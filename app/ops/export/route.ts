import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit } from '@/lib/db';
import { canDownload, currentProfile } from '@/lib/auth';

const queries = {
  vendors: () => sql`
    select v.id, v.business_name, c.name as category, ci.name as city, v.status, v.claim_status, v.verified_at, v.assured,
      v.starting_price_inr, v.phone, v.email, v.created_at
    from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id order by v.created_at`,
  leads: () => sql`
    select l.id, l.bride_name, l.phone, l.email, ci.name as city, l.event_date, l.source, l.status, l.verified_at, l.created_at
    from mkt.leads l join mkt.cities ci on ci.id = l.city_id order by l.created_at`,
  orders: () => sql`
    select o.id, v.business_name, p.name as pack, o.amount_inr, o.gateway, o.gateway_payment_id, o.status, o.buyer_gstin, o.paid_at
    from mkt.orders o left join mkt.vendors v on v.id = o.vendor_id left join mkt.packs p on p.id = o.pack_id order by o.created_at`,
  unlocks: () => sql`
    select u.id, v.business_name, c.name as category, u.credits_spent, u.credit_kind, u.refunded, u.created_at
    from mkt.unlocks u join mkt.vendors v on v.id = u.vendor_id join mkt.lead_needs ln on ln.id = u.lead_need_id
    join mkt.categories c on c.id = ln.category_id order by u.created_at`,
};

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  // Quote, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Admin-only CSV export. Every download is written to the audit log. */
export async function GET(req: NextRequest) {
  const p = await currentProfile();
  if (!p || !canDownload(p)) return new NextResponse('Only admins can download data', { status: 403 });
  const table = req.nextUrl.searchParams.get('table') as keyof typeof queries;
  if (!(table in queries)) return new NextResponse('Unknown export', { status: 400 });
  const rows = (await queries[table]()) as Record<string, unknown>[];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  await audit(sql, p.id, 'export.download', 'export', table, { rows: rows.length });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="olready-${table}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
