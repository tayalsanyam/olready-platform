import type { Db } from './db';
import { DomainError, getSetting } from './db';
import type { VendorCard } from './vendors';
import type { IdeaPhoto } from './ideas';

export const lookEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

/** Per visitor and site-wide daily caps, so a runaway script cannot run up the AI bill. */
export async function takeLookAllowance(db: Db, visitor: string) {
  const [perVisitor, site] = await Promise.all([getSetting<number>(db, 'look_per_visitor_day', 15), getSetting<number>(db, 'look_site_day', 3000)]);
  const [{ total }] = await db<{ total: number }[]>`select coalesce(sum(n), 0)::int as total from mkt.look_usage where day = ${today()}::date`;
  if (total >= site) throw new DomainError('busy', 'Photo search is busy today. Pick the styles instead.');
  const [row] = await db<{ n: number }[]>`
    insert into mkt.look_usage (day, visitor, n) values (${today()}::date, ${visitor}, 1)
    on conflict (day, visitor) do update set n = mkt.look_usage.n + 1 returning n`;
  if (row.n > perVisitor) throw new DomainError('limit', `You can search by photo ${perVisitor} times a day. Pick the styles instead.`);
}

/**
 * Reads a photo into styles from the allowed list using Claude's vision. Only the image and
 * the list go to the model; nothing about the person. Returns allowed slugs only.
 */
export async function readLook(image: Uint8Array, mime: string, topicName: string, tags: { slug: string; label: string }[]) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new DomainError('off', 'Photo search is not switched on yet. Pick the styles instead.');
  const list = tags.map((t) => `${t.slug} (${t.label})`).join(', ');
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model: process.env.ANTHROPIC_VISION_MODEL ?? 'claude-haiku-5-5',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: Buffer.from(image).toString('base64') } },
            {
              type: 'text',
              text: `This photo is a reference for "${topicName}" at an Indian wedding. Which of these styles does it show? Choose only from: ${list}. Answer with JSON only, like {"tags":["slug1","slug2"]}, best match first, at most 3. If none fit, answer {"tags":[]}.`,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new DomainError('ai_error', 'We could not read that photo. Pick the styles instead.');
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  let out: string[] = [];
  try {
    out = (JSON.parse(match?.[0] ?? '{}').tags ?? []) as string[];
  } catch {
    out = [];
  }
  const allowed = new Set(tags.map((t) => t.slug));
  return [...new Set(out)].filter((t) => allowed.has(t)).slice(0, 3);
}

/**
 * Vendors who do these styles in a city: two points for each style they say they are known
 * for, one for each of their tagged photos showing it. Best match first, then rating.
 */
export async function lookVendors(db: Db, o: { categoryId: number; cityId: number | null; tags: string[]; limit?: number }) {
  if (!o.tags.length) return [];
  return db<(VendorCard & { score: number; matched: string[] })[]>`
    select * from (
      select v.*, c.slug as category_slug, c.name as category_name, c.price_unit, ci.name as city_name, ci.slug as city_slug,
             r.rating, coalesce(r.n, 0)::int as review_count,
             (2 * cardinality(array(select unnest(v.known_for) intersect select unnest(${o.tags}::text[])))
               + (select count(*) from mkt.vendor_media m where m.vendor_id = v.id and not m.hidden_from_ideas and m.tags && ${o.tags}::text[]))::int as score,
             array(select distinct t from (
               select unnest(v.known_for) as t union all select unnest(m.tags) from mkt.vendor_media m where m.vendor_id = v.id
             ) x where t = any(${o.tags}::text[])) as matched
      from mkt.vendors v
      join mkt.categories c on c.id = v.category_id
      join mkt.cities ci on ci.id = v.city_id
      left join lateral (
        select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
        from mkt.reviews where vendor_id = v.id and status = 'published'
      ) r on true
      where v.status = 'live' and v.category_id = ${o.categoryId}
        and (${o.cityId}::int is null or v.city_id = ${o.cityId} or ${o.cityId} = any(v.service_city_ids))
    ) s where score > 0
    order by score desc, rating desc nulls last, business_name limit ${o.limit ?? 24}`;
}

export async function lookPhotos(db: Db, topicSlug: string, tags: string[], limit = 12) {
  if (!tags.length) return [];
  const { ideaPhotos } = await import('./ideas');
  // One query per style keeps it simple; merge and de-duplicate, newest first.
  const lists = await Promise.all(tags.map((t) => ideaPhotos(db, { topic: topicSlug, tag: t, limit })));
  const seen = new Set<string>();
  const out: IdeaPhoto[] = [];
  for (const p of lists.flat().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))) {
    if (seen.has(p.ref)) continue;
    seen.add(p.ref);
    out.push(p);
  }
  return out.slice(0, limit);
}
