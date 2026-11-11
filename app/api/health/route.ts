import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** For an uptime monitor: 200 when the site can reach its database, 503 when it cannot. */
export async function GET() {
  const t = Date.now();
  try {
    await sql`select 1`;
    return NextResponse.json({ ok: true, db_ms: Date.now() - t }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
