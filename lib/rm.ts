import type { Db, Sql } from './db';
import { DomainError, audit } from './db';
import { isConfigured, type Gateway } from './payments';

export type Service = { code: string; name: string; description: string; price_inr: number; length_days: number; active: boolean };
export type Engagement = {
  id: string;
  profile_id: string;
  wedding_id: string | null;
  source: 'paid' | 'perk';
  order_id: string | null;
  status: 'pending_payment' | 'pending_approval' | 'active' | 'ended' | 'rejected';
  rm_profile_id: string | null;
  length_days: number;
  starts_at: Date | null;
  ends_at: Date | null;
  note: string;
  created_at: Date;
};

export async function rmService(db: Db) {
  const [s] = await db<Service[]>`select * from mkt.services where code = 'rm_30d'`;
  return s ?? null;
}

export async function currentEngagement(db: Db, profileId: string) {
  const [e] = await db<(Engagement & { rm_name: string | null; rm_email: string | null; rm_phone: string | null })[]>`
    select e.*, p.full_name as rm_name, p.email as rm_email, p.phone as rm_phone
    from mkt.rm_engagements e left join mkt.profiles p on p.id = e.rm_profile_id
    where e.profile_id = ${profileId} and e.status in ('pending_payment','pending_approval','active')
    order by e.created_at desc limit 1`;
  return e ?? null;
}

/** The bride pays first. The engagement waits for the team once payment arrives. */
export async function buyRm(db: Db, input: { profileId: string; weddingId: string | null; gateway: Gateway; coupon?: string | null }) {
  const svc = await rmService(db);
  if (!svc?.active) throw new DomainError('unavailable', 'The relationship-manager service is not available right now');
  if (await currentEngagement(db, input.profileId)) throw new DomainError('already', 'You already have a relationship-manager request');
  const [gw] = await db<{ enabled: boolean }[]>`select enabled from mkt.gateway_settings where gateway = ${input.gateway}`;
  if (!gw?.enabled || !isConfigured(input.gateway)) throw new DomainError('gateway_off', 'This payment method is temporarily unavailable');
  const { couponDiscount } = await import('./coupons');
  const c = await couponDiscount(db, input.coupon ?? '', { product: svc.code, amount: svc.price_inr, profileId: input.profileId });
  const [order] = await db<{ id: string }[]>`
    insert into mkt.orders (profile_id, service_code, amount_inr, gateway, coupon_code, discount_inr, list_price_inr)
    values (${input.profileId}, ${svc.code}, ${svc.price_inr - c.discount}, ${input.gateway}, ${c.code}, ${c.discount}, ${svc.price_inr}) returning id`;
  await db`
    insert into mkt.rm_engagements (profile_id, wedding_id, source, order_id, status, length_days)
    values (${input.profileId}, ${input.weddingId}, 'paid', ${order.id}, 'pending_payment', ${svc.length_days})`;
  return order;
}

/** A booking perk becomes an RM request with no payment step. */
export async function engagementFromPerk(db: Db, profileId: string, perkId: string, weddingId: string | null, days: number) {
  if (await currentEngagement(db, profileId)) throw new DomainError('already', 'You already have a relationship manager');
  await db`
    insert into mkt.rm_engagements (profile_id, wedding_id, source, perk_id, status, length_days)
    values (${profileId}, ${weddingId}, 'perk', ${perkId}, 'pending_approval', ${days})`;
}

/** Approves and assigns. Runs for its length or until the wedding day, whichever is first. */
export async function approveEngagement(db: Db, id: string, rmProfileId: string, actor: string) {
  const [rm] = await db<{ role: string }[]>`select role from mkt.profiles where id = ${rmProfileId}`;
  if (!rm || !['rm', 'ops', 'admin'].includes(rm.role)) throw new DomainError('bad_rm', 'Pick a staff member with the RM role');
  const [e] = await db<{ id: string }[]>`
    update mkt.rm_engagements e set status = 'active', rm_profile_id = ${rmProfileId}, decided_by = ${actor},
      starts_at = now(),
      ends_at = least(
        now() + make_interval(days => e.length_days),
        coalesce((select (w.wedding_date + 1)::timestamptz from mkt.weddings w where w.id = e.wedding_id and w.wedding_date >= (now() at time zone 'Asia/Kolkata')::date), 'infinity')
      )
    where id = ${id} and status = 'pending_approval' returning id`;
  if (!e) throw new DomainError('bad_state', 'This request is not waiting for approval');
  await audit(db, actor, 'rm.approve', 'rm_engagement', id, { rmProfileId });
}

export async function rejectEngagement(db: Db, id: string, note: string, actor: string) {
  if (!note.trim()) throw new DomainError('no_note', 'Write why, and whether a refund is due');
  const [e] = await db<{ id: string }[]>`
    update mkt.rm_engagements set status = 'rejected', decided_by = ${actor}, note = ${note.trim()}
    where id = ${id} and status = 'pending_approval' returning id`;
  if (!e) throw new DomainError('bad_state', 'This request is not waiting for approval');
  await audit(db, actor, 'rm.reject', 'rm_engagement', id, { note });
}

export async function reassign(db: Db, id: string, rmProfileId: string, actor: string) {
  const [rm] = await db<{ role: string }[]>`select role from mkt.profiles where id = ${rmProfileId}`;
  if (!rm || !['rm', 'ops', 'admin'].includes(rm.role)) throw new DomainError('bad_rm', 'Pick a staff member with the RM role');
  await db`update mkt.rm_engagements set rm_profile_id = ${rmProfileId} where id = ${id} and status = 'active'`;
  await audit(db, actor, 'rm.reassign', 'rm_engagement', id, { rmProfileId });
}

export async function endExpiredEngagements(db: Db) {
  const rows = await db`update mkt.rm_engagements set status = 'ended' where status = 'active' and ends_at <= now() returning id`;
  return rows.length;
}

/** An RM sees a bride's conversations only while assigned to her. */
export async function rmAssignedToLead(db: Db, rmProfileId: string, leadId: string) {
  const [row] = await db`
    select 1 from mkt.rm_engagements e join mkt.leads l on l.id = ${leadId}
    where e.rm_profile_id = ${rmProfileId} and e.status = 'active'
      and (e.profile_id = l.bride_profile_id or (e.wedding_id is not null and e.wedding_id = l.wedding_id))`;
  return Boolean(row);
}

export async function rmQueue(db: Db) {
  return db<(Engagement & { bride_name: string; bride_email: string | null; wedding_title: string | null; wedding_date: string | null; rm_name: string | null })[]>`
    select e.*, p.full_name as bride_name, p.email as bride_email, w.title as wedding_title,
      to_char(w.wedding_date, 'YYYY-MM-DD') as wedding_date, r.full_name as rm_name
    from mkt.rm_engagements e join mkt.profiles p on p.id = e.profile_id
    left join mkt.weddings w on w.id = e.wedding_id left join mkt.profiles r on r.id = e.rm_profile_id
    where e.status in ('pending_approval','active') order by (e.status = 'pending_approval') desc, e.created_at`;
}

export async function rmStaff(db: Db) {
  return db<{ id: string; full_name: string; role: string; active: number }[]>`
    select p.id, p.full_name, p.role,
      (select count(*) from mkt.rm_engagements e where e.rm_profile_id = p.id and e.status = 'active')::int as active
    from mkt.profiles p where p.role in ('rm','ops','admin') order by (p.role = 'rm') desc, p.full_name`;
}

export async function caseload(db: Db, rmProfileId: string) {
  return db<(Engagement & { bride_name: string; bride_phone: string | null; bride_email: string | null; wedding_title: string | null; wedding_date: string | null })[]>`
    select e.*, p.full_name as bride_name, p.phone as bride_phone, p.email as bride_email, w.title as wedding_title,
      to_char(w.wedding_date, 'YYYY-MM-DD') as wedding_date
    from mkt.rm_engagements e join mkt.profiles p on p.id = e.profile_id left join mkt.weddings w on w.id = e.wedding_id
    where e.rm_profile_id = ${rmProfileId} and e.status = 'active' order by e.ends_at`;
}

export async function engagementFor(db: Db, id: string, viewer: { id: string; role: string }) {
  const [e] = await db<(Engagement & { bride_name: string; bride_phone: string | null; bride_email: string | null; wedding_title: string | null; wedding_date: string | null })[]>`
    select e.*, p.full_name as bride_name, p.phone as bride_phone, p.email as bride_email, w.title as wedding_title,
      to_char(w.wedding_date, 'YYYY-MM-DD') as wedding_date
    from mkt.rm_engagements e join mkt.profiles p on p.id = e.profile_id left join mkt.weddings w on w.id = e.wedding_id
    where e.id = ${id}`;
  if (!e) return null;
  if (viewer.role === 'rm' && e.rm_profile_id !== viewer.id) return null;
  return e;
}

export async function addRmNote(db: Db, engagementId: string, author: { id: string; role: string }, body: string) {
  const e = await engagementFor(db, engagementId, author);
  if (!e || e.status !== 'active') throw new DomainError('forbidden', 'Only the assigned RM adds notes while the engagement is active');
  if (!body.trim()) throw new DomainError('empty', 'Write a note');
  await db`insert into mkt.rm_notes (engagement_id, author_profile_id, body) values (${engagementId}, ${author.id}, ${body.trim().slice(0, 4000)})`;
}

export async function rmNotes(db: Db, engagementId: string) {
  return db<{ id: number; body: string; author: string; created_at: Date }[]>`
    select n.id, n.body, p.full_name as author, n.created_at from mkt.rm_notes n join mkt.profiles p on p.id = n.author_profile_id
    where n.engagement_id = ${engagementId} order by n.created_at desc`;
}

export type { Sql };
