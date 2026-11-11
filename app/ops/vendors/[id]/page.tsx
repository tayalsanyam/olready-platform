import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { citiesByIds, displayValue, fieldsFor, formatInr } from '@/lib/catalog';
import { TownChips } from '@/components/PlacePicker';
import { calendarFreshDays, calendarRange, freshness, shortDate, todayIst } from '@/lib/availability';
import { opsCalendarAddAction } from '@/lib/actions/calendar';
import { balances } from '@/lib/leads';
import { vendorStats } from '@/lib/vendorStats';
import type { Vendor } from '@/lib/vendors';
import { opsAdjustCredits, opsInviteClaim, opsVendorStatus } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle, Stat } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate } from '@/lib/dates';

export const metadata = { title: 'Vendor' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function OpsVendor({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  const me = await requireRole(['ops', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [v] = await sql<(Vendor & { category: string; city: string; state_name: string; area: string | null; owner_email: string | null })[]>`
    select v.*, c.name as category, ci.name as city, ci.state as state_name, lo.name as area, p.email as owner_email
    from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
    left join mkt.localities lo on lo.id = v.locality_id
    left join mkt.profiles p on p.id = v.owner_profile_id where v.id = ${id}`;
  if (!v) notFound();
  const [fields, cities, bal, stats, ledger] = await Promise.all([
    fieldsFor(sql, v.category_id),
    citiesByIds(sql, v.service_city_ids),
    balances(sql, v.id),
    vendorStats(sql, v.id),
    sql<{ id: number; credit_kind: string; delta: number; reason: string; note: string; created_at: Date }[]>`
      select id, credit_kind, delta, reason, note, created_at from mkt.credit_ledger where vendor_id = ${id} order by id desc limit 25`,
  ]);
  const [upcoming, freshDays] = await Promise.all([
    calendarRange(sql, v.id, todayIst(), new Date(Date.parse(todayIst()) + 90 * 864e5).toISOString().slice(0, 10)),
    calendarFreshDays(sql),
  ]);
  const fresh = freshness(v.calendar_updated_at ?? null, freshDays);
  return (
    <>
      <PageTitle
        title={v.business_name}
        sub={`${v.category} · ${[v.address_line, v.area, v.city, v.state_name, v.pincode].filter(Boolean).join(', ')} · owner ${v.owner_email ?? 'none yet'}`}
        action={
          <Link href={`/v/${v.slug}`} className="btn btn-ghost btn-sm">
            View profile
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Credits" value={(bal.planUsable ? bal.plan : 0) + bal.topup} hint={`${bal.plan} plan · ${bal.topup} top-up`} />
        <Stat label="Unlocks" value={stats.unlocks} />
        <Stat label="Bookings" value={stats.bookings} />
        <Stat label="Cost per booking" value={stats.costPerBooking != null ? formatInr(stats.costPerBooking) : '–'} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Status</h2>
          <form action={opsVendorStatus} className="mt-3 space-y-3">
            <input type="hidden" name="vendor_id" value={v.id} />
            <select name="status" defaultValue={v.status} className="input" aria-label="Status">
              {['draft', 'pending_review', 'live', 'suspended', 'closed'].map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="verified" defaultChecked={Boolean(v.verified_at)} /> Verified (details and work checked)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="assured" defaultChecked={v.assured} /> Assured (on a plan)
              </label>
            </div>
            <fieldset>
              <legend className="label">Towns served (who sees them in leads and listings)</legend>
              <input type="hidden" name="service_city_id" value={v.city_id} />
              <TownChips base={{ id: v.city_id, name: v.city, state: '' }} towns={cities.map((c) => ({ id: c.id, name: c.name, state: c.state }))} />
            </fieldset>
            <button className="btn btn-sm">Save</button>
          </form>
          {v.claim_status !== 'claimed' ? (
            <form action={opsInviteClaim} className="mt-5 space-y-2 border-t border-[var(--color-line)] pt-4">
              <p className="text-sm">
                <Badge>{v.claim_status}</Badge> This profile goes live only after the owner claims it.
              </p>
              <input type="hidden" name="vendor_id" value={v.id} />
              <div className="flex gap-2">
                <input name="email" required className="input" placeholder="Owner email" defaultValue={v.email ?? ''} />
                <button className="btn btn-sm">Send claim invite</button>
              </div>
            </form>
          ) : null}
        </Card>
        <Card>
          <h2 className="font-semibold">Details</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-[var(--color-muted)]">Phone</dt>
            <dd>{v.phone ?? '–'}</dd>
            <dt className="text-[var(--color-muted)]">Email</dt>
            <dd>{v.email ?? '–'}</dd>
            <dt className="text-[var(--color-muted)]">Instagram</dt>
            <dd>{v.instagram ?? '–'}</dd>
            <dt className="text-[var(--color-muted)]">Starting price</dt>
            <dd>{v.starting_price_inr != null ? formatInr(v.starting_price_inr) : '–'}</dd>
            {fields.map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-[var(--color-muted)]">{f.label}</dt>
                <dd>{displayValue(f, v.attributes[f.key]) ?? '–'}</dd>
              </div>
            ))}
            {v.legacy_artist_id ? (
              <>
                <dt className="text-[var(--color-muted)]">Old site artist id</dt>
                <dd>{v.legacy_artist_id}</dd>
              </>
            ) : null}
          </dl>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="font-semibold">Credit history</h2>
          <table className="data stack mt-2">
            <thead>
              <tr>
                <th>Date</th>
                <th>Change</th>
                <th>Kind</th>
                <th>Reason</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td>{fmtDate(l.created_at)}</td>
                  <td className={l.delta > 0 ? 'text-[var(--color-ok)]' : ''}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                  <td>{l.credit_kind}</td>
                  <td>{l.reason.replace('_', ' ')}</td>
                  <td>{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {me.role === 'admin' ? (
            <form action={opsAdjustCredits} className="mt-3 grid gap-2 sm:grid-cols-[100px_120px_1fr_auto]">
              <input type="hidden" name="vendor_id" value={v.id} />
              <input name="credits" required className="input" placeholder="±credits" inputMode="numeric" />
              <select name="kind" className="input" aria-label="Kind">
                <option value="topup">top-up</option>
                <option value="plan">plan</option>
              </select>
              <input name="note" required className="input" placeholder="Reason (required)" />
              <button className="btn btn-sm">Adjust</button>
            </form>
          ) : null}
        </Card>
        <Card className="lg:col-span-2">
          <h2 id="calendar" className="scroll-mt-24 font-semibold">Calendar</h2>
          <p className="hint">
            {fresh.fresh ? `Up to date (updated ${fresh.ago}).` : fresh.ago ? `Last updated ${fresh.ago}; brides see unmarked days as not marked.` : 'Never updated.'}{' '}
            {v.calendar_import_url ? `Google Calendar connected${v.calendar_import_error ? `, last read failed: ${v.calendar_import_error}` : ''}.` : ''}
          </p>
          {upcoming.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {upcoming.slice(0, 40).map((e) => (
                <li key={e.id} className="chip py-0.5">
                  {shortDate(e.day)} {e.status === 'closed' ? 'closed' : 'booked'}
                  {e.slot !== 'full' ? ` (${e.slot})` : ''}
                  {e.source === 'olready' ? ' · Olready' : e.source === 'import' ? ' · imported' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-muted)]">Nothing marked in the next 90 days.</p>
          )}
          <form action={opsCalendarAddAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_120px_120px_1.5fr_auto] sm:items-end">
            <input type="hidden" name="vendor_id" value={v.id} />
            <label>
              <span className="label">From</span>
              <input name="from" type="date" required className="input py-1" />
            </label>
            <label>
              <span className="label">Until</span>
              <input name="to" type="date" className="input py-1" />
            </label>
            <select name="status" className="input py-1" aria-label="Mark as">
              <option value="booked">Booked</option>
              <option value="closed">Closed</option>
            </select>
            <select name="slot" className="input py-1" aria-label="When">
              <option value="full">Whole day</option>
              <option value="day">Day</option>
              <option value="evening">Evening</option>
            </select>
            <input name="note" maxLength={120} className="input py-1" placeholder="Note, e.g. told us on the phone" aria-label="Note" />
            <button className="btn btn-sm">Mark</button>
          </form>
        </Card>
      </div>
    </>
  );
}
