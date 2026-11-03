import type { Db } from './db';
import { DomainError, audit } from './db';

// A wedding is several big days. Functions live on the request (lead_events), each vendor
// category says which functions it is for (need_events), and quotes can price each function.

export const FUNCTION_PRESETS = ['Roka', 'Sagan', 'Engagement', 'Mehendi', 'Haldi', 'Jaggo', 'Sangeet', 'Cocktail', 'Wedding', 'Anand Karaj', 'Reception'];
export const MAX_FUNCTIONS = 8;

export type FunctionInput = { name: string; date: string | null; guests: number | null };
export type LeadFunction = { id: string; name: string; event_date: string | null; guests: number | null };

const MAIN = /wedding|anand karaj|pheras|nikah|shaadi|vivah/i;

/** Reads fn_name_N / fn_date_N / fn_guests_N rows and fn_for_<categoryId> picks from a form. */
export function functionsFromForm(fd: FormData) {
  const fns: FunctionInput[] = [];
  const index: number[] = []; // form row -> position in fns
  for (let i = 0; i < MAX_FUNCTIONS; i++) {
    const name = String(fd.get(`fn_name_${i}`) ?? '').trim().slice(0, 40);
    const date = String(fd.get(`fn_date_${i}`) ?? '').trim();
    const guests = Number(String(fd.get(`fn_guests_${i}`) ?? '').replace(/[^\d]/g, ''));
    if (!name) continue;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DomainError('bad_date', `Check the date for ${name}`);
    index[i] = fns.length;
    fns.push({ name, date: date || null, guests: guests > 0 ? Math.min(guests, 20000) : null });
  }
  const forCategory = (categoryId: number) => {
    const picked = fd.getAll(`fn_for_${categoryId}`).map(Number).filter((n) => Number.isInteger(n) && index[n] != null).map((n) => index[n]);
    // Nothing ticked means every function, which is what most people mean.
    return picked.length ? [...new Set(picked)] : fns.map((_, i) => i);
  };
  return { fns, forCategory };
}

/** The lead's headline date and guests: the main ceremony if named, else the earliest function. */
export function headline(fns: FunctionInput[]) {
  const dated = fns.filter((f) => f.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const main = fns.find((f) => MAIN.test(f.name) && f.date) ?? dated[0];
  const guests = Math.max(0, ...fns.map((f) => f.guests ?? 0));
  return { date: main?.date ?? null, guests: guests || null };
}

export async function saveLeadFunctions(db: Db, leadId: string, fns: FunctionInput[], needFunctions: { needId: string; idx: number[] }[]) {
  const ids: string[] = [];
  for (const [i, f] of fns.entries()) {
    const [e] = await db<{ id: string }[]>`
      insert into mkt.lead_events (lead_id, name, event_date, guests, sort) values (${leadId}, ${f.name}, ${f.date}, ${f.guests}, ${i}) returning id`;
    ids.push(e.id);
  }
  for (const n of needFunctions) for (const i of n.idx) if (ids[i]) await db`insert into mkt.need_events (need_id, event_id) values (${n.needId}, ${ids[i]}) on conflict do nothing`;
}

export async function leadFunctions(db: Db, leadId: string) {
  return db<(LeadFunction & { need_ids: string[] })[]>`
    select e.id, e.name, to_char(e.event_date, 'YYYY-MM-DD') as event_date, e.guests,
      coalesce(array(select ne.need_id::text from mkt.need_events ne where ne.event_id = e.id), '{}') as need_ids
    from mkt.lead_events e where e.lead_id = ${leadId} order by e.event_date nulls last, e.sort`;
}

export async function needFunctions(db: Db, needIds: string[]) {
  if (!needIds.length) return new Map<string, LeadFunction[]>();
  const rows = await db<(LeadFunction & { need_id: string })[]>`
    select ne.need_id, e.id, e.name, to_char(e.event_date, 'YYYY-MM-DD') as event_date, e.guests
    from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id
    where ne.need_id = any(${needIds}::uuid[]) order by e.event_date nulls last, e.sort`;
  const m = new Map<string, LeadFunction[]>();
  for (const r of rows) m.set(r.need_id, [...(m.get(r.need_id) ?? []), { id: r.id, name: r.name, event_date: r.event_date, guests: r.guests }]);
  return m;
}

const short = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'date not fixed');
/** "Mehendi, 12 Feb, 150 guests" */
export const describeFunction = (f: LeadFunction | FunctionInput) => {
  const date = 'event_date' in f ? f.event_date : f.date;
  return [f.name, short(date), f.guests ? `${f.guests} guests` : null].filter(Boolean).join(', ');
};

/** Ops on the verification call: add a function, or correct one, and say which categories need it. */
export async function opsSaveFunction(db: Db, leadId: string, input: { id?: string | null; name: string; date: string | null; guests: number | null; needIds: string[] }, actor: string) {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new DomainError('name', 'Name the function');
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DomainError('date', 'Check the date');
  const [lead] = await db<{ id: string }[]>`select id from mkt.leads where id = ${leadId}`;
  if (!lead) throw new DomainError('not_found', 'Request not found');
  let id = input.id ?? null;
  if (id) {
    await db`update mkt.lead_events set name = ${name}, event_date = ${input.date}, guests = ${input.guests} where id = ${id} and lead_id = ${leadId}`;
    await db`delete from mkt.need_events where event_id = ${id}`;
  } else {
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.lead_events where lead_id = ${leadId}`;
    if (n >= MAX_FUNCTIONS) throw new DomainError('too_many', `Up to ${MAX_FUNCTIONS} functions per request`);
    const [e] = await db<{ id: string }[]>`insert into mkt.lead_events (lead_id, name, event_date, guests, sort) values (${leadId}, ${name}, ${input.date}, ${input.guests}, ${n}) returning id`;
    id = e.id;
  }
  for (const nid of input.needIds) {
    await db`insert into mkt.need_events (need_id, event_id) select ${nid}, ${id} where exists (select 1 from mkt.lead_needs where id = ${nid} and lead_id = ${leadId}) on conflict do nothing`;
  }
  await syncHeadline(db, leadId);
  await audit(db, actor, input.id ? 'lead.function_update' : 'lead.function_add', 'lead', leadId, { name });
}

export async function opsRemoveFunction(db: Db, leadId: string, eventId: string, actor: string) {
  await db`delete from mkt.lead_events where id = ${eventId} and lead_id = ${leadId}`;
  await syncHeadline(db, leadId);
  await audit(db, actor, 'lead.function_remove', 'lead', leadId);
}

/** Keeps the lead's headline date and guest count in step with its functions. */
async function syncHeadline(db: Db, leadId: string) {
  const fns = await leadFunctions(db, leadId);
  const h = headline(fns.map((f) => ({ name: f.name, date: f.event_date, guests: f.guests })));
  if (fns.length) await db`update mkt.leads set event_date = coalesce(${h.date}::date, event_date), guest_count = coalesce(${h.guests}::int, guest_count) where id = ${leadId}`;
}

/** The functions a bride already planned in her wedding, to fill the request form. */
export async function weddingFunctions(db: Db, weddingId: string | null) {
  if (!weddingId) return [] as FunctionInput[];
  const rows = await db<{ name: string; d: string | null }[]>`
    select name, to_char((starts_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d from mkt.wedding_events where wedding_id = ${weddingId} order by sort, starts_at`;
  return rows.slice(0, MAX_FUNCTIONS).map((r) => ({ name: r.name, date: r.d, guests: null }));
}

/**
 * Merges a request's functions into the wedding plan: a planned function with the same name and
 * no date takes the request's date; a function the plan does not have is added. Dated plans and
 * guests' RSVPs are never overwritten.
 */
export async function seedWeddingFunctions(db: Db, weddingId: string, fns: FunctionInput[]) {
  const planned = await db<{ id: string; name: string; dated: boolean; sort: number }[]>`
    select id, name, starts_at is not null as dated, sort from mkt.wedding_events where wedding_id = ${weddingId}`;
  let sort = Math.max(0, ...planned.map((p) => p.sort)) + 1;
  for (const f of fns) {
    const same = planned.find((p) => p.name.trim().toLowerCase() === f.name.trim().toLowerCase());
    const at = f.date ? `${f.date} 18:00:00+05:30` : null;
    if (same) {
      if (!same.dated && at) await db`update mkt.wedding_events set starts_at = ${at}::timestamptz where id = ${same.id}`;
    } else {
      await db`insert into mkt.wedding_events (wedding_id, name, starts_at, sort) values (${weddingId}, ${f.name}, ${at}::timestamptz, ${sort++})`;
    }
  }
}
