import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { formatInr } from '@/lib/catalog';
import { balances, visibleNeeds } from '@/lib/leads';
import { vendorStats } from '@/lib/vendorStats';
import { unlockAction } from '@/lib/actions/vendor';
import { Badge, Card, Empty, Notice, PageTitle, Stat } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leads', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function VendorHome({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor();
  const [bal, needs, stats] = await Promise.all([balances(sql, vendor.id), visibleNeeds(sql, vendor.id), vendorStats(sql, vendor.id)]);
  const credits = (bal.planUsable ? bal.plan : 0) + bal.topup;
  return (
    <>
      <PageTitle title="Verified leads" sub={`${vendor.category_name} · ${vendor.city_name}`} />
      <Notice error={q.error} ok={q.ok} />
      {vendor.status !== 'live' ? (
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-gold-soft)] px-3 py-2 text-sm">
          Your profile is <b>{vendor.status.replace('_', ' ')}</b>. Leads appear here once our team puts it live.{' '}
          <Link href="/vendor/profile" className="underline">
            Finish your profile
          </Link>
        </div>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Credits" value={credits} hint={bal.planUsable ? `${bal.plan} plan · ${bal.topup} top-up` : `${bal.topup} top-up`} />
        <Stat label="Unlocked" value={stats.unlocks} hint={`${stats.open_threads} conversations open`} />
        <Stat label="Bookings" value={stats.bookings} hint={stats.conversion != null ? `${stats.conversion}% of unlocks` : 'Report bookings to see this'} />
        <Stat
          label="Cost per booking"
          value={stats.costPerBooking != null ? formatInr(stats.costPerBooking) : '–'}
          hint="What you paid for leads ÷ bookings"
        />
      </div>
      {credits === 0 ? (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">You have no credits. Buy a small pack to unlock your first leads.</p>
          <Link href="/vendor/packs" className="btn btn-gold btn-sm">
            Buy credits
          </Link>
        </Card>
      ) : null}
      {needs.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {needs.map((n) => (
            <li key={n.need_id} className="card flex flex-col p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{n.bride_first_name}</span>
                <span className="text-sm text-[var(--color-muted)]">· {n.city_name}</span>
                {n.direct ? <Badge tone="gold">Asked for you</Badge> : null}
                {n.shortlisted ? <Badge tone="gold">Shortlisted you</Badge> : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
                <dt className="text-[var(--color-muted)]">Wedding</dt>
                <dd>{n.event_date ?? 'Date not fixed'}</dd>
                <dt className="text-[var(--color-muted)]">Budget</dt>
                <dd>{n.budget_inr != null ? formatInr(n.budget_inr) : (n.tier_label ?? 'Not shared')}</dd>
                <dt className="text-[var(--color-muted)]">Also needs</dt>
                <dd>{n.other_categories ? `${n.other_categories} more categor${n.other_categories > 1 ? 'ies' : 'y'}` : 'Only this'}</dd>
                <dt className="text-[var(--color-muted)]">Unlocked by</dt>
                <dd>
                  {n.unlocks} of {n.unlock_cap} vendors
                </dd>
              </dl>
              <form action={unlockAction} className="mt-3">
                <input type="hidden" name="need_id" value={n.need_id} />
                <button className="btn btn-sm w-full" disabled={credits < n.credit_cost}>
                  Unlock for {n.credit_cost} credit{n.credit_cost > 1 ? 's' : ''}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No new leads right now">Verified brides in your category and city appear here as soon as our team confirms them.</Empty>
      )}
      <p className="hint mt-6">
        Leads are verified, not exclusive: each one is shared with a limited number of vendors. An enquiry is a chance to connect, not a
        confirmed booking.
      </p>
    </>
  );
}
