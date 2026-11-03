import type { Db } from './db';
import { DomainError, audit } from './db';

export type QuoteLine = {
  quote_id: string;
  thread_id: string;
  vendor_name: string;
  vendor_slug: string;
  rating: number | null;
  amount_inr: number;
  details: string;
  status: 'sent' | 'accepted' | 'declined' | 'withdrawn';
  created_at: Date;
  reading: { included: string[]; extra: string[]; ask: string[] } | null;
};
export type CategoryLine = {
  category_id: number;
  category_name: string;
  planned: number | null;
  quotes: QuoteLine[];
  booked: { vendor: string; amount: number | null } | null;
  items: number; // other costs filed under this category
  likely: number;
  source: 'booked' | 'lowest_quote' | 'planned' | 'none';
};
export type BudgetSummary = {
  total: number | null;
  visibility: 'owners' | 'family';
  lines: CategoryLine[];
  other: { id: string; label: string; category_id: number | null; amount_inr: number; paid_inr: number }[];
  plannedSum: number;
  bookedSum: number;
  likelyTotal: number;
  paidSum: number;
};

/** The couple (owner, partner) always see the budget; other family only if the couple allows it. */
export async function canSeeBudget(db: Db, weddingId: string, profileId: string) {
  const [m] = await db<{ role: string; vis: string }[]>`
    select m.role, w.budget_visibility as vis from mkt.wedding_members m join mkt.weddings w on w.id = m.wedding_id
    where m.wedding_id = ${weddingId} and m.profile_id = ${profileId}`;
  if (!m) return false;
  return ['owner', 'partner'].includes(m.role) || m.vis === 'family';
}

async function assertCouple(db: Db, weddingId: string, profileId: string) {
  const [m] = await db<{ role: string }[]>`select role from mkt.wedding_members where wedding_id = ${weddingId} and profile_id = ${profileId}`;
  if (!m || !['owner', 'partner'].includes(m.role)) throw new DomainError('forbidden', 'Only the couple can change the budget');
}

/** Every live quote for this wedding's requests, one row per quote, newest first. */
export async function weddingQuotes(db: Db, weddingId: string) {
  return db<(QuoteLine & { category_id: number; category_name: string; need_id: string; booked_vendor: boolean })[]>`
    select q.id as quote_id, t.id as thread_id, v.business_name as vendor_name, v.slug as vendor_slug,
           (select round(avg((r.rating_artist + r.rating_service) / 2.0), 1)::float from mkt.reviews r where r.vendor_id = v.id and r.status = 'published') as rating,
           q.amount_inr, q.details, q.status, q.created_at, ln.category_id, c.name as category_name, ln.id as need_id,
           (ln.booked_vendor_id = v.id) as booked_vendor,
           (select json_build_object('included', r.included, 'extra', r.extra, 'ask', r.ask) from mkt.quote_readings r where r.quote_id = q.id) as reading
    from mkt.quotes q
    join mkt.threads t on t.id = q.thread_id
    join mkt.vendors v on v.id = t.vendor_id
    join mkt.lead_needs ln on ln.id = t.lead_need_id
    join mkt.leads l on l.id = ln.lead_id
    join mkt.categories c on c.id = ln.category_id
    where (l.wedding_id = ${weddingId} or l.bride_profile_id = (select owner_profile_id from mkt.weddings where id = ${weddingId}))
      and q.status in ('sent','accepted') and ln.status <> 'removed'
    order by c.sort, q.amount_inr`;
}

export async function budgetSummary(db: Db, weddingId: string): Promise<BudgetSummary> {
  const [w] = await db<{ total_budget_inr: string | null; budget_visibility: 'owners' | 'family'; owner: string }[]>`
    select total_budget_inr, budget_visibility, owner_profile_id as owner from mkt.weddings where id = ${weddingId}`;
  const [plans, needs, quotes, other] = await Promise.all([
    db<{ category_id: number; budget_inr: string }[]>`select category_id, budget_inr from mkt.category_budgets where wedding_id = ${weddingId}`,
    db<{ category_id: number; category_name: string; sort: number; budget_inr: number | null; booked_vendor: string | null; booked_amount: number | null; booked_outside: Record<string, unknown> | null }[]>`
      select ln.category_id, c.name as category_name, c.sort, ln.budget_inr, bv.business_name as booked_vendor,
             coalesce((select q.amount_inr from mkt.quotes q join mkt.threads t on t.id = q.thread_id
                        where t.lead_need_id = ln.id and t.vendor_id = ln.booked_vendor_id and q.status = 'accepted' order by q.created_at desc limit 1),
                      (select max(br.amount_inr) from mkt.booking_reports br where br.lead_need_id = ln.id)) as booked_amount,
             ln.booked_outside
      from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id
      left join mkt.vendors bv on bv.id = ln.booked_vendor_id
      where (l.wedding_id = ${weddingId} or l.bride_profile_id = ${w.owner}) and ln.status <> 'removed'`,
    weddingQuotes(db, weddingId),
    db<{ id: string; label: string; category_id: number | null; amount_inr: string; paid_inr: string }[]>`
      select id, label, category_id, amount_inr, paid_inr from mkt.budget_items where wedding_id = ${weddingId} order by created_at`,
  ]);
  const cats = await db<{ id: number; name: string; sort: number }[]>`
    select id, name, sort from mkt.categories
    where id in ${db([0, ...plans.map((p) => p.category_id), ...needs.map((n) => n.category_id), ...other.filter((o) => o.category_id).map((o) => o.category_id!)])}
    order by sort`;
  const lines: CategoryLine[] = cats.map((c) => {
    const plan = plans.find((p) => p.category_id === c.id);
    const need = needs.find((n) => n.category_id === c.id);
    const planned = plan ? Number(plan.budget_inr) : (need?.budget_inr ?? null);
    const qs = quotes.filter((q) => q.category_id === c.id);
    const items = other.filter((o) => o.category_id === c.id).reduce((a, o) => a + Number(o.amount_inr), 0);
    const booked = need?.booked_vendor ? { vendor: need.booked_vendor, amount: need.booked_amount } : null;
    const open = qs.filter((q) => q.status === 'sent').map((q) => q.amount_inr);
    let likely = 0;
    let source: CategoryLine['source'] = 'none';
    if (booked?.amount != null) [likely, source] = [booked.amount, 'booked'];
    else if (open.length) [likely, source] = [Math.min(...open), 'lowest_quote'];
    else if (planned != null) [likely, source] = [planned, 'planned'];
    // Costs filed against a category count on top (e.g. extra outfits, or a vendor booked outside OLReady).
    return { category_id: c.id, category_name: c.name, planned, quotes: qs, booked, items, likely: likely + items, source };
  });
  const uncategorised = other.filter((o) => !o.category_id).reduce((a, o) => a + Number(o.amount_inr), 0);
  return {
    total: w.total_budget_inr == null ? null : Number(w.total_budget_inr),
    visibility: w.budget_visibility,
    lines,
    other: other.map((o) => ({ ...o, amount_inr: Number(o.amount_inr), paid_inr: Number(o.paid_inr) })),
    plannedSum: lines.reduce((a, l) => a + (l.planned ?? 0), 0),
    bookedSum: lines.reduce((a, l) => a + (l.booked?.amount ?? 0), 0),
    likelyTotal: lines.reduce((a, l) => a + l.likely, 0) + uncategorised,
    paidSum: other.reduce((a, o) => a + Number(o.paid_inr), 0),
  };
}

const money = (n: number | null) => {
  if (n == null) return null;
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new DomainError('bad_amount', 'Enter an amount in rupees');
  return Math.round(n);
};

export async function setTotalBudget(db: Db, weddingId: string, profileId: string, amount: number | null) {
  await assertCouple(db, weddingId, profileId);
  await db`update mkt.weddings set total_budget_inr = ${money(amount)} where id = ${weddingId}`;
}

export async function setCategoryBudget(db: Db, weddingId: string, profileId: string, categoryId: number, amount: number | null) {
  await assertCouple(db, weddingId, profileId);
  if (amount == null) await db`delete from mkt.category_budgets where wedding_id = ${weddingId} and category_id = ${categoryId}`;
  else
    await db`
      insert into mkt.category_budgets (wedding_id, category_id, budget_inr) values (${weddingId}, ${categoryId}, ${money(amount)})
      on conflict (wedding_id, category_id) do update set budget_inr = excluded.budget_inr`;
}

export async function addBudgetItem(db: Db, weddingId: string, profileId: string, input: { label: string; categoryId: number | null; amount: number; paid: number }) {
  await assertCouple(db, weddingId, profileId);
  const label = input.label.trim().slice(0, 80);
  if (!label) throw new DomainError('label', 'Say what the cost is for');
  const amount = money(input.amount) ?? 0;
  const paid = Math.min(money(input.paid) ?? 0, amount);
  await db`
    insert into mkt.budget_items (wedding_id, label, category_id, amount_inr, paid_inr, created_by)
    values (${weddingId}, ${label}, ${input.categoryId}, ${amount}, ${paid}, ${profileId})`;
}

export async function updateBudgetItemPaid(db: Db, weddingId: string, profileId: string, itemId: string, paid: number) {
  await assertCouple(db, weddingId, profileId);
  const [r] = await db`
    update mkt.budget_items set paid_inr = least(${money(paid) ?? 0}, amount_inr) where id = ${itemId} and wedding_id = ${weddingId} returning id`;
  if (!r) throw new DomainError('not_found', 'Cost not found');
}

export async function removeBudgetItem(db: Db, weddingId: string, profileId: string, itemId: string) {
  await assertCouple(db, weddingId, profileId);
  await db`delete from mkt.budget_items where id = ${itemId} and wedding_id = ${weddingId}`;
}

export async function setBudgetVisibility(db: Db, weddingId: string, profileId: string, vis: 'owners' | 'family') {
  const [m] = await db<{ role: string }[]>`select role from mkt.wedding_members where wedding_id = ${weddingId} and profile_id = ${profileId}`;
  if (m?.role !== 'owner') throw new DomainError('forbidden', 'Only the person who set up the wedding can change this');
  await db`update mkt.weddings set budget_visibility = ${vis === 'family' ? 'family' : 'owners'} where id = ${weddingId}`;
  await audit(db, profileId, 'budget.visibility', 'wedding', weddingId, { vis });
}
