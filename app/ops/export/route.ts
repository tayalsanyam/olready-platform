import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit } from '@/lib/db';
import { canDownload, currentProfile } from '@/lib/auth';
import { mfaNeeded } from '@/lib/mfa';
import { csvCell, dataset, exportDataset, type Filters } from '@/lib/opsData';

/**
 * Admin-only CSV export of any Ops data list, with the same filters as the list on screen.
 * Needs a passed sign-in check, and every download is written to the audit log.
 */
export async function GET(req: NextRequest) {
  const p = await currentProfile();
  if (!p || !canDownload(p)) return new NextResponse('Only admins can download data', { status: 403 });
  if (await mfaNeeded(p.id)) return new NextResponse('Confirm your sign-in code first: open /mfa', { status: 403 });
  const sp = req.nextUrl.searchParams;
  const d = dataset(sp.get('set') ?? sp.get('table') ?? '');
  if (!d) return new NextResponse('Unknown export', { status: 400 });
  const f: Filters = {
    q: sp.get('q') ?? undefined,
    status: sp.get('status') ?? undefined,
    city: sp.get('city') ?? undefined,
    category: sp.get('category') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
  };
  const rows = await exportDataset(sql, d, f);
  const cols = rows.length ? Object.keys(rows[0]) : d.columns.map((c) => c.key);
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
  await audit(sql, p.id, 'export.download', 'export', d.key, { rows: rows.length, filters: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="olready-${d.key}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
