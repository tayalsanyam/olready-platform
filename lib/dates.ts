// How dates and times are shown everywhere: in India time, in words ("14 Feb 2027"), never raw ISO.

const TZ = 'Asia/Kolkata';
type D = Date | string | null | undefined;

/** A plain date ("2027-02-14") is a calendar day, not an instant: keep it on that day. */
const toDate = (d: Exclude<D, null | undefined>) => (d instanceof Date ? d : /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00+05:30`) : new Date(d));

/** "14 Feb 2027" */
export function fmtDate(d: D, empty = '') {
  if (!d) return empty;
  const x = toDate(d);
  return Number.isNaN(x.getTime()) ? empty : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}

/** "14 Feb" (same year implied) */
export function fmtDay(d: D, empty = '') {
  if (!d) return empty;
  const x = toDate(d);
  return Number.isNaN(x.getTime()) ? empty : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ });
}

/** "Sunday, 14 February 2027" */
export function fmtLongDate(d: D, empty = '') {
  if (!d) return empty;
  const x = toDate(d);
  return Number.isNaN(x.getTime()) ? empty : x.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
}

/** "10 Nov 2026, 12:01 pm" in India time */
export function fmtDateTime(d: D, empty = '') {
  if (!d) return empty;
  const x = toDate(d);
  return Number.isNaN(x.getTime()) ? empty : x.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
}

/** "12:01 pm" in India time */
export function fmtTime(d: D, empty = '') {
  if (!d) return empty;
  const x = toDate(d);
  return Number.isNaN(x.getTime()) ? empty : x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
}

/** "1 view", "3 views" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
