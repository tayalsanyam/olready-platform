import type { Db } from './db';
import { DomainError, audit } from './db';
import { slugify } from './catalog';
import { queueEmail } from './email';

export const SECTIONS: Record<string, { label: string; blurb: string }> = {
  planning: { label: 'Planning', blurb: 'Timelines, checklists and how to get it all done.' },
  budget: { label: 'Budget', blurb: 'What things cost in the Tricity and where to save.' },
  ideas: { label: 'Ideas', blurb: 'Decor, looks, themes and little touches.' },
  fashion: { label: 'Outfits and jewellery', blurb: 'Lehengas, sherwanis and bridal sets.' },
  vendors: { label: 'Choosing vendors', blurb: 'What to ask, what to check, what to sign.' },
  'real-talk': { label: 'Real talk', blurb: 'Honest advice from brides and families.' },
};

export type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_url: string | null;
  section: string;
  category_id: number | null;
  category_slug: string | null;
  category_name: string | null;
  city_id: number | null;
  city_slug: string | null;
  city_name: string | null;
  status: 'draft' | 'published' | 'archived';
  author_name: string;
  published_at: Date | null;
  updated_at: Date;
};

const cols = (db: Db) => db`
  a.id, a.slug, a.title, a.excerpt, a.body, a.cover_url, a.section, a.category_id, c.slug as category_slug, c.plural_name as category_name,
  a.city_id, ci.slug as city_slug, ci.name as city_name, a.status, a.author_name, a.published_at, a.updated_at`;
const from = (db: Db) => db`mkt.articles a left join mkt.categories c on c.id = a.category_id left join mkt.cities ci on ci.id = a.city_id`;

export async function publishedArticles(db: Db, o: { section?: string | null; limit?: number; offset?: number; exclude?: string | null; categoryId?: number | null } = {}) {
  return db<Article[]>`
    select ${cols(db)} from ${from(db)}
    where a.status = 'published'
      and (${o.section ?? null}::text is null or a.section = ${o.section ?? null})
      and (${o.categoryId ?? null}::int is null or a.category_id = ${o.categoryId ?? null})
      and (${o.exclude ?? null}::uuid is null or a.id <> ${o.exclude ?? null})
    order by a.published_at desc limit ${o.limit ?? 12} offset ${o.offset ?? 0}`;
}

export async function countPublished(db: Db, section?: string | null) {
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from mkt.articles where status = 'published' and (${section ?? null}::text is null or section = ${section ?? null})`;
  return n;
}

export async function articleBySlug(db: Db, slug: string, opts: { includeDrafts?: boolean } = {}) {
  const [a] = await db<Article[]>`
    select ${cols(db)} from ${from(db)} where a.slug = ${slug} and (a.status = 'published' or ${Boolean(opts.includeDrafts)})`;
  return a ?? null;
}

export async function articleById(db: Db, id: string) {
  const [a] = await db<Article[]>`select ${cols(db)} from ${from(db)} where a.id = ${id}`;
  return a ?? null;
}

export async function allArticles(db: Db) {
  return db<Article[]>`select ${cols(db)} from ${from(db)} order by a.updated_at desc`;
}

export type ArticleInput = {
  title: string;
  slug?: string;
  excerpt: string;
  body: string;
  section: string;
  categoryId: number | null;
  cityId: number | null;
  coverUrl?: string | null;
  authorName: string;
};

/** Creates or updates an article. Publishing is a separate step so drafts can be reviewed. */
export async function saveArticle(db: Db, id: string | null, input: ArticleInput, actor: string) {
  const title = input.title.trim();
  if (title.length < 5) throw new DomainError('title', 'Give the article a title of at least 5 characters');
  if (!SECTIONS[input.section]) throw new DomainError('section', 'Pick a section');
  const slug = slugify(input.slug?.trim() || title).slice(0, 80);
  if (!slug) throw new DomainError('slug', 'The address needs letters or numbers');
  const [clash] = await db`select 1 from mkt.articles where slug = ${slug} and id <> ${id ?? '00000000-0000-0000-0000-000000000000'}`;
  if (clash) throw new DomainError('slug_taken', 'Another article already uses this address');
  const excerpt = input.excerpt.trim().slice(0, 300);
  const author = input.authorName.trim().slice(0, 80) || 'OLReady team';
  if (id) {
    const [a] = await db<{ id: string }[]>`
      update mkt.articles set title = ${title}, slug = ${slug}, excerpt = ${excerpt}, body = ${input.body}, section = ${input.section},
        category_id = ${input.categoryId}, city_id = ${input.cityId}, cover_url = coalesce(${input.coverUrl ?? null}, cover_url),
        author_name = ${author}, updated_at = now()
      where id = ${id} returning id`;
    if (!a) throw new DomainError('not_found', 'Article not found');
    await audit(db, actor, 'article.update', 'article', id);
    return a.id;
  }
  const [a] = await db<{ id: string }[]>`
    insert into mkt.articles (title, slug, excerpt, body, section, category_id, city_id, cover_url, author_profile_id, author_name)
    values (${title}, ${slug}, ${excerpt}, ${input.body}, ${input.section}, ${input.categoryId}, ${input.cityId}, ${input.coverUrl ?? null}, ${actor}, ${author})
    returning id`;
  await audit(db, actor, 'article.create', 'article', a.id);
  return a.id;
}

export async function setArticleStatus(db: Db, id: string, status: 'draft' | 'published' | 'archived', actor: string) {
  const [a] = await db<{ body: string; excerpt: string }[]>`select body, excerpt from mkt.articles where id = ${id}`;
  if (!a) throw new DomainError('not_found', 'Article not found');
  if (status === 'published' && a.body.trim().length < 200) throw new DomainError('short', 'Write at least a few paragraphs before publishing');
  if (status === 'published' && !a.excerpt.trim()) throw new DomainError('excerpt', 'Add a one-line summary before publishing');
  await db`
    update mkt.articles set status = ${status}, updated_at = now(),
      published_at = case when ${status} = 'published' then coalesce(published_at, now()) else published_at end
    where id = ${id}`;
  await audit(db, actor, `article.${status}`, 'article', id);
}

export async function subscribeNewsletter(db: Db, email: string, source = 'blog') {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new DomainError('bad_email', 'Enter a valid email');
  const [s] = await db<{ id: string; token: string; fresh: boolean }[]>`
    insert into mkt.newsletter_subscribers (email, source) values (${e}, ${source})
    on conflict (email) do update set unsubscribed_at = null
    returning id, unsubscribe_token as token, (xmax = 0) as fresh`;
  if (s.fresh) await queueEmail(db, e, 'newsletter_welcome', { token: s.token }, `newsletter_welcome:${s.id}`);
}

export async function unsubscribeNewsletter(db: Db, token: string) {
  const [s] = await db`update mkt.newsletter_subscribers set unsubscribed_at = coalesce(unsubscribed_at, now()) where unsubscribe_token = ${token} returning id`;
  return Boolean(s);
}
