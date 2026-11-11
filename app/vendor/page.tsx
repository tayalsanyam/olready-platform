import { Bar, Marigold, Ring } from '@/components/Art';
import { greeting } from '@/lib/dates';
import { plansBehind } from '@/lib/alerts';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { formatInr } from '@/lib/catalog';
import { balances, visibleNeeds } from '@/lib/leads';
import { needFunctions } from '@/lib/functions';
import { clashesForNeeds } from '@/lib/availability';
import { FunctionList } from '@/components/FunctionList';
import { vendorStats } from '@/lib/vendorStats';
import { unlockAction } from '@/lib/actions/vendor';
import { Badge, Card, Empty, Notice, PageTitle, Stat } from '@/components/ui';
import { fmtDate, fmtDay, plural } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leads', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function VendorHome({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor();
  const [bal, needs, stats] = await Promise.all([balances(sql, vendor.id), visibleNeeds(sql, vendor.id), vendorStats(sql, vendor.id)]);
  const credits = (bal.planUsable ? bal.plan : 0) + bal.topup;
  const pace = (await plansBehind(sql)).find((r) => r.vendor_id === vendor.id);
  const [plan] = await sql<{ name: string; credits: number; used: number; days_left: number }[]>`
    select p.name, p.credits, greatest(0, p.credits - ${bal.plan})::int as used, greatest(0, ceil(extract(epoch from (s.ends_at - now())) / 86400))::int as days_left
    from mkt.vendor_subscriptions s join mkt.packs p on p.id = s.pack_id
    where s.vendor_id = ${vendor.id} and s.status = 'active' and s.ends_at > now() order by s.ends_at desc limit 1`;
  const [prof] = await sql<{ photos: number; fresh: boolean; towns: number }[]>`
    select (select count(*) from mkt.vendor_media where vendor_id = ${vendor.id})::int as photos,
      coalesce((select calendar_updated_at > now() - interval '45 days' from mkt.vendors where id = ${vendor.id}), false) as fresh,
      coalesce(cardinality((select service_city_ids from mkt.vendors where id = ${vendor.id})), 0)::int as towns`;
  const steps = [
    { ok: Boolean(vendor.cover_image_url), label: 'add a cover photo', href: '/vendor/profile' },
    { ok: prof.photos >= 6, label: 'add at least 6 work photos', href: '/vendor/profile#photos' },
    { ok: (vendor.about ?? '').trim().length >= 120, label: 'write a fuller About', href: '/vendor/profile' },
    { ok: vendor.starting_price_inr != null, label: 'add your starting price', href: '/vendor/profile' },
    { ok: prof.fresh, label: 'confirm your calendar', href: '/vendor/calendar' },
    { ok: prof.towns > 1, label: 'add the towns you travel to', href: '/vendor/profile' },
  ];
  const strength = { steps, done: steps.filter((x) => x.ok).length, next: steps.find((x) => !x.ok) };
  const [fnsByNeed, clashes] = await Promise.all([needFunctions(sql, needs.map((n) => n.need_id)), clashesForNeeds(sql, vendor.id, needs.map((n) => n.need_id))]);
  return (
    <>
      <section className="jaali-dark arrive relative mb-5 overflow-hidden rounded-3xl bg-[var(--color-ink)] p-5 text-white sm:p-7">
        <Marigold size={110} className="pointer-events-none absolute -right-8 -top-9 opacity-90" />
        <div className="relative flex flex-wrap items-center justify-between gap-5 pr-10 sm:pr-16">
          <div className="min-w-0">
            <p className="text-sm text-white/70">
              {greeting()} · {vendor.category_name} · {vendor.city_name}
            </p>
            <h1 className="mt-1 text-3xl sm:text-4xl" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
              {vendor.business_name}
            </h1>
            <p className="mt-2 text-white/80">
              {needs.length ? `${plural(needs.length, 'verified request')} ${needs.length === 1 ? 'is' : 'are'} open for you right now.` : 'No open requests right now. New ones arrive here as soon as our team verifies them.'}
            </p>
          </div>
          {plan ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 pr-5">
              <Ring value={plan.used} total={plan.credits} size={72} stroke={7} colour="#ffc23d" label={`${plan.used} of ${plan.credits} plan enquiries used`}>
                <span className="figure text-xl">{plan.used}</span>
                <span className="text-[10px] text-white/70">of {plan.credits}</span>
              </Ring>
              <div className="text-sm">
                <div className="font-semibold">{plan.name} plan</div>
                <div className="text-white/75">{plural(plan.days_left, 'day')} left</div>
                <Link href="/vendor/packs" className="text-white/90 underline">
                  Credits and plans
                </Link>
              </div>
            </div>
          ) : null}
        </div>
        <div className="relative mt-5 rounded-2xl bg-white/10 p-3">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">Profile strength {strength.done} of {strength.steps.length}</span>
            {strength.next ? (
              <Link href={strength.next.href} className="text-white/90 underline">
                Next: {strength.next.label}
              </Link>
            ) : (
              <span className="text-white/80">Complete. Brides see everything they look for.</span>
            )}
          </div>
          <Bar value={strength.done} total={strength.steps.length} colour="#ffc23d" label={`Profile strength ${strength.done} of ${strength.steps.length}`} />
        </div>
      </section>
      <Notice error={q.error} ok={q.ok} />
      {vendor.status !== 'live' ? (
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-pink-soft)] px-3 py-2 text-sm">
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
      {pace ? (
        <Card className="mb-5">
          <p className="text-sm">
            <b>
              You have used {pace.used} of {pace.credits} enquiries and your {pace.plan} plan has {plural(pace.days_left, 'day')} left.
            </b>{' '}
            Unused enquiries end with the plan. {pace.open_leads ? `${plural(pace.open_leads, 'verified request')} below ${pace.open_leads === 1 ? 'is' : 'are'} open for you now.` : 'Check here daily: requests close once enough vendors open them.'}{' '}
            <Link href="/vendor/calendar" className="underline">
              Update your calendar
            </Link>{' '}
            and{' '}
            <Link href="/vendor/profile" className="underline">
              add the towns you travel to
            </Link>{' '}
            to see more.
          </p>
        </Card>
      ) : null}
      {credits === 0 ? (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">You have no credits. Buy a small pack to unlock your first leads.</p>
          <Link href="/vendor/packs" className="btn btn-pink btn-sm">
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
                <span className="text-sm text-[var(--color-muted)]">· {n.area_name ? `${n.area_name}, ${n.city_name}` : n.city_name}</span>
                {n.direct ? <Badge tone="gold">Asked for you</Badge> : null}
                {n.shortlisted ? <Badge tone="gold">Shortlisted you</Badge> : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
                {(fnsByNeed.get(n.need_id)?.length ?? 0) > 1 ? (
                  <>
                    <dt className="col-span-2 text-[var(--color-muted)]">{fnsByNeed.get(n.need_id)!.length} functions</dt>
                    <dd className="col-span-2 mb-1">
                      <FunctionList fns={fnsByNeed.get(n.need_id)!} />
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="text-[var(--color-muted)]">Wedding</dt>
                    <dd>{fmtDate(n.event_date, 'Date not fixed')}</dd>
                  </>
                )}
                {n.guest_count ? (
                  <>
                    <dt className="text-[var(--color-muted)]">Guests</dt>
                    <dd>About {n.guest_count}</dd>
                  </>
                ) : null}
                <dt className="text-[var(--color-muted)]">Budget</dt>
                <dd>{n.budget_inr != null ? formatInr(n.budget_inr) : (n.tier_label ?? 'Not shared')}</dd>
                {n.brief ? (
                  <>
                    <dt className="text-[var(--color-muted)]">She wants</dt>
                    <dd>{n.brief}</dd>
                  </>
                ) : null}
                <dt className="text-[var(--color-muted)]">Also needs</dt>
                <dd>{n.other_categories ? `${n.other_categories} more categor${n.other_categories > 1 ? 'ies' : 'y'}` : 'Only this'}</dd>
                <dt className="text-[var(--color-muted)]">Unlocked by</dt>
                <dd>
                  {n.unlocks} of {n.unlock_cap} vendors
                </dd>
              </dl>
              {clashes.get(n.need_id)?.length ? (
                <p className="mt-3 rounded-lg bg-[#fff6e0] px-3 py-2 text-sm">
                  Your calendar shows you booked for {clashes.get(n.need_id)!.join('; ')}.{' '}
                  <Link href="/vendor/calendar" className="underline">
                    Check your calendar
                  </Link>
                </p>
              ) : null}
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
