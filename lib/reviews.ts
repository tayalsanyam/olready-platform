import type { Db, Sql } from './db';
import { DomainError, audit, getSetting } from './db';

export type Review = {
  id: string;
  vendor_id: string;
  author_profile_id: string;
  author_name: string;
  lead_need_id: string | null;
  rating_artist: number;
  rating_service: number;
  body: string;
  verified_booking: boolean;
  status: 'published' | 'under_dispute' | 'hidden' | 'removed';
  vendor_reply: string | null;
  vendor_replied_at: Date | null;
  created_at: Date;
};

export type Dispute = {
  id: string;
  review_id: string;
  vendor_id: string;
  vendor_name: string;
  review_body: string;
  reason: string;
  status: 'open' | 'awaiting_proof' | 'proof_submitted' | 'upheld' | 'rejected' | 'expired';
  contact_due_at: Date;
  contacted_at: Date | null;
  proof_due_at: Date | null;
  proof: string | null;
  outcome_note: string;
  created_at: Date;
};

export async function reviewsForVendor(db: Db, vendorId: string, opts: { includeDisputed?: boolean } = {}) {
  return opts.includeDisputed
    ? db<Review[]>`
        select r.*, p.full_name as author_name from mkt.reviews r join mkt.profiles p on p.id = r.author_profile_id
        where r.vendor_id = ${vendorId} and r.status in ('published','under_dispute') order by r.created_at desc`
    : db<Review[]>`
        select r.*, p.full_name as author_name from mkt.reviews r join mkt.profiles p on p.id = r.author_profile_id
        where r.vendor_id = ${vendorId} and r.status = 'published' order by r.created_at desc`;
}

/** Brides review vendors they unlocked a conversation with; a booking marks the review verified. */
export async function writeReview(
  db: Db,
  input: { vendorId: string; profileId: string; ratingArtist: number; ratingService: number; body: string }
) {
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (!ok(input.ratingArtist) || !ok(input.ratingService)) throw new DomainError('bad_rating', 'Ratings are 1 to 5');
  const [link] = await db<{ need_id: string; booked: boolean }[]>`
    select ln.id as need_id, (ln.booked_vendor_id = t.vendor_id) as booked
    from mkt.threads t
    join mkt.lead_needs ln on ln.id = t.lead_need_id
    join mkt.leads l on l.id = ln.lead_id
    where t.vendor_id = ${input.vendorId}
      and (l.bride_profile_id = ${input.profileId}
           or exists (select 1 from mkt.wedding_members m where m.wedding_id = l.wedding_id and m.profile_id = ${input.profileId}))
    order by booked desc nulls last limit 1`;
  if (!link) throw new DomainError('no_contact', 'You can review vendors you have talked to through OLReady');
  const [r] = await db<{ id: string }[]>`
    insert into mkt.reviews (vendor_id, author_profile_id, lead_need_id, rating_artist, rating_service, body, verified_booking)
    values (${input.vendorId}, ${input.profileId}, ${link.need_id}, ${input.ratingArtist}, ${input.ratingService},
      ${input.body.trim().slice(0, 3000)}, ${Boolean(link.booked)})
    on conflict (vendor_id, author_profile_id) do update set
      rating_artist = excluded.rating_artist, rating_service = excluded.rating_service, body = excluded.body
    returning id`;
  return r;
}

export async function replyToReview(db: Db, reviewId: string, vendorId: string, reply: string) {
  const text = reply.trim();
  if (!text) throw new DomainError('empty', 'Write a reply first');
  const [r] = await db<{ id: string }[]>`
    update mkt.reviews set vendor_reply = ${text.slice(0, 2000)}, vendor_replied_at = now()
    where id = ${reviewId} and vendor_id = ${vendorId} returning id`;
  if (!r) throw new DomainError('not_found', 'Review not found');
}

// ---------------------------------------------------------------- disputes
export async function openDispute(sql: Sql, reviewId: string, vendorId: string, reason: string, actor: string) {
  if (!reason.trim()) throw new DomainError('empty', 'Say why this review is wrong');
  return sql.begin(async (tx) => {
    const [r] = await tx<{ status: string }[]>`
      select status from mkt.reviews where id = ${reviewId} and vendor_id = ${vendorId} for update`;
    if (!r) throw new DomainError('not_found', 'Review not found');
    if (r.status !== 'published') throw new DomainError('not_published', 'This review is already being handled');
    const hours = await getSetting(tx, 'review_contact_hours', 48);
    const [d] = await tx<{ id: string }[]>`
      insert into mkt.review_disputes (review_id, vendor_id, reason, contact_due_at)
      values (${reviewId}, ${vendorId}, ${reason.trim()}, now() + make_interval(hours => ${hours})) returning id`;
    // The review stays visible while the dispute runs, as on WedMeGood.
    await tx`update mkt.reviews set status = 'under_dispute' where id = ${reviewId}`;
    await audit(tx, actor, 'dispute.open', 'review', reviewId, { reason });
    return d;
  });
}

/** Ops records contacting the vendor; the 7-day proof window starts now. */
export async function markContacted(db: Db, disputeId: string, actor: string) {
  const days = await getSetting(db, 'review_proof_days', 7);
  const [d] = await db<{ id: string }[]>`
    update mkt.review_disputes set status = 'awaiting_proof', contacted_at = now(),
      proof_due_at = now() + make_interval(days => ${days})
    where id = ${disputeId} and status = 'open' returning id`;
  if (!d) throw new DomainError('bad_state', 'This dispute is not waiting for contact');
  await audit(db, actor, 'dispute.contacted', 'dispute', disputeId);
}

export async function submitProof(db: Db, disputeId: string, vendorId: string, proof: string) {
  if (!proof.trim()) throw new DomainError('empty', 'Add your proof first');
  const [d] = await db<{ id: string }[]>`
    update mkt.review_disputes set status = 'proof_submitted', proof = ${proof.trim()}
    where id = ${disputeId} and vendor_id = ${vendorId} and status = 'awaiting_proof' and proof_due_at > now()
    returning id`;
  if (!d) throw new DomainError('bad_state', 'The proof window is closed or proof was already sent');
}

export async function decideDispute(sql: Sql, disputeId: string, uphold: boolean, note: string, actor: string) {
  return sql.begin(async (tx) => {
    const [d] = await tx<{ review_id: string; status: string }[]>`
      select review_id, status from mkt.review_disputes where id = ${disputeId} for update`;
    if (!d) throw new DomainError('not_found', 'Dispute not found');
    if (d.status !== 'proof_submitted') throw new DomainError('bad_state', 'Decide only after the vendor sends proof');
    await tx`
      update mkt.review_disputes set status = ${uphold ? 'upheld' : 'rejected'}, decided_by = ${actor},
        decided_at = now(), outcome_note = ${note}
      where id = ${disputeId}`;
    await tx`update mkt.reviews set status = ${uphold ? 'removed' : 'published'} where id = ${d.review_id}`;
    await audit(tx, actor, uphold ? 'dispute.upheld' : 'dispute.rejected', 'dispute', disputeId, { note });
  });
}

/** Closes disputes whose 7-day proof window ran out; the review stays published. */
export async function expireDisputes(db: Db) {
  const rows = await db<{ review_id: string }[]>`
    update mkt.review_disputes set status = 'expired', outcome_note = 'No proof within the deadline'
    where status = 'awaiting_proof' and proof_due_at <= now() returning review_id`;
  for (const r of rows) {
    await db`update mkt.reviews set status = 'published' where id = ${r.review_id} and status = 'under_dispute'`;
  }
  return rows.length;
}

export async function disputeQueue(db: Db) {
  return db<Dispute[]>`
    select d.*, v.business_name as vendor_name, r.body as review_body
    from mkt.review_disputes d join mkt.vendors v on v.id = d.vendor_id join mkt.reviews r on r.id = d.review_id
    where d.status in ('open','awaiting_proof','proof_submitted')
    order by coalesce(d.proof_due_at, d.contact_due_at)`;
}
