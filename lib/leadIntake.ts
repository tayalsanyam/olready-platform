import { audit, DomainError, type Db, type Sql } from './db';
import { addNeed, createEnquiry, normalisePhone } from './leads';
import { listCategories, type Category } from './catalog';
import { searchPlaces, pincodeInfo } from './locations';
import { queueEmail } from './email';

// Brides who answer an Instagram or Facebook ad never visit the site. Their details arrive as a
// sheet pasted into Ops or straight from Meta's lead forms, and wait for the verification call.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Ops takes her email on the call. Once saved she can sign in with it and find her request. */
export async function setLeadContact(db: Db, leadId: string, input: { email: string; name?: string }, actor: string) {
  const email = input.email.trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) throw new DomainError('bad_email', 'That email does not look right');
  const name = input.name?.trim();
  const [lead] = await db<{ id: string; status: string; bride_name: string; bride_profile_id: string | null; email: string | null }[]>`
    update mkt.leads set email = ${email || null}, bride_name = ${name || db`bride_name`} where id = ${leadId}
    returning id, status, bride_name, bride_profile_id, email`;
  if (!lead) throw new DomainError('not_found', 'Lead not found');
  let linked = false;
  if (email && !lead.bride_profile_id) {
    // She already has an account under this email: her request shows up there straight away.
    const [p] = await db<{ id: string }[]>`select id from mkt.profiles where email = ${email} and role = 'bride'`;
    if (p) {
      await db`update mkt.leads set bride_profile_id = ${p.id} where id = ${leadId}`;
      linked = true;
    }
  }
  if (email && lead.status === 'verified') {
    await queueEmail(db, email, 'lead_verified', { name: lead.bride_name.split(' ')[0] }, `verified:${leadId}`);
  }
  await audit(db, actor, 'lead.contact', 'lead', leadId, { email: Boolean(email), linked });
  return { linked };
}

export type IntakeRow = {
  name: string;
  phone: string;
  email?: string | null;
  town?: string | null;
  date?: string | null;
  categories?: string | null;
  campaign?: string | null;
  externalId?: string | null;
};
export type IntakeDefaults = { cityId: number; categoryIds: number[]; source: 'instagram' | 'ops' };
export type IntakeResult = { added: number; merged: number; skipped: number; problems: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Column names as Meta's lead download writes them, plus the plain words a person would type.
const COLUMNS: Record<keyof IntakeRow, string[]> = {
  name: ['full name', 'name', 'bride name', 'first name', 'your name'],
  phone: ['phone number', 'phone', 'mobile', 'mobile number', 'whatsapp number', 'contact number'],
  email: ['email', 'email address', 'e mail'],
  town: ['city', 'town', 'wedding city', 'location', 'pincode', 'pin code', 'zip code', 'post code'],
  date: ['wedding date', 'event date', 'date', 'date of wedding', 'when is your wedding'],
  categories: ['services', 'service', 'category', 'categories', 'what do you need', 'looking for', 'requirement', 'requirements'],
  campaign: ['campaign name', 'campaign', 'ad name', 'form name', 'adset name', 'ad set name'],
  externalId: ['id', 'lead id', 'leadgen id'],
};

function splitLine(line: string, sep: string) {
  if (sep === '\t') return line.split('\t').map((c) => c.trim());
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Reads a pasted sheet (tabs from a spreadsheet, or commas from a CSV file) whose first row names the columns. */
export function parseLeadSheet(text: string): IntakeRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new DomainError('empty_sheet', 'Paste the heading row and at least one lead');
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const head = splitLine(lines[0], sep).map(norm);
  const at = {} as Record<keyof IntakeRow, number>;
  for (const key of Object.keys(COLUMNS) as (keyof IntakeRow)[]) {
    at[key] = head.findIndex((h) => COLUMNS[key].includes(h));
  }
  // Meta writes "campaign_name" and "ad_name"; prefer the campaign, fall back to the ad.
  if (at.name < 0 || at.phone < 0) throw new DomainError('bad_sheet', 'The sheet needs a name column and a phone column');
  return lines.slice(1, 1001).map((line) => {
    const cells = splitLine(line, sep);
    const get = (k: keyof IntakeRow) => (at[k] >= 0 ? (cells[at[k]] ?? '').trim() : '');
    return {
      name: get('name'),
      phone: get('phone').replace(/^p:/i, ''),
      email: get('email') || null,
      town: get('town') || null,
      date: get('date') || null,
      categories: get('categories') || null,
      campaign: get('campaign') || null,
      externalId: get('externalId').replace(/^l:/i, '') || null,
    };
  });
}

/** "14/02/2027", "2027-02-14" or "14 Feb 2027" to YYYY-MM-DD. Day comes first, as people write it in India. */
export function readDate(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s))) {
    [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
    if (y < 100) y += 2000;
  } else if ((hit = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(s))) {
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(hit[2].toLowerCase());
    if (mi < 0) return null;
    [d, m, y] = [Number(hit[1]), mi + 1, Number(hit[3])];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2020 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Which categories a free-text answer such as "Makeup, photography" means. */
export function matchCategories(text: string | null | undefined, cats: Pick<Category, 'id' | 'name' | 'plural_name' | 'slug'>[]) {
  const t = norm(text ?? '');
  if (!t) return [];
  const WORDS: Record<string, string[]> = {
    venues: ['venue', 'banquet', 'hall', 'resort', 'farmhouse', 'lawn'],
    'bridal-makeup': ['makeup', 'make up', 'mua', 'hair'],
    photographers: ['photo', 'video', 'cinemat', 'pre wedding shoot'],
    decorators: ['decor', 'stage'],
    'mehendi-artists': ['mehendi', 'mehndi', 'henna'],
    'djs-dhol': ['dj', 'dhol', 'music'],
    invitations: ['invitation', 'card', 'invite'],
    caterers: ['cater', 'food'],
    planners: ['planner', 'planning'],
    'bridal-wear': ['lehenga', 'bridal wear', 'outfit', 'dress'],
    florists: ['flower', 'florist'],
    jewellery: ['jewel'],
    choreographers: ['choreo', 'dance'],
    pandits: ['pandit', 'priest'],
    bands: ['band', 'baraat'],
  };
  return cats
    .filter((c) => {
      const words = [norm(c.name), norm(c.plural_name), ...(WORDS[c.slug] ?? [])];
      return words.some((w) => w && t.includes(w));
    })
    .map((c) => c.id);
}

async function townFor(db: Db, raw: string | null | undefined) {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const pin = /\b[1-9][0-9]{5}\b/.exec(s)?.[0];
  if (pin) {
    const info = await pincodeInfo(db, pin);
    if (info?.city_id) return { cityId: info.city_id, pincode: pin };
  }
  const first = s.split(/[,/]/)[0].trim();
  if (first.length < 2) return null;
  const hit = (await searchPlaces(db, first, { limit: 3 })).find((p) => p.kind === 'town');
  return hit && hit.kind === 'town' ? { cityId: hit.city_id, pincode: null } : null;
}

/**
 * Adds each row as a request waiting for the verification call. The same ad lead is never added twice,
 * and a phone number that already has a request still waiting for its call gets the new categories added to it.
 */
export async function importLeads(sql: Sql, rows: IntakeRow[], defaults: IntakeDefaults, actor: string | null): Promise<IntakeResult> {
  const cats = await listCategories(sql, { activeOnly: true });
  const res: IntakeResult = { added: 0, merged: 0, skipped: 0, problems: [] };
  for (const [i, row] of rows.entries()) {
    const label = `Row ${i + 2}${row.name ? ` (${row.name})` : ''}`;
    try {
      if (!row.name?.trim()) throw new DomainError('bad_name', 'no name');
      const phone = normalisePhone(row.phone);
      if (row.externalId) {
        const [dup] = await sql`select 1 from mkt.leads where external_id = ${row.externalId}`;
        if (dup) { res.skipped++; continue; }
      }
      const wanted = matchCategories(row.categories, cats);
      const categoryIds = wanted.length ? wanted : defaults.categoryIds;
      if (!categoryIds.length) throw new DomainError('no_needs', 'no category, and no default chosen');
      const town = (await townFor(sql, row.town)) ?? { cityId: defaults.cityId, pincode: null };
      const email = row.email && EMAIL_RE.test(row.email.trim()) ? row.email.trim().toLowerCase() : null;
      const [open] = await sql<{ id: string }[]>`
        select id from mkt.leads where phone = ${phone} and status in ('new','verifying') order by created_at desc limit 1`;
      if (open) {
        for (const c of categoryIds) await addNeed(sql, open.id, c, null);
        await sql`update mkt.leads set email = coalesce(email, ${email}), campaign = coalesce(campaign, ${row.campaign ?? null}),
          external_id = coalesce(external_id, ${row.externalId ?? null}) where id = ${open.id}`;
        res.merged++;
        continue;
      }
      const lead = await createEnquiry(sql, {
        name: row.name, phone, email, cityId: town.cityId, pincode: town.pincode, eventDate: readDate(row.date),
        source: defaults.source, needs: categoryIds.map((categoryId) => ({ categoryId })),
      });
      await sql`update mkt.leads set campaign = ${row.campaign?.slice(0, 120) ?? null}, external_id = ${row.externalId ?? null} where id = ${lead.id}`;
      if (email) {
        const [p] = await sql<{ id: string }[]>`select id from mkt.profiles where email = ${email} and role = 'bride'`;
        if (p) await sql`update mkt.leads set bride_profile_id = ${p.id} where id = ${lead.id}`;
      }
      res.added++;
    } catch (e) {
      res.skipped++;
      if (res.problems.length < 12) res.problems.push(`${label}: ${e instanceof DomainError ? e.message : 'could not be read'}`);
    }
  }
  await audit(sql, actor, 'lead.import', 'lead', null, { rows: rows.length, added: res.added, merged: res.merged, skipped: res.skipped, source: defaults.source });
  return res;
}

/** How each source is doing over the last 90 days. */
export async function sourceSummary(db: Db) {
  return db<{ source: string; campaign: string | null; leads: number; verified: number; unlocked: number; booked: number }[]>`
    select l.source, l.campaign, count(*)::int as leads,
      count(*) filter (where l.status = 'verified')::int as verified,
      count(*) filter (where exists (select 1 from mkt.lead_needs ln join mkt.unlocks u on u.lead_need_id = ln.id
        where ln.lead_id = l.id and not u.refunded))::int as unlocked,
      count(*) filter (where exists (select 1 from mkt.lead_needs ln where ln.lead_id = l.id and ln.status = 'closed_booked'))::int as booked
    from mkt.leads l where l.created_at > now() - interval '90 days'
    group by 1, 2 order by count(*) desc limit 40`;
}

// ---------------------------------------------------------------- Meta lead forms

type MetaField = { name: string; values: string[] };

/** Turns the answers on a Meta lead form into a row, using the same column names as the sheet. */
export function rowFromMetaFields(fields: MetaField[], meta: { id: string; campaign?: string | null }): IntakeRow {
  const find = (key: keyof IntakeRow) => fields.find((f) => COLUMNS[key].includes(norm(f.name)))?.values?.[0]?.trim() ?? '';
  return {
    name: find('name'), phone: find('phone'), email: find('email') || null, town: find('town') || null, date: find('date') || null,
    categories: find('categories') || null, campaign: meta.campaign ?? null, externalId: meta.id,
  };
}

export function metaLeadsConfigured() {
  return Boolean(process.env.META_LEADS_PAGE_TOKEN && process.env.META_LEADS_VERIFY_TOKEN && (process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET));
}

async function intakeDefaults(db: Db): Promise<IntakeDefaults | null> {
  const slug = process.env.META_LEADS_DEFAULT_TOWN || 'chandigarh';
  const [city] = await db<{ id: number }[]>`select id from mkt.cities where slug = ${slug} and active`;
  if (!city) return null;
  const slugs = (process.env.META_LEADS_DEFAULT_CATEGORIES || 'bridal-makeup').split(',').map((s) => s.trim()).filter(Boolean);
  const cats = await db<{ id: number }[]>`select id from mkt.categories where active and slug = any(${slugs})`;
  return { cityId: city.id, categoryIds: cats.map((c) => c.id), source: 'instagram' };
}

/** Meta tells us a lead id; we fetch the answers with the page token and add the lead. */
export async function handleMetaLeadWebhook(sql: Sql, body: { entry?: { changes?: { field?: string; value?: { leadgen_id?: string } }[] }[] }) {
  const ids = (body.entry ?? []).flatMap((e) => e.changes ?? []).filter((c) => c.field === 'leadgen').map((c) => c.value?.leadgen_id).filter((x): x is string => Boolean(x));
  const token = process.env.META_LEADS_PAGE_TOKEN;
  const defaults = await intakeDefaults(sql);
  if (!token || !defaults) return { added: 0 };
  const rows: IntakeRow[] = [];
  for (const id of ids.slice(0, 50)) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(id)}?fields=field_data,campaign_name,ad_name,form_id&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) continue;
    const j = (await r.json()) as { field_data?: MetaField[]; campaign_name?: string; ad_name?: string };
    rows.push(rowFromMetaFields(j.field_data ?? [], { id, campaign: j.campaign_name ?? j.ad_name ?? null }));
  }
  const res = await importLeads(sql, rows, defaults, null);
  if (res.added) await (await import('./alerts')).staffAlert(sql, 'lead', `${res.added} from an Instagram or Facebook ad`, '/ops/leads?source=instagram', `metaleads:${ids[0]}`);
  return { added: res.added };
}
