import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { citiesInUse } from '@/lib/catalog';
import { PLACEMENTS, allBoosts, bannerQueue, bookableMonths, monthLabel } from '@/lib/promotion';
import { opsAdjustWallet, opsBoostStatus, opsDecideBanner, opsTeamBanner } from '@/lib/actions/promotion';
import { Badge, Card, Empty, Field, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Promotions' };
type P = { searchParams: Promise<Record<string, string | string[]>> };
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default async function Promotions({ searchParams }: P) {
  const q = await searchParams;
  const me = await requireRole(['ops', 'admin']);
  const [banners, boosts, cities, [spend]] = await Promise.all([
    bannerQueue(sql),
    allBoosts(sql),
    citiesInUse(sql),
    sql<{ wallet_in: number; boost_7d: number; banners_month: number }[]>`
      select
        (select coalesce(sum(delta_inr), 0) from mkt.ad_wallet_ledger where reason = 'topup' and created_at > now() - interval '30 days')::int as wallet_in,
        (select coalesce(sum(charged_inr), 0) from mkt.boost_visits where day > (now() at time zone 'Asia/Kolkata')::date - 7)::int as boost_7d,
        (select coalesce(sum(price_inr), 0) from mkt.banners where status = 'approved' and month = date_trunc('month', now())::date)::int as banners_month`,
  ]);
  const pending = banners.filter((b) => b.status === 'pending');
  const live = banners.filter((b) => b.status === 'approved');
  return (
    <>
      <PageTitle title="Promotions" sub="Boosts, banners and ads wallets. Everything paid is labelled Sponsored on the site." />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          ['Wallet top-ups, 30 days', spend.wallet_in],
          ['Boost spend, 7 days', spend.boost_7d],
          ['Banners this month', spend.banners_month],
        ].map(([l, n]) => (
          <Card key={l as string} className="p-4">
            <p className="text-sm text-[var(--color-muted)]">{l}</p>
            <p className="figure text-2xl">{inr(n as number)}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 font-semibold">Banners to review ({pending.length})</h2>
      {pending.length ? (
        <ul className="space-y-3">
          {pending.map((b) => (
            <li key={b.id}>
              <Card className="flex flex-wrap gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image_url} alt="" className="aspect-video w-56 rounded-[10px] object-cover" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-base font-semibold">{b.headline}</p>
                  <p className="text-[var(--color-muted)]">
                    {b.vendor_name ?? 'OLReady'} · {b.placement === 'home' ? 'Home page' : b.city_name} · {monthLabel(b.month)} · {inr(b.price_inr)} paid
                  </p>
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    <form action={opsDecideBanner}>
                      <input type="hidden" name="banner_id" value={b.id} />
                      <input type="hidden" name="approve" value="1" />
                      <button className="btn btn-sm">Approve</button>
                    </form>
                    <form action={opsDecideBanner} className="flex flex-wrap gap-2">
                      <input type="hidden" name="banner_id" value={b.id} />
                      <input type="hidden" name="approve" value="0" />
                      <input name="reason" required className="input w-64 py-1" placeholder="Why (sent to the vendor)" aria-label="Reason" />
                      <button className="btn btn-ghost btn-sm">Reject and refund</button>
                    </form>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No banners waiting" />
      )}

      {live.length ? (
        <>
          <h2 className="mb-2 mt-8 font-semibold">Approved banners, this month and ahead</h2>
          <Card className="overflow-x-auto p-0">
            <table className="data">
              <thead>
                <tr>
                  <th>Headline</th>
                  <th>Where</th>
                  <th>Month</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {live.map((b) => (
                  <tr key={b.id}>
                    <td>{b.headline}</td>
                    <td>{b.placement === 'home' ? 'Home' : b.city_name}</td>
                    <td>{monthLabel(b.month)}</td>
                    <td>{b.vendor_name ?? 'OLReady'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}

      <h2 className="mb-2 mt-8 font-semibold">Boosts</h2>
      {boosts.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="data min-w-[700px]">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Where</th>
                <th>Daily budget</th>
                <th>Visits / spend</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {boosts.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link className="underline" href={`/v/${b.vendor_slug}`}>
                      {b.vendor_name}
                    </Link>
                  </td>
                  <td>{b.placements.map((p) => PLACEMENTS[p]?.split(',')[0]).join(', ')}</td>
                  <td>{inr(b.daily_budget_inr)}</td>
                  <td>
                    {b.visits_total} / {inr(b.spent_total)}
                  </td>
                  <td>
                    <Badge tone={b.status === 'active' ? 'ok' : 'plain'}>{b.paused_by_ops ? 'paused by Ops' : b.status}</Badge>
                  </td>
                  <td>
                    {b.status !== 'ended' ? (
                      <form action={opsBoostStatus}>
                        <input type="hidden" name="boost_id" value={b.id} />
                        <input type="hidden" name="status" value={b.status === 'active' ? 'paused' : 'active'} />
                        <button className="btn btn-ghost btn-sm">{b.status === 'active' ? 'Pause' : 'Resume'}</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty title="No Boosts yet" />
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Place a banner (free, approved at once)</h2>
          <p className="hint">For OLReady campaigns, or a slot sold offline.</p>
          <form action={opsTeamBanner} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Where">
              <select name="placement" className="input">
                <option value="home">Home page</option>
                <option value="city">City page</option>
              </select>
            </Field>
            <Field label="City">
              <select name="city_id" className="input">
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Month">
              <select name="month" className="input">
                {bookableMonths().map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Links to">
              <input name="link_url" required className="input" placeholder="/invitations or /v/vendor-slug" />
            </Field>
            <Field label="Headline">
              <input name="headline" required minLength={5} maxLength={90} className="input" />
            </Field>
            <Field label="Image (16:9)">
              <input type="file" name="image" required accept="image/jpeg,image/png,image/webp" className="block text-sm" />
            </Field>
            <button className="btn btn-sm">Place banner</button>
          </form>
        </Card>
        {me.role === 'admin' ? (
          <Card>
            <h2 className="font-semibold">Correct an ads wallet (admin)</h2>
            <form action={opsAdjustWallet} className="mt-3 space-y-3">
              <Field label="Vendor id">
                <input name="vendor_id" required className="input font-mono text-sm" placeholder="from the vendor's Ops page" />
              </Field>
              <Field label="Amount ₹ (negative to take away)">
                <input name="delta" required inputMode="numeric" className="input" />
              </Field>
              <Field label="Why">
                <input name="note" required className="input" />
              </Field>
              <button className="btn btn-sm">Adjust</button>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
