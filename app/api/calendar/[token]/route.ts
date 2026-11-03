import { sql } from '@/lib/db';
import { buildIcs, calendarRange, todayIst } from '@/lib/availability';

// A vendor's private iCal feed: /api/calendar/<token>.ics
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, '');
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response('Not found', { status: 404 });
  const [v] = await sql<{ id: string; business_name: string }[]>`select id, business_name from mkt.vendors where calendar_token = ${token}`;
  if (!v) return new Response('Not found', { status: 404 });
  const from = new Date(Date.parse(todayIst()) - 30 * 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.parse(todayIst()) + 548 * 864e5).toISOString().slice(0, 10);
  const body = buildIcs(v.business_name, await calendarRange(sql, v.id, from, to));
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' } });
}
