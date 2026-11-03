import type { Db, Sql } from './db';
import { DomainError, audit, getSetting } from './db';
import type { VendorCard } from './vendors';

export const WALLET_TOPUPS = [2000, 5000, 10000];
export const PLACEMENTS: Record<string, string> = {
  search: 'Listing pages, above the results',
  profiles: "Other vendors' profiles, under similar vendors",
  home: 'Home page',
};
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India date

// ---------------------------------------------------------------- wallet
export async function walletBalance(db: Db, vendorId: string) {
  const [{ n }] = await db<{ n: number }[]>`select coalesce(sum(delta_inr), 0)::int as n from mkt.ad_wallet_ledger where vendor_id = ${vendorId}`;
  return n;
}

export async function walletLedger(db: Db, vendorId: string, limit = 30) {
  return db<{ id: number; delta_inr: number; reason: string; note: string; created_at: Date }[]>`
    select id, delta_inr, reason, note, created_at from mkt.ad_wallet_ledger where vendor_id = ${vendorId} order by id desc limit ${limit}`;
}

async function walletMove(db: Db, vendorId: string, delta: number, reason: string, ref: string | null, note: string, actor: string | null) {
  await db`
    insert into mkt.ad_wallet_ledger (vendor_id, delta_inr, reason, ref_id, note, created_by)
    values (${vendorId}, ${delta}, ${reason}, ${ref}, ${note}, ${actor})`;
}

/** Staff correct a wallet (goodwill credit, mistakes). Never below zero. */
export async function adjustWallet(sql: Sql, vendorId: string, delta: number, note: string, actor: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new DomainError('bad_amount', 'Enter a whole rupee amount');
  if (!note.trim()) throw new DomainError('note', 'Say why');
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${'wallet:' + vendorId}))`;
    if ((await walletBalance(tx, vendorId)) + delta < 0) throw new DomainError('negative', 'The wallet cannot go below zero');
    await walletMove(tx, vendorId, delta, 'adjustment', null, note.trim(), actor);
    await audit(tx, actor, 'wallet.adjust', 'vendor', vendorId, { delta });
  });
}

// ---------------------------------------------------------------- boosts
export type Boost = {
  id: string;
  vendor_id: string;
  city_ids: number[];
  placements: string[];
  price_per_visit_inr: number;
  daily_budget_inr: number;
  starts_on: string;
  ends_on: string | null;
  status: 'active' | 'paused' | 'ended';
  paused_by_ops: boolean;
};

export async function createBoost(
  db: Db,
  vendor: { id: string; city_id: number; service_city_ids: number[]; status: string },
  input: { placements: string[]; cityIds: number[]; dailyBudget: number; startsOn: string; endsOn: string | null },
  actor: string
) {
  if (vendor.status !== 'live') throw new DomainError('not_live', 'Your profile must be live before you can promote it');
  const placements = [...new Set(input.placements)].filter((p) => PLACEMENTS[p]);
  if (!placements.length) throw new DomainError('placements', 'Pick where the Boost should show');
  const served = new Set([vendor.city_id, ...vendor.service_city_ids]);
  const cities = [...new Set(input.cityIds)].filter((c) => served.has(c));
  if (input.cityIds.length && cities.length !== new Set(input.cityIds).size) throw new DomainError('cities', 'Pick only cities you serve');
  if (!Number.isInteger(input.dailyBudget) || input.dailyBudget < 50) throw new DomainError('budget', 'The daily budget must be at least ₹50');
  const start = input.startsOn || today();
  if (start < today()) throw new DomainError('dates', 'The start date cannot be in the past');
  if (input.endsOn && input.endsOn < start) throw new DomainError('dates', 'The end date must be after the start');
  const price = await getSetting<number>(db, 'boost_price_per_visit', 15);
  if ((await walletBalance(db, vendor.id)) < price) throw new DomainError('wallet', 'Top up your ads wallet first');
  const [b] = await db<{ id: string }[]>`
    insert into mkt.boosts (vendor_id, city_ids, placements, price_per_visit_inr, daily_budget_inr, starts_on, ends_on)
    values (${vendor.id}, ${cities}, ${placements}, ${price}, ${input.dailyBudget}, ${start}, ${input.endsOn || null})
    returning id`;
  await audit(db, actor, 'boost.create', 'boost', b.id, { placements, cities, daily: input.dailyBudget });
  return b.id;
}

export async function setBoostStatus(db: Db, boostId: string, status: 'active' | 'paused' | 'ended', by: { actor: string; vendorId?: string; ops?: boolean }) {
  const [b] = await db<{ vendor_id: string; paused_by_ops: boolean; status: string }[]>`select vendor_id, paused_by_ops, status from mkt.boosts where id = ${boostId}`;
  if (!b || (by.vendorId && b.vendor_id !== by.vendorId)) throw new DomainError('not_found', 'Boost not found');
  if (b.status === 'ended') throw new DomainError('ended', 'This Boost has ended');
  if (!by.ops && b.paused_by_ops && status === 'active') throw new DomainError('ops_paused', 'Our team paused this Boost. Contact support.');
  await db`update mkt.boosts set status = ${status}, paused_by_ops = ${by.ops ? status === 'paused' : b.paused_by_ops} where id = ${boostId}`;
  await audit(db, by.actor, `boost.${status}`, 'boost', boostId, { ops: Boolean(by.ops) });
}

export type SponsoredCard = VendorCard & { boost_id: string };

/**
 * Boosts that may show right now for a category and city: running today, under today's
 * budget, and with enough in the wallet for one more visit. Random order, so budget, not
 * position, decides reach.
 */
export async function sponsored(db: Db, o: { categoryId?: number | null; cityId?: number | null; placement: 'search' | 'profiles' | 'home'; exclude?: string[]; limit?: number }) {
  return db<SponsoredCard[]>`
    select v.*, c.slug as category_slug, c.name as category_name, c.price_unit, ci.name as city_name, ci.slug as city_slug,
           r.rating, coalesce(r.n, 0)::int as review_count, b.id as boost_id
    from mkt.boosts b
    join mkt.vendors v on v.id = b.vendor_id and v.status = 'live'
    join mkt.categories c on c.id = v.category_id
    join mkt.cities ci on ci.id = v.city_id
    left join lateral (
      select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
      from mkt.reviews where vendor_id = v.id and status = 'published'
    ) r on true
    where b.status = 'active' and ${o.placement} = any(b.placements)
      and b.starts_on <= ${today()}::date and (b.ends_on is null or b.ends_on >= ${today()}::date)
      and (${o.categoryId ?? null}::int is null or v.category_id = ${o.categoryId ?? null})
      and (${o.cityId ?? null}::int is null
           or (cardinality(b.city_ids) = 0 and (v.city_id = ${o.cityId ?? null} or ${o.cityId ?? null} = any(v.service_city_ids)))
           or ${o.cityId ?? null} = any(b.city_ids))
      and not (v.id = any(${o.exclude ?? []}::uuid[]))
      and (select coalesce(sum(charged_inr), 0) from mkt.boost_visits bv where bv.boost_id = b.id and bv.day = ${today()}::date) + b.price_per_visit_inr <= b.daily_budget_inr
      and (select coalesce(sum(delta_inr), 0) from mkt.ad_wallet_ledger w where w.vendor_id = v.id) >= b.price_per_visit_inr
    order by random() limit ${o.limit ?? 2}`;
}

/**
 * A visitor opened a Sponsored card. Charged once per visitor per Boost per day, only within
 * the daily budget and the wallet. Returns where to send the visitor.
 */
export async function recordBoostVisit(sql: Sql, boostId: string, visitor: string | null, placement: string) {
  if (!/^[0-9a-f-]{36}$/.test(boostId)) return null;
  return sql.begin(async (tx) => {
    const [b] = await tx<{ id: string; vendor_id: string; slug: string; price: number; daily: number; status: string }[]>`
      select b.id, b.vendor_id, v.slug, b.price_per_visit_inr as price, b.daily_budget_inr as daily, b.status
      from mkt.boosts b join mkt.vendors v on v.id = b.vendor_id where b.id = ${boostId} for update of b`;
    if (!b) return null;
    if (!visitor || b.status !== 'active') return b.slug;
    await tx`select pg_advisory_xact_lock(hashtext(${'wallet:' + b.vendor_id}))`;
    const day = today();
    const [{ spent }] = await tx<{ spent: number }[]>`
      select coalesce(sum(charged_inr), 0)::int as spent from mkt.boost_visits where boost_id = ${b.id} and day = ${day}::date`;
    const affordable = spent + b.price <= b.daily && (await walletBalance(tx, b.vendor_id)) >= b.price;
    const charge = affordable ? b.price : 0;
    const [fresh] = await tx`
      insert into mkt.boost_visits (boost_id, day, visitor, charged_inr, placement) values (${b.id}, ${day}::date, ${visitor}, ${charge}, ${placement.slice(0, 20)})
      on conflict do nothing returning 1`;
    if (fresh && charge) await walletMove(tx, b.vendor_id, -charge, 'boost_visit', b.id, 'Boost visit', null);
    return b.slug;
  });
}

export async function boostsFor(db: Db, vendorId: string) {
  return db<(Boost & { visits_today: number; spent_today: number; visits_total: number; spent_total: number })[]>`
    select b.*, to_char(b.starts_on, 'YYYY-MM-DD') as starts_on, to_char(b.ends_on, 'YYYY-MM-DD') as ends_on,
      (select count(*) from mkt.boost_visits v where v.boost_id = b.id and v.day = ${today()}::date and v.charged_inr > 0)::int as visits_today,
      (select coalesce(sum(charged_inr), 0) from mkt.boost_visits v where v.boost_id = b.id and v.day = ${today()}::date)::int as spent_today,
      (select count(*) from mkt.boost_visits v where v.boost_id = b.id and v.charged_inr > 0)::int as visits_total,
      (select coalesce(sum(charged_inr), 0) from mkt.boost_visits v where v.boost_id = b.id)::int as spent_total
    from mkt.boosts b where b.vendor_id = ${vendorId} order by b.created_at desc`;
}

export async function allBoosts(db: Db) {
  return db<(Boost & { vendor_name: string; vendor_slug: string; spent_total: number; visits_total: number })[]>`
    select b.*, to_char(b.starts_on, 'YYYY-MM-DD') as starts_on, to_char(b.ends_on, 'YYYY-MM-DD') as ends_on,
           v.business_name as vendor_name, v.slug as vendor_slug,
           (select coalesce(sum(charged_inr), 0) from mkt.boost_visits x where x.boost_id = b.id)::int as spent_total,
           (select count(*) from mkt.boost_visits x where x.boost_id = b.id and x.charged_inr > 0)::int as visits_total
    from mkt.boosts b join mkt.vendors v on v.id = b.vendor_id order by (b.status = 'active') desc, b.created_at desc limit 200`;
}

/** Boosts past their end date stop on their own (daily job). */
export async function endFinishedBoosts(db: Db) {
  const r = await db`update mkt.boosts set status = 'ended' where status <> 'ended' and ends_on is not null and ends_on < ${today()}::date returning id`;
  return r.length;
}

// ---------------------------------------------------------------- banners
const firstOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);

/** This month until the 20th, then the next two months. */
export function bookableMonths(now = new Date(Date.now() + 5.5 * 3600e3)) {
  const out: string[] = [];
  if (now.getUTCDate() <= 20) out.push(firstOfMonth(now));
  for (let i = 1; i <= 2; i++) out.push(firstOfMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))));
  return out;
}
export const monthLabel = (m: string) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}T00:00:00Z`));

export async function bannerPrice(db: Db, placement: 'home' | 'city') {
  return getSetting<number>(db, placement === 'home' ? 'banner_price_home' : 'banner_price_city', placement === 'home' ? 12000 : 5000);
}

export async function slotsLeft(db: Db, placement: 'home' | 'city', cityId: number | null, month: string) {
  const slots = await getSetting<number>(db, 'banner_slots', 3);
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from mkt.banners where placement = ${placement} and month = ${month}::date
      and status in ('pending','approved') and (${placement} = 'home' or city_id = ${cityId})`;
  return Math.max(0, slots - n);
}

export async function bookBanner(
  sql: Sql,
  vendor: { id: string; slug: string; status: string },
  input: { placement: 'home' | 'city'; cityId: number | null; month: string; headline: string; imageUrl: string },
  actor: string
) {
  if (!(await getSetting<number>(sql, 'banners_self_serve', 1))) throw new DomainError('off', 'Banner booking is paused. Contact our team.');
  if (vendor.status !== 'live') throw new DomainError('not_live', 'Your profile must be live before you can book a banner');
  if (!bookableMonths().includes(input.month)) throw new DomainError('month', 'Pick one of the months on offer');
  if (input.placement === 'city' && !input.cityId) throw new DomainError('city', 'Pick a city');
  const headline = input.headline.trim();
  if (headline.length < 5 || headline.length > 90) throw new DomainError('headline', 'Write a headline of 5 to 90 characters');
  const price = await bannerPrice(sql, input.placement);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`banner:${input.placement}:${input.cityId ?? 0}:${input.month}`}))`;
    await tx`select pg_advisory_xact_lock(hashtext(${'wallet:' + vendor.id}))`;
    if ((await slotsLeft(tx, input.placement, input.cityId, input.month)) < 1) throw new DomainError('full', 'That month is fully booked. Pick another.');
    if ((await walletBalance(tx, vendor.id)) < price) throw new DomainError('wallet', `You need ₹${price.toLocaleString('en-IN')} in your ads wallet`);
    const [b] = await tx<{ id: string }[]>`
      insert into mkt.banners (vendor_id, placement, city_id, month, headline, image_url, link_url, price_inr, created_by)
      values (${vendor.id}, ${input.placement}, ${input.placement === 'city' ? input.cityId : null}, ${input.month}::date, ${headline},
        ${input.imageUrl}, ${`/v/${vendor.slug}`}, ${price}, ${actor})
      returning id`;
    await walletMove(tx, vendor.id, -price, 'banner', b.id, `Banner, ${monthLabel(input.month)}`, actor);
    await audit(tx, actor, 'banner.book', 'banner', b.id, { price });
    return b.id;
  });
}

export async function cancelBanner(sql: Sql, bannerId: string, vendorId: string, actor: string) {
  return sql.begin(async (tx) => {
    const [b] = await tx<{ price_inr: number; status: string }[]>`select price_inr, status from mkt.banners where id = ${bannerId} and vendor_id = ${vendorId} for update`;
    if (!b) throw new DomainError('not_found', 'Banner not found');
    if (b.status !== 'pending') throw new DomainError('bad_state', 'Only banners waiting for review can be cancelled');
    await tx`update mkt.banners set status = 'cancelled' where id = ${bannerId}`;
    if (b.price_inr) await walletMove(tx, vendorId, b.price_inr, 'banner_refund', bannerId, 'Banner cancelled', actor);
  });
}

export async function decideBanner(sql: Sql, bannerId: string, approve: boolean, reason: string, actor: string) {
  return sql.begin(async (tx) => {
    const [b] = await tx<{ vendor_id: string | null; price_inr: number; status: string }[]>`
      select vendor_id, price_inr, status from mkt.banners where id = ${bannerId} for update`;
    if (!b || b.status !== 'pending') throw new DomainError('bad_state', 'This banner is not waiting for review');
    if (!approve && !reason.trim()) throw new DomainError('reason', 'Tell the vendor why');
    await tx`update mkt.banners set status = ${approve ? 'approved' : 'rejected'}, reject_reason = ${reason.trim()}, decided_by = ${actor} where id = ${bannerId}`;
    if (!approve && b.vendor_id && b.price_inr) await walletMove(tx, b.vendor_id, b.price_inr, 'banner_refund', bannerId, 'Banner not approved', actor);
    await audit(tx, actor, approve ? 'banner.approve' : 'banner.reject', 'banner', bannerId);
    return b.vendor_id;
  });
}

/** Ops can place a banner for a vendor or for OLReady itself, free. */
export async function teamBanner(db: Db, input: { placement: 'home' | 'city'; cityId: number | null; month: string; headline: string; imageUrl: string; linkUrl: string; vendorId: string | null }, actor: string) {
  const link = input.linkUrl.trim();
  if (!/^\/(?!\/)/.test(link) && !/^https:\/\//.test(link)) throw new DomainError('link', 'Link to a page on this site or an https address');
  const [b] = await db<{ id: string }[]>`
    insert into mkt.banners (vendor_id, placement, city_id, month, headline, image_url, link_url, price_inr, status, decided_by, created_by)
    values (${input.vendorId}, ${input.placement}, ${input.placement === 'city' ? input.cityId : null}, ${input.month}::date, ${input.headline.trim()},
      ${input.imageUrl}, ${link}, 0, 'approved', ${actor}, ${actor})
    returning id`;
  return b.id;
}

export type Banner = { id: string; vendor_id: string | null; placement: 'home' | 'city'; city_id: number | null; city_name: string | null; month: string; headline: string; image_url: string; link_url: string; price_inr: number; status: string; reject_reason: string; vendor_name: string | null; created_at: Date };

export async function liveBanners(db: Db, placement: 'home' | 'city', cityId: number | null = null) {
  return db<Banner[]>`
    select b.*, to_char(b.month, 'YYYY-MM-DD') as month, ci.name as city_name, v.business_name as vendor_name
    from mkt.banners b left join mkt.cities ci on ci.id = b.city_id left join mkt.vendors v on v.id = b.vendor_id
    where b.status = 'approved' and b.placement = ${placement} and b.month = date_trunc('month', ${today()}::date)::date
      and (${placement} = 'home' or b.city_id = ${cityId})
      and (b.vendor_id is null or v.status = 'live')
    order by b.created_at`;
}

export async function bannersFor(db: Db, vendorId: string) {
  return db<Banner[]>`
    select b.*, to_char(b.month, 'YYYY-MM-DD') as month, ci.name as city_name, null as vendor_name
    from mkt.banners b left join mkt.cities ci on ci.id = b.city_id where b.vendor_id = ${vendorId} order by b.month desc, b.created_at desc`;
}

export async function bannerQueue(db: Db) {
  return db<Banner[]>`
    select b.*, to_char(b.month, 'YYYY-MM-DD') as month, ci.name as city_name, v.business_name as vendor_name
    from mkt.banners b left join mkt.cities ci on ci.id = b.city_id left join mkt.vendors v on v.id = b.vendor_id
    where b.status = 'pending' or (b.status = 'approved' and b.month >= date_trunc('month', ${today()}::date)::date)
    order by (b.status = 'pending') desc, b.month, b.created_at`;
}
