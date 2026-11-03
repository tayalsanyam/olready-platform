import type { Db } from './db';
import { getSetting } from './db';
import { type Category, type City, displayValue, fieldsFor, formatInr, listCategories, listCities } from './catalog';

// Price guides: "How much does a wedding venue cost in Mohali?" answered from live OLReady
// listings and real quotes. A guide is indexed only when enough vendors list a price.

export type CostGuide = {
  category: Category;
  city: City | null;
  year: number;
  priced: number;
  low: number;
  mid: number;
  high: number;
  min: number;
  max: number;
  quoteMid: number | null;
  quotes: number;
  breakdown: { label: string; mid: number; n: number }[];
  cheapest: { slug: string; name: string; city: string; price: number }[];
  topRated: { slug: string; name: string; city: string; price: number | null; rating: number; reviews: number }[];
  indexable: boolean;
};

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];

export async function costGuide(db: Db, categorySlug: string, citySlug: string | null): Promise<CostGuide | null> {
  const cats = await listCategories(db, { activeOnly: true });
  const category = cats.find((c) => c.slug === categorySlug);
  if (!category) return null;
  const city = citySlug ? ((await listCities(db)).find((c) => c.slug === citySlug) ?? null) : null;
  if (citySlug && !city) return null;
  const cityId = city?.id ?? null;
  const vendors = await db<{ slug: string; name: string; city: string; price: number | null; attributes: Record<string, unknown>; rating: number | null; reviews: number }[]>`
    select v.slug, v.business_name as name, ci.name as city, v.starting_price_inr as price, v.attributes, r.rating, coalesce(r.n, 0)::int as reviews
    from mkt.vendors v join mkt.cities ci on ci.id = v.city_id
    left join lateral (
      select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
      from mkt.reviews where vendor_id = v.id and status = 'published') r on true
    where v.status = 'live' and v.category_id = ${category.id}
      and (${cityId}::int is null or v.city_id = ${cityId} or ${cityId} = any(v.service_city_ids))`;
  const priced = vendors.filter((v) => v.price != null && v.price > 0);
  if (!priced.length) return null;
  const prices = priced.map((v) => v.price!).sort((a, b) => a - b);
  const [q] = await db<{ n: number; mid: number | null }[]>`
    select count(*)::int as n, percentile_cont(0.5) within group (order by q.amount_inr)::int as mid
    from mkt.quotes q join mkt.threads t on t.id = q.thread_id join mkt.lead_needs ln on ln.id = t.lead_need_id join mkt.leads l on l.id = ln.lead_id
    where ln.category_id = ${category.id} and q.status in ('sent', 'accepted') and q.created_at > now() - interval '365 days'
      and (${cityId}::int is null or l.city_id = ${cityId})`;

  // Middle price by the category's main choice (venue type, artist type ...), where there is enough to say.
  const fields = await fieldsFor(db, category.id);
  const main = fields.find((f) => f.filterable && f.type === 'select');
  const breakdown: CostGuide['breakdown'] = [];
  if (main) {
    for (const o of main.options) {
      const xs = priced.filter((v) => v.attributes[main.key] === o.value).map((v) => v.price!).sort((a, b) => a - b);
      if (xs.length >= 2) breakdown.push({ label: displayValue(main, o.value) ?? o.label, mid: pct(xs, 0.5), n: xs.length });
    }
  }
  const min = await getSetting<number>(db, 'min_vendors_to_index', 3);
  return {
    category,
    city,
    year: new Date(Date.now() + 5.5 * 3600e3).getUTCFullYear(),
    priced: priced.length,
    low: pct(prices, 0.25),
    mid: pct(prices, 0.5),
    high: pct(prices, 0.75),
    min: prices[0],
    max: prices[prices.length - 1],
    quoteMid: q.n >= 5 ? q.mid : null,
    quotes: q.n,
    breakdown: breakdown.sort((a, b) => a.mid - b.mid),
    cheapest: [...priced].sort((a, b) => a.price! - b.price!).slice(0, 3).map((v) => ({ slug: v.slug, name: v.name, city: v.city, price: v.price! })),
    topRated: vendors
      .filter((v) => v.rating != null && v.reviews > 0)
      .sort((a, b) => b.rating! - a.rating! || b.reviews - a.reviews)
      .slice(0, 3)
      .map((v) => ({ slug: v.slug, name: v.name, city: v.city, price: v.price, rating: v.rating!, reviews: v.reviews })),
    indexable: priced.length >= min,
  };
}

const noun = (c: Category) => c.name.replace(/^Wedding /, '').replace(/^Bridal /, 'bridal ').toLowerCase();
export const costPath = (categorySlug: string, citySlug?: string | null) => `/cost/${categorySlug}${citySlug ? `/${citySlug}` : ''}`;
export const costTitle = (g: Pick<CostGuide, 'category' | 'city' | 'year'>) =>
  `${g.category.name} cost in ${g.city?.name ?? 'Chandigarh Tricity'} (${g.year})`;

/** Questions people search, answered from the figures on the page. */
export function costFaq(g: CostGuide) {
  const where = g.city?.name ?? 'the Tricity';
  const unit = g.category.price_unit;
  const faq: { q: string; a: string }[] = [
    {
      q: `How much does a ${noun(g.category)} cost in ${where}?`,
      a: `On OLReady, ${g.category.plural_name.toLowerCase()} in ${where} start from ${formatInr(g.min)} ${unit}. Most start between ${formatInr(g.low)} and ${formatInr(g.high)}, and the middle is about ${formatInr(g.mid)}. These are starting prices from ${g.priced} listed vendors; full quotes depend on your date, functions and guests.`,
    },
  ];
  if (g.quoteMid) faq.push({ q: `What do brides actually get quoted?`, a: `Across ${g.quotes} quotes sent on OLReady in the last year, the middle quote was ${formatInr(g.quoteMid)}. Quotes are usually higher than starting prices because they cover the full package.` });
  if (g.breakdown.length >= 2)
    faq.push({
      q: `Which kind costs more?`,
      a: g.breakdown.map((b) => `${b.label}: about ${formatInr(b.mid)} ${unit}`).join('; ') + '.',
    });
  faq.push({
    q: `How do I get exact prices?`,
    a: `Send one request with your functions, dates and guests. Our team confirms it on a short call, then verified ${g.category.plural_name.toLowerCase()} in ${where} quote you on OLReady, and you compare them side by side.`,
  });
  return faq;
}

/** Every guide worth listing: Tricity-wide per category, and per city where vendors list prices. */
export async function costEntries(db: Db) {
  const [cats, cities] = await Promise.all([listCategories(db, { activeOnly: true }), listCities(db)]);
  const min = await getSetting<number>(db, 'min_vendors_to_index', 3);
  const rows = await db<{ category_id: number; city_id: number; n: number }[]>`
    select v.category_id, ci.id as city_id, count(*)::int as n
    from mkt.vendors v join mkt.cities ci on ci.id = v.city_id or ci.id = any(v.service_city_ids)
    where v.status = 'live' and v.starting_price_inr > 0 group by v.category_id, ci.id`;
  const totals = await db<{ category_id: number; n: number }[]>`
    select category_id, count(*)::int as n from mkt.vendors where status = 'live' and starting_price_inr > 0 group by category_id`;
  const out: { path: string; title: string }[] = [];
  for (const c of cats) {
    if ((totals.find((t) => t.category_id === c.id)?.n ?? 0) >= min) out.push({ path: costPath(c.slug), title: `${c.name} cost in Chandigarh Tricity` });
    for (const ci of cities) {
      if ((rows.find((r) => r.category_id === c.id && r.city_id === ci.id)?.n ?? 0) >= min) out.push({ path: costPath(c.slug, ci.slug), title: `${c.name} cost in ${ci.name}` });
    }
  }
  return out;
}
