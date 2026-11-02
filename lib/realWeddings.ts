import type { Db, Sql } from './db';
import { DomainError, audit } from './db';
import { slugify } from './catalog';

export type RealWedding = {
  id: string;
  slug: string;
  title: string;
  couple_names: string;
  city_id: number | null;
  city_name: string | null;
  wedding_date: string | null;
  story: string;
  cover_image_url: string | null;
  consent_confirmed: boolean;
  status: 'draft' | 'submitted' | 'published' | 'rejected';
  review_note: string;
  published_at: Date | null;
  created_at: Date;
};

const cols = (db: Db) => db`
  rw.id, rw.slug, rw.title, rw.couple_names, rw.city_id, ci.name as city_name,
  to_char(rw.wedding_date, 'YYYY-MM-DD') as wedding_date, rw.story, rw.cover_image_url, rw.consent_confirmed,
  rw.status, rw.review_note, rw.published_at, rw.created_at`;

export async function submitRealWedding(
  sql: Sql,
  profileId: string,
  input: {
    title: string;
    coupleNames: string;
    cityId: number | null;
    weddingDate: string | null;
    story: string;
    coverImageUrl: string | null;
    photoUrls: string[];
    vendorSlugs: string[];
    consent: boolean;
  }
) {
  if (!input.consent) throw new DomainError('no_consent', 'Confirm that the couple agreed to publish these photos');
  if (!input.title.trim() || !input.coupleNames.trim()) throw new DomainError('empty', 'Add a title and the couple names');
  return sql.begin(async (tx) => {
    let slug = slugify(`${input.coupleNames} ${input.title}`) || 'real-wedding';
    const [taken] = await tx`select 1 from mkt.real_weddings where slug = ${slug}`;
    if (taken) slug = `${slug}-${Date.now().toString(36)}`;
    const [rw] = await tx<{ id: string; slug: string }[]>`
      insert into mkt.real_weddings (slug, title, couple_names, city_id, wedding_date, story, cover_image_url,
        consent_confirmed, submitted_by, status)
      values (${slug}, ${input.title.trim()}, ${input.coupleNames.trim()}, ${input.cityId}, ${input.weddingDate || null},
        ${input.story.trim()}, ${input.coverImageUrl || null}, true, ${profileId}, 'submitted')
      returning id, slug`;
    let i = 0;
    for (const url of input.photoUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u) || u.startsWith("/uploads/")).slice(0, 40)) {
      await tx`insert into mkt.real_wedding_photos (real_wedding_id, url, sort) values (${rw.id}, ${url}, ${i++})`;
    }
    const vendors = input.vendorSlugs.length
      ? await tx<{ id: string; owner_profile_id: string | null }[]>`
          select id, owner_profile_id from mkt.vendors where slug = any(${input.vendorSlugs}) and status = 'live'`
      : [];
    for (const v of vendors) {
      await tx`
        insert into mkt.real_wedding_vendors (real_wedding_id, vendor_id, vendor_confirmed)
        values (${rw.id}, ${v.id}, ${v.owner_profile_id === profileId}) on conflict do nothing`;
    }
    await audit(tx, profileId, 'real_wedding.submit', 'real_wedding', rw.id, { vendors: vendors.length });
    return rw;
  });
}

export async function moderateRealWedding(db: Db, id: string, publish: boolean, note: string, actor: string) {
  const [rw] = await db<{ consent_confirmed: boolean }[]>`select consent_confirmed from mkt.real_weddings where id = ${id}`;
  if (!rw) throw new DomainError('not_found', 'Not found');
  if (publish && !rw.consent_confirmed) throw new DomainError('no_consent', 'No consent recorded');
  await db`
    update mkt.real_weddings set status = ${publish ? 'published' : 'rejected'}, review_note = ${note},
      published_at = case when ${publish} then now() else null end
    where id = ${id}`;
  await audit(db, actor, publish ? 'real_wedding.publish' : 'real_wedding.reject', 'real_wedding', id, { note });
}

export async function tagVendor(db: Db, realWeddingId: string, vendorId: string, actor: string) {
  await db`
    insert into mkt.real_wedding_vendors (real_wedding_id, vendor_id) values (${realWeddingId}, ${vendorId})
    on conflict do nothing`;
  await audit(db, actor, 'real_wedding.tag', 'real_wedding', realWeddingId, { vendorId });
}

/** A tagged vendor confirms they worked on the wedding; unconfirmed tags still show, marked as such in Ops. */
export async function confirmTag(db: Db, realWeddingId: string, vendorId: string) {
  await db`
    update mkt.real_wedding_vendors set vendor_confirmed = true
    where real_wedding_id = ${realWeddingId} and vendor_id = ${vendorId}`;
}

export async function publishedRealWeddings(db: Db, limit = 24) {
  return db<RealWedding[]>`
    select ${cols(db)} from mkt.real_weddings rw left join mkt.cities ci on ci.id = rw.city_id
    where rw.status = 'published' order by rw.published_at desc limit ${limit}`;
}

export async function realWeddingBySlug(db: Db, slug: string, opts: { includeUnpublished?: boolean } = {}) {
  const [rw] = await db<RealWedding[]>`
    select ${cols(db)} from mkt.real_weddings rw left join mkt.cities ci on ci.id = rw.city_id
    where rw.slug = ${slug} ${opts.includeUnpublished ? db`` : db`and rw.status = 'published'`}`;
  if (!rw) return null;
  const photos = await db<{ id: string; url: string; caption: string }[]>`
    select id, url, caption from mkt.real_wedding_photos where real_wedding_id = ${rw.id} order by sort`;
  const vendors = await db<{ id: string; slug: string; business_name: string; category_name: string; vendor_confirmed: boolean }[]>`
    select v.id, v.slug, v.business_name, c.name as category_name, rwv.vendor_confirmed
    from mkt.real_wedding_vendors rwv join mkt.vendors v on v.id = rwv.vendor_id join mkt.categories c on c.id = v.category_id
    where rwv.real_wedding_id = ${rw.id} and v.status = 'live' order by c.sort`;
  return { ...rw, photos, vendors };
}

export async function realWeddingsForVendor(db: Db, vendorId: string) {
  return db<RealWedding[]>`
    select ${cols(db)} from mkt.real_weddings rw
    join mkt.real_wedding_vendors rwv on rwv.real_wedding_id = rw.id
    left join mkt.cities ci on ci.id = rw.city_id
    where rwv.vendor_id = ${vendorId} and rw.status = 'published' order by rw.published_at desc`;
}

export async function moderationQueue(db: Db) {
  return db<(RealWedding & { vendor_count: number; photo_count: number })[]>`
    select ${cols(db)},
      (select count(*) from mkt.real_wedding_vendors x where x.real_wedding_id = rw.id)::int as vendor_count,
      (select count(*) from mkt.real_wedding_photos x where x.real_wedding_id = rw.id)::int as photo_count
    from mkt.real_weddings rw left join mkt.cities ci on ci.id = rw.city_id
    where rw.status = 'submitted' order by rw.created_at`;
}
