import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { SLOT_LABEL, calendarFreshDays, calendarMonth, calendarRange, freshness, shortDate, todayIst, type DayStatus } from '@/lib/availability';
import { spacesFor } from '@/lib/venueSpaces';
import { siteUrl } from '@/lib/seo';
import { calendarAddAction, calendarCapacityAction, calendarConfirmAction, calendarImportAction, calendarRemoveAction } from '@/lib/actions/calendar';
import { Badge, Card, Field, Notice, PageTitle, sp } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Calendar', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL: Record<DayStatus, string> = {
  free: 'bg-white',
  some: 'bg-[#fff6e0]',
  full: 'bg-[var(--color-pink-soft)]',
  closed: 'bg-[#ececec]',
};
const WORD: Record<DayStatus, string> = { free: '', some: 'Some', full: 'Booked', closed: 'Closed' };

const monthOf = (d: string) => d.slice(0, 7);
const shiftMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** The vendor's calendar: a month at a glance, one day in detail, and calendar connections. */
export default async function CalendarPage({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor('/vendor/calendar');
  const today = todayIst();
  const month = /^\d{4}-\d{2}$/.test(sp(q.m) ?? '') ? sp(q.m)! : monthOf(today);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp(q.d) ?? '') ? sp(q.d)! : null;
  const [grid, spaces, upcoming, freshDays] = await Promise.all([
    calendarMonth(sql, vendor.id, month),
    spacesFor(sql, vendor.id),
    calendarRange(sql, vendor.id, today, new Date(Date.parse(today) + 90 * 864e5).toISOString().slice(0, 10)),
    calendarFreshDays(sql),
  ]);
  const f = freshness(vendor.calendar_updated_at ?? null, freshDays);
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const selected = day ? grid.find((g) => g.day === day) ?? null : null;
  const self = `/vendor/calendar?m=${month}${day ? `&d=${day}` : ''}`;
  const monthName = new Date(`${month}-01T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const feed = `${siteUrl()}/api/calendar/${vendor.calendar_token}.ics`;
  return (
    <>
      <PageTitle title="Calendar" sub="Mark the days you are booked. Brides check your dates before they send a request, and leads show when a date clashes." />
      <Notice error={q.error} ok={q.ok} />
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {f.fresh ? (
            <>
              <Badge tone="ok">Up to date</Badge> Updated {f.ago}. Brides see your unmarked days as free.
            </>
          ) : (
            <>
              <Badge tone="warn">Not confirmed</Badge> {f.ago ? `Last updated ${f.ago}.` : 'Never updated.'} Until you confirm, brides see unmarked days as &ldquo;not marked&rdquo;.
            </>
          )}
        </p>
        <form action={calendarConfirmAction}>
          <input type="hidden" name="_back" value={self} />
          <button className="btn btn-sm">My calendar is up to date</button>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Link href={`/vendor/calendar?m=${shiftMonth(month, -1)}`} className="btn btn-ghost btn-sm" aria-label="Previous month">
              ‹
            </Link>
            <h2 className="font-semibold">{monthName}</h2>
            <Link href={`/vendor/calendar?m=${shiftMonth(month, 1)}`} className="btn btn-ghost btn-sm" aria-label="Next month">
              ›
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--color-muted)]" aria-hidden>
            {WEEK.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <ol className="mt-1 grid grid-cols-7 gap-1" aria-label={`Days in ${monthName}`}>
            {Array.from({ length: lead }, (_, i) => (
              <li key={`pad-${i}`} aria-hidden />
            ))}
            {grid.map((g) => {
              const past = g.day < today;
              const label = `${shortDate(g.day)}${WORD[g.status] ? `, ${WORD[g.status].toLowerCase()}` : ', free'}`;
              return (
                <li key={g.day}>
                  <Link
                    href={`/vendor/calendar?m=${month}&d=${g.day}`}
                    aria-label={label}
                    aria-current={g.day === day ? 'date' : undefined}
                    className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-sm ${CELL[g.status]} ${g.day === day ? 'border-[var(--color-pink)] ring-2 ring-[var(--color-pink)]' : 'border-[var(--color-line)]'} ${past ? 'border-transparent bg-transparent text-[var(--color-muted)]' : ''} ${g.day === today ? 'font-semibold' : ''}`}
                  >
                    {Number(g.day.slice(8))}
                    {WORD[g.status] ? <span className="hidden text-[10px] leading-none sm:block">{WORD[g.status]}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-[var(--color-line)] bg-[var(--color-pink-soft)]" /> Booked
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-[var(--color-line)] bg-[#fff6e0]" /> Some bookings, room left
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-[var(--color-line)] bg-[#ececec]" /> Closed
            </span>
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold">{day ? fmtLongDate(day).replace(/ \d{4}$/, '') : 'Mark dates'}</h2>
          {selected?.entries.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {selected.entries.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg bg-[var(--color-tint)] p-2">
                  <span>
                    <b>{e.status === 'closed' ? 'Closed' : 'Booked'}</b> · {SLOT_LABEL[e.slot]}
                    {e.space ? ` · ${e.space}` : ''}
                    {e.note ? <span className="block text-[var(--color-muted)]">{e.note}</span> : null}
                    {e.source === 'olready' ? <Badge tone="ok">OLReady booking</Badge> : e.source === 'import' ? <Badge>From your calendar</Badge> : e.source === 'ops' ? <Badge>Added by OLReady team</Badge> : null}
                  </span>
                  {e.source !== 'import' ? (
                    <form action={calendarRemoveAction}>
                      <input type="hidden" name="entry_id" value={e.id} />
                      <input type="hidden" name="_back" value={self} />
                      <button className="text-xs underline" aria-label={`Remove ${e.status} on ${shortDate(e.day)}`}>
                        Remove
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : day ? (
            <p className="hint mt-2">Nothing marked. {f.fresh ? 'Brides see this day as free.' : ''}</p>
          ) : (
            <p className="hint mt-2">Tap a day, or mark a range below.</p>
          )}
          {!day || day >= today ? (
            <form action={calendarAddAction} className="mt-4 space-y-3 border-t border-[var(--color-line)] pt-3">
              <input type="hidden" name="_back" value={self} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="From">
                  <input name="from" type="date" required min={today} defaultValue={day ?? ''} className="input" />
                </Field>
                <Field label="Until (optional)">
                  <input name="to" type="date" min={today} className="input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Mark as">
                  <select name="status" className="input" defaultValue="booked">
                    <option value="booked">Booked</option>
                    <option value="closed">Closed (not working)</option>
                  </select>
                </Field>
                <Field label="When">
                  <select name="slot" className="input" defaultValue="full">
                    <option value="full">Whole day</option>
                    <option value="day">Day only</option>
                    <option value="evening">Evening only</option>
                  </select>
                </Field>
              </div>
              {spaces.length ? (
                <Field label="Hall or lawn">
                  <select name="space_id" className="input" defaultValue="">
                    <option value="">The whole venue</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Note for you (private)">
                <input name="note" maxLength={120} className="input" placeholder="e.g. Sharma wedding, advance paid" />
              </Field>
              <button className="btn btn-pink btn-sm">Mark on calendar</button>
            </form>
          ) : null}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Coming up</h2>
          {upcoming.length ? (
            <ul className="mt-2 divide-y divide-[var(--color-line)] text-sm">
              {upcoming.slice(0, 30).map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-1.5">
                  <Link href={`/vendor/calendar?m=${monthOf(e.day)}&d=${e.day}`} className="font-medium">
                    {shortDate(e.day)}
                  </Link>
                  <span className="text-right text-[var(--color-muted)]">
                    {e.status === 'closed' ? 'Closed' : 'Booked'} · {SLOT_LABEL[e.slot]}
                    {e.space ? ` · ${e.space}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint mt-2">Nothing in the next 90 days.</p>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">How many bookings a day</h2>
          {spaces.length ? (
            <p className="hint mt-1">Each hall or lawn takes one booking a day, or one day and one evening booking. You have {spaces.length}.</p>
          ) : (
            <form action={calendarCapacityAction} className="mt-2 flex items-end gap-2">
              <input type="hidden" name="_back" value={self} />
              <Field label="Bookings you can take on one day" hint="For example 3 if your team can do three brides on the same day.">
                <input name="bookings_per_day" type="number" min={1} max={20} defaultValue={vendor.bookings_per_day ?? 1} className="input w-24" />
              </Field>
              <button className="btn btn-ghost btn-sm mb-5">Save</button>
            </form>
          )}
          <h2 className="mt-5 font-semibold">Connect your Google Calendar</h2>
          <p className="hint mt-1">
            In Google Calendar, open Settings, choose your calendar, and copy the &ldquo;Secret address in iCal format&rdquo;. We read it every day and mark those days booked. We never write to it.
          </p>
          <form action={calendarImportAction} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="_back" value={self} />
            <input name="import_url" type="url" defaultValue={vendor.calendar_import_url ?? ''} className="input grow" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" aria-label="Your calendar's iCal address" />
            <button className="btn btn-ghost btn-sm">{vendor.calendar_import_url ? 'Save' : 'Connect'}</button>
          </form>
          {vendor.calendar_import_url ? (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {vendor.calendar_import_error ? `Last try failed: ${vendor.calendar_import_error}` : vendor.calendar_imported_at ? `Last read ${new Date(vendor.calendar_imported_at).toLocaleString('en-IN')}` : 'Not read yet'}. Clear the box and save to disconnect.
            </p>
          ) : null}
          <h2 className="mt-5 font-semibold">See OLReady dates in your own calendar</h2>
          <p className="hint mt-1">Add this address in Google Calendar (Other calendars, From URL) or on your phone. Keep it private: anyone with it can see your booked dates.</p>
          <input readOnly value={feed} className="input mt-2 text-xs" aria-label="Your OLReady calendar feed" />
        </Card>
      </div>
    </>
  );
}
