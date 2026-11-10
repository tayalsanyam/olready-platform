import type { Db } from './db';
import { DomainError, audit } from './db';
import { fmtDay } from './dates';

// A wedding is several big days. Functions live on the request (lead_events), each vendor
// category says which functions it is for (need_events), and quotes can price each function.

export const FUNCTION_PRESETS = ['Roka', 'Sagan', 'Engagement', 'Mehendi', 'Haldi', 'Jaggo', 'Sangeet', 'Cocktail', 'Wedding', 'Anand Karaj', 'Reception'];
export const MAX_FUNCTIONS = 8;

export type TimeOfDay = 'morning' | 'day' | 'evening';
export const TIMES: Record<TimeOfDay, string> = { morning: 'Morning', day: 'Daytime', evening: 'Evening' };
export type FunctionInput = { name: string; date: string | null; guests: number | null; place?: string | null; cityId?: number | null; time?: TimeOfDay | null };
/** city is set only when the function is in a different town from the request. */
export type LeadFunction = { id: string; name: string; event_date: string | null; guests: number | null; place: string | null; city_id?: number | null; city?: string | null; time_of_day?: TimeOfDay | null };

const MAIN = /wedding|anand karaj|pheras|nikah|shaadi|vivah/i;

/** Reads fn_name_N / fn_date_N / fn_guests_N rows and fn_for_<categoryId> picks from a form. */
export function functionsFromForm(fd: FormData) {
  const fns: FunctionInput[] = [];
  const index: number[] = []; // form row -> position in fns
  for (let i = 0; i < MAX_FUNCTIONS; i++) {
    const name = String(fd.get(`fn_name_${i}`) ?? '').trim().slice(0, 40);
    const date = String(fd.get(`fn_date_${i}`) ?? '').trim();
    const guests = Number(String(fd.get(`fn_guests_${i}`) ?? '').replace(/[^\d]/g, ''));
    const place = String(fd.get(`fn_place_${i}`) ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || null;
    if (!name) continue;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DomainError('bad_date', `Check the date for ${name}`);
    index[i] = fns.length;
    fns.push({ name, date: date || null, guests: guests > 0 ? Math.min(guests, 20000) : null, place });
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
      insert into mkt.lead_events (lead_id, name, event_date, guests, place, city_id, time_of_day, sort) values (${leadId}, ${f.name}, ${f.date}, ${f.guests}, ${f.place ?? null}, ${f.cityId ?? null}, ${f.time ?? null}, ${i}) returning id`;
    ids.push(e.id);
  }
  for (const n of needFunctions) for (const i of n.idx) if (ids[i]) await db`insert into mkt.need_events (need_id, event_id) values (${n.needId}, ${ids[i]}) on conflict do nothing`;
}

export async function leadFunctions(db: Db, leadId: string) {
  return db<(LeadFunction & { need_ids: string[]; town_id: number; town: string; town_state: string })[]>`
    select e.id, e.name, to_char(e.event_date, 'YYYY-MM-DD') as event_date, e.guests, e.place, e.city_id, e.time_of_day,
      case when e.city_id is not null and e.city_id <> l.city_id then ci.name end as city,
      ci.id as town_id, ci.name as town, ci.state as town_state,
      coalesce(array(select ne.need_id::text from mkt.need_events ne where ne.event_id = e.id), '{}') as need_ids
    from mkt.lead_events e join mkt.leads l on l.id = e.lead_id join mkt.cities ci on ci.id = coalesce(e.city_id, l.city_id)
    where e.lead_id = ${leadId} order by e.event_date nulls last, e.sort`;
}

export async function needFunctions(db: Db, needIds: string[]) {
  if (!needIds.length) return new Map<string, LeadFunction[]>();
  const rows = await db<(LeadFunction & { need_id: string })[]>`
    select ne.need_id, e.id, e.name, to_char(e.event_date, 'YYYY-MM-DD') as event_date, e.guests, e.place, e.time_of_day,
      (select ci.name from mkt.cities ci join mkt.leads l on l.id = e.lead_id where ci.id = e.city_id and e.city_id <> l.city_id) as city
    from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id
    where ne.need_id = any(${needIds}::uuid[]) order by e.event_date nulls last, e.sort`;
  const m = new Map<string, LeadFunction[]>();
  for (const r of rows) m.set(r.need_id, [...(m.get(r.need_id) ?? []), { id: r.id, name: r.name, event_date: r.event_date, guests: r.guests, place: r.place, city: r.city, time_of_day: r.time_of_day }]);
  return m;
}

const short = (d: string | null) => fmtDay(d, 'date not fixed');
/** "Mehendi, 12 Feb evening, 150 guests, at home in Sector 35, in Jaipur" */
export const describeFunction = (f: LeadFunction | FunctionInput) => {
  const date = 'event_date' in f ? f.event_date : f.date;
  const time = 'event_date' in f ? f.time_of_day : f.time;
  const city = 'event_date' in f ? f.city : null;
  return [f.name, `${short(date)}${time ? ` ${TIMES[time].toLowerCase()}` : ''}`, f.guests ? `${f.guests} guests` : null, f.place ? `at ${f.place}` : null, city ? `in ${city}` : null].filter(Boolean).join(', ');
};

/** Ops on the verification call: add a function, or correct one, and say which categories need it. */
export async function opsSaveFunction(db: Db, leadId: string, input: { id?: string | null; name: string; date: string | null; guests: number | null; place?: string | null; cityId?: number | null; time?: string | null; needIds: string[] }, actor: string) {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new DomainError('name', 'Name the function');
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DomainError('date', 'Check the date');
  const [lead] = await db<{ id: string; city_id: number }[]>`select id, city_id from mkt.leads where id = ${leadId}`;
  if (!lead) throw new DomainError('not_found', 'Request not found');
  const time = input.time && input.time in TIMES ? input.time : null;
  // A function in the request's own town stores no town, so it follows the request if that is corrected.
  let cityId: number | null = input.cityId && input.cityId !== lead.city_id ? input.cityId : null;
  if (cityId) {
    const [c] = await db`select 1 from mkt.cities where id = ${cityId} and active`;
    if (!c) cityId = null;
  }
  let id = input.id ?? null;
  if (id) {
    await db`update mkt.lead_events set name = ${name}, event_date = ${input.date}, guests = ${input.guests}, place = ${input.place?.trim().slice(0, 80) || null}, city_id = ${cityId}, time_of_day = ${time} where id = ${id} and lead_id = ${leadId}`;
    await db`delete from mkt.need_events where event_id = ${id}`;
  } else {
    let [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from mkt.lead_events where lead_id = ${leadId}`;
    if (!n && !MAIN.test(name)) {
      // An older request with only a headline date: keep that day as the Wedding before adding to it.
      const [w] = await db<{ id: string }[]>`
        insert into mkt.lead_events (lead_id, name, event_date, guests, sort)
        select id, 'Wedding', event_date, guest_count, 0 from mkt.leads where id = ${leadId} and event_date is not null returning id`;
      if (w) {
        await db`insert into mkt.need_events (need_id, event_id) select id, ${w.id} from mkt.lead_needs where lead_id = ${leadId} and status <> 'removed'`;
        n = 1;
      }
    }
    if (n >= MAX_FUNCTIONS) throw new DomainError('too_many', `Up to ${MAX_FUNCTIONS} functions per request`);
    const [e] = await db<{ id: string }[]>`insert into mkt.lead_events (lead_id, name, event_date, guests, place, city_id, time_of_day, sort) values (${leadId}, ${name}, ${input.date}, ${input.guests}, ${input.place?.trim().slice(0, 80) || null}, ${cityId}, ${time}, ${n}) returning id`;
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
  const rows = await db<{ name: string; d: string | null; venue: string }[]>`
    select name, to_char((starts_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d, venue from mkt.wedding_events where wedding_id = ${weddingId} order by sort, starts_at`;
  return rows.slice(0, MAX_FUNCTIONS).map((r) => ({ name: r.name, date: r.d, guests: null, place: r.venue || null }));
}

/**
 * Merges a request's functions into the wedding plan: a planned function with the same name and
 * no date takes the request's date; a function the plan does not have is added. Dated plans and
 * guests' RSVPs are never overwritten.
 */
export async function seedWeddingFunctions(db: Db, weddingId: string, fns: FunctionInput[]) {
  const planned = await db<{ id: string; name: string; dated: boolean; sort: number; venue: string }[]>`
    select id, name, starts_at is not null as dated, sort, venue from mkt.wedding_events where wedding_id = ${weddingId}`;
  let sort = Math.max(0, ...planned.map((p) => p.sort)) + 1;
  for (const f of fns) {
    const same = planned.find((p) => p.name.trim().toLowerCase() === f.name.trim().toLowerCase());
    const at = f.date ? `${f.date} 18:00:00+05:30` : null;
    if (same) {
      if (!same.dated && at) await db`update mkt.wedding_events set starts_at = ${at}::timestamptz where id = ${same.id}`;
      if (!same.venue && f.place) await db`update mkt.wedding_events set venue = ${f.place} where id = ${same.id}`;
    } else {
      await db`insert into mkt.wedding_events (wedding_id, name, starts_at, venue, sort) values (${weddingId}, ${f.name}, ${at}::timestamptz, ${f.place ?? ''}, ${sort++})`;
    }
  }
}
