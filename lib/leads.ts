import type { Db, Sql } from './db';
import { type FunctionInput, MAX_FUNCTIONS, headline, saveLeadFunctions, seedWeddingFunctions } from './functions';
import { DomainError, audit, getSetting } from './db';
import { tierForBudget, tiersFor } from './catalog';

export type Lead = {
  id: string;
  wedding_id: string | null;
  bride_profile_id: string | null;
  bride_name: string;
  phone: string;
  email: string | null;
  city_id: number;
  locality_id: number | null;
  pincode: string | null;
  event_date: string | null;
  guest_count: number | null;
  whatsapp_opt_in: boolean;
  source: string;
  status: 'new' | 'verifying' | 'verified' | 'rejected' | 'fake';
  verification_stage: number;
  verified_at: Date | null;
  notes: string;
  created_at: Date;
};

export type LeadNeed = {
  id: string;
  lead_id: string;
  category_id: number;
  budget_tier_id: number | null;
  budget_inr: number | null;
  status: 'open' | 'capped' | 'closed_booked' | 'closed_by_bride' | 'removed';
  unlock_cap: number;
  reopen_rounds: number;
  direct_vendor_id: string | null;
  preferred_vendor_ids: string[];
  booked_vendor_id: string | null;
  booked_outside: { vendor_name: string; reason: string } | null;
  notes: string;
  created_at: Date;
};

// ---------------------------------------------------------------- enquiries
export type EnquiryInput = {
  brideProfileId?: string | null;
  weddingId?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  cityId: number;
  localityId?: number | null;
  pincode?: string | null;
  eventDate?: string | null;
  guestCount?: number | null;
  whatsappOptIn?: boolean;
  source?: Lead['source'];
  needs: { categoryId: number; budgetInr?: number | null; preferredVendorIds?: string[]; functions?: number[] }[];
  directVendorId?: string | null;
  /** The big days. Without them, the request is one "Wedding" on eventDate. */
  functions?: FunctionInput[];
};

const PHONE_RE = /^\+?[0-9]{10,13}$/;

export function normalisePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!PHONE_RE.test(digits)) throw new DomainError('bad_phone', 'Enter a valid mobile number');
  return digits.length === 10 ? `+91${digits}` : digits.startsWith('+') ? digits : `+${digits}`;
}

export async function createEnquiry(sql: Sql, input: EnquiryInput) {
  if (!input.name.trim()) throw new DomainError('bad_name', 'Name is required');
  if (!input.needs.length) throw new DomainError('no_needs', 'Pick at least one category');
  const phone = normalisePhone(input.phone);
  const fns: FunctionInput[] = input.functions?.length
    ? input.functions.slice(0, MAX_FUNCTIONS)
    : [{ name: 'Wedding', date: input.eventDate || null, guests: input.guestCount && input.guestCount > 0 ? Math.round(input.guestCount) : null }];
  const h = headline(fns);
  const eventDate = h.date ?? input.eventDate ?? null;
  const guestCount = h.guests ?? input.guestCount ?? null;
  return sql.begin(async (tx) => {
    const [lead] = await tx<Lead[]>`
      insert into mkt.leads (wedding_id, bride_profile_id, bride_name, phone, email, city_id, locality_id, pincode, event_date, guest_count, whatsapp_opt_in, whatsapp_opt_in_at, source)
      values (${input.weddingId ?? null}, ${input.brideProfileId ?? null}, ${input.name.trim()}, ${phone},
        ${input.email?.toLowerCase() ?? null}, ${input.cityId}, ${input.localityId ?? null}, ${input.pincode ?? null}, ${eventDate || null},
        ${guestCount && guestCount > 0 && guestCount <= 20000 ? Math.round(guestCount) : null},
        ${Boolean(input.whatsappOptIn)}, ${input.whatsappOptIn ? new Date() : null},
        ${input.directVendorId ? 'direct_request' : (input.source ?? 'website')})
      returning *`;
    const seen = new Set<number>();
    const picks: { needId: string; idx: number[] }[] = [];
    for (const n of input.needs) {
      if (seen.has(n.categoryId)) continue;
      seen.add(n.categoryId);
      const need = await addNeed(tx, lead.id, n.categoryId, n.budgetInr ?? null, {
        directVendorId: input.directVendorId ?? null,
        preferredVendorIds: n.preferredVendorIds ?? [],
      });
      const idx = (n.functions?.length ? n.functions : fns.map((_, i) => i)).filter((i) => i >= 0 && i < fns.length);
      picks.push({ needId: need.id, idx });
    }
    await saveLeadFunctions(tx, lead.id, fns, picks);
    if (input.weddingId) await seedWeddingFunctions(tx, input.weddingId, fns);
    return lead;
  });
}

export async function addNeed(
  db: Db,
  leadId: string,
  categoryId: number,
  budgetInr: number | null,
  opts: { directVendorId?: string | null; preferredVendorIds?: string[]; actor?: string | null } = {}
) {
  const [cat] = await db<{ unlock_cap: number; active: boolean }[]>`
    select unlock_cap, active from mkt.categories where id = ${categoryId}`;
  if (!cat || !cat.active) throw new DomainError('bad_category', 'That category is not open yet');
  if (opts.directVendorId) {
    const [v] = await db`select 1 from mkt.vendors where id = ${opts.directVendorId} and category_id = ${categoryId}`;
    if (!v) throw new DomainError('bad_vendor', 'That vendor is not in this category');
  }
  const tier = tierForBudget(await tiersFor(db, categoryId), budgetInr);
  const [need] = await db<LeadNeed[]>`
    insert into mkt.lead_needs (lead_id, category_id, budget_inr, budget_tier_id, unlock_cap, direct_vendor_id, preferred_vendor_ids)
    values (${leadId}, ${categoryId}, ${budgetInr}, ${tier?.id ?? null},
      ${opts.directVendorId ? 1 : cat.unlock_cap}, ${opts.directVendorId ?? null}, ${opts.preferredVendorIds ?? []}::uuid[])
    on conflict (lead_id, category_id) do update set
      budget_inr = coalesce(excluded.budget_inr, mkt.lead_needs.budget_inr),
      budget_tier_id = coalesce(excluded.budget_tier_id, mkt.lead_needs.budget_tier_id)
    returning *`;
  if (opts.actor) await audit(db, opts.actor, 'need.add', 'lead', leadId, { categoryId, budgetInr });
  return need;
}

export async function setNeedBudget(db: Db, needId: string, budgetInr: number | null, actor: string) {
  const [n] = await db<LeadNeed[]>`select * from mkt.lead_needs where id = ${needId}`;
  if (!n) throw new DomainError('not_found', 'Need not found');
  const tier = tierForBudget(await tiersFor(db, n.category_id), budgetInr);
  await db`update mkt.lead_needs set budget_inr = ${budgetInr}, budget_tier_id = ${tier?.id ?? null} where id = ${needId}`;
  await audit(db, actor, 'need.budget', 'need', needId, { budgetInr });
}

export async function removeNeed(db: Db, needId: string, actor: string) {
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from mkt.unlocks where lead_need_id = ${needId}`;
  if (n > 0) throw new DomainError('has_unlocks', 'Vendors already unlocked this need; mark the lead fake instead');
  await db`update mkt.lead_needs set status = 'removed' where id = ${needId}`;
  await audit(db, actor, 'need.remove', 'need', needId);
}

// ---------------------------------------------------------------- verification
/** Three-stage verification. Stage 3 makes the lead visible to vendors. */
export async function advanceVerification(db: Db, leadId: string, stage: 1 | 2 | 3, actor: string, notes = '') {
  const [lead] = await db<Lead[]>`select * from mkt.leads where id = ${leadId}`;
  if (!lead) throw new DomainError('not_found', 'Lead not found');
  if (lead.status === 'fake' || lead.status === 'rejected') {
    throw new DomainError('closed', 'This lead is closed');
  }
  if (stage < lead.verification_stage) throw new DomainError('backwards', 'Verification cannot go backwards');
  if (stage === 3) {
    const [{ n }] = await db<{ n: number }[]>`
      select count(*)::int as n from mkt.lead_needs where lead_id = ${leadId} and status = 'open'`;
    if (n === 0) throw new DomainError('no_needs', 'Add at least one category before verifying');
  }
  await db`
    update mkt.leads set verification_stage = ${stage},
      status = ${stage === 3 ? 'verified' : 'verifying'},
      verified_by = case when ${stage} = 3 then ${actor}::uuid else verified_by end,
      verified_at = case when ${stage} = 3 then now() else verified_at end,
      notes = case when ${notes} = '' then notes else notes || E'\n' || ${notes} end
    where id = ${leadId}`;
  await audit(db, actor, `lead.verify_stage_${stage}`, 'lead', leadId, { notes });
}

export async function rejectLead(db: Db, leadId: string, actor: string, reason: string) {
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from mkt.unlocks u join mkt.lead_needs ln on ln.id = u.lead_need_id
    where ln.lead_id = ${leadId}`;
  if (n > 0) throw new DomainError('has_unlocks', 'Vendors already unlocked this lead; mark it fake instead');
  await db`update mkt.leads set status = 'rejected', notes = notes || E'\n' || ${'Rejected: ' + reason} where id = ${leadId}`;
  await db`update mkt.lead_needs set status = 'removed' where lead_id = ${leadId}`;
  await audit(db, actor, 'lead.reject', 'lead', leadId, { reason });
}

/**
 * A fake or wrong lead is removed. Ops picks, unlock by unlock, which vendors get credits back.
 */
export async function markLeadFake(sql: Sql, leadId: string, refundUnlockIds: string[], actor: string, reason: string) {
  return sql.begin(async (tx) => {
    const [lead] = await tx<Lead[]>`select * from mkt.leads where id = ${leadId} for update`;
    if (!lead) throw new DomainError('not_found', 'Lead not found');
    await tx`update mkt.leads set status = 'fake', notes = notes || E'\n' || ${'Fake: ' + reason} where id = ${leadId}`;
    await tx`update mkt.lead_needs set status = 'removed' where lead_id = ${leadId}`;
    let refunded = 0;
    if (refundUnlockIds.length) {
      const rows = await tx<{ id: string; vendor_id: string; credits_spent: number; credit_kind: 'plan' | 'topup' }[]>`
        update mkt.unlocks u set refunded = true
        from mkt.lead_needs ln
        where u.lead_need_id = ln.id and ln.lead_id = ${leadId}
          and u.id = any(${refundUnlockIds}::uuid[]) and not u.refunded
        returning u.id, u.vendor_id, u.credits_spent, u.credit_kind`;
      for (const r of rows) {
        await tx`
          insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason, ref_id, note, created_by)
          values (${r.vendor_id}, ${r.credit_kind}, ${r.credits_spent}, 'refund_fake', ${r.id}, ${reason}, ${actor})`;
        refunded++;
      }
    }
    await audit(tx, actor, 'lead.fake', 'lead', leadId, { reason, refunded });
    return { refunded };
  });
}

// ---------------------------------------------------------------- credits
export type Balances = { plan: number; topup: number; planUsable: boolean; planTiers: string[] | 'all' };

export async function balances(db: Db, vendorId: string): Promise<Balances> {
  const rows = await db<{ credit_kind: 'plan' | 'topup'; total: number }[]>`
    select credit_kind, coalesce(sum(delta), 0)::int as total from mkt.credit_ledger
    where vendor_id = ${vendorId} group by credit_kind`;
  const subs = await db<{ tier_codes: string[] | null }[]>`
    select p.tier_codes from mkt.vendor_subscriptions s join mkt.packs p on p.id = s.pack_id
    where s.vendor_id = ${vendorId} and s.status = 'active' and (s.ends_at is null or s.ends_at > now())`;
  const planTiers: string[] | 'all' = subs.some((s) => s.tier_codes == null)
    ? 'all'
    : Array.from(new Set(subs.flatMap((s) => s.tier_codes ?? [])));
  return {
    plan: rows.find((r) => r.credit_kind === 'plan')?.total ?? 0,
    topup: rows.find((r) => r.credit_kind === 'topup')?.total ?? 0,
    planUsable: subs.length > 0,
    planTiers,
  };
}

export async function grantCredits(
  db: Db,
  vendorId: string,
  kind: 'plan' | 'topup',
  amount: number,
  reason: 'purchase' | 'booking_reward' | 'adjustment',
  refId: string | null,
  actor: string | null,
  note = ''
) {
  if (amount === 0) return;
  await db`
    insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason, ref_id, note, created_by)
    values (${vendorId}, ${kind}, ${amount}, ${reason}, ${refId}, ${note}, ${actor})`;
}

// ---------------------------------------------------------------- vendor lead feed
export type NeedCard = {
  need_id: string;
  lead_id: string;
  category_id: number;
  category_name: string;
  bride_first_name: string;
  city_name: string;
  event_date: string | null;
  guest_count: number | null;
  tier_label: string | null;
  budget_inr: number | null;
  unlocks: number;
  unlock_cap: number;
  credit_cost: number;
  direct: boolean;
  shortlisted: boolean;
  other_categories: number;
  created_at: Date;
};

/** Open, verified needs a vendor may unlock: own category, served city, under the cap. */
export async function visibleNeeds(db: Db, vendorId: string) {
  return db<NeedCard[]>`
    with v as (select * from mkt.vendors where id = ${vendorId} and status = 'live')
    select ln.id as need_id, l.id as lead_id, ln.category_id, c.name as category_name,
           split_part(l.bride_name, ' ', 1) as bride_first_name, ci.name as city_name,
           to_char(l.event_date, 'YYYY-MM-DD') as event_date, l.guest_count, bt.label as tier_label, ln.budget_inr,
           (select count(*) from mkt.unlocks u where u.lead_need_id = ln.id and not u.refunded)::int as unlocks,
           ln.unlock_cap, c.unlock_credit_cost as credit_cost, (ln.direct_vendor_id is not null) as direct,
           (v.id = any(ln.preferred_vendor_ids)) as shortlisted,
           (select count(*) from mkt.lead_needs o where o.lead_id = l.id and o.id <> ln.id and o.status <> 'removed')::int
             as other_categories,
           l.verified_at as created_at
    from v
    join mkt.lead_needs ln on ln.category_id = v.category_id and ln.status = 'open'
    join mkt.leads l on l.id = ln.lead_id and l.status = 'verified'
    join mkt.categories c on c.id = ln.category_id
    join mkt.cities ci on ci.id = l.city_id
    left join mkt.budget_tiers bt on bt.id = ln.budget_tier_id
    where (l.city_id = v.city_id or l.city_id = any(v.service_city_ids))
      and (ln.direct_vendor_id is null or ln.direct_vendor_id = v.id)
      and not exists (select 1 from mkt.unlocks u where u.lead_need_id = ln.id and u.vendor_id = v.id)
      -- A wedding that has already happened is not a lead.
      and coalesce((select max(e.event_date) from mkt.lead_events e where e.lead_id = l.id), l.event_date, 'infinity'::date) >= (now() at time zone 'Asia/Kolkata')::date
    order by (ln.direct_vendor_id is not null) desc, (v.id = any(ln.preferred_vendor_ids)) desc, l.verified_at desc
    limit 200`;
}

// ---------------------------------------------------------------- unlock
export async function unlockNeed(sql: Sql, needId: string, vendorId: string, actor: string) {
  return sql.begin(async (tx) => {
    const [need] = await tx<(LeadNeed & { lead_status: string; city_id: number; tier_code: string | null })[]>`
      select ln.*, l.status as lead_status, l.city_id, bt.code as tier_code
      from mkt.lead_needs ln
      join mkt.leads l on l.id = ln.lead_id
      left join mkt.budget_tiers bt on bt.id = ln.budget_tier_id
      where ln.id = ${needId}
      for update of ln`;
    if (!need) throw new DomainError('not_found', 'Lead not found');
    if (need.lead_status !== 'verified' || need.status !== 'open') {
      throw new DomainError('not_open', 'This lead is no longer open');
    }
    const [vendor] = await tx<{ id: string; category_id: number; city_id: number; service_city_ids: number[]; status: string }[]>`
      select id, category_id, city_id, service_city_ids, status from mkt.vendors where id = ${vendorId}`;
    if (!vendor || vendor.status !== 'live') throw new DomainError('not_live', 'Your profile must be live to unlock leads');
    if (vendor.category_id !== need.category_id) throw new DomainError('wrong_category', 'This lead is for another category');
    if (vendor.city_id !== need.city_id && !vendor.service_city_ids.includes(need.city_id)) {
      throw new DomainError('wrong_city', 'This lead is outside the cities you serve');
    }
    if (need.direct_vendor_id && need.direct_vendor_id !== vendorId) {
      throw new DomainError('direct_other', 'This request was sent to another vendor');
    }
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from mkt.unlocks where lead_need_id = ${needId} and not refunded`;
    if (n >= need.unlock_cap) throw new DomainError('capped', 'This lead has reached its unlock limit');
    const [already] = await tx`select 1 from mkt.unlocks where lead_need_id = ${needId} and vendor_id = ${vendorId}`;
    if (already) throw new DomainError('already', 'You already unlocked this lead');

    const [{ cost }] = await tx<{ cost: number }[]>`
      select unlock_credit_cost as cost from mkt.categories where id = ${need.category_id}`;
    // Serialise spending per vendor so two unlocks cannot overdraw the same balance.
    await tx`select pg_advisory_xact_lock(hashtext(${'credits:' + vendorId}))`;
    const bal = await balances(tx, vendorId);
    const planEligible =
      bal.planUsable && (need.tier_code == null || bal.planTiers === 'all' || bal.planTiers.includes(need.tier_code));
    const kind: 'plan' | 'topup' | null =
      planEligible && bal.plan >= cost ? 'plan' : bal.topup >= cost ? 'topup' : null;
    if (!kind) throw new DomainError('no_credits', `You need ${cost} credit${cost > 1 ? 's' : ''} to unlock this lead`);

    const [unlock] = await tx<{ id: string }[]>`
      insert into mkt.unlocks (lead_need_id, vendor_id, credits_spent, credit_kind, round)
      values (${needId}, ${vendorId}, ${cost}, ${kind}, ${need.reopen_rounds}) returning id`;
    await tx`
      insert into mkt.credit_ledger (vendor_id, credit_kind, delta, reason, ref_id, created_by)
      values (${vendorId}, ${kind}, ${-cost}, 'unlock', ${unlock.id}, ${actor})`;
    const [thread] = await tx<{ id: string }[]>`
      insert into mkt.threads (lead_need_id, vendor_id) values (${needId}, ${vendorId}) returning id`;
    if (n + 1 >= need.unlock_cap) {
      await tx`update mkt.lead_needs set status = 'capped' where id = ${needId}`;
    }
    await audit(tx, actor, 'need.unlock', 'need', needId, { vendorId, cost, kind });
    return { unlockId: unlock.id, threadId: thread.id, creditKind: kind, cost };
  });
}

/** Staff decide case by case whether to reopen a capped lead. Each round adds more unlocks. */
export async function reopenNeed(db: Db, needId: string, actor: string) {
  const increment = await getSetting(db, 'reopen_increment', 10);
  const maxRounds = await getSetting(db, 'max_reopen_rounds', 2);
  const [need] = await db<LeadNeed[]>`select * from mkt.lead_needs where id = ${needId}`;
  if (!need) throw new DomainError('not_found', 'Need not found');
  if (need.status !== 'capped') throw new DomainError('not_capped', 'Only a capped lead can be reopened');
  if (need.reopen_rounds >= maxRounds) {
    throw new DomainError('max_rounds', `This lead has already been reopened ${maxRounds} times`);
  }
  await db`
    update mkt.lead_needs set unlock_cap = unlock_cap + ${increment}, reopen_rounds = reopen_rounds + 1, status = 'open'
    where id = ${needId}`;
  await audit(db, actor, 'need.reopen', 'need', needId, { increment });
}

// ---------------------------------------------------------------- bride side
export async function brideCanAccessLead(db: Db, leadId: string, profileId: string) {
  const [row] = await db`
    select 1 from mkt.leads l
    left join mkt.wedding_members m on m.wedding_id = l.wedding_id and m.profile_id = ${profileId}
    where l.id = ${leadId} and (l.bride_profile_id = ${profileId} or m.profile_id is not null)`;
  return Boolean(row);
}

/** Bride switches a category off: booked outside OLReady, or no longer needed. */
export async function closeNeedByBride(
  db: Db,
  needId: string,
  profileId: string,
  bookedOutside: { vendorName: string; reason: string } | null
) {
  const [need] = await db<LeadNeed[]>`select * from mkt.lead_needs where id = ${needId}`;
  if (!need) throw new DomainError('not_found', 'Not found');
  if (!(await brideCanAccessLead(db, need.lead_id, profileId))) throw new DomainError('forbidden', 'Not your enquiry');
  if (need.status === 'closed_booked') throw new DomainError('booked', 'This category is already booked');
  await db`
    update mkt.lead_needs set status = 'closed_by_bride',
      booked_outside = ${bookedOutside ? db.json({ vendor_name: bookedOutside.vendorName, reason: bookedOutside.reason }) : null}
    where id = ${needId}`;
  await audit(db, profileId, 'need.closed_by_bride', 'need', needId, { bookedOutside });
}

// ---------------------------------------------------------------- booking reports
/**
 * Either side reporting confirms the booking. Only the reporter is rewarded:
 * vendors get credits, brides get a perk to claim within the claim window.
 */
export async function reportBooking(
  sql: Sql,
  input: { needId: string; vendorId: string; reporterProfileId: string; side: 'bride' | 'vendor'; amountInr?: number | null }
) {
  return sql.begin(async (tx) => {
    const [need] = await tx<LeadNeed[]>`select * from mkt.lead_needs where id = ${input.needId} for update`;
    if (!need) throw new DomainError('not_found', 'Not found');
    const [thread] = await tx<{ id: string }[]>`
      select id from mkt.threads where lead_need_id = ${input.needId} and vendor_id = ${input.vendorId}`;
    if (!thread) throw new DomainError('no_thread', 'Only a vendor who unlocked this lead can be booked through it');
    if (input.side === 'vendor') {
      const [own] = await tx`select 1 from mkt.vendors where id = ${input.vendorId} and owner_profile_id = ${input.reporterProfileId}`;
      if (!own) throw new DomainError('forbidden', 'Not your business');
    } else if (!(await brideCanAccessLead(tx, need.lead_id, input.reporterProfileId))) {
      throw new DomainError('forbidden', 'Not your enquiry');
    }
    if (need.booked_vendor_id && need.booked_vendor_id !== input.vendorId) {
      throw new DomainError('booked_other', 'This category is already booked with another vendor');
    }
    const [dupe] = await tx`select 1 from mkt.booking_reports where lead_need_id = ${input.needId} and reporter_side = ${input.side}`;
    if (dupe) throw new DomainError('already', 'This booking has already been reported');

    const [report] = await tx<{ id: string }[]>`
      insert into mkt.booking_reports (lead_need_id, vendor_id, reported_by, reporter_side, amount_inr)
      values (${input.needId}, ${input.vendorId}, ${input.reporterProfileId}, ${input.side}, ${input.amountInr ?? null})
      returning id`;
    await tx`
      update mkt.lead_needs set status = 'closed_booked', booked_vendor_id = ${input.vendorId} where id = ${input.needId}`;
    await tx`update mkt.threads set status = 'booked' where id = ${thread.id}`;

    if (input.side === 'vendor') {
      const reward = await getSetting(tx, 'booking_reward_credits', 1);
      await grantCredits(tx, input.vendorId, 'topup', reward, 'booking_reward', report.id, input.reporterProfileId);
    } else {
      const claimDays = await getSetting(tx, 'bride_perk_claim_days', 60);
      await tx`
        insert into mkt.bride_perks (profile_id, perk, booking_report_id, claim_by)
        values (${input.reporterProfileId}, 'rm_access_7d', ${report.id}, now() + make_interval(days => ${claimDays}))`;
    }
    await audit(tx, input.reporterProfileId, 'booking.report', 'need', input.needId, {
      vendorId: input.vendorId,
      side: input.side,
    });
    return report;
  });
}

export async function activatePerk(db: Db, perkId: string, profileId: string) {
  const days = await getSetting(db, 'bride_perk_length_days', 7);
  const [p] = await db<{ id: string }[]>`
    update mkt.bride_perks set activated_at = now(), expires_at = now() + make_interval(days => ${days})
    where id = ${perkId} and profile_id = ${profileId} and activated_at is null and claim_by > now()
    returning id`;
  if (!p) throw new DomainError('perk_unavailable', 'This perk has been used or has expired');
}
