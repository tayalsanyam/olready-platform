import { sql } from '@/lib/db';
import { AcceptTerms } from '@/components/PolicyPage';
import { requireVendor } from '@/lib/vendorSession';
import { gatewayStates } from '@/lib/payments';
import { listCities } from '@/lib/catalog';
import { getSetting } from '@/lib/db';
import { fmtDate, fmtDay, plural } from '@/lib/dates';
import {
  PLACEMENTS,
  WALLET_TOPUPS,
  bannerPrice,
  bannersFor,
  bookableMonths,
  boostsFor,
  monthLabel,
  slotsLeft,
  walletBalance,
  walletLedger,
} from '@/lib/promotion';
import { bookBannerAction, boostStatusAction, cancelBannerAction, createBoostAction, topUpWalletAction } from '@/lib/actions/promotion';
import { Badge, Card, Field, Notice, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promote', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const gatewayLabel: Record<string, string> = { razorpay: 'Razorpay (UPI, cards)', payu: 'PayU', manual: 'Bank transfer', test: 'Test payment (dev only)' };
const REASON: Record<string, string> = { topup: 'Top-up', boost_visit: 'Boost visits', banner: 'Banner', banner_refund: 'Banner refund', adjustment: 'Adjustment by OLReady' };
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmt = (d: Date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(d);

export default async function Promote({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor('/vendor/promote');
  const months = bookableMonths();
  const [balance, ledger, boosts, banners, gateways, cities, price, homePrice, cityPrice] = await Promise.all([
    walletBalance(sql, vendor.id),
    walletLedger(sql, vendor.id),
    boostsFor(sql, vendor.id),
    bannersFor(sql, vendor.id),
    gatewayStates(sql),
    listCities(sql),
    getSetting<number>(sql, 'boost_price_per_visit', 15),
    bannerPrice(sql, 'home'),
    bannerPrice(sql, 'city'),
  ]);
  const usable = gateways.filter((g) => g.enabled && g.configured);
  const served = cities.filter((c) => c.id === vendor.city_id || vendor.service_city_ids.includes(c.id));
  // Slots left this and next months on the home page and in the vendor's own city.
  const homeSlots = await Promise.all(months.map((m) => slotsLeft(sql, 'home', null, m)));
  // Merge daily boost spend into one ledger line per day so the list stays readable.
  const lines: { key: string; reason: string; delta: number; when: Date; note: string }[] = [];
  for (const l of ledger) {
    const last = lines.at(-1);
    if (l.reason === 'boost_visit' && last?.reason === 'boost_visit' && fmt(last.when) === fmt(l.created_at)) last.delta += l.delta_inr;
    else lines.push({ key: String(l.id), reason: l.reason, delta: l.delta_inr, when: l.created_at, note: l.note });
  }
  return (
    <>
      <PageTitle
        title="Promote"
        sub="Reach more families with Boosts and banners. Everything you pay for is labelled Sponsored and never changes your place in the regular results."
      />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Ads wallet</p>
          <p className="figure text-4xl">{inr(balance)}</p>
          {usable.length ? (
            <form action={topUpWalletAction} className="mt-4 space-y-3">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="label mb-1">Top up (GST included)</legend>
                {WALLET_TOPUPS.map((a, i) => (
                  <label key={a} className="chip cursor-pointer has-[:checked]:border-[var(--color-pink)] has-[:checked]:bg-[var(--color-pink-soft)]">
                    <input type="radio" name="amount" value={a} defaultChecked={i === 1} className="sr-only" />
                    {inr(a)}
                  </label>
                ))}
              </fieldset>
              <select name="gateway" className="input" aria-label="Payment method">
                {usable.map((g) => (
                  <option key={g.gateway} value={g.gateway}>
                    {gatewayLabel[g.gateway]}
                  </option>
                ))}
              </select>
              <input name="gstin" className="input" placeholder="GSTIN (optional)" aria-label="GSTIN" />
              <input name="coupon" className="input uppercase placeholder:normal-case" placeholder="Discount code (optional)" aria-label="Discount code" maxLength={24} />
              <AcceptTerms />
              <button className="btn btn-pink btn-sm">Top up</button>
            </form>
          ) : (
            <p className="hint mt-3">Online payment is temporarily unavailable. Contact our team to top up.</p>
          )}
          {lines.length ? (
            <ul className="mt-5 divide-y divide-[var(--color-line)] text-sm">
              {lines.slice(0, 12).map((l) => (
                <li key={l.key} className="flex justify-between py-1.5">
                  <span>
                    {REASON[l.reason] ?? l.reason}
                    <span className="text-[var(--color-muted)]"> · {fmt(l.when)}</span>
                  </span>
                  <span className={l.delta > 0 ? 'text-emerald-700' : ''}>{l.delta > 0 ? `+${inr(l.delta)}` : `−${inr(-l.delta)}`}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-semibold">Boost your profile</h2>
          <p className="hint mt-1">
            Your card shows as Sponsored in the places you pick. You pay {inr(price)} each time someone opens your profile from it, once per
            person per day, and never more than your daily budget.
          </p>
          <form action={createBoostAction} className="mt-3 space-y-3">
            <fieldset>
              <legend className="label mb-1">Where</legend>
              {Object.entries(PLACEMENTS).map(([k, label], i) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="placements" value={k} defaultChecked={i === 0} className="h-4 w-4 accent-[var(--color-pink)]" />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="label mb-1">Cities (none ticked = every city you serve)</legend>
              <div className="flex flex-wrap gap-2">
                {served.map((c) => (
                  <label key={c.id} className="chip cursor-pointer has-[:checked]:border-[var(--color-pink)] has-[:checked]:bg-[var(--color-pink-soft)]">
                    <input type="checkbox" name="city_ids" value={c.id} className="sr-only" />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Daily budget ₹">
                <input name="daily_budget" inputMode="numeric" defaultValue={300} className="input" required />
              </Field>
              <Field label="Starts">
                <input name="starts_on" type="date" className="input" defaultValue={new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)} />
              </Field>
              <Field label="Ends (optional)">
                <input name="ends_on" type="date" className="input" />
              </Field>
            </div>
            <button className="btn btn-sm" disabled={balance < price}>
              Start Boost
            </button>
            {balance < price ? <p className="hint">Top up your wallet to start a Boost.</p> : null}
          </form>
          {boosts.length ? (
            <ul className="mt-5 space-y-2 text-sm">
              {boosts.map((b) => (
                <li key={b.id} className="rounded-[12px] border border-[var(--color-line)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{b.placements.map((p) => PLACEMENTS[p]?.split(',')[0]).join(' · ')}</span>
                    <Badge tone={b.status === 'active' ? 'ok' : b.status === 'paused' ? 'warn' : 'plain'}>{b.paused_by_ops ? 'paused by OLReady' : b.status}</Badge>
                  </div>
                  <p className="mt-1 text-[var(--color-muted)]">
                    {inr(b.daily_budget_inr)} a day · from {fmtDate(b.starts_on)}
                    {b.ends_on ? ` to ${fmtDate(b.ends_on)}` : ''} · {b.city_ids.length ? cities.filter((c) => b.city_ids.includes(c.id)).map((c) => c.name).join(', ') : 'all your cities'}
                  </p>
                  <p className="mt-1">
                    Today: {b.visits_today} visit{b.visits_today === 1 ? '' : 's'}, {inr(b.spent_today)} · All time: {b.visits_total} visits, {inr(b.spent_total)}
                  </p>
                  {b.status !== 'ended' ? (
                    <div className="mt-2 flex gap-2">
                      <form action={boostStatusAction}>
                        <input type="hidden" name="boost_id" value={b.id} />
                        <input type="hidden" name="status" value={b.status === 'active' ? 'paused' : 'active'} />
                        <button className="btn btn-ghost btn-sm" disabled={b.paused_by_ops}>
                          {b.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                      </form>
                      <form action={boostStatusAction}>
                        <input type="hidden" name="boost_id" value={b.id} />
                        <input type="hidden" name="status" value="ended" />
                        <button className="btn btn-ghost btn-sm">End</button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <Card className="mt-5">
        <h2 className="font-semibold">Book a banner</h2>
        <p className="hint mt-1">
          A month-long Sponsored banner: home page {inr(homePrice)}, a city page {inr(cityPrice)}. Paid from your wallet when you book; if our team
          does not approve it, or you cancel before review, the full amount goes back.
        </p>
        <form action={bookBannerAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Where">
            <select name="placement" className="input" defaultValue="city">
              <option value="home">Home page ({inr(homePrice)})</option>
              <option value="city">City page ({inr(cityPrice)})</option>
            </select>
          </Field>
          <Field label="City (for a city page)">
            <select name="city_id" className="input" defaultValue={vendor.city_id}>
              {served.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Month">
            <select name="month" className="input">
              {months.map((m, i) => (
                <option key={m} value={m}>
                  {monthLabel(m)} ({homeSlots[i]} home slot{homeSlots[i] === 1 ? '' : 's'} left)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Headline">
            <input name="headline" required minLength={5} maxLength={90} className="input" placeholder="Bridal looks that last from pheras to reception" />
          </Field>
          <Field label="Image (16:9, JPEG/PNG/WebP, up to 5 MB)">
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required className="block text-sm" />
          </Field>
          <div className="self-end">
            <button className="btn btn-sm">Book and pay from wallet</button>
          </div>
        </form>
        {banners.length ? (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {banners.map((b) => (
              <li key={b.id} className="flex gap-3 rounded-[12px] border border-[var(--color-line)] p-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image_url} alt="" className="h-16 w-28 shrink-0 rounded-[8px] object-cover" />
                <div className="min-w-0">
                  <p className="font-semibold">{b.headline}</p>
                  <p className="text-[var(--color-muted)]">
                    {b.placement === 'home' ? 'Home page' : b.city_name}, {monthLabel(b.month)}, {inr(b.price_inr)}
                  </p>
                  <Badge tone={b.status === 'approved' ? 'ok' : b.status === 'pending' ? 'warn' : 'plain'}>{b.status === 'pending' ? 'in review' : b.status}</Badge>
                  {b.reject_reason ? <p className="mt-1 text-xs">{b.reject_reason}</p> : null}
                  {b.status === 'pending' ? (
                    <form action={cancelBannerAction} className="mt-1">
                      <input type="hidden" name="banner_id" value={b.id} />
                      <button className="text-xs underline">Cancel and refund</button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
