import { audit, DomainError, getSetting, type Db, type Sql } from './db';
import { createEnquiry, normalisePhone } from './leads';

/**
 * A visitor who is not signed in leaves a mobile number: from the call-me card, the leaving
 * prompt, the chat, or after saving vendors. The number is the lead. It waits in Ops > Numbers
 * to call until someone rings and turns it into a request, or closes it.
 */

export const CAPTURE_SOURCES = { slip: 'Call-me card', exit: 'Leaving prompt', chat: 'Chat helper', shortlist: 'Saved vendors', dock: 'Call button' } as const;
export type CaptureSource = keyof typeof CAPTURE_SOURCES;

export type CaptureInput = {
  phone: string;
  name?: string | null;
  source: string;
  page?: string | null;
  townSlug?: string | null;
  slugs?: string[];
  chatId?: string | null;
  visitor?: string | null;
  note?: string | null;
};

/** What the page she was on tells us: /vendors/mohali/bridal-makeup, /v/glow-by-kirti, /cost/venues/delhi. */
async function contextOf(db: Db, page: string | null, townSlug: string | null) {
  const seg = (page ?? '').split('?')[0].split('/').filter(Boolean);
  let cityId: number | null = null;
  let categoryId: number | null = null;
  const vendorSlugs: string[] = [];
  const cityBy = async (slug: string | undefined) => (slug ? (await db<{ id: number }[]>`select id from mkt.cities where slug = ${slug} and active`)[0]?.id ?? null : null);
  const catBy = async (slug: string | undefined) => (slug ? (await db<{ id: number }[]>`select id from mkt.categories where slug = ${slug} and active`)[0]?.id ?? null : null);
  if (seg[0] === 'vendors') {
    cityId = await cityBy(seg[1]);
    categoryId = await catBy(seg[2]);
  } else if (seg[0] === 'cost') {
    categoryId = await catBy(seg[1]);
    cityId = await cityBy(seg[2]);
  } else if (seg[0] === 'v' && seg[1]) {
    const [v] = await db<{ city_id: number; category_id: number; slug: string }[]>`select city_id, category_id, slug from mkt.vendors where slug = ${seg[1]} and status = 'live'`;
    if (v) {
      cityId = v.city_id;
      categoryId = v.category_id;
      vendorSlugs.push(v.slug);
    }
  }
  cityId ??= await cityBy(townSlug ?? undefined);
  return { cityId, categoryId, vendorSlugs };
}

export async function saveCapture(db: Db, input: CaptureInput) {
  const phone = normalisePhone(input.phone);
  const source = (input.source in CAPTURE_SOURCES ? input.source : 'dock') as CaptureSource;
  const name = (input.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || null;
  const page = (input.page ?? '').split('?')[0].slice(0, 200) || null;
  // One browser cannot flood the queue.
  if (input.visitor) {
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.captures where visitor = ${input.visitor} and created_at > now() - interval '1 day'`;
    if (n >= 6) throw new DomainError('too_many', 'We already have your number. Our team will call you.');
  }
  const ctx = await contextOf(db, page, input.townSlug ?? null);
  const asked = [...new Set([...(input.slugs ?? []), ...ctx.vendorSlugs].filter((s) => /^[a-z0-9-]{2,80}$/.test(s)))].slice(0, 20);
  const slugs = asked.length ? (await db<{ slug: string }[]>`select slug from mkt.vendors where slug = any(${asked}) and status = 'live'`).map((r) => r.slug) : [];
  const chatId = input.chatId && /^[0-9a-f-]{36}$/i.test(input.chatId) ? input.chatId : null;
  const note = (input.note ?? '').trim().slice(0, 500);
  // The same number again while it is still waiting adds to that entry.
  const [open] = await db<{ id: string }[]>`select id from mkt.captures where phone = ${phone} and status = 'open' order by created_at desc limit 1`;
  if (open) {
    await db`
      update mkt.captures set name = coalesce(${name}, name), page = coalesce(${page}, page), city_id = coalesce(city_id, ${ctx.cityId}),
        category_id = coalesce(category_id, ${ctx.categoryId}), chat_id = coalesce(${chatId}, chat_id), visitor = coalesce(visitor, ${input.visitor ?? null}),
        vendor_slugs = (select coalesce(array_agg(distinct s), '{}') from unnest(vendor_slugs || ${slugs}::text[]) s),
        note = case when ${note} = '' or note like '%' || ${note} || '%' then note else trim(note || ' ' || ${note}) end, updated_at = now()
      where id = ${open.id}`;
    return { id: open.id, repeat: true };
  }
  const [c] = await db<{ id: string }[]>`
    insert into mkt.captures (phone, name, source, page, city_id, category_id, vendor_slugs, note, chat_id, visitor)
    values (${phone}, ${name}, ${source}, ${page}, ${ctx.cityId}, ${ctx.categoryId}, ${slugs}, ${note}, ${chatId}, ${input.visitor ?? null}) returning id`;
  const { staffAlert } = await import('./alerts');
  await staffAlert(db, 'capture', `${name ?? 'A visitor'} left a number (${CAPTURE_SOURCES[source].toLowerCase()})`, '/ops/captures', `capture:${c.id}`);
  return { id: c.id, repeat: false };
}

export type CaptureRow = {
  id: string; phone: string; name: string | null; source: CaptureSource; page: string | null; city_id: number | null; city: string | null; category_id: number | null;
  category: string | null; vendor_slugs: string[]; vendors: { slug: string; name: string }[]; note: string; status: string; outcome: string | null; lead_id: string | null;
  created_at: Date; chat: { role: 'user' | 'assistant'; text: string }[] | null; has_request: boolean;
};

export async function listCaptures(db: Db, view: 'open' | 'done' = 'open') {
  return db<CaptureRow[]>`
    select c.id, c.phone, c.name, c.source, c.page, c.city_id, ci.name as city, c.category_id, cat.name as category, c.vendor_slugs, c.note, c.status, c.outcome, c.lead_id, c.created_at,
      coalesce((select json_agg(json_build_object('slug', v.slug, 'name', v.business_name) order by v.business_name) from mkt.vendors v where v.slug = any(c.vendor_slugs)), '[]'::json) as vendors,
      (select vc.messages from mkt.visitor_chats vc where vc.id = c.chat_id) as chat,
      exists (select 1 from mkt.leads l where l.phone = c.phone and l.created_at > c.created_at - interval '30 days') as has_request
    from mkt.captures c left join mkt.cities ci on ci.id = c.city_id left join mkt.categories cat on cat.id = c.category_id
    where ${view === 'open' ? db`c.status = 'open'` : db`c.status <> 'open'`}
    order by c.created_at ${view === 'open' ? db`asc` : db`desc`} limit 200`;
}

/** Zero if the table is not there yet, so a deploy that lands before its migration cannot break Ops. */
export async function openCaptureCount(db: Db) {
  try {
    const [r] = await db<{ n: number }[]>`select count(*)::int as n from mkt.captures where status = 'open'`;
    return r.n;
  } catch {
    return 0;
  }
}

export async function closeCapture(db: Db, id: string, outcome: string, actor: string) {
  const [c] = await db`update mkt.captures set status = 'closed', outcome = ${outcome.trim().slice(0, 200) || 'Closed'}, handled_by = ${actor}, done_at = now(), updated_at = now() where id = ${id} and status = 'open' returning id`;
  if (!c) throw new DomainError('not_found', 'Already handled');
  await audit(db, actor, 'capture.close', 'capture', id);
}

/** After the call: the number becomes a request, with the vendors she saved marked as her picks. */
export async function convertCapture(sql: Sql, id: string, input: { name: string; cityId: number; categoryIds: number[] }, actor: string) {
  const [c] = await sql<{ id: string; phone: string; source: CaptureSource; vendor_slugs: string[] }[]>`select id, phone, source, vendor_slugs from mkt.captures where id = ${id} and status = 'open'`;
  if (!c) throw new DomainError('not_found', 'Already handled');
  if (!input.categoryIds.length) throw new DomainError('no_needs', 'Tick at least one service');
  const picks = c.vendor_slugs.length
    ? await sql<{ id: string; category_id: number }[]>`select id, category_id from mkt.vendors where slug = any(${c.vendor_slugs}) and status = 'live'`
    : [];
  const lead = await createEnquiry(sql, {
    name: input.name.trim() || 'Website visitor', phone: c.phone, cityId: input.cityId, source: 'ops',
    needs: input.categoryIds.map((categoryId) => ({ categoryId, preferredVendorIds: picks.filter((p) => p.category_id === categoryId).map((p) => p.id) })),
  });
  await sql`update mkt.leads set source = 'website', campaign = ${CAPTURE_SOURCES[c.source]} where id = ${lead.id}`;
  await sql`update mkt.captures set status = 'converted', lead_id = ${lead.id}, handled_by = ${actor}, done_at = now(), updated_at = now(), outcome = 'Request started' where id = ${id}`;
  await audit(sql, actor, 'capture.convert', 'capture', id, { leadId: lead.id });
  return lead;
}

/** What the site's prompts need to know, in one read. */
export async function captureConfig(db: Db) {
  const [on, seconds, views, ai, free] = await Promise.all([
    getSetting<number>(db, 'capture_prompts_on', 1), getSetting<number>(db, 'capture_prompt_seconds', 45), getSetting<number>(db, 'capture_prompt_views', 3),
    getSetting<number>(db, 'visitor_ai_on', 1), getSetting<number>(db, 'visitor_ai_free', 2),
  ]);
  return { prompts: Boolean(on), seconds: Math.max(10, seconds), views: Math.max(1, views), ai: Boolean(ai) && Boolean(process.env.ANTHROPIC_API_KEY), free };
}
