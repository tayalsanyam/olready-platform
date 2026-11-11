import type { Db, Sql } from './db';
import { DomainError, audit } from './db';
import { queueEmail } from './email';
import { normalisePhone } from './leads';

// ---------------------------------------------------------------- review requests
export const REVIEW_REQUESTS_PER_DAY = 20;

export type ReviewRequest = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  client_name: string;
  client_email: string;
  token: string;
  status: 'sent' | 'used' | 'cancelled';
  created_at: Date;
};

/**
 * A vendor invites a client who booked them outside Olready. The review is written by the
 * person who signs in with that email, and waits for Ops before it shows.
 */
export async function createReviewRequest(
  db: Db,
  vendor: { id: string; business_name: string; email: string | null; owner_profile_id: string | null },
  actor: { id: string; email: string | null },
  clientName: string,
  clientEmail: string
) {
  const name = clientName.trim().slice(0, 80);
  const email = clientEmail.trim().toLowerCase();
  if (!name) throw new DomainError('bad_name', "Enter your client's name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError('bad_email', "Enter your client's email");
  if (email === actor.email?.toLowerCase() || email === vendor.email?.toLowerCase()) {
    throw new DomainError('own_email', 'Send the link to your client, not to yourself');
  }
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from mkt.review_requests where vendor_id = ${vendor.id} and created_at > now() - interval '1 day'`;
  if (n >= REVIEW_REQUESTS_PER_DAY) throw new DomainError('too_many', `You can send ${REVIEW_REQUESTS_PER_DAY} review requests a day`);
  const [r] = await db<{ id: string; token: string }[]>`
    insert into mkt.review_requests (vendor_id, client_name, client_email, created_by)
    values (${vendor.id}, ${name}, ${email}, ${actor.id})
    on conflict (vendor_id, client_email) do nothing
    returning id, token`;
  if (!r) throw new DomainError('already', 'You have already asked this client for a review');
  const [slug] = await db<{ slug: string }[]>`select slug from mkt.vendors where id = ${vendor.id}`;
  await queueEmail(db, email, 'review_request', { name, vendor: vendor.business_name, token: r.token, vendorSlug: slug.slug }, `review_request:${r.id}`);
  await audit(db, actor.id, 'review_request.create', 'vendor', vendor.id, { request: r.id });
  return r;
}

export async function reviewRequestsFor(db: Db, vendorId: string) {
  return db<ReviewRequest[]>`
    select rr.*, v.business_name as vendor_name, v.slug as vendor_slug from mkt.review_requests rr
    join mkt.vendors v on v.id = rr.vendor_id where rr.vendor_id = ${vendorId} order by rr.created_at desc limit 100`;
}

export async function reviewRequestByToken(db: Db, token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [r] = await db<(ReviewRequest & { owner_profile_id: string | null; review_status: string | null })[]>`
    select rr.*, v.business_name as vendor_name, v.slug as vendor_slug, v.owner_profile_id,
           (select status from mkt.reviews where id = rr.review_id) as review_status
    from mkt.review_requests rr join mkt.vendors v on v.id = rr.vendor_id where rr.token = ${token}`;
  return r ?? null;
}

export async function submitInvitedReview(
  sql: Sql,
  token: string,
  profile: { id: string; email: string | null },
  input: { ratingArtist: number; ratingService: number; body: string }
) {
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (!ok(input.ratingArtist) || !ok(input.ratingService)) throw new DomainError('bad_rating', 'Pick a rating from 1 to 5 for both');
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string; vendor_id: string; client_email: string; status: string; owner: string | null }[]>`
      select rr.id, rr.vendor_id, rr.client_email, rr.status, v.owner_profile_id as owner
      from mkt.review_requests rr join mkt.vendors v on v.id = rr.vendor_id where rr.token = ${token} for update of rr`;
    if (!r || r.status === 'cancelled') throw new DomainError('not_found', 'This review link is no longer valid');
    if (r.status === 'used') throw new DomainError('used', 'This link has already been used. Thank you!');
    if (r.owner === profile.id) throw new DomainError('own', 'You cannot review your own business');
    if ((profile.email ?? '').toLowerCase() !== r.client_email) {
      throw new DomainError('wrong_email', 'Sign in with the email this link was sent to');
    }
    const [exists] = await tx`select 1 from mkt.reviews where vendor_id = ${r.vendor_id} and author_profile_id = ${profile.id}`;
    if (exists) throw new DomainError('already', 'You have already reviewed this vendor');
    const [rev] = await tx<{ id: string }[]>`
      insert into mkt.reviews (vendor_id, author_profile_id, rating_artist, rating_service, body, verified_booking, status, source)
      values (${r.vendor_id}, ${profile.id}, ${input.ratingArtist}, ${input.ratingService}, ${input.body.trim().slice(0, 3000)}, false, 'pending', 'vendor_invite')
      returning id`;
    await tx`update mkt.review_requests set status = 'used', used_at = now(), review_id = ${rev.id} where id = ${r.id}`;
    await audit(tx, profile.id, 'review.invited_submit', 'review', rev.id);
    return rev;
  });
}

export async function pendingReviews(db: Db) {
  return db<{ id: string; vendor_name: string; vendor_slug: string; author_name: string; author_email: string; rating_artist: number; rating_service: number; body: string; created_at: Date }[]>`
    select r.id, v.business_name as vendor_name, v.slug as vendor_slug, p.full_name as author_name, p.email as author_email,
           r.rating_artist, r.rating_service, r.body, r.created_at
    from mkt.reviews r join mkt.vendors v on v.id = r.vendor_id join mkt.profiles p on p.id = r.author_profile_id
    where r.status = 'pending' order by r.created_at`;
}

export async function decidePendingReview(db: Db, reviewId: string, publish: boolean, actor: string) {
  const [r] = await db`
    update mkt.reviews set status = ${publish ? 'published' : 'removed'} where id = ${reviewId} and status = 'pending' returning id`;
  if (!r) throw new DomainError('not_found', 'Review not waiting for a decision');
  await audit(db, actor, publish ? 'review.publish' : 'review.remove', 'review', reviewId);
}

// ---------------------------------------------------------------- callback requests
export const CALLBACK_TOPICS: Record<string, string> = {
  plans: 'Plans and credits',
  leads: 'Leads and unlocks',
  profile: 'My profile',
  payments: 'A payment',
  booking: 'My wedding bookings',
  other: 'Something else',
};

export async function requestCallback(
  db: Db,
  profile: { id: string; full_name: string; email: string | null },
  input: { vendorId?: string | null; topic: string; phone: string; when: string; note: string }
) {
  if (!CALLBACK_TOPICS[input.topic]) throw new DomainError('bad_topic', 'Pick what the call is about');
  const phone = normalisePhone(input.phone);
  const [open] = await db`select 1 from mkt.callback_requests where profile_id = ${profile.id} and status = 'open'`;
  if (open) throw new DomainError('open', 'We already have your request and will call you soon');
  const [c] = await db<{ id: string }[]>`
    insert into mkt.callback_requests (profile_id, vendor_id, topic, phone, preferred_time, note)
    values (${profile.id}, ${input.vendorId ?? null}, ${input.topic}, ${phone}, ${input.when.trim().slice(0, 60)}, ${input.note.trim().slice(0, 500)})
    returning id`;
  if (profile.email) {
    await queueEmail(db, profile.email, 'callback_booked', { name: profile.full_name || 'there', phone, when: input.when.trim(), topic: CALLBACK_TOPICS[input.topic].toLowerCase() }, `callback:${c.id}`);
  }
  return c;
}

export async function openCallbacks(db: Db) {
  return db<{ id: string; name: string; role: string; vendor_name: string | null; vendor_id: string | null; topic: string; phone: string; preferred_time: string; note: string; created_at: Date }[]>`
    select c.id, p.full_name as name, p.role, v.business_name as vendor_name, c.vendor_id, c.topic, c.phone, c.preferred_time, c.note, c.created_at
    from mkt.callback_requests c join mkt.profiles p on p.id = c.profile_id left join mkt.vendors v on v.id = c.vendor_id
    where c.status = 'open' order by c.created_at`;
}

export async function closeCallback(db: Db, id: string, outcome: string, actor: string) {
  const [c] = await db`
    update mkt.callback_requests set status = 'done', handled_by = ${actor}, outcome = ${outcome.trim().slice(0, 300)}, done_at = now()
    where id = ${id} and status = 'open' returning id`;
  if (!c) throw new DomainError('not_found', 'Callback already handled');
  await audit(db, actor, 'callback.done', 'callback', id);
}
