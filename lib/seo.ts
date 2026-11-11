import type { Db } from './db';
import { getSetting } from './db';
import { type Category, type City, fieldsFor, formatInr, listCategories } from './catalog';
import { type FilterDef, type VendorCard, countVendors, filtersFor } from './vendors';

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export function landingPath(city: City | { slug: string }, category: Category | { slug: string }, filter?: { slug: string } | null) {
  return `/vendors/${city.slug}/${category.slug}${filter ? `/${filter.slug}` : ''}`;
}

/**
 * "Airbrush makeup" + "Bridal makeup artists" reads as "Airbrush makeup artists", not
 * "Airbrush makeup bridal makeup artists": when the option ends in a word the category name
 * has, the option replaces the start of the name.
 */
export function filterNoun(category: Category, filter: FilterDef) {
  const words = category.plural_name.split(' ');
  const last = filter.label.trim().split(/\s+/).pop()!.toLowerCase();
  const at = words.findIndex((w) => w.toLowerCase() === last);
  if (at >= 0) return [filter.label, ...words.slice(at + 1)].join(' ');
  return `${filter.label} ${category.plural_name.toLowerCase()}`;
}

export function landingTitle(category: Category, city: City, filter?: FilterDef | null) {
  const base = `${category.plural_name} in ${city.name}`;
  if (!filter) return base;
  const low = filter.label.charAt(0).toLowerCase() + filter.label.slice(1);
  // Price bands read as "Wedding venues in Mohali, under ₹1,000 a plate"; ranges as "… for 500+ guests".
  if (filter.field.key === '__price') return `${base}, ${low}`;
  if (typeof filter.value === 'object') return `${base} for ${low}`;
  // "Travels to venue" describes what the vendor does: "Mehendi artists in Mohali who travel to venue".
  if (filter.value === true && /^[A-Z][a-z]+s\b/.test(filter.label) && !/^(Has|Is)\b/.test(filter.label))
    return `${base} who ${low.replace(/^([a-z]+?)s\b/, '$1')}`;
  return `${filterNoun(category, filter)} in ${city.name}`;
}

/** A landing page is indexed only when it lists enough vendors; thin pages hurt the whole site. */
export async function indexable(db: Db, vendorCount: number) {
  const min = await getSetting(db, 'min_vendors_to_index', 3);
  return vendorCount >= min;
}

export type LandingEntry = { path: string; vendors: number; title: string };

/** Every city × category × filter page worth listing in the sitemap. */
/**
 * Every listing page worth indexing, across India: the India-wide page per category, each town per
 * category with enough vendors, its filter pages, and its area pages ("Wedding venues in Sector 35,
 * Chandigarh"). One grouped query finds the towns and areas; filters are counted only where a town
 * already qualifies.
 */
export async function landingEntries(db: Db): Promise<LandingEntry[]> {
  const cats = await listCategories(db, { activeOnly: true });
  const min = await getSetting(db, 'min_vendors_to_index', 3);
  const towns = await db<(City & { category_id: number; n: number })[]>`
    select c.*, v.category_id, count(distinct v.id)::int as n
    from mkt.vendors v join mkt.cities c on c.id = v.city_id or c.id = any(v.service_city_ids)
    where v.status = 'live' and c.active group by c.id, v.category_id having count(distinct v.id) >= ${min}
    order by c.launched desc, c.sort, c.name`;
  const areas = await db<{ city_slug: string; city_name: string; category_id: number; slug: string; name: string; n: number }[]>`
    select c.slug as city_slug, c.name as city_name, v.category_id, l.slug, l.name, count(*)::int as n
    from mkt.vendors v join mkt.localities l on l.id = v.locality_id join mkt.cities c on c.id = l.city_id
    where v.status = 'live' and l.active group by c.slug, c.name, v.category_id, l.slug, l.name having count(*) >= ${min}`;
  const national = await db<{ category_id: number; n: number }[]>`
    select category_id, count(*)::int as n from mkt.vendors where status = 'live' group by category_id having count(*) >= ${min}`;
  const out: LandingEntry[] = [];
  for (const cat of cats) {
    const nat = national.find((x) => x.category_id === cat.id);
    if (nat) out.push({ path: `/vendors/india/${cat.slug}`, vendors: nat.n, title: `${cat.plural_name} in India` });
    const here = towns.filter((t) => t.category_id === cat.id);
    if (!here.length) continue;
    const filters = filtersFor(await fieldsFor(db, cat.id), cat.price_bands ?? []);
    for (const city of here) {
      out.push({ path: landingPath(city, cat), vendors: city.n, title: landingTitle(cat, city) });
      for (const f of filters) {
        const n = await countVendors(db, { categoryId: cat.id, cityId: city.id, filter: f });
        if (n >= min) out.push({ path: landingPath(city, cat, f), vendors: n, title: landingTitle(cat, city, f) });
      }
      for (const a of areas.filter((x) => x.category_id === cat.id && x.city_slug === city.slug)) {
        out.push({ path: landingPath(city, cat, a), vendors: a.n, title: landingTitle(cat, { ...city, name: `${a.name}, ${city.name}` }) });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- JSON-LD
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: siteUrl() + it.path })),
  };
}

export function faqLd(faq: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

const abs = (u: string) => (u.startsWith('http') ? u : `${siteUrl()}${u}`);

export function vendorLd(
  v: VendorCard,
  extra: { reviews?: { author_name?: string | null; rating_artist: number; rating_service: number; body: string; created_at: Date }[]; images?: string[]; areaServed?: string[]; state?: string } = {}
) {
  const images = [...new Set([v.cover_image_url, ...(extra.images ?? [])].filter((x): x is string => Boolean(x)))].slice(0, 6).map(abs);
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${siteUrl()}/v/${v.slug}#business`,
    name: v.business_name,
    url: `${siteUrl()}/v/${v.slug}`,
    description: v.tagline || v.about.slice(0, 200),
    address: {
      '@type': 'PostalAddress',
      ...(v.address_public && v.address_line ? { streetAddress: [v.address_line, v.locality_name].filter(Boolean).join(', ') } : {}),
      addressLocality: v.locality_name && !v.address_public ? `${v.locality_name}, ${v.city_name}` : v.city_name,
      ...(extra.state || v.state_name ? { addressRegion: extra.state ?? v.state_name } : {}),
      ...(v.pincode ? { postalCode: v.pincode } : {}),
      addressCountry: 'IN',
    },
    ...(v.address_public && v.lat && v.lng ? { geo: { '@type': 'GeoCoordinates', latitude: Number(v.lat), longitude: Number(v.lng) } } : {}),
    ...(v.address_public && v.maps_url ? { hasMap: v.maps_url } : {}),
    ...(extra.areaServed?.length ? { areaServed: extra.areaServed.map((name) => ({ '@type': 'City', name })) } : {}),
    ...(images.length ? { image: images } : {}),
    ...(extra.reviews?.length
      ? {
          review: extra.reviews.slice(0, 5).map((r) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: (r.author_name ?? '').split(' ')[0] || 'A bride' },
            datePublished: r.created_at.toISOString().slice(0, 10),
            reviewRating: { '@type': 'Rating', ratingValue: (r.rating_artist + r.rating_service) / 2, bestRating: 5, worstRating: 1 },
            reviewBody: r.body.slice(0, 500),
          })),
        }
      : {}),
    ...(v.starting_price_inr != null ? { priceRange: `From ${formatInr(v.starting_price_inr)}` } : {}),
    ...(v.rating != null && v.review_count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.review_count } }
      : {}),
  };
}

export function itemListLd(vendors: VendorCard[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: vendors.map((v, i) => ({ '@type': 'ListItem', position: i + 1, url: `${siteUrl()}/v/${v.slug}`, name: v.business_name })),
  };
}

/** Landing-page Q&A written from the live data on the page. */
export function landingFaq(category: Category, city: City, vendors: VendorCard[], filter?: FilterDef | null) {
  const prices = vendors.map((v) => v.starting_price_inr).filter((n): n is number => n != null).sort((a, b) => a - b);
  const label = (filter && typeof filter.value !== 'object' && filter.field.key !== '__price' ? filterNoun(category, filter) : category.plural_name).toLowerCase();
  const faq: { q: string; a: string }[] = [];
  if (prices.length) {
    const median = prices[Math.floor(prices.length / 2)];
    faq.push({
      q: `How much do ${label} in ${city.name} charge?`,
      a: `On Olready, ${label} in ${city.name} start from ${formatInr(prices[0])} ${category.price_unit}; the middle of the range is about ${formatInr(median)}.`,
    });
  }
  faq.push({
    q: `How many ${label} in ${city.name} are on Olready?`,
    a: `${vendors.length} ${vendors.length === 1 ? 'is' : 'are'} listed right now. Verified profiles carry a verified tag.`,
  });
  faq.push({
    q: `How do I get quotes from ${label} in ${city.name}?`,
    a: `Tell Olready what you need. Our team confirms your details on a short call, then verified vendors contact you and you compare quotes in one place.`,
  });
  return faq;
}
