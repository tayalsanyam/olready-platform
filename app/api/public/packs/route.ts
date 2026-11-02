import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// The one place plan and top-up prices are published. The sales site reads this
// so a price changed in Ops is the price shown and charged everywhere.
export const dynamic = 'force-dynamic';

export async function GET() {
  const packs = await sql<
    { code: string; name: string; kind: string; credits: number; price_inr: number; validity_days: number | null; description: string }[]
  >`
    select code, name, kind, credits, price_inr, validity_days, description
    from mkt.packs where active order by sort`;
  return NextResponse.json(
    { currency: 'INR', gst_included: true, packs },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', 'Access-Control-Allow-Origin': '*' } }
  );
}
