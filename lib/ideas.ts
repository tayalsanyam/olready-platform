import type { Db } from './db';
import { DomainError, audit } from './db';

export type IdeaTopic = { id: number; slug: string; name: string; description: string; category_id: number | null };
export type IdeaTag = { slug: string; label: string };
export type IdeaPhoto = {
  ref: string; // 'v-<uuid>' for vendor work, 'r-<uuid>' for real-wedding photos
  url: string;
  caption: string;
  tags: string[];
  created_at: Date;
  topic_slug: string;
  topic_name: string;
  vendor_id: string | null;
  vendor_slug: string | null;
  vendor_name: string | null;
  category_name: string | null;
  city_name: string | null;
  rw_slug: string | null;
  rw_names: string | null;
};

/** Every photo the gallery may show: work from live vendors and photos from published real weddings. */
function photos(db: Db) {
  return db`
    select 'v-' || m.id as ref, m.url, m.caption, m.tags, m.created_at, tp.slug as topic_slug, tp.name as topic_name,
           v.id as vendor_id, v.slug as vendor_slug, v.business_name as vendor_name, c.name as category_name,
           ci.name as city_name, null::text as rw_slug, null::text as rw_names
    from mkt.vendor_media m
    join mkt.vendors v on v.id = m.vendor_id and v.status = 'live'
    join mkt.idea_topics tp on tp.category_id = v.category_id
    join mkt.categories c on c.id = v.category_id
    join mkt.cities ci on ci.id = v.city_id
    where not m.hidden_from_ideas
    union all
    select 'r-' || p.id, p.url, p.caption, p.tags, coalesce(rw.published_at, rw.created_at), tp.slug, tp.name,
           v.id, v.slug, v.business_name, c.name, ci.name, rw.slug, rw.couple_names
    from mkt.real_wedding_photos p
    join mkt.real_weddings rw on rw.id = p.real_wedding_id and rw.status = 'published'
    join mkt.idea_topics tp on tp.slug = 'real-wedding-moments'
    left join mkt.vendors v on v.id = p.vendor_id and v.status = 'live'
    left join mkt.categories c on c.id = v.category_id
    left join mkt.cities ci on ci.id = rw.city_id
    where not p.hidden_from_ideas`;
}

export async function ideaTopics(db: Db) {
  return db<(IdeaTopic & { photo_count: number; cover_url: string | null })[]>`
    with p as (${photos(db)})
    select t.id, t.slug, t.name, t.description, t.category_id,
           (select count(*) from p where p.topic_slug = t.slug)::int as photo_count,
           (select url from p where p.topic_slug = t.slug order by created_at desc limit 1) as cover_url
    from mkt.idea_topics t order by t.sort`;
}

export async function ideaTopic(db: Db, slug: string) {
  const [t] = await db<IdeaTopic[]>`select id, slug, name, description, category_id from mkt.idea_topics where slug = ${slug}`;
  return t ?? null;
}

export async function topicTags(db: Db, topicId: number) {
  return db<IdeaTag[]>`select slug, label from mkt.idea_tags where topic_id = ${topicId} order by sort`;
}

type PhotoQuery = { topic?: string | null; tag?: string | null; vendorId?: string | null; exclude?: string | null; limit?: number; offset?: number };

export async function ideaPhotos(db: Db, q: PhotoQuery = {}) {
  return db<IdeaPhoto[]>`
    with p as (${photos(db)})
    select * from p
    where (${q.topic ?? null}::text is null or topic_slug = ${q.topic ?? null})
      and (${q.tag ?? null}::text is null or ${q.tag ?? null} = any(tags))
      and (${q.vendorId ?? null}::uuid is null or vendor_id = ${q.vendorId ?? null})
      and (${q.exclude ?? null}::text is null or ref <> ${q.exclude ?? null})
    order by created_at desc, ref
    limit ${q.limit ?? 30} offset ${q.offset ?? 0}`;
}

export async function countIdeaPhotos(db: Db, q: Pick<PhotoQuery, 'topic' | 'tag'> = {}) {
  const [{ n }] = await db<{ n: number }[]>`
    with p as (${photos(db)})
    select count(*)::int as n from p
    where (${q.topic ?? null}::text is null or topic_slug = ${q.topic ?? null})
      and (${q.tag ?? null}::text is null or ${q.tag ?? null} = any(tags))`;
  return n;
}

export async function ideaPhoto(db: Db, ref: string) {
  if (!/^[vr]-[0-9a-f-]{36}$/.test(ref)) return null;
  const [p] = await db<IdeaPhoto[]>`with p as (${photos(db)}) select * from p where ref = ${ref}`;
  return p ?? null;
}

// ---------------------------------------------------------------- saving
export async function savedRefs(db: Db, profileId: string | null | undefined, kind: 'photo' | 'article') {
  if (!profileId) return new Set<string>();
  const rows = await db<{ ref: string }[]>`
    select s.ref from mkt.saved_items s
    join mkt.wedding_members wm on wm.wedding_id = s.wedding_id and wm.profile_id = ${profileId}
    where s.kind = ${kind}`;
  return new Set(rows.map((r) => r.ref));
}

/** Saves to the family's wedding wall, or removes it if already saved. Returns true when saved. */
export async function toggleSaved(db: Db, weddingId: string, kind: 'photo' | 'article', ref: string, profileId: string) {
  const [gone] = await db`delete from mkt.saved_items where wedding_id = ${weddingId} and kind = ${kind} and ref = ${ref} returning id`;
  if (gone) return false;
  await db`insert into mkt.saved_items (wedding_id, kind, ref, saved_by) values (${weddingId}, ${kind}, ${ref}, ${profileId})`;
  return true;
}

// ---------------------------------------------------------------- tagging and moderation
/** Vendors tag their own work; only tags defined for the photo's topic are kept. */
export async function setMediaTags(db: Db, mediaId: string, vendorId: string, tags: string[], caption: string) {
  const [m] = await db<{ topic_id: number | null }[]>`
    select tp.id as topic_id from mkt.vendor_media m join mkt.vendors v on v.id = m.vendor_id
    left join mkt.idea_topics tp on tp.category_id = v.category_id
    where m.id = ${mediaId} and m.vendor_id = ${vendorId}`;
  if (!m) throw new DomainError('not_found', 'Photo not found');
  const allowed = m.topic_id ? (await topicTags(db, m.topic_id)).map((t) => t.slug) : [];
  const keep = [...new Set(tags)].filter((t) => allowed.includes(t));
  await db`update mkt.vendor_media set tags = ${keep}, caption = ${caption.trim().slice(0, 140)} where id = ${mediaId}`;
  return keep;
}

export async function setIdeaHidden(db: Db, ref: string, hidden: boolean, actor: string) {
  const id = ref.slice(2);
  if (ref.startsWith('v-')) await db`update mkt.vendor_media set hidden_from_ideas = ${hidden} where id = ${id}`;
  else if (ref.startsWith('r-')) await db`update mkt.real_wedding_photos set hidden_from_ideas = ${hidden} where id = ${id}`;
  else throw new DomainError('not_found', 'Photo not found');
  await audit(db, actor, hidden ? 'idea.hide' : 'idea.show', 'photo', ref);
}

// ---------------------------------------------------------------- wedding wall
export type WallItem = {
  id: string;
  kind: 'photo' | 'article';
  ref: string;
  note: string;
  saved_by_name: string;
  created_at: Date;
  photo: IdeaPhoto | null;
  article: { slug: string; title: string; excerpt: string; cover_url: string | null } | null;
};

/** Everything the family saved, newest first, with the photo or article it points to. */
export async function wallItems(db: Db, weddingId: string): Promise<WallItem[]> {
  const rows = await db<{ id: string; kind: 'photo' | 'article'; ref: string; note: string; saved_by_name: string; created_at: Date }[]>`
    select s.id, s.kind, s.ref, s.note, p.full_name as saved_by_name, s.created_at
    from mkt.saved_items s join mkt.profiles p on p.id = s.saved_by
    where s.wedding_id = ${weddingId} order by s.created_at desc`;
  const out: WallItem[] = [];
  for (const r of rows) {
    if (r.kind === 'photo') {
      const photo = await ideaPhoto(db, r.ref);
      if (photo) out.push({ ...r, photo, article: null });
    } else {
      const [a] = await db<{ slug: string; title: string; excerpt: string; cover_url: string | null }[]>`
        select slug, title, excerpt, cover_url from mkt.articles where id = ${r.ref} and status = 'published'`;
      if (a) out.push({ ...r, photo: null, article: a });
    }
  }
  return out;
}

export async function setWallNote(db: Db, weddingId: string, itemId: string, note: string) {
  const [r] = await db`update mkt.saved_items set note = ${note.trim().slice(0, 500)} where id = ${itemId} and wedding_id = ${weddingId} returning id`;
  if (!r) throw new DomainError('not_found', 'Saved item not found');
}

export async function removeWallItem(db: Db, weddingId: string, itemId: string) {
  await db`delete from mkt.saved_items where id = ${itemId} and wedding_id = ${weddingId}`;
}
