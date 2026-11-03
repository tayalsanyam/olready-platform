import type { Db, Sql } from './db';
import { DomainError, audit } from './db';
import { brideCanAccessLead } from './leads';
import { rmAssignedToLead } from './rm';
import { flagsFor } from './moderation';

export type ThreadRow = {
  id: string;
  lead_need_id: string;
  lead_id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  category_name: string;
  bride_name: string;
  bride_phone: string;
  bride_email: string | null;
  event_date: string | null;
  city_name: string;
  budget_inr: number | null;
  tier_label: string | null;
  need_status: string;
  status: 'open' | 'quoted' | 'quote_accepted' | 'booked' | 'closed';
  last_message_at: Date | null;
  created_at: Date;
  functions: { name: string; event_date: string | null; guests: number | null }[] | null;
};

const threadSelect = (db: Db) => db`
  select t.id, t.lead_need_id, l.id as lead_id, t.vendor_id, v.business_name as vendor_name, v.slug as vendor_slug,
         c.name as category_name, l.bride_name, l.phone as bride_phone, l.email as bride_email,
         to_char(l.event_date, 'YYYY-MM-DD') as event_date, ci.name as city_name, ln.budget_inr,
         bt.label as tier_label, ln.status as need_status, t.status,
         (select max(created_at) from mkt.messages m where m.thread_id = t.id) as last_message_at, t.created_at,
         (select json_agg(json_build_object('name', e.name, 'event_date', to_char(e.event_date, 'YYYY-MM-DD'), 'guests', e.guests, 'place', e.place) order by e.event_date nulls last, e.sort)
          from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id where ne.need_id = t.lead_need_id) as functions
  from mkt.threads t
  join mkt.lead_needs ln on ln.id = t.lead_need_id
  join mkt.leads l on l.id = ln.lead_id
  join mkt.vendors v on v.id = t.vendor_id
  join mkt.categories c on c.id = ln.category_id
  join mkt.cities ci on ci.id = l.city_id
  left join mkt.budget_tiers bt on bt.id = ln.budget_tier_id`;

export async function threadsForVendor(db: Db, vendorId: string) {
  return db<ThreadRow[]>`${threadSelect(db)} where t.vendor_id = ${vendorId}
    order by coalesce((select max(created_at) from mkt.messages m where m.thread_id = t.id), t.created_at) desc`;
}

export async function threadsForBride(db: Db, profileId: string) {
  return db<ThreadRow[]>`${threadSelect(db)}
    where l.bride_profile_id = ${profileId}
       or exists (select 1 from mkt.wedding_members m where m.wedding_id = l.wedding_id and m.profile_id = ${profileId})
    order by t.created_at desc`;
}

export type Access = { side: 'vendor' | 'bride' | 'staff' };

/** Vendor owner, the bride or her wedding members, or staff. Anyone else is refused. */
export async function threadAccess(db: Db, threadId: string, profile: { id: string; role: string }): Promise<Access> {
  const [t] = await db<{ vendor_id: string; lead_id: string; owner: string | null }[]>`
    select t.vendor_id, ln.lead_id, v.owner_profile_id as owner
    from mkt.threads t join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.vendors v on v.id = t.vendor_id
    where t.id = ${threadId}`;
  if (!t) throw new DomainError('not_found', 'Conversation not found');
  if (t.owner === profile.id) return { side: 'vendor' };
  if (await brideCanAccessLead(db, t.lead_id, profile.id)) return { side: 'bride' };
  if (['ops', 'admin'].includes(profile.role)) return { side: 'staff' };
  if (profile.role === 'rm' && (await rmAssignedToLead(db, profile.id, t.lead_id))) return { side: 'staff' };
  throw new DomainError('forbidden', 'You cannot open this conversation');
}

export async function getThread(db: Db, threadId: string) {
  const [t] = await db<ThreadRow[]>`${threadSelect(db)} where t.id = ${threadId}`;
  return t ?? null;
}

export async function threadMessages(db: Db, threadId: string) {
  return db<{
    id: number;
    sender_profile_id: string;
    sender_name: string;
    sender_role: string;
    body: string;
    attachment_url: string | null;
    attachment_name: string | null;
    attachment_kind: 'image' | 'pdf' | null;
    review_status: 'none' | 'flagged' | 'cleared' | 'hidden';
    created_at: Date;
  }[]>`
    select m.id, m.sender_profile_id, p.full_name as sender_name, p.role as sender_role, m.body,
           m.attachment_url, m.attachment_name, m.attachment_kind, m.review_status, m.created_at
    from mkt.messages m join mkt.profiles p on p.id = m.sender_profile_id
    where m.thread_id = ${threadId} order by m.created_at, m.id`;
}

export async function threadQuotes(db: Db, threadId: string) {
  return db<{ id: string; amount_inr: number; details: string; status: string; created_at: Date; reading: { included: string[]; extra: string[]; ask: string[] } | null; lines: QuoteLine[] | null }[]>`
    select q.id, q.amount_inr, q.details, q.status, q.created_at,
           (select json_agg(json_build_object('label', ql.label, 'amount', ql.amount_inr) order by ql.sort) from mkt.quote_lines ql where ql.quote_id = q.id) as lines,
           case when r.quote_id is null then null else json_build_object('included', r.included, 'extra', r.extra, 'ask', r.ask) end as reading
    from mkt.quotes q left join mkt.quote_readings r on r.quote_id = q.id
    where q.thread_id = ${threadId} order by q.created_at desc`;
}

export type Attachment = { url: string; kind: 'image' | 'pdf'; name: string };

export async function postMessage(db: Db, threadId: string, profile: { id: string; role: string }, body: string, file?: Attachment | null) {
  const access = await threadAccess(db, threadId, profile);
  if (access.side === 'staff') throw new DomainError('forbidden', 'Staff can read but not post here');
  const text = body.trim();
  if (!text && !file) throw new DomainError('empty', 'Write a message or attach a file first');
  const flags = flagsFor(text);
  const [m] = await db<{ id: number }[]>`
    insert into mkt.messages (thread_id, sender_profile_id, body, attachment_url, attachment_name, attachment_kind, flags, review_status)
    values (${threadId}, ${profile.id}, ${text.slice(0, 4000)}, ${file?.url ?? null}, ${file?.name ?? null}, ${file?.kind ?? null},
      ${flags}, ${flags.length ? 'flagged' : 'none'})
    returning id`;
  return m.id;
}

export type QuoteLine = { label: string; amount: number };

/** A quote, optionally priced per function; with lines, the total is their sum. */
export async function sendQuote(sql: Sql, threadId: string, profile: { id: string; role: string }, amountInr: number, details: string, lines: QuoteLine[] = []) {
  const priced = lines.filter((l) => l.label.trim() && Number.isFinite(l.amount) && l.amount > 0).slice(0, 12);
  if (priced.length) amountInr = priced.reduce((s, l) => s + Math.round(l.amount), 0);
  return sql.begin(async (tx) => {
    const access = await threadAccess(tx, threadId, profile);
    if (access.side !== 'vendor') throw new DomainError('forbidden', 'Only the vendor can send a quote');
    if (!Number.isFinite(amountInr) || amountInr <= 0) throw new DomainError('bad_amount', 'Enter the quote amount, or a price for at least one function');
    await tx`update mkt.quotes set status = 'withdrawn' where thread_id = ${threadId} and status = 'sent'`;
    const [q] = await tx<{ id: string }[]>`
      insert into mkt.quotes (thread_id, amount_inr, details) values (${threadId}, ${Math.round(amountInr)}, ${details.trim()})
      returning id`;
    for (const [i, l] of priced.entries()) {
      await tx`insert into mkt.quote_lines (quote_id, label, amount_inr, sort) values (${q.id}, ${l.label.trim().slice(0, 60)}, ${Math.round(l.amount)}, ${i})`;
    }
    await tx`update mkt.threads set status = 'quoted' where id = ${threadId} and status in ('open','quoted')`;
    await audit(tx, profile.id, 'quote.send', 'thread', threadId, { amountInr });
    return q;
  });
}

export async function decideQuote(sql: Sql, quoteId: string, profile: { id: string; role: string }, accept: boolean) {
  return sql.begin(async (tx) => {
    const [q] = await tx<{ thread_id: string; status: string }[]>`
      select thread_id, status from mkt.quotes where id = ${quoteId} for update`;
    if (!q) throw new DomainError('not_found', 'Quote not found');
    const access = await threadAccess(tx, q.thread_id, profile);
    if (access.side !== 'bride') throw new DomainError('forbidden', 'Only the bride can accept or decline a quote');
    if (q.status !== 'sent') throw new DomainError('decided', 'This quote is no longer open');
    await tx`update mkt.quotes set status = ${accept ? 'accepted' : 'declined'}, decided_at = now() where id = ${quoteId}`;
    if (accept) await tx`update mkt.threads set status = 'quote_accepted' where id = ${q.thread_id} and status <> 'booked'`;
    await audit(tx, profile.id, accept ? 'quote.accept' : 'quote.decline', 'thread', q.thread_id);
  });
}
