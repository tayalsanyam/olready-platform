import type { Db } from './db';
import { DomainError, getSetting } from './db';
import { aiEnabled } from './ai';
import { displayValue, fieldsFor, formatInr, listCategories, listCities } from './catalog';
import { weddingFor, checklist, shortlist, events } from './weddings';
import { budgetSummary, canSeeBudget, weddingQuotes } from './budget';
import { spacesFor } from './venueSpaces';
import { reviewsForVendor } from './reviews';
import { ideaPhotos, ideaTopics } from './ideas';
import { searchArticles } from './search';

// Ask OLReady: a planning helper for brides and their family. Claude answers through tools
// over OLReady's own data and the bride's own wedding. It never sees vendor contact details,
// never names a vendor that did not come from a tool, and changes nothing without a confirm.

export const ASSISTANT_NAME = 'Ask OLReady';
const MAX_STEPS = 6;
const MAX_VENDORS = 8;

type Profile = { id: string; role: string; full_name: string };
type Wedding = NonNullable<Awaited<ReturnType<typeof weddingFor>>>;
type Ctx = { db: Db; profile: Profile; wedding: Wedding | null; threadId: string; slugs: Set<string>; actions: string[] };
type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
type ApiMessage = { role: 'user' | 'assistant'; content: string | Block[] };

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : typeof v === 'string' && /^\d+$/.test(v.replace(/[,₹\s]/g, '')) ? Number(v.replace(/[,₹\s]/g, '')) : null);
const clip = (s: string | null | undefined, n: number) => (!s ? '' : s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------------------------------------------------------- tools

export const TOOLS = [
  {
    name: 'search_vendors',
    description:
      'Find live OLReady vendors in one category. Use for any request to suggest, find or shortlist vendors. Returns at most 8, best first, each with a link. Never suggest a vendor that is not in a result.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category slug from the list in the instructions' },
        city: { type: 'string', description: 'City slug; leave out to search everywhere' },
        max_price: { type: 'integer', description: 'Highest starting price in rupees, in the category price unit' },
        guests: { type: 'integer', description: 'Guest count; for venues, only places that hold this many' },
        min_rating: { type: 'number', description: 'Lowest average rating, 1 to 5' },
        keyword: { type: 'string', description: 'Style or feature, e.g. "airbrush", "lawn", "candid", "Arabic"' },
        sort: { type: 'string', enum: ['best', 'price_low', 'rating'] },
      },
      required: ['category'],
    },
  },
  {
    name: 'vendor_details',
    description: "One vendor's public profile: prices, facts, halls, reviews. Contact details are never available; brides reach vendors by sending a request.",
    input_schema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
  },
  {
    name: 'my_wedding',
    description: "The signed-in bride's wedding: date, city, functions, checklist progress, shortlist, requests and quotes, and budget if she may see it.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'compare_quotes',
    description: "Quotes the bride has received, with what each includes, what costs extra and what to ask. Optionally one category.",
    input_schema: { type: 'object', properties: { category: { type: 'string' } } },
  },
  {
    name: 'price_guide',
    description: 'Typical prices for a category from live OLReady vendors (starting prices) and recent quotes. Use before suggesting any budget figure.',
    input_schema: { type: 'object', properties: { category: { type: 'string' }, city: { type: 'string' } }, required: ['category'] },
  },
  {
    name: 'find_ideas',
    description: 'Photos from the OLReady ideas gallery. Without a topic, lists the topics and their styles.',
    input_schema: { type: 'object', properties: { topic: { type: 'string' }, style: { type: 'string' } } },
  },
  {
    name: 'find_articles',
    description: 'OLReady guide articles on planning, budgets and choosing vendors.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'propose_shortlist',
    description: "Offer to add a vendor to the bride's shortlist. She sees a card and must confirm; say so.",
    input_schema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
  },
  {
    name: 'propose_checklist_item',
    description: "Offer to add a task to the bride's checklist. She must confirm.",
    input_schema: { type: 'object', properties: { title: { type: 'string' }, due_date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['title'] },
  },
  {
    name: 'propose_category_budget',
    description: "Offer to set the bride's planned budget for one category. She must confirm.",
    input_schema: { type: 'object', properties: { category: { type: 'string' }, amount: { type: 'integer' } }, required: ['category', 'amount'] },
  },
  {
    name: 'draft_request',
    description: 'Prepare a quote request form with categories filled in. Returns a link; the bride checks and sends it herself. Verified vendors then send quotes.',
    input_schema: {
      type: 'object',
      properties: {
        categories: { type: 'array', items: { type: 'string' } },
        city: { type: 'string' },
        guests: { type: 'integer' },
        vendor: { type: 'string', description: 'A vendor slug, to ask that vendor directly' },
      },
      required: ['categories'],
    },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]['name'];

const STATUS: Record<ToolName, string> = {
  search_vendors: 'Looking through vendors',
  vendor_details: 'Reading the vendor profile',
  my_wedding: 'Checking your wedding plan',
  compare_quotes: 'Reading your quotes',
  price_guide: 'Checking prices in the Tricity',
  find_ideas: 'Finding ideas',
  find_articles: 'Finding guides',
  propose_shortlist: 'Preparing a shortlist card',
  propose_checklist_item: 'Preparing a checklist card',
  propose_category_budget: 'Preparing a budget card',
  draft_request: 'Preparing your request',
};
export const statusFor = (name: string) => STATUS[name as ToolName] ?? 'Working on it';

async function categoryBySlug(db: Db, slug: string) {
  const cats = await listCategories(db, { activeOnly: true });
  const s = slug.toLowerCase();
  return cats.find((c) => c.slug === s || c.name.toLowerCase() === s || c.plural_name.toLowerCase() === s) ?? null;
}
async function cityBySlug(db: Db, slug: string) {
  if (!slug) return null;
  const cities = await listCities(db);
  const s = slug.toLowerCase();
  return cities.find((c) => c.slug === s || c.name.toLowerCase() === s) ?? null;
}

async function searchTool(ctx: Ctx, i: Record<string, unknown>) {
  const { db } = ctx;
  const cat = await categoryBySlug(db, str(i.category));
  if (!cat) return { error: `Unknown category "${str(i.category)}". Use a slug from the list.` };
  const city = await cityBySlug(db, str(i.city));
  if (str(i.city) && !city) return { error: `Unknown city "${str(i.city)}".` };
  const fields = await fieldsFor(db, cat.id);
  const hasCapacity = fields.some((f) => f.key === 'capacity_max');
  const guests = hasCapacity ? int(i.guests) : null;
  const maxPrice = int(i.max_price);
  const minRating = typeof i.min_rating === 'number' ? i.min_rating : null;
  const kw = str(i.keyword).slice(0, 40);
  const like = kw ? `%${kw.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const sort = str(i.sort);
  const rows = await db<{ slug: string; business_name: string; city: string; starting_price_inr: number | null; verified: boolean; assured: boolean; attributes: Record<string, unknown>; tagline: string; rating: number | null; n: number }[]>`
    select v.slug, v.business_name, ci.name as city, v.starting_price_inr, v.verified_at is not null as verified, v.assured, v.attributes, v.tagline,
           r.rating, coalesce(r.n, 0)::int as n
    from mkt.vendors v join mkt.cities ci on ci.id = v.city_id
    left join lateral (
      select round(avg((rating_artist + rating_service) / 2.0), 1)::float as rating, count(*) as n
      from mkt.reviews where vendor_id = v.id and status = 'published') r on true
    where v.status = 'live' and v.category_id = ${cat.id}
      and (${city?.id ?? null}::int is null or v.city_id = ${city?.id ?? null} or ${city?.id ?? null} = any(v.service_city_ids))
      and (${maxPrice}::int is null or v.starting_price_inr <= ${maxPrice})
      and (${guests}::int is null or ((v.attributes ->> 'capacity_max') ~ '^[0-9]+$' and (v.attributes ->> 'capacity_max')::int >= ${guests}))
      and (${minRating}::float is null or r.rating >= ${minRating})
      and (${like}::text is null or v.business_name ilike ${like} or v.tagline ilike ${like} or v.about ilike ${like}
           or v.attributes::text ilike ${like} or array_to_string(coalesce(v.known_for, '{}'), ' ') ilike ${like})
    order by ${sort === 'price_low' ? db`v.starting_price_inr asc nulls last,` : sort === 'rating' ? db`r.rating desc nulls last, r.n desc,` : db``}
      v.assured desc, (v.verified_at is not null) desc, r.rating desc nulls last, r.n desc, v.business_name
    limit ${MAX_VENDORS}`;
  const cardFields = fields.filter((f) => f.on_card);
  for (const r of rows) ctx.slugs.add(r.slug);
  return {
    category: cat.plural_name,
    city: city?.name ?? 'all cities',
    price_unit: cat.price_unit,
    note: i.guests && !hasCapacity ? 'Guest count is not a filter for this category.' : undefined,
    vendors: rows.map((r) => ({
      name: r.business_name,
      link: `/v/${r.slug}`,
      slug: r.slug,
      city: r.city,
      starting_price: r.starting_price_inr != null ? `${formatInr(r.starting_price_inr)} ${cat.price_unit}` : 'on request',
      rating: r.rating ? `${r.rating} from ${r.n} review${r.n === 1 ? '' : 's'}` : 'no reviews yet',
      checked: r.assured ? 'OLReady Assured' : r.verified ? 'Verified' : 'Not yet verified',
      tagline: clip(r.tagline, 120),
      facts: cardFields.map((f) => ({ f, v: displayValue(f, r.attributes[f.key]) })).filter((x) => x.v != null).map((x) => `${x.f.label}: ${x.v}`),
    })),
  };
}

async function detailsTool(ctx: Ctx, i: Record<string, unknown>) {
  const { db } = ctx;
  const slug = str(i.slug).replace(/^\/?v\//, '');
  const [v] = await db<{ id: string; slug: string; business_name: string; category_id: number; category: string; price_unit: string; city: string; tagline: string; about: string; starting_price_inr: number | null; years_experience: number | null; attributes: Record<string, unknown>; verified: boolean; assured: boolean; known_for: string[] | null }[]>`
    select v.id, v.slug, v.business_name, v.category_id, c.name as category, c.price_unit, ci.name as city, v.tagline, v.about, v.starting_price_inr,
           v.years_experience, v.attributes, v.verified_at is not null as verified, v.assured, v.known_for
    from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
    where v.slug = ${slug} and v.status = 'live'`;
  if (!v) return { error: 'No live vendor with that link.' };
  ctx.slugs.add(v.slug);
  const [fields, halls, reviews] = await Promise.all([fieldsFor(db, v.category_id), spacesFor(db, v.id), reviewsForVendor(db, v.id)]);
  const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + (r.rating_artist + r.rating_service) / 2, 0) / reviews.length) * 10) / 10 : null;
  return {
    name: v.business_name,
    link: `/v/${v.slug}`,
    category: v.category,
    city: v.city,
    starting_price: v.starting_price_inr != null ? `${formatInr(v.starting_price_inr)} ${v.price_unit}` : 'on request',
    years_experience: v.years_experience,
    checked: v.assured ? 'OLReady Assured' : v.verified ? 'Verified' : 'Not yet verified',
    tagline: v.tagline,
    about: clip(v.about, 900),
    facts: fields.map((f) => ({ f, val: displayValue(f, v.attributes[f.key]) })).filter((x) => x.val != null).map((x) => `${x.f.label}: ${x.val}`),
    known_for: v.known_for ?? [],
    halls: halls.map((h) => `${h.name} (${h.kind}${h.seating ? `, seats ${h.seating}` : ''}${h.floating ? `, ${h.floating} floating` : ''})`),
    reviews: {
      count: reviews.length,
      average: avg,
      latest: reviews.slice(0, 4).map((r) => ({ by: (r.author_name ?? '').split(' ')[0] || 'A bride', work: r.rating_artist, service: r.rating_service, booked_here: r.verified_booking, said: clip(r.body, 300) })),
    },
    how_to_contact: 'Send a request through OLReady; the vendor replies in her OLReady inbox.',
  };
}

async function myWeddingTool(ctx: Ctx) {
  const { db, wedding: w, profile } = ctx;
  if (!w) return { has_wedding: false, note: 'She has not started a wedding plan. She can start one at /me.' };
  const [cl, sl, ev, needs, seeBudget] = await Promise.all([
    checklist(db, w.id),
    shortlist(db, w.id),
    events(db, w.id),
    db<{ category: string; status: string; quotes: number; booked: string | null; verified: boolean }[]>`
      select c.name as category, ln.status, l.status = 'verified' as verified,
        (select count(*)::int from mkt.quotes q join mkt.threads t on t.id = q.thread_id where t.lead_need_id = ln.id and q.status in ('sent','accepted')) as quotes,
        bv.business_name as booked
      from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id
      left join mkt.vendors bv on bv.id = ln.booked_vendor_id
      where (l.wedding_id = ${w.id} or l.bride_profile_id = ${w.owner_profile_id}) and ln.status <> 'removed' order by c.sort`,
    canSeeBudget(db, w.id, profile.id),
  ]);
  for (const s of sl) ctx.slugs.add(s.slug);
  const open = cl.filter((x) => !x.done);
  const budget = seeBudget ? await budgetSummary(db, w.id) : null;
  const days = w.wedding_date ? Math.round((Date.parse(w.wedding_date) - Date.parse(today())) / 864e5) : null;
  const [city] = w.city_id ? await db<{ name: string; slug: string }[]>`select name, slug from mkt.cities where id = ${w.city_id}` : [];
  return {
    has_wedding: true,
    title: w.title,
    your_role: w.member_role,
    wedding_date: w.wedding_date,
    days_to_go: days,
    city: city ? `${city.name} (${city.slug})` : null,
    functions: ev.map((e) => `${e.name}${e.starts_at ? ` on ${e.starts_at.toISOString().slice(0, 10)}` : ''}${e.venue ? ` at ${e.venue}` : ''}`),
    checklist: { done: cl.length - open.length, total: cl.length, next: open.slice(0, 6).map((x) => `${x.title}${x.due_date ? ` (by ${x.due_date})` : ''}`) },
    shortlist: sl.map((s) => ({ name: s.business_name, link: `/v/${s.slug}`, category: s.category_name })),
    requests: needs.map((n) => ({ category: n.category, state: n.booked ? `booked with ${n.booked}` : !n.verified ? 'waiting for our verification call' : `${n.quotes} quote${n.quotes === 1 ? '' : 's'}`, })),
    budget: budget
      ? {
          total: budget.total != null ? formatInr(budget.total) : 'not set',
          planned_across_categories: formatInr(budget.plannedSum),
          by_category: budget.lines
            .filter((l) => l.planned != null || l.likely)
            .map((l) => ({ category: l.category_name, planned: l.planned != null ? formatInr(l.planned) : 'not set', likely: formatInr(l.likely), likely_from: l.source })),
        }
      : 'Only the couple can see the budget.',
  };
}

async function quotesTool(ctx: Ctx, i: Record<string, unknown>) {
  const { db, wedding } = ctx;
  if (!wedding) return { quotes: [], note: 'No wedding plan yet.' };
  const all = await weddingQuotes(db, wedding.id);
  const cat = str(i.category) ? await categoryBySlug(db, str(i.category)) : null;
  const rows = cat ? all.filter((q) => q.category_id === cat.id) : all;
  for (const q of rows) ctx.slugs.add(q.vendor_slug);
  return {
    quotes: rows.map((q) => ({
      vendor: q.vendor_name,
      link: `/v/${q.vendor_slug}`,
      conversation: `/me/threads/${q.thread_id}`,
      category: q.category_name,
      amount: formatInr(q.amount_inr),
      priced_per_function: q.lines?.map((l) => `${l.label}: ${formatInr(l.amount)}`) ?? [],
      status: q.status,
      vendor_wrote: clip(q.details, 500),
      included: q.reading?.included ?? [],
      charged_extra: q.reading?.extra ?? [],
      worth_asking: q.reading?.ask ?? [],
    })),
    compare_page: '/me/compare',
  };
}

async function priceTool(ctx: Ctx, i: Record<string, unknown>) {
  const { db } = ctx;
  const cat = await categoryBySlug(db, str(i.category));
  if (!cat) return { error: 'Unknown category.' };
  const city = await cityBySlug(db, str(i.city));
  const [s] = await db<{ n: number; p25: number | null; p50: number | null; p75: number | null }[]>`
    select count(*)::int as n,
      percentile_cont(0.25) within group (order by starting_price_inr)::int as p25,
      percentile_cont(0.5) within group (order by starting_price_inr)::int as p50,
      percentile_cont(0.75) within group (order by starting_price_inr)::int as p75
    from mkt.vendors v where status = 'live' and category_id = ${cat.id} and starting_price_inr is not null
      and (${city?.id ?? null}::int is null or v.city_id = ${city?.id ?? null} or ${city?.id ?? null} = any(v.service_city_ids))`;
  const [q] = await db<{ n: number; p50: number | null }[]>`
    select count(*)::int as n, percentile_cont(0.5) within group (order by q.amount_inr)::int as p50
    from mkt.quotes q join mkt.threads t on t.id = q.thread_id join mkt.lead_needs ln on ln.id = t.lead_need_id
    where ln.category_id = ${cat.id} and q.status in ('sent', 'accepted') and q.created_at > now() - interval '365 days'`;
  if (s.n < 3) return { category: cat.plural_name, note: 'Too few vendors list prices here to give a fair range. Suggest sending a request to get real quotes.' };
  return {
    category: cat.plural_name,
    city: city?.name ?? 'Tricity',
    unit: cat.price_unit,
    vendors_with_prices: s.n,
    starting_prices: { lower: formatInr(s.p25), middle: formatInr(s.p50), upper: formatInr(s.p75) },
    typical_quote: q.n >= 5 ? formatInr(q.p50) : 'not enough quotes yet',
    caution: 'Starting prices are the lowest package; full quotes are usually higher.',
  };
}

async function ideasTool(ctx: Ctx, i: Record<string, unknown>) {
  const { db } = ctx;
  const topics = await ideaTopics(db);
  const t = str(i.topic).toLowerCase();
  const topic = topics.find((x) => x.slug === t || x.name.toLowerCase() === t);
  if (!topic) return { topics: topics.map((x) => ({ slug: x.slug, name: x.name, page: `/ideas/${x.slug}` })) };
  const tags = await db<{ slug: string; label: string }[]>`select slug, label from mkt.idea_tags where topic_id = ${topic.id} order by sort`;
  const style = str(i.style).toLowerCase();
  const tag = tags.find((x) => x.slug === style || x.label.toLowerCase() === style);
  const photos = await ideaPhotos(db, { topic: topic.slug, tag: tag?.slug, limit: 6 });
  for (const p of photos) if (p.vendor_slug) ctx.slugs.add(p.vendor_slug);
  return {
    topic: topic.name,
    page: `/ideas/${topic.slug}${tag ? `?tag=${tag.slug}` : ''}`,
    styles: tags.map((x) => x.label),
    photos: photos.map((p) => ({ link: `/ideas/photo/${p.ref}`, caption: p.caption, by: p.vendor_name, vendor_link: p.vendor_slug ? `/v/${p.vendor_slug}` : null })),
  };
}

async function articlesTool(ctx: Ctx, i: Record<string, unknown>) {
  const rows = await searchArticles(ctx.db, str(i.query));
  return { articles: rows.map((a) => ({ title: a.title, link: `/blog/${a.slug}`, summary: a.excerpt })) };
}

async function propose(ctx: Ctx, kind: 'shortlist' | 'checklist' | 'category_budget', payload: Record<string, unknown>, summary: string) {
  const [a] = await ctx.db<{ id: string }[]>`
    insert into mkt.assistant_actions (thread_id, kind, payload, summary) values (${ctx.threadId}, ${kind}, ${ctx.db.json(payload as never)}, ${summary}) returning id`;
  ctx.actions.push(a.id);
  return { proposed: summary, note: 'A card is shown under your answer. Nothing changes until she taps Confirm.' };
}

async function proposeShortlist(ctx: Ctx, i: Record<string, unknown>) {
  if (!ctx.wedding) return { error: 'She needs a wedding plan first (at /me) to keep a shortlist.' };
  const slug = str(i.slug).replace(/^\/?v\//, '');
  const [v] = await ctx.db<{ id: string; business_name: string; on: boolean }[]>`
    select v.id, v.business_name, exists (select 1 from mkt.shortlist s where s.wedding_id = ${ctx.wedding.id} and s.vendor_id = v.id) as on
    from mkt.vendors v where v.slug = ${slug} and v.status = 'live'`;
  if (!v) return { error: 'No live vendor with that link.' };
  ctx.slugs.add(slug);
  if (v.on) return { note: `${v.business_name} is already on her shortlist.` };
  return propose(ctx, 'shortlist', { vendorId: v.id, slug }, `Add ${v.business_name} to your shortlist`);
}

async function proposeChecklist(ctx: Ctx, i: Record<string, unknown>) {
  if (!ctx.wedding) return { error: 'She needs a wedding plan first (at /me).' };
  const title = clip(str(i.title), 120);
  if (title.length < 3) return { error: 'Give the task a title.' };
  const due = /^\d{4}-\d{2}-\d{2}$/.test(str(i.due_date)) ? str(i.due_date) : null;
  return propose(ctx, 'checklist', { title, dueDate: due }, `Add "${title}" to your checklist${due ? ` for ${due}` : ''}`);
}

async function proposeBudget(ctx: Ctx, i: Record<string, unknown>) {
  if (!ctx.wedding) return { error: 'She needs a wedding plan first (at /me).' };
  if (!(await canSeeBudget(ctx.db, ctx.wedding.id, ctx.profile.id))) return { error: 'Only the couple can change the budget.' };
  const cat = await categoryBySlug(ctx.db, str(i.category));
  const amount = int(i.amount);
  if (!cat || !amount || amount < 1000) return { error: 'Need a category and an amount of at least ₹1,000.' };
  return propose(ctx, 'category_budget', { categoryId: cat.id, amount }, `Set your ${cat.plural_name.toLowerCase()} budget to ${formatInr(amount)}`);
}

async function draftRequest(ctx: Ctx, i: Record<string, unknown>) {
  const cats = Array.isArray(i.categories) ? i.categories.map(String) : [];
  const found = (await Promise.all(cats.map((c) => categoryBySlug(ctx.db, c)))).filter(Boolean) as { slug: string; plural_name: string }[];
  if (!found.length) return { error: 'Name at least one category.' };
  const city = await cityBySlug(ctx.db, str(i.city));
  const p = new URLSearchParams({ category: found.map((c) => c.slug).join(',') });
  if (city) p.set('city', city.slug);
  const g = int(i.guests);
  if (g) p.set('guests', String(g));
  const vendor = str(i.vendor).replace(/^\/?v\//, '');
  if (vendor) {
    const [v] = await ctx.db`select 1 from mkt.vendors where slug = ${vendor} and status = 'live'`;
    if (v) {
      p.set('vendor', vendor);
      ctx.slugs.add(vendor);
    }
  }
  return {
    link: `/enquire?${p}`,
    for: found.map((c) => c.plural_name),
    note: 'She checks the form and sends it herself. Our team confirms the details on a short call, then verified vendors send quotes to her OLReady inbox.',
  };
}

export async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>) {
  switch (name as ToolName) {
    case 'search_vendors':
      return searchTool(ctx, input);
    case 'vendor_details':
      return detailsTool(ctx, input);
    case 'my_wedding':
      return myWeddingTool(ctx);
    case 'compare_quotes':
      return quotesTool(ctx, input);
    case 'price_guide':
      return priceTool(ctx, input);
    case 'find_ideas':
      return ideasTool(ctx, input);
    case 'find_articles':
      return articlesTool(ctx, input);
    case 'propose_shortlist':
      return proposeShortlist(ctx, input);
    case 'propose_checklist_item':
      return proposeChecklist(ctx, input);
    case 'propose_category_budget':
      return proposeBudget(ctx, input);
    case 'draft_request':
      return draftRequest(ctx, input);
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// ---------------------------------------------------------------- answer checks

// Any 10-digit Indian mobile however it is spaced: 98765 43210, 987-654-3210, +91 9876543210.
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}(?!\d)/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Enforces the rules on the final answer: vendor links must come from tool results and be
 * live; phone numbers and emails are removed. Returns the cleaned text and what was caught.
 */
export async function checkAnswer(db: Db, text: string, known: Set<string>, usedTools: boolean) {
  const flags = new Set<string>();
  let out = text;
  const linked = [...out.matchAll(/\[([^\]]+)\]\(\/v\/([a-z0-9-]+)\)/g)];
  if (linked.length) {
    const slugs = [...new Set(linked.map((m) => m[2]))];
    const live = new Set((await db<{ slug: string }[]>`select slug from mkt.vendors where slug = any(${slugs}) and status = 'live'`).map((r) => r.slug));
    for (const m of linked) {
      if (!known.has(m[2]) || !live.has(m[2])) {
        flags.add('unknown_vendor');
        out = out.replace(m[0], m[1]);
      }
    }
  }
  // Bare /v/ paths the model typed outside a link.
  for (const m of out.matchAll(/(?<!\()\/v\/([a-z0-9-]+)/g)) if (!known.has(m[1])) flags.add('unknown_vendor');
  if (PHONE.test(out) || EMAIL.test(out)) {
    flags.add('contact');
    out = out.replace(PHONE, '[number removed]').replace(EMAIL, '[email removed]');
  }
  PHONE.lastIndex = 0;
  EMAIL.lastIndex = 0;
  if (!usedTools && /₹\s?\d/.test(out)) flags.add('unsourced_price');
  return { text: out, flags: [...flags] };
}

// ---------------------------------------------------------------- the conversation

async function systemPrompt(db: Db) {
  const [cats, cities] = await Promise.all([listCategories(db, { activeOnly: true }), listCities(db)]);
  return `You are ${ASSISTANT_NAME}, the planning helper inside OLReady, a wedding marketplace for Chandigarh, Mohali, Panchkula and nearby towns. You help a bride (or her family) plan: choosing vendors, budgets, timelines, ideas and comparing quotes. Today is ${today()} (India).

How OLReady works: vendors list for free. A bride sends one request for any categories; our team confirms it on a short call; verified vendors then message and quote inside OLReady. Vendor phone numbers are private until she chooses to share hers. You cannot see vendor contact details and must never give any, or say vendors are available on a date (you do not know; a request finds out).

Categories (slug: name, price unit): ${cats.map((c) => `${c.slug}: ${c.plural_name}, ${c.price_unit}`).join('; ')}.
Cities (slug: name): ${cities.map((c) => `${c.slug}: ${c.name}`).join('; ')}.

Rules:
- Facts about vendors, prices, her wedding or her quotes come only from tools. Never name a vendor that is not in a tool result from this conversation. Link every vendor you name as [Name](/v/slug) using the link from the tool.
- Before giving budget figures, call price_guide; before talking about her plan, call my_wedding.
- Ranking is by fit to what she asked: price, place, capacity, reviews, verification. Payment or promotion never affects what you suggest.
- To change her shortlist, checklist or budget, call the propose_ tool and tell her to tap Confirm on the card. To get quotes, call draft_request and give her the link; she sends it herself.
- Reply in the language she writes in: English, Hindi or Hinglish.
- Keep replies short and easy on a phone: a line or two, then at most 5 bullets. Ask one question when something important is missing (city, date, guests, budget). No headings.
- For money, health or legal questions, keep it general and suggest asking a professional.
- If asked about anything unrelated to her wedding, say briefly that you can only help with wedding planning on OLReady.`;
}

async function callClaude(system: string, messages: ApiMessage[]) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new DomainError('off', `${ASSISTANT_NAME} is not switched on yet.`);
  const tools = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));
  let res: Response;
  try {
    res = await fetch(`${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.ANTHROPIC_BRIDE_MODEL ?? 'claude-sonnet-5-5',
        max_tokens: 1500,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      }),
    });
  } catch {
    throw new DomainError('ai_error', 'That took too long. Try again.');
  }
  if (!res.ok) throw new DomainError('ai_error', `${ASSISTANT_NAME} could not answer just now (${res.status}). Try again.`);
  return (await res.json()) as { content: Block[]; stop_reason: string };
}

export async function allowance(db: Db, profileId: string) {
  const [on, perDay, siteDay] = await Promise.all([
    getSetting<number>(db, 'bride_assistant_on', 1),
    getSetting<number>(db, 'bride_assistant_per_day', 40),
    getSetting<number>(db, 'bride_assistant_site_day', 5000),
  ]);
  const [u] = await db<{ mine: number; all: number }[]>`
    select count(*) filter (where t.profile_id = ${profileId})::int as mine, count(*)::int as all
    from mkt.assistant_messages m join mkt.assistant_threads t on t.id = m.thread_id
    where m.role = 'user' and m.text <> '' and m.created_at >= (${today()}::date)::timestamp at time zone 'Asia/Kolkata'`;
  return { on: Boolean(on) && aiEnabled(), left: Math.max(0, Math.min(perDay - u.mine, siteDay - u.all)), perDay };
}

export async function ownThread(db: Db, threadId: string, profileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) return null;
  const [t] = await db<{ id: string; title: string; wedding_id: string | null }[]>`
    select id, title, wedding_id from mkt.assistant_threads where id = ${threadId} and profile_id = ${profileId}`;
  return t ?? null;
}

async function history(db: Db, threadId: string) {
  const rows = await db<{ role: 'user' | 'assistant'; content: string | Block[] }[]>`
    select role, content from mkt.assistant_messages where thread_id = ${threadId} order by created_at desc, id desc limit 40`;
  rows.reverse();
  // Start at a plain question, so no tool result is left without its call.
  while (rows.length && !(rows[0].role === 'user' && typeof rows[0].content === 'string')) rows.shift();
  return rows as ApiMessage[];
}

function slugsIn(messages: ApiMessage[]) {
  const s = new Set<string>();
  for (const m of messages)
    if (Array.isArray(m.content))
      for (const b of m.content) if (b.type === 'tool_result') for (const x of b.content.matchAll(/"\/v\/([a-z0-9-]+)"/g)) s.add(x[1]);
  return s;
}

export type TurnEvent = { type: 'thread'; id: string } | { type: 'status'; text: string };
export type TurnResult = { threadId: string; messageId: string; text: string; flags: string[]; actions: { id: string; summary: string; status: string }[] };

/** One question in, one checked answer out. Every step is stored so the thread can continue. */
export async function ask(db: Db, profile: Profile, input: { threadId?: string | null; text: string }, emit: (e: TurnEvent) => void = () => {}): Promise<TurnResult> {
  if (profile.role !== 'bride') throw new DomainError('forbidden', `${ASSISTANT_NAME} is for brides and their family.`);
  const text = input.text.trim().slice(0, 2000);
  if (!text) throw new DomainError('empty', 'Type a question');
  const a = await allowance(db, profile.id);
  if (!a.on) throw new DomainError('off', `${ASSISTANT_NAME} is resting right now. Everything else on OLReady works as usual.`);
  if (a.left <= 0) throw new DomainError('limit', `You have used today's ${a.perDay} questions. Ask again tomorrow.`);
  const wedding = await weddingFor(db, profile.id);
  let threadId = input.threadId && (await ownThread(db, input.threadId, profile.id)) ? input.threadId : null;
  if (!threadId) {
    const [t] = await db<{ id: string }[]>`
      insert into mkt.assistant_threads (profile_id, wedding_id, title) values (${profile.id}, ${wedding?.id ?? null}, ${clip(text.replace(/\s+/g, ' '), 70)}) returning id`;
    threadId = t.id;
    emit({ type: 'thread', id: threadId });
  }
  const store = (role: 'user' | 'assistant', content: string | Block[], shown: string, tools: string[] = [], flags: string[] = []) =>
    db<{ id: string }[]>`
      insert into mkt.assistant_messages (thread_id, role, content, text, tools_used, flags)
      values (${threadId}, ${role}, ${db.json(content as never)}, ${shown}, ${tools}, ${flags}) returning id`.then((r) => r[0].id);

  await store('user', text, text);
  const messages = await history(db, threadId);
  const ctx: Ctx = { db, profile, wedding, threadId, slugs: slugsIn(messages), actions: [] };
  const system = await systemPrompt(db);
  const used: string[] = [];
  let finalText = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await callClaude(system, messages);
    const calls = res.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    const said = res.content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!calls.length || step === MAX_STEPS - 1) {
      finalText = said || 'Sorry, I could not finish that. Could you ask it a little more simply?';
      break;
    }
    await store('assistant', res.content, '', calls.map((c) => c.name));
    messages.push({ role: 'assistant', content: res.content });
    const results: Block[] = [];
    for (const c of calls) {
      emit({ type: 'status', text: statusFor(c.name) });
      used.push(c.name);
      let out: unknown;
      try {
        out = await runTool(ctx, c.name, c.input ?? {});
      } catch (e) {
        out = { error: e instanceof DomainError ? e.message : 'That lookup failed.' };
      }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(out && typeof out === 'object' && 'error' in out ? { is_error: true } : {}) });
    }
    await store('user', results, '');
    messages.push({ role: 'user', content: results });
  }
  const checked = await checkAnswer(db, finalText, ctx.slugs, used.length > 0 || slugsIn(messages).size > 0);
  const messageId = await store('assistant', [{ type: 'text', text: checked.text }], checked.text, [...new Set(used)], checked.flags);
  if (ctx.actions.length) await db`update mkt.assistant_actions set message_id = ${messageId} where id = any(${ctx.actions}::uuid[])`;
  await db`update mkt.assistant_threads set updated_at = now(), wedding_id = coalesce(wedding_id, ${wedding?.id ?? null}) where id = ${threadId}`;
  const actions = ctx.actions.length
    ? await db<{ id: string; summary: string; status: string }[]>`select id, summary, status from mkt.assistant_actions where id = any(${ctx.actions}::uuid[]) order by created_at`
    : [];
  return { threadId, messageId, text: checked.text, flags: checked.flags, actions };
}

// ---------------------------------------------------------------- confirm cards, feedback, history

export async function decideAction(db: Db, actionId: string, profile: Profile, confirm: boolean) {
  const [a] = await db<{ id: string; kind: string; payload: Record<string, unknown>; status: string; profile_id: string }[]>`
    select a.id, a.kind, a.payload, a.status, t.profile_id from mkt.assistant_actions a join mkt.assistant_threads t on t.id = a.thread_id
    where a.id = ${actionId}`;
  if (!a || a.profile_id !== profile.id) throw new DomainError('not_found', 'That card is not yours');
  if (a.status !== 'pending') return a.status;
  if (!confirm) {
    await db`update mkt.assistant_actions set status = 'cancelled', decided_at = now() where id = ${a.id}`;
    return 'cancelled';
  }
  const w = await weddingFor(db, profile.id);
  try {
    if (!w) throw new DomainError('no_wedding', 'Start your wedding plan first');
    if (a.kind === 'shortlist') {
      const vid = String(a.payload.vendorId);
      const [on] = await db`select 1 from mkt.shortlist where wedding_id = ${w.id} and vendor_id = ${vid}`;
      if (!on) {
        const { toggleShortlist } = await import('./weddings');
        await toggleShortlist(db, w.id, vid, profile.id);
      }
    } else if (a.kind === 'checklist') {
      const { addChecklistItem } = await import('./weddings');
      await addChecklistItem(db, w.id, profile.id, String(a.payload.title), (a.payload.dueDate as string | null) ?? null);
    } else if (a.kind === 'category_budget') {
      const { setCategoryBudget } = await import('./budget');
      await setCategoryBudget(db, w.id, profile.id, Number(a.payload.categoryId), Number(a.payload.amount));
    }
    await db`update mkt.assistant_actions set status = 'done', decided_at = now() where id = ${a.id}`;
    return 'done';
  } catch (e) {
    const msg = e instanceof DomainError ? e.message : 'That did not work';
    await db`update mkt.assistant_actions set status = 'failed', error = ${msg}, decided_at = now() where id = ${a.id}`;
    throw new DomainError('failed', msg);
  }
}

export async function rateMessage(db: Db, messageId: string, profileId: string, helpful: boolean, note = '') {
  const [m] = await db`
    select 1 from mkt.assistant_messages m join mkt.assistant_threads t on t.id = m.thread_id
    where m.id = ${messageId} and t.profile_id = ${profileId} and m.role = 'assistant' and m.text <> ''`;
  if (!m) throw new DomainError('not_found', 'Message not found');
  await db`
    insert into mkt.assistant_feedback (message_id, profile_id, helpful, note) values (${messageId}, ${profileId}, ${helpful}, ${clip(note, 500)})
    on conflict (message_id, profile_id) do update set helpful = excluded.helpful, note = excluded.note, created_at = now()`;
}

export async function threadsFor(db: Db, profileId: string) {
  return db<{ id: string; title: string; updated_at: Date }[]>`
    select id, title, updated_at from mkt.assistant_threads where profile_id = ${profileId} order by updated_at desc limit 30`;
}

export type ShownMessage = { id: string; role: 'user' | 'assistant'; text: string; created_at: Date; helpful: boolean | null; actions: { id: string; summary: string; status: string }[] };

export async function shownMessages(db: Db, threadId: string): Promise<ShownMessage[]> {
  const rows = await db<{ id: string; role: 'user' | 'assistant'; text: string; created_at: Date; helpful: boolean | null }[]>`
    select m.id, m.role, m.text, m.created_at, (select helpful from mkt.assistant_feedback f where f.message_id = m.id limit 1) as helpful
    from mkt.assistant_messages m where m.thread_id = ${threadId} and m.text <> '' order by m.created_at, m.id`;
  const acts = await db<{ id: string; message_id: string; summary: string; status: string }[]>`
    select id, message_id, summary, status from mkt.assistant_actions where thread_id = ${threadId} order by created_at`;
  return rows.map((r) => ({ ...r, actions: acts.filter((a) => a.message_id === r.id).map(({ id, summary, status }) => ({ id, summary, status })) }));
}

export async function deleteThread(db: Db, threadId: string, profileId: string) {
  await db`delete from mkt.assistant_threads where id = ${threadId} and profile_id = ${profileId}`;
}

/** Daily job: chats untouched for longer than the keep period are deleted. */
export async function purgeOldChats(db: Db) {
  const days = await getSetting<number>(db, 'bride_assistant_keep_days', 90);
  const r = await db`delete from mkt.assistant_threads where updated_at < now() - make_interval(days => ${days}) returning 1`;
  return r.length;
}
