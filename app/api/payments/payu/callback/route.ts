import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { markOrderPaid, payuResponseValid } from '@/lib/payments';

/** PayU posts the result here (both success and failure URLs). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const p = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  if (!payuResponseValid(p)) return to(`/vendor/packs?error=${encodeURIComponent('We could not confirm this payment. Contact support if money left your account.')}`);
  const [o] = await sql<{ id: string; amount_inr: number }[]>`select id, amount_inr from mkt.orders where id = ${p.txnid} and gateway = 'payu'`;
  if (!o) return to('/vendor/packs?error=Order%20not%20found');
  if (p.status !== 'success') {
    await sql`update mkt.orders set status = 'failed' where id = ${o.id} and status = 'created'`;
    return to('/vendor/packs?error=Payment%20failed');
  }
  if (Number(p.amount) !== o.amount_inr) return to('/vendor/packs?error=Amount%20mismatch');
  await markOrderPaid(sql, o.id, p.mihpayid ?? null, null);
  return to('/vendor/packs?ok=Payment%20received');
}
