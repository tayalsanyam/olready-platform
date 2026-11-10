import type { Db } from './db';
import { DomainError, audit, getSetting } from './db';
import { fmtDay } from './dates';

// Vendor date availability. A day is 'closed', 'full', 'some' (booked, room left) or 'free'.
// "Free" is only said to brides when the vendor has kept the calendar up to date recently.

export type DayStatus = 'closed' | 'full' | 'some' | 'free';
export type Slot = 'full' | 'day' | 'evening';
export type CalendarEntry = {
  id: string;
  day: string;
  slot: Slot;
  space_id: string | null;
  space: string | null;
  status: 'booked' | 'closed';
  note: string;
  source: 'vendor' | 'olready' | 'ops' | 'import';
  lead_need_id: string | null;
};

export const SLOT_LABEL: Record<Slot, string> = { full: 'Whole day', day: 'Day', evening: 'Evening' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today in India, YYYY-MM-DD. */
export const todayIst = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const shortDate = (d: string) => fmtDay(d);

function checkDay(d: string, label = 'date') {
  if (!DAY.test(d) || Number.isNaN(Date.parse(d))) throw new DomainError('bad_date', `Check the ${label}`);
  if (d < todayIst()) throw new DomainError('past', 'That date has passed');
  if (d > addDays(todayIst(), 3 * 366)) throw new DomainError('far', 'Dates can be up to three years ahead');
}

export async function calendarFreshDays(db: Db) {
  return getSetting<number>(db, 'calendar_fresh_days', 45);
}

/** Whether a vendor's "free" days can be trusted, and how long ago the calendar was updated. */
export function freshness(updatedAt: Date | string | null, freshDays: number) {
  if (!updatedAt) return { fresh: false, ago: null as string | null };
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 864e5);
  const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 31 ? `${days} days ago` : days < 60 ? 'a month ago' : `${Math.floor(days / 30)} months ago`;
  return { fresh: days <= freshDays, ago };
}

/** Status of several days for one vendor. */
export async function dayStatuses(db: Db, vendorId: string, days: string[]) {
  const ds = [...new Set(days.filter((d) => DAY.test(d)))];
  if (!ds.length) return new Map<string, DayStatus>();
  const rows = await db<{ day: string; status: DayStatus }[]>`
    select d::text as day, mkt.vendor_day(${vendorId}, d) as status from unnest(${ds}::date[]) as d`;
  return new Map(rows.map((r) => [r.day, r.status]));
}

export type DateCheck = { day: string; status: DayStatus | 'unknown'; text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' };

/**
 * What a bride is told about a vendor on her dates. A day with nothing marked is "free" only if the
 * calendar is fresh; otherwise it is unknown and the request will find out.
 */
export async function checkDates(db: Db, vendor: { id: string; calendar_updated_at: Date | string | null }, days: string[], labels: Record<string, string> = {}): Promise<DateCheck[]> {
  const [statuses, freshDays] = await Promise.all([dayStatuses(db, vendor.id, days), calendarFreshDays(db)]);
  const f = freshness(vendor.calendar_updated_at, freshDays);
  return [...statuses.entries()].map(([day, s]) => {
    const what = `${labels[day] ? `${labels[day]}, ` : ''}${shortDate(day)}`;
    if (s === 'closed' || s === 'full') return { day, status: s, text: `${what}: booked`, tone: 'bad' };
    if (!f.fresh) return { day, status: 'unknown', text: `${what}: not marked${f.ago ? ` (calendar updated ${f.ago})` : ''}. Your request will ask.`, tone: 'muted' };
    if (s === 'some') return { day, status: s, text: `${what}: some bookings, still taking more (updated ${f.ago})`, tone: 'warn' };
    return { day, status: s, text: `${what}: free as per their calendar (updated ${f.ago})`, tone: 'ok' };
  });
}

// ---------------------------------------------------------------- the vendor's calendar
export async function calendarRange(db: Db, vendorId: string, from: string, to: string) {
  return db<CalendarEntry[]>`
    select c.id, c.day::text as day, c.slot, c.space_id, s.name as space, c.status, c.note, c.source, c.lead_need_id
    from mkt.vendor_calendar c left join mkt.venue_spaces s on s.id = c.space_id
    where c.vendor_id = ${vendorId} and c.day between ${from}::date and ${to}::date order by c.day, c.created_at`;
}

/** A month grid: every day of the month with its status and entries. month = YYYY-MM. */
export async function calendarMonth(db: Db, vendorId: string, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new DomainError('bad_month', 'Check the month');
  const first = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [entries, statuses] = await Promise.all([
    calendarRange(db, vendorId, first, last),
    db<{ day: string; status: DayStatus }[]>`
      select d::date::text as day, mkt.vendor_day(${vendorId}, d::date) as status from generate_series(${first}::date, ${last}::date, interval '1 day') d`,
  ]);
  return statuses.map((s) => ({ day: s.day, status: s.status, entries: entries.filter((e) => e.day === s.day) }));
}

async function touch(db: Db, vendorId: string) {
  await db`update mkt.vendors set calendar_updated_at = now() where id = ${vendorId}`;
}

export type EntryInput = { from: string; to?: string | null; slot: string; status: string; spaceId?: string | null; note?: string };

/** Marks one day or a range (up to 62 days) booked or closed. Returns the number of days marked. */
export async function addCalendarEntries(db: Db, vendorId: string, input: EntryInput, actor: string, source: 'vendor' | 'ops' = 'vendor') {
  checkDay(input.from, 'start date');
  const to = input.to || input.from;
  checkDay(to, 'end date');
  if (to < input.from) throw new DomainError('order', 'The end date is before the start date');
  const span = Math.round((Date.parse(to) - Date.parse(input.from)) / 864e5) + 1;
  if (span > 62) throw new DomainError('long', 'Mark up to 62 days at a time');
  if (!['full', 'day', 'evening'].includes(input.slot)) throw new DomainError('slot', 'Pick whole day, day or evening');
  if (!['booked', 'closed'].includes(input.status)) throw new DomainError('status', 'Pick booked or closed');
  let spaceId = input.spaceId || null;
  if (spaceId) {
    const [s] = await db`select 1 from mkt.venue_spaces where id = ${spaceId} and vendor_id = ${vendorId}`;
    if (!s) spaceId = null;
  }
  const note = (input.note ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const days = Array.from({ length: span }, (_, i) => addDays(input.from, i));
  await db`
    insert into mkt.vendor_calendar (vendor_id, day, slot, space_id, status, note, source, created_by)
    select ${vendorId}, d::date, ${input.slot}, ${spaceId}, ${input.status}, ${note}, ${source}, ${actor} from unnest(${days}::date[]) d`;
  await touch(db, vendorId);
  await audit(db, actor, 'calendar.add', 'vendor', vendorId, { from: input.from, to, status: input.status, source });
  return days.length;
}

export async function removeCalendarEntry(db: Db, vendorId: string, entryId: string, actor: string) {
  const [gone] = await db<{ day: string; source: string }[]>`delete from mkt.vendor_calendar where id = ${entryId} and vendor_id = ${vendorId} returning day::text, source`;
  if (!gone) throw new DomainError('not_found', 'That date is not on your calendar');
  await touch(db, vendorId);
  await audit(db, actor, 'calendar.remove', 'vendor', vendorId, gone);
}

/** "My calendar is up to date": brides may now be told a vendor is free on unmarked days. */
export async function confirmCalendar(db: Db, vendorId: string, actor: string) {
  await touch(db, vendorId);
  await audit(db, actor, 'calendar.confirm', 'vendor', vendorId);
}

export async function setBookingsPerDay(db: Db, vendorId: string, n: number, actor: string) {
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new DomainError('capacity', 'Bookings a day must be between 1 and 20');
  await db`update mkt.vendors set bookings_per_day = ${n} where id = ${vendorId}`;
  await touch(db, vendorId);
  await audit(db, actor, 'calendar.capacity', 'vendor', vendorId, { n });
}

/**
 * A booking made through OLReady fills the vendor's calendar for the functions it covers (or the
 * request's date). Runs inside the booking transaction; repeats are ignored.
 */
export async function blockForBooking(db: Db, needId: string, vendorId: string, actor: string | null) {
  const rows = await db<{ day: string; name: string }[]>`
    select e.event_date::text as day, e.name from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id
    where ne.need_id = ${needId} and e.event_date is not null
    union
    select l.event_date::text, 'Wedding' from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id
    where ln.id = ${needId} and l.event_date is not null
      and not exists (select 1 from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id where ne.need_id = ${needId} and e.event_date is not null)`;
  const today = todayIst();
  let n = 0;
  for (const r of rows) {
    if (r.day < today) continue;
    const added = await db`
      insert into mkt.vendor_calendar (vendor_id, day, slot, status, note, source, lead_need_id, created_by)
      values (${vendorId}, ${r.day}::date, 'full', 'booked', ${`OLReady booking: ${r.name}`.slice(0, 120)}, 'olready', ${needId}, ${actor})
      on conflict do nothing returning id`;
    n += added.length;
  }
  return n;
}

/** For a vendor's lead cards: the functions' dates they have already marked booked or closed. */
export async function clashesForNeeds(db: Db, vendorId: string, needIds: string[]) {
  if (!needIds.length) return new Map<string, string[]>();
  const rows = await db<{ need_id: string; day: string; name: string }[]>`
    select ne.need_id, e.event_date::text as day, e.name
    from mkt.need_events ne join mkt.lead_events e on e.id = ne.event_id
    where ne.need_id = any(${needIds}::uuid[]) and e.event_date is not null and mkt.vendor_busy(${vendorId}, e.event_date)
    order by e.event_date`;
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.need_id, [...(m.get(r.need_id) ?? []), `${r.name}, ${shortDate(r.day)}`]);
  return m;
}

// ---------------------------------------------------------------- iCal feed and import
const icsEscape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const icsDate = (d: string) => d.replace(/-/g, '');

/** The vendor's calendar as an iCal feed, for Google Calendar, Apple Calendar or Outlook. */
export function buildIcs(business: string, entries: CalendarEntry[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OLReady//Vendor calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(`${business} on OLReady`)}`];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  for (const e of entries) {
    const what = e.status === 'closed' ? 'Closed' : 'Booked';
    const extra = [e.slot !== 'full' ? SLOT_LABEL[e.slot] : null, e.space].filter(Boolean).join(', ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@olready.in`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.day)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(e.day, 1))}`,
      `SUMMARY:${icsEscape(`${what}${extra ? ` (${extra})` : ''}${e.note ? `: ${e.note}` : ''}`)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export type IcsEvent = { uid: string; days: string[]; summary: string };

/** All-day and timed events from an iCal file, as India dates. Recurring rules are not expanded. */
export function parseIcs(text: string, opts: { from?: string; to?: string } = {}): IcsEvent[] {
  const from = opts.from ?? todayIst();
  const to = opts.to ?? addDays(from, 548);
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: Record<string, string> | null = null;
  const toIst = (prop: string, value: string) => {
    if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    // UTC times move to India time; local or TZID times are taken as written.
    if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) + 5.5 * 3600e3).toISOString().slice(0, 10);
    void prop;
    return `${y}-${mo}-${d}`;
  };
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      const start = cur.DTSTART ? toIst('DTSTART', cur.DTSTART) : null;
      if (start && cur.STATUS !== 'CANCELLED' && cur.TRANSP !== 'TRANSPARENT') {
        const allDay = /^\d{8}$/.test(cur.DTSTART);
        let end = cur.DTEND ? toIst('DTEND', cur.DTEND) : null;
        // All-day DTEND is the day after; a timed event ends on its own end date.
        if (end && allDay) end = addDays(end, -1);
        if (!end || end < start) end = start;
        const days: string[] = [];
        for (let d = start; d <= end && days.length < 62; d = addDays(d, 1)) if (d >= from && d <= to) days.push(d);
        if (days.length) out.push({ uid: (cur.UID || `${start}-${cur.SUMMARY ?? ''}`).slice(0, 200), days, summary: (cur.SUMMARY ?? '').slice(0, 100) });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i > 0) {
        const key = line.slice(0, i).split(';')[0].toUpperCase();
        const val = line.slice(i + 1).trim();
        if (['DTSTART', 'DTEND', 'UID', 'SUMMARY', 'STATUS', 'TRANSP'].includes(key)) cur[key] = val.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ');
      }
    }
  }
  return out;
}

export async function setImportUrl(db: Db, vendorId: string, url: string | null, actor: string) {
  const u = url?.trim() || null;
  if (u && !/^https:\/\/\S+\.ics(\?\S*)?$|^https:\/\/calendar\.google\.com\/calendar\/ical\/\S+$/i.test(u)) {
    throw new DomainError('bad_url', 'Paste the secret iCal address of your calendar (it starts with https:// and usually ends in .ics)');
  }
  await db`update mkt.vendors set calendar_import_url = ${u}, calendar_import_error = null where id = ${vendorId}`;
  if (!u) await db`delete from mkt.vendor_calendar where vendor_id = ${vendorId} and source = 'import'`;
  await audit(db, actor, u ? 'calendar.import_on' : 'calendar.import_off', 'vendor', vendorId);
}

/** Replaces a vendor's imported days with what their calendar says now. */
export async function importCalendar(db: Db, vendorId: string, fetcher: (url: string) => Promise<string> = fetchIcs) {
  const [v] = await db<{ url: string | null }[]>`select calendar_import_url as url from mkt.vendors where id = ${vendorId}`;
  if (!v?.url) return 0;
  try {
    const events = parseIcs(await fetcher(v.url));
    await db.begin(async (tx) => {
      await tx`delete from mkt.vendor_calendar where vendor_id = ${vendorId} and source = 'import'`;
      for (const e of events.slice(0, 1000)) {
        for (const d of e.days) {
          await tx`
            insert into mkt.vendor_calendar (vendor_id, day, slot, status, note, source, import_uid)
            values (${vendorId}, ${d}::date, 'full', 'booked', ${e.summary ? `From your calendar: ${e.summary}`.slice(0, 120) : 'From your calendar'}, 'import', ${e.uid})
            on conflict do nothing`;
        }
      }
    });
    await db`update mkt.vendors set calendar_imported_at = now(), calendar_import_error = null, calendar_updated_at = now() where id = ${vendorId}`;
    return events.length;
  } catch (e) {
    await db`update mkt.vendors set calendar_imported_at = now(), calendar_import_error = ${String((e as Error).message).slice(0, 200)} where id = ${vendorId}`;
    return -1;
  }
}

async function fetchIcs(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'text/calendar' }, redirect: 'follow' });
    if (!r.ok) throw new Error(`Your calendar address answered ${r.status}`);
    const text = await r.text();
    if (text.length > 3_000_000) throw new Error('That calendar is too large to read');
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That address is not an iCal calendar');
    return text;
  } finally {
    clearTimeout(t);
  }
}

/** Daily job: refresh imported calendars, and remind vendors whose calendars have gone stale. */
export async function calendarDaily(db: Db, remind: (vendorId: string) => Promise<void>) {
  const due = await db<{ id: string }[]>`
    select id from mkt.vendors where status = 'live' and calendar_import_url is not null
      and (calendar_imported_at is null or calendar_imported_at < now() - interval '20 hours') limit 500`;
  for (const v of due) await importCalendar(db, v.id);
  const days = await getSetting<number>(db, 'calendar_reminder_days', 30);
  const stale = await db<{ id: string }[]>`
    select id from mkt.vendors where status = 'live' and calendar_import_url is null
      and (calendar_updated_at is null or calendar_updated_at < now() - make_interval(days => ${days}))
      and (calendar_reminded_at is null or calendar_reminded_at < now() - make_interval(days => ${days})) limit 500`;
  for (const v of stale) {
    await remind(v.id);
    await db`update mkt.vendors set calendar_reminded_at = now() where id = ${v.id}`;
  }
  return { imported: due.length, reminded: stale.length };
}
