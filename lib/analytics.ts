import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import type { Db } from './db';

export type Counter = 'views' | 'impressions' | 'quote_starts' | 'photo_views';
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|curl|wget|python-requests|lighthouse/i;
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India date

/** A salted hash of network + browser for today: enough to count a visitor once, useless for tracking. */
export async function visitorKey() {
  const h = await headers();
  const ua = h.get('user-agent') ?? '';
  if (!ua || BOT.test(ua)) return null;
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
  const salt = process.env.CRON_SECRET ?? 'olready';
  return createHash('sha256').update(`${salt}|${today()}|${ip}|${ua}`).digest('hex').slice(0, 32);
}

export async function bump(db: Db, vendorIds: string[], counter: Counter) {
  if (!vendorIds.length) return;
  const day = today();
  // Column names come from the Counter type, never from input.
  const col = db(counter);
  await db`
    insert into mkt.vendor_daily (vendor_id, day, ${col})
    select unnest(${vendorIds}::uuid[]), ${day}::date, 1
    on conflict (vendor_id, day) do update set ${col} = mkt.vendor_daily.${col} + 1`;
}

/** Counts a profile view once per visitor per day. Owners and staff are not counted. */
export async function recordView(db: Db, vendorId: string, visitor: string | null) {
  if (!visitor) return;
  const [fresh] = await db`
    insert into mkt.vendor_view_seen (vendor_id, day, visitor) values (${vendorId}, ${today()}, ${visitor})
    on conflict do nothing returning 1`;
  if (fresh) await bump(db, [vendorId], 'views');
}

export type Insights = {
  days: { day: string; views: number; impressions: number; quote_starts: number; photo_views: number }[];
  totals: Record<'views' | 'impressions' | 'quote_starts' | 'photo_views' | 'shortlists' | 'leads' | 'unlocks' | 'bookings', number>;
  previous: Insights['totals'];
};

export async function vendorInsights(db: Db, vendorId: string, period: number): Promise<Insights> {
  const end = today();
  const days = await db<Insights['days']>`
    select to_char(d, 'YYYY-MM-DD') as day, coalesce(v.views, 0) as views, coalesce(v.impressions, 0) as impressions,
           coalesce(v.quote_starts, 0) as quote_starts, coalesce(v.photo_views, 0) as photo_views
    from generate_series(${end}::date - (${period}::int - 1), ${end}::date, interval '1 day') d
    left join mkt.vendor_daily v on v.vendor_id = ${vendorId} and v.day = d::date
    order by d`;
  const totals = async (from: string, to: string) => {
    const [t] = await db<Insights['totals'][]>`
      select
        (select coalesce(sum(views), 0) from mkt.vendor_daily where vendor_id = ${vendorId} and day between ${from}::date and ${to}::date)::int as views,
        (select coalesce(sum(impressions), 0) from mkt.vendor_daily where vendor_id = ${vendorId} and day between ${from}::date and ${to}::date)::int as impressions,
        (select coalesce(sum(quote_starts), 0) from mkt.vendor_daily where vendor_id = ${vendorId} and day between ${from}::date and ${to}::date)::int as quote_starts,
        (select coalesce(sum(photo_views), 0) from mkt.vendor_daily where vendor_id = ${vendorId} and day between ${from}::date and ${to}::date)::int as photo_views,
        (select count(*) from mkt.shortlist where vendor_id = ${vendorId} and (created_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date)::int as shortlists,
        (select count(*) from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id join mkt.vendors v on v.id = ${vendorId}
          where ln.category_id = v.category_id and l.status = 'verified' and (l.city_id = v.city_id or l.city_id = any(v.service_city_ids))
            and (l.verified_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date)::int as leads,
        (select count(*) from mkt.unlocks where vendor_id = ${vendorId} and not refunded and (created_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date)::int as unlocks,
        (select count(distinct lead_need_id) from mkt.booking_reports where vendor_id = ${vendorId} and (created_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date)::int as bookings`;
    return t;
  };
  const [cur, prev] = await Promise.all([
    totals(days[0].day, end),
    db<{ a: string; b: string }[]>`select to_char(${days[0].day}::date - ${period}::int, 'YYYY-MM-DD') as a, to_char(${days[0].day}::date - 1, 'YYYY-MM-DD') as b`.then(([r]) => totals(r.a, r.b)),
  ]);
  return { days, totals: cur, previous: prev };
}
