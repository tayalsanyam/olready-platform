import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { displayValue, fieldsFor, formatInr, listCities } from '@/lib/catalog';
import { balances } from '@/lib/leads';
import { vendorStats } from '@/lib/vendorStats';
import type { Vendor } from '@/lib/vendors';
import { opsAdjustCredits, opsInviteClaim, opsVendorStatus } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle, Stat } from '@/components/ui';

export const metadata = { title: 'Vendor' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function OpsVendor({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  const me = await requireRole(['ops', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [v] = await sql<(Vendor & { category: string; city: string; owner_email: string | null })[]>`
    select v.*, c.name as category, ci.name as city, p.email as owner_email
    from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
    left join mkt.profiles p on p.id = v.owner_profile_id where v.id = ${id}`;
  if (!v) notFound();
  const [fields, cities, bal, stats, ledger] = await Promise.all([
    fieldsFor(sql, v.category_id),
    listCities(sql),
    balances(sql, v.id),
    vendorStats(sql, v.id),
    sql<{ id: number; credit_kind: string; delta: number; reason: string; note: string; created_at: Date }[]>`
      select id, credit_kind, delta, reason, note, created_at from mkt.credit_ledger where vendor_id = ${id} order by id desc limit 25`,
  ]);
  return (
    <>
      <PageTitle
        title={v.business_name}
        sub={`${v.category} · ${v.city} · owner ${v.owner_email ?? 'none yet'}`}
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
              <legend className="label">Cities served (who sees her in leads)</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                {cities.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5">
                    <input type="checkbox" name="service_city_id" value={c.id} defaultChecked={c.id === v.city_id || v.service_city_ids.includes(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
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
          <table className="data mt-2">
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
                  <td>{l.created_at.toISOString().slice(0, 10)}</td>
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
      </div>
    </>
  );
}
