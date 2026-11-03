import type { Db } from './db';
import { landingPath } from './seo';

export type VendorHit = {
  slug: string;
  business_name: string;
  category_name: string;
  city_name: string;
  starting_price_inr: number | null;
  price_unit: string;
  rating: number | null;
  review_count: number;
  cover_image_url: string | null;
};
export type PageHit = { label: string; href: string };

// Escapes LIKE wildcards so a search for "100%" matches literally.
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
const prefix = (q: string) => `${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

/** Live vendors by name, tagline or category, in the chosen city (or any Tricity city). */
export async function searchVendors(db: Db, q: string, cityId: number | null, limit = 24) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return db<VendorHit[]>`
    select v.slug, v.business_name, c.name as category_name, ci.name as city_name, v.starting_price_inr, c.price_unit,
           r.rating, coalesce(r.n, 0)::int as review_count, v.cover_image_url
    from mkt.vendors v
    join mkt.categories c on c.id = v.category_id and c.active
    join mkt.cities ci on ci.id = v.city_id
    left join lateral (
      select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
      from mkt.reviews where vendor_id = v.id and status = 'published'
    ) r on true
    where v.status = 'live'
      and (${cityId}::int is null or v.city_id = ${cityId} or ${cityId} = any(v.service_city_ids))
      and (v.business_name ilike ${like(term)} or v.tagline ilike ${like(term)} or c.name ilike ${like(term)} or c.plural_name ilike ${like(term)}
           or v.attributes::text ilike ${like(term)})
    order by (v.business_name ilike ${prefix(term)}) desc, (v.business_name ilike ${like(term)}) desc,
             (v.verified_at is not null) desc, r.rating desc nulls last, v.business_name
    limit ${limit}`;
}

/** Category and filter pages whose name matches, e.g. "banquet" → Banquet halls in Chandigarh. */
export async function searchPages(db: Db, q: string, city: { slug: string; name: string }) {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const cats = await db<{ slug: string; name: string; plural_name: string }[]>`
    select slug, name, plural_name from mkt.categories where active order by sort`;
  const fields = await db<{ cat_slug: string; plural_name: string; options: { label: string; seo?: string }[]; seo_slug: string | null; label: string; type: string }[]>`
    select c.slug as cat_slug, c.plural_name, f.options, f.seo_slug, f.label, f.type
    from mkt.category_fields f join mkt.categories c on c.id = f.category_id
    where c.active and f.filterable`;
  const out: PageHit[] = [];
  for (const c of cats) {
    if (c.plural_name.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)) {
      out.push({ label: `${c.plural_name} in ${city.name}`, href: landingPath(city, c) });
    }
  }
  for (const f of fields) {
    for (const o of f.options ?? []) {
      if (o.seo && o.label.toLowerCase().includes(t)) {
        out.push({ label: `${o.label} ${f.plural_name.toLowerCase()} in ${city.name}`.replace(/^(\w)/, (m) => m.toUpperCase()), href: `/vendors/${city.slug}/${f.cat_slug}/${o.seo}` });
      }
    }
    if (f.type === 'bool' && f.seo_slug && f.label.toLowerCase().includes(t)) {
      out.push({ label: `${f.plural_name} in ${city.name}: ${f.label.toLowerCase()}`, href: `/vendors/${city.slug}/${f.cat_slug}/${f.seo_slug}` });
    }
  }
  return out.slice(0, 8);
}

export async function searchArticles(db: Db, q: string, limit = 6) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return db<{ slug: string; title: string; excerpt: string }[]>`
    select slug, title, excerpt from mkt.articles
    where status = 'published' and (title ilike ${like(term)} or excerpt ilike ${like(term)} or body ilike ${like(term)})
    order by (title ilike ${like(term)}) desc, published_at desc limit ${limit}`;
}

export async function searchIdeaTopics(db: Db, q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return db<{ href: string; label: string }[]>`
    select '/ideas/' || tp.slug || coalesce('?tag=' || tg.slug, '') as href,
           coalesce(tg.label || ' ', '') || lower(tp.name) as label
    from mkt.idea_topics tp left join mkt.idea_tags tg on tg.topic_id = tp.id and tg.label ilike ${like(term)}
    where tp.name ilike ${like(term)} or tg.id is not null
    order by tp.sort limit 6`;
}

export async function searchRealWeddings(db: Db, q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return db<{ slug: string; couple_names: string; title: string }[]>`
    select slug, couple_names, title from mkt.real_weddings
    where status = 'published' and (couple_names ilike ${like(term)} or title ilike ${like(term)} or story ilike ${like(term)})
    order by published_at desc limit 6`;
}
