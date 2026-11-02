import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { markOrderPaid, razorpayWebhookValid } from '@/lib/payments';

/** Backstop for Razorpay: credits the order even if the browser never returned. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!razorpayWebhookValid(raw, req.headers.get('x-razorpay-signature') ?? '')) {
    return new NextResponse('bad signature', { status: 401 });
  }
  const event = JSON.parse(raw) as {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string; notes?: { order_id?: string } } } };
  };
  if (event.event !== 'payment.captured' && event.event !== 'order.paid') return NextResponse.json({ ignored: true });
  const pay = event.payload?.payment?.entity;
  if (!pay) return NextResponse.json({ ignored: true });
  const [o] = await sql<{ id: string }[]>`select id from mkt.orders where gateway_order_id = ${pay.order_id} and gateway = 'razorpay'`;
  if (!o) return NextResponse.json({ unknown: true });
  await markOrderPaid(sql, o.id, pay.id, null);
  return NextResponse.json({ ok: true });
}
