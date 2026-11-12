import type { Db } from './db';

/**
 * The two working lists of the Ops console. Every lead in one place, by where it stands;
 * every vendor in one place, by where they stand with us. Each tab is a question the team asks daily.
 */

// ---------------------------------------------------------------- vendors

export const VENDOR_TABS = {
  review: { label: 'To review', hint: 'New profiles and claims waiting for a yes or a no.' },
  new: { label: 'New this month', hint: 'Went live in the last 30 days. Welcome them and check they have what they need.' },
  plan: { label: 'On a plan', hint: 'Every vendor with an active plan.' },
  ending: { label: 'Ending in 30 days', hint: 'Plans about to run out. The time to talk about renewing.' },
  behind: { label: 'Behind on usage', hint: 'Using far fewer enquiries than the time gone. Call before they decide it does not work.' },
  contract: { label: 'Waiting for contract', hint: 'Paid for a plan; it starts when the signed contract is attached.' },
  lapsed: { label: 'Plan expired', hint: 'Had a plan, it ended, and nothing replaced it. Win them back.' },
  topup: { label: 'Top-ups only', hint: 'Live and buying credits, but never on a plan.' },
  noplan: { label: 'Never paid', hint: 'Live on Olready and have never bought anything.' },
  draft: { label: 'Not finished', hint: 'Started a profile, or one we built that is not claimed yet.' },
  paused: { label: 'Paused or closed', hint: 'Not shown to brides.' },
  all: { label: 'All vendors', hint: 'Everyone, newest first.' },
} as const;
export type VendorTab = keyof typeof VENDOR_TABS;

export type VendorBookRow = {
  id: string; slug: string; business_name: string; category: string; city: string; status: string; claim_status: string; verified: boolean; assured: boolean;
  phone: string | null; email: string | null; created_at: Date; live_at: Date | null;
  plan: string | null; plan_credits: number | null; plan_used: number | null; plan_ends: string | null; plan_days_left: number | null;
  last_plan: string | null; last_plan_ended: string | null; pending_plan: string | null; credits: number; paid_inr: number;
  last_unlock: string | null; unlocks_30: number; open_leads: number; photos: number; calendar_fresh: boolean; behind: boolean;
};

const BOOK = (db: Db) => db`
  select v.id, v.slug, v.business_name, c.name as category, ci.name as city, v.status, v.claim_status, v.verified_at is not null as verified, v.assured,
    v.phone, coalesce(p.email, v.email) as email, v.created_at, v.verified_at as live_at, v.category_id, v.city_id,
    act.name as plan, act.credits as plan_credits, act.ends as plan_ends, act.days_left as plan_days_left, act.days_total as plan_days_total,
    case when act.credits is not null then greatest(0, act.credits - greatest(0, coalesce(led.plan_left, 0)))::int end as plan_used,
    last.name as last_plan, last.ended as last_plan_ended, pend.name as pending_plan,
    (coalesce(led.topup_left, 0) + case when act.credits is not null then greatest(0, coalesce(led.plan_left, 0)) else 0 end)::int as credits,
    coalesce((select sum(o.amount_inr) from mkt.orders o where o.vendor_id = v.id and o.status = 'paid'), 0)::int as paid_inr,
    (select count(*) from mkt.orders o where o.vendor_id = v.id and o.status = 'paid')::int as orders,
    (select to_char(max(u.created_at) at time zone 'Asia/Kolkata', 'YYYY-MM-DD') from mkt.unlocks u where u.vendor_id = v.id) as last_unlock,
    (select count(*) from mkt.unlocks u where u.vendor_id = v.id and u.created_at > now() - interval '30 days')::int as unlocks_30,
    (select count(*) from mkt.vendor_media m where m.vendor_id = v.id)::int as photos,
    coalesce(v.calendar_updated_at > now() - interval '45 days', false) as calendar_fresh,
    (select count(*) from mkt.vendor_claims vc where vc.vendor_id = v.id and vc.status = 'submitted')::int as claims
  from mkt.vendors v
  join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
  left join mkt.profiles p on p.id = v.owner_profile_id
  left join lateral (
    select pk.name, pk.credits, to_char(s.ends_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as ends,
      greatest(0, ceil(extract(epoch from (s.ends_at - now())) / 86400))::int as days_left,
      greatest(1, round(extract(epoch from (s.ends_at - s.starts_at)) / 86400))::int as days_total
    from mkt.vendor_subscriptions s join mkt.packs pk on pk.id = s.pack_id
    where s.vendor_id = v.id and s.status = 'active' and (s.ends_at is null or s.ends_at > now()) order by s.ends_at desc nulls first limit 1) act on true
  left join lateral (
    select pk.name, to_char(s.ends_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as ended
    from mkt.vendor_subscriptions s join mkt.packs pk on pk.id = s.pack_id
    where s.vendor_id = v.id and (s.status = 'expired' or (s.status = 'active' and s.ends_at <= now())) order by s.ends_at desc limit 1) last on true
  left join lateral (
    select pk.name from mkt.vendor_subscriptions s join mkt.packs pk on pk.id = s.pack_id
    where s.vendor_id = v.id and s.status = 'pending_contract' order by s.created_at desc limit 1) pend on true
  left join lateral (
    select sum(delta) filter (where credit_kind = 'plan') as plan_left, sum(delta) filter (where credit_kind = 'topup') as topup_left
    from mkt.credit_ledger cl where cl.vendor_id = v.id) led on true`;

// One definition of each tab, used for both the list and the counts.
const TAB_WHERE: Record<VendorTab, string> = {
  review: `(status = 'pending_review' or claims > 0)`,
  new: `(status = 'live' and coalesce(live_at, created_at) > now() - interval '30 days')`,
  plan: `(plan is not null)`,
  ending: `(plan is not null and plan_days_left <= 30)`,
  behind: `(plan is not null and plan_credits > 0 and (plan_days_total - plan_days_left)::numeric / plan_days_total >= 0.2
            and plan_used::numeric / plan_credits * 100 < (plan_days_total - plan_days_left)::numeric / plan_days_total * 100 - 25)`,
  contract: `(pending_plan is not null)`,
  lapsed: `(plan is null and pending_plan is null and last_plan is not null and status = 'live')`,
  topup: `(status = 'live' and plan is null and last_plan is null and pending_plan is null and orders > 0)`,
  noplan: `(status = 'live' and plan is null and last_plan is null and pending_plan is null and orders = 0)`,
  draft: `(status = 'draft')`,
  paused: `(status in ('suspended', 'closed'))`,
  all: `true`,
};

export async function vendorBookCounts(db: Db) {
  const cols = (Object.keys(TAB_WHERE) as VendorTab[]).map((t) => `count(*) filter (where ${TAB_WHERE[t]})::int as "${t}"`).join(', ');
  const [r] = await db<Record<VendorTab, number>[]>`with b as (${BOOK(db)}) select ${db.unsafe(cols)} from b`;
  return r;
}

export async function vendorBook(db: Db, opts: { tab: VendorTab; q?: string; categoryId?: number | null; limit?: number }) {
  const q = (opts.q ?? '').trim();
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const digits = q.replace(/\D/g, '');
  const order = { ending: 'plan_days_left asc', plan: 'plan_days_left asc nulls last', lapsed: 'last_plan_ended desc', review: 'created_at asc', behind: 'plan_days_left asc', new: 'coalesce(live_at, created_at) desc' } as Partial<Record<VendorTab, string>>;
  return db<VendorBookRow[]>`
    with b as (${BOOK(db)})
    select b.*, ${db.unsafe(TAB_WHERE.behind)} as behind,
      (select count(*) from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id
        where b.status = 'live' and ln.category_id = b.category_id and ln.status = 'open' and l.status = 'verified'
          and (ln.direct_vendor_id is null or ln.direct_vendor_id = b.id)
          and mkt.need_city_ids(ln.id) && (b.city_id || (select service_city_ids from mkt.vendors where id = b.id))
          and not exists (select 1 from mkt.unlocks u where u.lead_need_id = ln.id and u.vendor_id = b.id))::int as open_leads
    from b
    where ${db.unsafe(TAB_WHERE[opts.tab])}
      ${opts.categoryId ? db`and b.category_id = ${opts.categoryId}` : db``}
      ${q ? db`and (b.business_name ilike ${like} or b.email ilike ${like} or b.city ilike ${like} ${digits.length >= 4 ? db`or regexp_replace(coalesce(b.phone, ''), '\\D', '', 'g') like ${`%${digits}%`}` : db``})` : db``}
    order by ${db.unsafe(order[opts.tab] ?? 'created_at desc')} limit ${opts.limit ?? 300}`;
}

// ---------------------------------------------------------------- leads

export const LEAD_TABS = {
  call: { label: 'Numbers to call', hint: 'Visitors who left a number without sending a request.' },
  verify: { label: 'To verify', hint: 'Requests waiting for the verification call.' },
  live: { label: 'With vendors', hint: 'Verified and open. Vendors can unlock these now.' },
  quiet: { label: 'No vendor yet', hint: 'Verified more than two days ago and not one vendor has opened it. Nudge vendors or call her.' },
  capped: { label: 'Full, to decide', hint: 'Reached the vendor limit. Reopen only if she still wants more options.' },
  booked: { label: 'Booked', hint: 'At least one category has a booking on record.' },
  closed: { label: 'Closed', hint: 'Rejected, fake, or she no longer needs it.' },
  all: { label: 'All leads', hint: 'Every request, newest first.' },
} as const;
export type LeadTab = keyof typeof LEAD_TABS;

export type LeadBookRow = {
  id: string; bride_name: string; phone: string; has_email: boolean; city: string; event_date: string | null; source: string; campaign: string | null; status: string;
  verification_stage: number; created_at: Date; verified_at: Date | null;
  needs: { category: string; status: string; unlocks: number; cap: number; quotes: number }[];
};

const LEAD_WHERE: Record<Exclude<LeadTab, 'call'>, string> = {
  verify: `l.status in ('new', 'verifying')`,
  live: `l.status = 'verified' and exists (select 1 from mkt.lead_needs n where n.lead_id = l.id and n.status = 'open')`,
  quiet: `l.status = 'verified' and l.verified_at < now() - interval '2 days'
          and exists (select 1 from mkt.lead_needs n where n.lead_id = l.id and n.status = 'open')
          and not exists (select 1 from mkt.unlocks u join mkt.lead_needs n on n.id = u.lead_need_id where n.lead_id = l.id)`,
  capped: `l.status = 'verified' and exists (select 1 from mkt.lead_needs n where n.lead_id = l.id and n.status = 'capped')`,
  booked: `exists (select 1 from mkt.lead_needs n where n.lead_id = l.id and n.status = 'closed_booked')`,
  closed: `(l.status in ('rejected', 'fake') or (l.status = 'verified' and not exists (select 1 from mkt.lead_needs n where n.lead_id = l.id and n.status in ('open', 'capped', 'closed_booked'))))`,
  all: `true`,
};

export async function leadBookCounts(db: Db) {
  const cols = (Object.keys(LEAD_WHERE) as (keyof typeof LEAD_WHERE)[]).map((t) => `count(*) filter (where ${LEAD_WHERE[t]})::int as "${t}"`).join(', ');
  const [r] = await db<Record<keyof typeof LEAD_WHERE, number>[]>`select ${db.unsafe(cols)} from mkt.leads l`;
  let call = 0;
  try {
    [{ n: call }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.captures where status = 'open'`;
  } catch {
    /* table not migrated yet */
  }
  return { ...r, call } as Record<LeadTab, number>;
}

export async function leadBook(db: Db, opts: { tab: Exclude<LeadTab, 'call'>; q?: string; source?: string | null; limit?: number }) {
  const q = (opts.q ?? '').trim();
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const digits = q.replace(/\D/g, '');
  return db<LeadBookRow[]>`
    select l.id, l.bride_name, l.phone, (l.email is not null) as has_email, ci.name as city, to_char(l.event_date, 'YYYY-MM-DD') as event_date,
      l.source, l.campaign, l.status, l.verification_stage, l.created_at, l.verified_at,
      coalesce((select json_agg(json_build_object('category', c.name, 'status', n.status, 'cap', n.unlock_cap,
          'unlocks', (select count(*) from mkt.unlocks u where u.lead_need_id = n.id and not u.refunded),
          'quotes', (select count(*) from mkt.threads t where t.lead_need_id = n.id and t.status in ('quoted', 'quote_accepted'))) order by c.sort)
        from mkt.lead_needs n join mkt.categories c on c.id = n.category_id where n.lead_id = l.id and n.status <> 'removed'), '[]'::json) as needs
    from mkt.leads l join mkt.cities ci on ci.id = l.city_id
    where ${db.unsafe(LEAD_WHERE[opts.tab])}
      ${opts.source ? db`and l.source = ${opts.source}` : db``}
      ${q ? db`and (l.bride_name ilike ${like} or l.email ilike ${like} or ci.name ilike ${like} or l.campaign ilike ${like} ${digits.length >= 4 ? db`or l.phone like ${`%${digits}%`}` : db``})` : db``}
    order by ${opts.tab === 'verify' ? db`l.created_at asc` : db`l.created_at desc`} limit ${opts.limit ?? 200}`;
}
