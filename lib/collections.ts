import type { Db } from './db';
import { DomainError, audit } from './db';
import { slugify } from './catalog';
import type { VendorCard } from './vendors';

export type Collection = {
  id: string;
  slug: string;
  title: string;
  intro: string;
  category_id: number | null;
  city_id: number | null;
  city_name: string | null;
  category_plural: string | null;
  vendor_ids: string[];
  status: 'draft' | 'published';
  updated_at: Date;
};

const cols = (db: Db) => db`
  c.id, c.slug, c.title, c.intro, c.category_id, c.city_id, ci.name as city_name, cat.plural_name as category_plural,
  c.vendor_ids, c.status, c.updated_at`;
const from = (db: Db) => db`mkt.collections c left join mkt.cities ci on ci.id = c.city_id left join mkt.categories cat on cat.id = c.category_id`;

export async function allCollections(db: Db) {
  return db<Collection[]>`select ${cols(db)} from ${from(db)} order by c.updated_at desc`;
}
export async function publishedCollections(db: Db, f: { categoryId?: number | null; cityId?: number | null } = {}) {
  return db<Collection[]>`
    select ${cols(db)} from ${from(db)} where c.status = 'published'
      and (${f.categoryId ?? null}::int is null or c.category_id = ${f.categoryId ?? null})
      and (${f.cityId ?? null}::int is null or c.city_id = ${f.cityId ?? null})
    order by c.updated_at desc`;
}
export async function collectionBySlug(db: Db, slug: string) {
  const [c] = await db<Collection[]>`select ${cols(db)} from ${from(db)} where c.slug = ${slug}`;
  return c ?? null;
}
export async function collectionById(db: Db, id: string) {
  const [c] = await db<Collection[]>`select ${cols(db)} from ${from(db)} where c.id = ${id}`;
  return c ?? null;
}

/** The vendors in a collection, in the order the team chose; vendors no longer live drop out. */
export async function collectionVendors(db: Db, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db<VendorCard[]>`
    select v.*, c.slug as category_slug, c.name as category_name, c.price_unit, ci.name as city_name, ci.slug as city_slug,
           r.rating, coalesce(r.n, 0)::int as review_count
    from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
    left join lateral (
      select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
      from mkt.reviews where vendor_id = v.id and status = 'published'
    ) r on true
    where v.id = any(${ids}::uuid[]) and v.status = 'live'`;
  return ids.map((id) => rows.find((r) => r.id === id)).filter((x): x is VendorCard => Boolean(x));
}

export async function saveCollection(
  db: Db,
  id: string | null,
  input: { title: string; intro: string; categoryId: number | null; cityId: number | null; vendorIds: string[]; publish: boolean },
  actor: string
) {
  const title = input.title.trim();
  if (title.length < 5) throw new DomainError('title', 'Give the collection a title');
  const ids = [...new Set(input.vendorIds)].slice(0, 30);
  if (input.publish && ids.length < 3) throw new DomainError('few', 'Pick at least three vendors before publishing');
  const slug = slugify(title).slice(0, 80);
  const [clash] = await db`select 1 from mkt.collections where slug = ${slug} and id <> ${id ?? '00000000-0000-0000-0000-000000000000'}`;
  if (clash) throw new DomainError('slug', 'Another collection has this title');
  const status = input.publish ? 'published' : 'draft';
  const [c] = id
    ? await db<{ id: string }[]>`
        update mkt.collections set slug = ${slug}, title = ${title}, intro = ${input.intro.trim().slice(0, 2000)}, category_id = ${input.categoryId},
          city_id = ${input.cityId}, vendor_ids = ${ids}::uuid[], status = ${status}, updated_by = ${actor}, updated_at = now()
        where id = ${id} returning id`
    : await db<{ id: string }[]>`
        insert into mkt.collections (slug, title, intro, category_id, city_id, vendor_ids, status, updated_by)
        values (${slug}, ${title}, ${input.intro.trim().slice(0, 2000)}, ${input.categoryId}, ${input.cityId}, ${ids}::uuid[], ${status}, ${actor})
        returning id`;
  if (!c) throw new DomainError('not_found', 'Collection not found');
  await audit(db, actor, 'collection.save', 'collection', c.id, { status, vendors: ids.length });
  return c.id;
}
