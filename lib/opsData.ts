import type { Db } from './db';

// Every list the team works with, from one definition each: what it selects, which columns can
// be searched and filtered, and how a row links to its page. Column expressions are constants
// written here, never user input.

export type Filters = { q?: string; status?: string; city?: string; category?: string; from?: string; to?: string; sort?: string; dir?: 'asc' | 'desc' };
export type Column = { key: string; label: string; kind?: 'date' | 'money' | 'bool' | 'number' };
export type DataSet = {
  key: string;
  label: string;
  group: 'Vendors' | 'Leads' | 'Money' | 'Trust' | 'Activity';
  blurb: string;
  from: string; // FROM ... JOIN ... (constant)
  select: string; // column list (constant)
  columns: Column[];
  search: string[]; // expressions searched with ilike
  statusCol?: string;
  statuses?: string[];
  cityCol?: string;
  categoryCol?: string;
  dateCol: string;
  link?: (r: Record<string, unknown>) => string | null;
};

export const DATASETS: DataSet[] = [
  {
    key: 'vendors',
    label: 'Vendors',
    group: 'Vendors',
    blurb: 'Every profile, with status, verification and contact details.',
    from: 'mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id',
    select: `v.id, v.slug, v.business_name, c.name as category, ci.name as city, v.status, v.claim_status, v.verified_at is not null as verified, v.assured,
      v.starting_price_inr, v.phone, v.email,
      (select coalesce(sum(delta), 0) from mkt.credit_ledger l where l.vendor_id = v.id) as credits,
      (select coalesce(sum(delta_inr), 0) from mkt.ad_wallet_ledger w where w.vendor_id = v.id) as wallet_inr, v.created_at`,
    columns: [
      { key: 'business_name', label: 'Business' },
      { key: 'category', label: 'Category' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' },
      { key: 'verified', label: 'Verified', kind: 'bool' },
      { key: 'assured', label: 'Assured', kind: 'bool' },
      { key: 'credits', label: 'Credits', kind: 'number' },
      { key: 'wallet_inr', label: 'Ads wallet', kind: 'money' },
      { key: 'phone', label: 'Phone' },
      { key: 'created_at', label: 'Joined', kind: 'date' },
    ],
    search: ['v.business_name', 'v.phone', 'v.email', 'v.slug'],
    statusCol: 'v.status',
    statuses: ['draft', 'pending_review', 'live', 'suspended', 'closed'],
    cityCol: 'ci.slug',
    categoryCol: 'c.slug',
    dateCol: 'v.created_at',
    link: (r) => `/v/${r.slug}`,
  },
  {
    key: 'leads',
    label: 'Leads',
    group: 'Leads',
    blurb: 'Every enquiry with its verification state and categories.',
    from: 'mkt.leads l join mkt.cities ci on ci.id = l.city_id',
    select: `l.id, l.bride_name, l.phone, l.email, ci.name as city, l.event_date, l.guest_count, l.source, l.campaign, l.status, l.whatsapp_opt_in,
      (select string_agg(c.name, ', ') from mkt.lead_needs ln join mkt.categories c on c.id = ln.category_id where ln.lead_id = l.id and ln.status <> 'removed') as categories,
      l.verified_at, l.created_at`,
    columns: [
      { key: 'bride_name', label: 'Bride' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'categories', label: 'Wants' },
      { key: 'event_date', label: 'Wedding', kind: 'date' },
      { key: 'guest_count', label: 'Guests', kind: 'number' },
      { key: 'source', label: 'Source' },
      { key: 'campaign', label: 'Campaign' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Received', kind: 'date' },
    ],
    search: ['l.bride_name', 'l.phone', 'l.email', 'l.campaign'],
    statusCol: 'l.status',
    statuses: ['new', 'verifying', 'verified', 'rejected', 'fake'],
    cityCol: 'ci.slug',
    dateCol: 'l.created_at',
    link: (r) => `/ops/leads/${r.id}`,
  },
  {
    key: 'needs',
    label: 'Lead categories',
    group: 'Leads',
    blurb: 'One row per category a bride asked for: cap, unlocks and outcome.',
    from: 'mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id join mkt.cities ci on ci.id = l.city_id left join mkt.vendors bv on bv.id = ln.booked_vendor_id',
    select: `ln.id, l.id as lead_id, l.bride_name, c.name as category, ci.name as city, ln.status, ln.budget_inr, ln.unlock_cap,
      (select count(*) from mkt.unlocks u where u.lead_need_id = ln.id and not u.refunded) as unlocks, bv.business_name as booked_with, ln.created_at`,
    columns: [
      { key: 'bride_name', label: 'Bride' },
      { key: 'category', label: 'Category' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' },
      { key: 'budget_inr', label: 'Budget', kind: 'money' },
      { key: 'unlocks', label: 'Unlocks', kind: 'number' },
      { key: 'unlock_cap', label: 'Cap', kind: 'number' },
      { key: 'booked_with', label: 'Booked with' },
      { key: 'created_at', label: 'Created', kind: 'date' },
    ],
    search: ['l.bride_name', 'l.phone', 'bv.business_name'],
    statusCol: 'ln.status',
    statuses: ['open', 'capped', 'closed_booked', 'closed_by_bride', 'removed'],
    cityCol: 'ci.slug',
    categoryCol: 'c.slug',
    dateCol: 'ln.created_at',
    link: (r) => `/ops/leads/${r.lead_id}`,
  },
  {
    key: 'unlocks',
    label: 'Unlocks',
    group: 'Leads',
    blurb: 'Which vendor unlocked which request, with credits spent.',
    from: 'mkt.unlocks u join mkt.vendors v on v.id = u.vendor_id join mkt.lead_needs ln on ln.id = u.lead_need_id join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id join mkt.cities ci on ci.id = l.city_id',
    select: `u.id, v.business_name, l.id as lead_id, l.bride_name, c.name as category, ci.name as city, u.credits_spent, u.credit_kind, u.round, u.refunded, u.created_at`,
    columns: [
      { key: 'business_name', label: 'Vendor' },
      { key: 'bride_name', label: 'Bride' },
      { key: 'category', label: 'Category' },
      { key: 'city', label: 'City' },
      { key: 'credits_spent', label: 'Credits', kind: 'number' },
      { key: 'credit_kind', label: 'From' },
      { key: 'refunded', label: 'Refunded', kind: 'bool' },
      { key: 'created_at', label: 'When', kind: 'date' },
    ],
    search: ['v.business_name', 'l.bride_name'],
    cityCol: 'ci.slug',
    categoryCol: 'c.slug',
    dateCol: 'u.created_at',
    link: (r) => `/ops/leads/${r.lead_id}`,
  },
  {
    key: 'orders',
    label: 'Orders',
    group: 'Money',
    blurb: 'Every purchase: packs, wallet top-ups and the RM service.',
    from: 'mkt.orders o join mkt.profiles pr on pr.id = o.profile_id left join mkt.vendors v on v.id = o.vendor_id left join mkt.packs p on p.id = o.pack_id left join mkt.services s on s.code = o.service_code',
    select: `o.id, coalesce(v.business_name, pr.full_name) as buyer, coalesce(p.name, s.name, 'Ads wallet') as product, o.amount_inr, o.discount_inr, o.coupon_code,
      o.refunded_inr, o.gateway, o.gateway_payment_id, o.status, o.buyer_gstin, o.created_at, o.paid_at`,
    columns: [
      { key: 'buyer', label: 'Buyer' },
      { key: 'product', label: 'Product' },
      { key: 'amount_inr', label: 'Paid', kind: 'money' },
      { key: 'discount_inr', label: 'Discount', kind: 'money' },
      { key: 'refunded_inr', label: 'Refunded', kind: 'money' },
      { key: 'gateway', label: 'Gateway' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Created', kind: 'date' },
    ],
    search: ['v.business_name', 'pr.full_name', 'pr.email', 'o.gateway_payment_id', 'o.coupon_code', 'o.id::text'],
    statusCol: 'o.status',
    statuses: ['created', 'paid', 'failed', 'refunded'],
    dateCol: 'o.created_at',
    link: (r) => `/ops/orders/${r.id}`,
  },
  {
    key: 'refunds',
    label: 'Refunds',
    group: 'Money',
    blurb: 'Money sent back, how, why and what was taken back.',
    from: 'mkt.refunds r join mkt.orders o on o.id = r.order_id join mkt.profiles pr on pr.id = o.profile_id left join mkt.vendors v on v.id = o.vendor_id join mkt.profiles by on by.id = r.created_by',
    select: `r.id, o.id as order_id, coalesce(v.business_name, pr.full_name) as buyer, r.amount_inr, r.method, coalesce(r.gateway_refund_id, r.reference) as reference, r.reason, by.full_name as by_name, r.created_at`,
    columns: [
      { key: 'buyer', label: 'Buyer' },
      { key: 'amount_inr', label: 'Amount', kind: 'money' },
      { key: 'method', label: 'How' },
      { key: 'reference', label: 'Reference' },
      { key: 'reason', label: 'Why' },
      { key: 'by_name', label: 'By' },
      { key: 'created_at', label: 'When', kind: 'date' },
    ],
    search: ['v.business_name', 'pr.full_name', 'r.reason', 'r.reference'],
    dateCol: 'r.created_at',
    link: (r) => `/ops/orders/${r.order_id}`,
  },
  {
    key: 'plans',
    label: 'Plans',
    group: 'Money',
    blurb: 'Vendor plans and their dates.',
    from: 'mkt.vendor_subscriptions s join mkt.vendors v on v.id = s.vendor_id join mkt.packs p on p.id = s.pack_id join mkt.cities ci on ci.id = v.city_id join mkt.categories c on c.id = v.category_id',
    select: `s.id, v.business_name, v.slug, p.name as plan, s.status, s.starts_at, s.ends_at, s.legacy_ref, s.created_at`,
    columns: [
      { key: 'business_name', label: 'Vendor' },
      { key: 'plan', label: 'Plan' },
      { key: 'status', label: 'Status' },
      { key: 'starts_at', label: 'Starts', kind: 'date' },
      { key: 'ends_at', label: 'Ends', kind: 'date' },
      { key: 'legacy_ref', label: 'Old site ref' },
    ],
    search: ['v.business_name', 's.legacy_ref'],
    statusCol: 's.status',
    statuses: ['pending_contract', 'active', 'expired', 'cancelled'],
    cityCol: 'ci.slug',
    categoryCol: 'c.slug',
    dateCol: 's.created_at',
    link: (r) => `/v/${r.slug}`,
  },
  {
    key: 'credits',
    label: 'Credit ledger',
    group: 'Money',
    blurb: 'Every credit in and out, per vendor.',
    from: 'mkt.credit_ledger l join mkt.vendors v on v.id = l.vendor_id',
    select: `l.id, v.business_name, v.slug, l.credit_kind, l.delta, l.reason, l.note, l.created_at`,
    columns: [
      { key: 'business_name', label: 'Vendor' },
      { key: 'credit_kind', label: 'Kind' },
      { key: 'delta', label: 'Change', kind: 'number' },
      { key: 'reason', label: 'Reason' },
      { key: 'note', label: 'Note' },
      { key: 'created_at', label: 'When', kind: 'date' },
    ],
    search: ['v.business_name', 'l.note'],
    statusCol: 'l.reason',
    statuses: ['purchase', 'unlock', 'refund_fake', 'booking_reward', 'adjustment', 'expiry'],
    dateCol: 'l.created_at',
    link: (r) => `/v/${r.slug}`,
  },
  {
    key: 'wallet',
    label: 'Ads wallet ledger',
    group: 'Money',
    blurb: 'Top-ups, Boost visits, banners and refunds.',
    from: 'mkt.ad_wallet_ledger w join mkt.vendors v on v.id = w.vendor_id',
    select: `w.id, v.business_name, v.slug, w.delta_inr, w.reason, w.note, w.created_at`,
    columns: [
      { key: 'business_name', label: 'Vendor' },
      { key: 'delta_inr', label: 'Change', kind: 'money' },
      { key: 'reason', label: 'Reason' },
      { key: 'note', label: 'Note' },
      { key: 'created_at', label: 'When', kind: 'date' },
    ],
    search: ['v.business_name', 'w.note'],
    statusCol: 'w.reason',
    statuses: ['topup', 'boost_visit', 'banner', 'banner_refund', 'adjustment'],
    dateCol: 'w.created_at',
    link: (r) => `/v/${r.slug}`,
  },
  {
    key: 'tax-documents',
    label: 'Tax invoices and credit notes',
    group: 'Money',
    blurb: 'Every GST document issued, with the tax split. Download for the accountant or GSTR-1.',
    from: 'mkt.tax_documents d',
    select: `d.id, d.order_id, d.kind, d.number, d.issued_at, d.buyer->>'name' as buyer, d.buyer->>'gstin' as buyer_gstin, d.place_of_supply, d.sac,
      round(d.taxable_paise / 100.0, 2) as taxable_inr, round(d.cgst_paise / 100.0, 2) as cgst_inr, round(d.sgst_paise / 100.0, 2) as sgst_inr,
      round(d.igst_paise / 100.0, 2) as igst_inr, round(d.total_paise / 100.0, 2) as total_inr, d.issued_at as created_at`,
    columns: [
      { key: 'number', label: 'Number' },
      { key: 'kind', label: 'Type' },
      { key: 'issued_at', label: 'Date', kind: 'date' },
      { key: 'buyer', label: 'Buyer' },
      { key: 'buyer_gstin', label: 'GSTIN' },
      { key: 'place_of_supply', label: 'Place of supply' },
      { key: 'taxable_inr', label: 'Taxable', kind: 'money' },
      { key: 'cgst_inr', label: 'CGST', kind: 'money' },
      { key: 'sgst_inr', label: 'SGST/UTGST', kind: 'money' },
      { key: 'igst_inr', label: 'IGST', kind: 'money' },
      { key: 'total_inr', label: 'Total', kind: 'money' },
    ],
    search: ['d.number', "d.buyer->>'name'", "d.buyer->>'gstin'"],
    statusCol: 'd.kind',
    statuses: ['invoice', 'credit_note'],
    dateCol: 'd.issued_at',
    link: (r) => `/ops/orders/${r.order_id}`,
  },
  {
    key: 'reviews',
    label: 'Reviews',
    group: 'Trust',
    blurb: 'All reviews, including pending, hidden and disputed ones.',
    from: 'mkt.reviews r join mkt.vendors v on v.id = r.vendor_id join mkt.profiles p on p.id = r.author_profile_id join mkt.categories c on c.id = v.category_id',
    select: `r.id, v.business_name, v.slug, p.full_name as author, r.rating_artist, r.rating_service, r.verified_booking, r.source, r.status, r.amount_spent_inr, r.body, r.created_at`,
    columns: [
      { key: 'business_name', label: 'Vendor' },
      { key: 'author', label: 'By' },
      { key: 'rating_artist', label: 'Work', kind: 'number' },
      { key: 'rating_service', label: 'Service', kind: 'number' },
      { key: 'verified_booking', label: 'Booked here', kind: 'bool' },
      { key: 'source', label: 'Source' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'When', kind: 'date' },
    ],
    search: ['v.business_name', 'p.full_name', 'r.body'],
    statusCol: 'r.status',
    statuses: ['pending', 'published', 'under_dispute', 'hidden', 'removed'],
    categoryCol: 'c.slug',
    dateCol: 'r.created_at',
    link: (r) => `/v/${r.slug}`,
  },
  {
    key: 'conversations',
    label: 'Conversations',
    group: 'Activity',
    blurb: 'Every vendor and bride chat, with quotes and last activity.',
    from: 'mkt.threads t join mkt.vendors v on v.id = t.vendor_id join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id join mkt.cities ci on ci.id = l.city_id',
    select: `t.id, v.business_name, l.bride_name, c.name as category, ci.name as city, t.status,
      (select count(*) from mkt.messages m where m.thread_id = t.id) as messages,
      (select max(amount_inr) from mkt.quotes q where q.thread_id = t.id and q.status in ('sent','accepted')) as quote_inr,
      (select max(created_at) from mkt.messages m where m.thread_id = t.id) as last_message, t.created_at`,
    columns: [
      { key: 'business_name', label: 'Vendor' },
      { key: 'bride_name', label: 'Bride' },
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' },
      { key: 'messages', label: 'Messages', kind: 'number' },
      { key: 'quote_inr', label: 'Quote', kind: 'money' },
      { key: 'last_message', label: 'Last message', kind: 'date' },
    ],
    search: ['v.business_name', 'l.bride_name'],
    statusCol: 't.status',
    statuses: ['open', 'quoted', 'quote_accepted', 'booked', 'closed'],
    cityCol: 'ci.slug',
    categoryCol: 'c.slug',
    dateCol: 't.created_at',
    link: (r) => `/ops/threads/${r.id}`,
  },
  {
    key: 'callbacks',
    label: 'Callback requests',
    group: 'Activity',
    blurb: 'Every "call me" request and what happened.',
    from: 'mkt.callback_requests cb join mkt.profiles p on p.id = cb.profile_id left join mkt.vendors v on v.id = cb.vendor_id left join mkt.profiles h on h.id = cb.handled_by',
    select: `cb.id, coalesce(v.business_name, p.full_name) as who, p.role, cb.topic, cb.phone, cb.preferred_time, cb.status, cb.outcome, h.full_name as handled_by, cb.created_at`,
    columns: [
      { key: 'who', label: 'Who' },
      { key: 'role', label: 'Role' },
      { key: 'topic', label: 'About' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'outcome', label: 'Outcome' },
      { key: 'handled_by', label: 'By' },
      { key: 'created_at', label: 'Asked', kind: 'date' },
    ],
    search: ['v.business_name', 'p.full_name', 'cb.phone', 'cb.outcome'],
    statusCol: 'cb.status',
    statuses: ['open', 'done'],
    dateCol: 'cb.created_at',
  },
  {
    key: 'emails',
    label: 'Emails',
    group: 'Activity',
    blurb: 'Everything queued or sent, with errors.',
    from: 'mkt.email_outbox e',
    select: `e.id, e.to_email, e.template, e.sent_at, e.error, e.created_at`,
    columns: [
      { key: 'to_email', label: 'To' },
      { key: 'template', label: 'Email' },
      { key: 'sent_at', label: 'Sent', kind: 'date' },
      { key: 'error', label: 'Problem' },
      { key: 'created_at', label: 'Queued', kind: 'date' },
    ],
    search: ['e.to_email', 'e.template', 'e.error'],
    dateCol: 'e.created_at',
  },
  {
    key: 'audit',
    label: 'Audit log',
    group: 'Activity',
    blurb: 'Who changed what, and when.',
    from: 'mkt.audit_log a left join mkt.profiles p on p.id = a.actor_profile_id',
    select: `a.id, coalesce(p.full_name, 'system') as actor, a.action, a.entity, a.entity_id, a.data::text as data, a.created_at`,
    columns: [
      { key: 'actor', label: 'Who' },
      { key: 'action', label: 'Did' },
      { key: 'entity', label: 'On' },
      { key: 'entity_id', label: 'Id' },
      { key: 'data', label: 'Details' },
      { key: 'created_at', label: 'When', kind: 'date' },
    ],
    search: ['p.full_name', 'a.action', 'a.entity_id'],
    dateCol: 'a.created_at',
  },
];

export const dataset = (key: string) => DATASETS.find((d) => d.key === key) ?? null;

function where(db: Db, d: DataSet, f: Filters) {
  const parts = [db`true`];
  const q = f.q?.trim();
  if (q && d.search.length) {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    parts.push(db`(${d.search.map((c, i) => (i ? db`or ${db.unsafe(c)} ilike ${like}` : db`${db.unsafe(c)} ilike ${like}`))})`);
  }
  if (f.status && d.statusCol && d.statuses?.includes(f.status)) parts.push(db`${db.unsafe(d.statusCol)} = ${f.status}`);
  if (f.city && d.cityCol) parts.push(db`${db.unsafe(d.cityCol)} = ${f.city}`);
  if (f.category && d.categoryCol) parts.push(db`${db.unsafe(d.categoryCol)} = ${f.category}`);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) parts.push(db`${db.unsafe(d.dateCol)} >= ${f.from}::date`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) parts.push(db`${db.unsafe(d.dateCol)} < ${f.to}::date + 1`);
  return parts.reduce((a, p, i) => (i ? db`${a} and ${p}` : p));
}

/** Splits a select list into alias → expression, so sorting can use the expression directly. */
function selectMap(select: string) {
  const items: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = '';
  for (const ch of select) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === ',') {
      items.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  const map = new Map<string, string>();
  for (const it of items) {
    const m = it.match(/^([\s\S]*?)\s+as\s+([a-z_]+)$/i);
    if (m) map.set(m[2], m[1]);
    else map.set(it.split('.').pop()!.trim(), it);
  }
  return map;
}

/**
 * One page of a list. Rows are picked first using only the filter and sort columns, then the
 * full row (with its per-row counts) is built for those rows alone, so a page costs the same
 * whether the table holds a hundred rows or a million.
 */
export async function runDataset(db: Db, d: DataSet, f: Filters, page = 1, size = 50) {
  const cols = selectMap(d.select);
  const idExpr = cols.get('id')!;
  const sortKey = d.columns.find((c) => c.key === f.sort)?.key;
  const dir = f.dir === 'asc' ? db`asc` : db`desc`;
  // The default order matches the date indexes (newest first), so page 1 is an index scan.
  const order = sortKey && cols.has(sortKey) ? db`${db.unsafe(cols.get(sortKey)!)} ${dir} nulls last` : db`${db.unsafe(d.dateCol)} desc`;
  const w = where(db, d, f);
  const [ids, [{ n }]] = await Promise.all([
    db<{ id: string; t: string }[]>`
      select ${db.unsafe(idExpr)}::text as id, pg_typeof(${db.unsafe(idExpr)})::text as t
      from ${db.unsafe(d.from)} where ${w} order by ${order}, ${db.unsafe(idExpr)} desc limit ${size} offset ${(page - 1) * size}`,
    db<{ n: number }[]>`select count(*)::int as n from ${db.unsafe(d.from)} where ${w}`,
  ]);
  if (!ids.length) return { rows: [], total: n };
  const list = ids.map((r) => r.id);
  // Compare in the id's own type so the primary key index is used.
  const type = /^[a-z ]+$/.test(ids[0].t) ? ids[0].t : 'text';
  const rows = await db<Record<string, unknown>[]>`
    select ${db.unsafe(d.select)} from ${db.unsafe(d.from)} where ${db.unsafe(idExpr)} = any(${list}::${db.unsafe(type)}[])`;
  const at = new Map(list.map((id, i) => [id, i]));
  rows.sort((a, b) => (at.get(String(a.id)) ?? 0) - (at.get(String(b.id)) ?? 0));
  return { rows, total: n };
}

export async function exportDataset(db: Db, d: DataSet, f: Filters, max = 200000) {
  return db<Record<string, unknown>[]>`select * from (select ${db.unsafe(d.select)} from ${db.unsafe(d.from)} where ${where(db, d, f)}) x order by created_at desc nulls last limit ${max}`;
}

export const csvCell = (v: unknown) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join('; ') : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formulas
  return `"${safe.replace(/"/g, '""')}"`;
};
