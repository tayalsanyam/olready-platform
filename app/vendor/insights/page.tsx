import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { vendorInsights } from '@/lib/analytics';
import { Card, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Insights', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const PERIODS = [7, 30, 90];
const METRICS: { key: 'impressions' | 'views' | 'photo_views' | 'quote_starts' | 'shortlists' | 'leads' | 'unlocks' | 'bookings'; label: string; hint: string }[] = [
  { key: 'impressions', label: 'Seen in search', hint: 'Times your card appeared on a listing page' },
  { key: 'views', label: 'Profile views', hint: 'People who opened your profile, once per person per day' },
  { key: 'photo_views', label: 'Photo views', hint: 'Your photos opened in Ideas' },
  { key: 'quote_starts', label: 'Quote forms opened', hint: 'Brides who started a request to you' },
  { key: 'shortlists', label: 'Shortlisted', hint: 'Families who saved you' },
  { key: 'leads', label: 'Verified leads', hint: 'Verified requests in your category and cities' },
  { key: 'unlocks', label: 'Leads you unlocked', hint: '' },
  { key: 'bookings', label: 'Bookings reported', hint: '' },
];

function Delta({ now, before }: { now: number; before: number }) {
  if (!before && !now) return <span className="text-xs text-[var(--color-muted)]">No change</span>;
  if (!before) return <span className="text-xs font-semibold text-emerald-700">New</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-emerald-700' : 'text-[var(--color-pink-deep)]'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% <span className="font-normal text-[var(--color-muted)]">vs previous</span>
    </span>
  );
}

export default async function Insights({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor('/vendor/insights');
  const period = PERIODS.includes(Number(sp(q.days))) ? Number(sp(q.days)) : 30;
  const data = await vendorInsights(sql, vendor.id, period);
  const max = Math.max(1, ...data.days.map((d) => d.views));
  const w = 100 / data.days.length;
  const t = data.totals;
  const rate = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–');
  return (
    <>
      <PageTitle
        title="Insights"
        sub="How brides find you and what they do next. Updated as it happens."
        action={
          <div className="flex gap-1" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <Link key={p} href={`/vendor/insights?days=${p}`} className="chip" aria-current={p === period}>
                {p} days
              </Link>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METRICS.map((m) => (
          <Card key={m.key} className="p-4">
            <p className="text-sm text-[var(--color-muted)]">{m.label}</p>
            <p className="figure mt-1 text-3xl">{t[m.key].toLocaleString('en-IN')}</p>
            <Delta now={t[m.key]} before={data.previous[m.key]} />
            {m.hint ? <p className="mt-1 text-xs text-[var(--color-muted)]">{m.hint}</p> : null}
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <h2 className="font-semibold">Profile views by day</h2>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-40 w-full" role="img" aria-label={`Profile views per day over the last ${period} days`}>
          {data.days.map((d, i) => {
            const h = (d.views / max) * 36;
            return (
              <rect key={d.day} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={Math.max(h, d.views ? 0.6 : 0.2)} rx={0.4} fill={d.views ? 'var(--color-pink)' : 'var(--color-line)'}>
                <title>
                  {d.day}: {d.views} view{d.views === 1 ? '' : 's'}, {d.impressions} in search
                </title>
              </rect>
            );
          })}
        </svg>
        <div className="mt-1 flex justify-between text-xs text-[var(--color-muted)]">
          <span>{data.days[0].day}</span>
          <span>Busiest day: {max === 1 && !data.days.some((d) => d.views) ? 'none yet' : `${max} views`}</span>
          <span>{data.days.at(-1)!.day}</span>
        </div>
      </Card>

      <Card className="mt-5">
        <h2 className="font-semibold">From search to booking</h2>
        <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
          <li className="rounded-[12px] bg-[var(--color-tint)] p-3">
            Seen in search <b className="figure block text-2xl">{t.impressions}</b>
          </li>
          <li className="rounded-[12px] bg-[var(--color-tint)] p-3">
            Opened your profile <b className="figure block text-2xl">{rate(t.views, t.impressions)}</b>
          </li>
          <li className="rounded-[12px] bg-[var(--color-tint)] p-3">
            Shortlisted or asked for a quote <b className="figure block text-2xl">{rate(t.shortlists + t.quote_starts, t.views)}</b>
          </li>
          <li className="rounded-[12px] bg-[var(--color-tint)] p-3">
            Unlocked leads that booked <b className="figure block text-2xl">{rate(t.bookings, t.unlocks)}</b>
          </li>
        </ol>
        <p className="hint mt-3">
          More photos with captions and styles, a complete profile and quick replies raise each step.{' '}
          <Link className="underline" href="/vendor/profile">
            Improve your profile
          </Link>
        </p>
      </Card>
    </>
  );
}
