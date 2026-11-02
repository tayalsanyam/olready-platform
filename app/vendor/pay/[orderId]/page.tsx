import { notFound } from 'next/navigation';
import Script from 'next/script';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { formatInr } from '@/lib/catalog';
import { type Order, type Pack, payuRequestFields, razorpayCreateOrder } from '@/lib/payments';
import { siteUrl } from '@/lib/seo';
import { completeTestPayment, razorpayVerifyAction } from '@/lib/actions/vendor';
import { Card, Notice, PageTitle } from '@/components/ui';
import { RazorpayButton } from './razorpay';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay', robots: { index: false } };

type P = { params: Promise<{ orderId: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function Pay({ params, searchParams }: P) {
  const { orderId } = await params;
  const q = await searchParams;
  const { profile, vendor } = await requireVendor(`/vendor/pay/${orderId}`);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const [order] = await sql<Order[]>`select * from mkt.orders where id = ${orderId} and profile_id = ${profile.id}`;
  if (!order) notFound();
  const [pack] = await sql<Pack[]>`select * from mkt.packs where id = ${order.pack_id}`;
  let razorpayOrderId = order.gateway_order_id;
  if (order.status === 'created' && order.gateway === 'razorpay' && !razorpayOrderId) {
    razorpayOrderId = (await razorpayCreateOrder(order)).id;
    await sql`update mkt.orders set gateway_order_id = ${razorpayOrderId} where id = ${order.id}`;
  }
  const payu =
    order.gateway === 'payu'
      ? payuRequestFields(order, pack, { name: profile.full_name || vendor.business_name, email: profile.email ?? '', phone: vendor.phone ?? '' }, siteUrl())
      : null;
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle title={`Pay for ${pack.name}`} sub={`${formatInr(order.amount_inr)} · GST included`} />
      <Notice error={q.error} />
      <Card className="space-y-3">
        {order.status !== 'created' ? (
          <p>This order is {order.status}.</p>
        ) : order.gateway === 'razorpay' ? (
          <>
            <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
            <RazorpayButton
              keyId={process.env.RAZORPAY_KEY_ID ?? ''}
              gatewayOrderId={razorpayOrderId!}
              orderId={order.id}
              amountPaise={order.amount_inr * 100}
              name={vendor.business_name}
              email={profile.email ?? ''}
              verify={razorpayVerifyAction}
            />
          </>
        ) : order.gateway === 'payu' && payu ? (
          <form action={payu.action} method="post">
            {Object.entries(payu.fields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <button className="btn btn-gold w-full">Pay with PayU</button>
          </form>
        ) : order.gateway === 'manual' ? (
          <div className="space-y-2 text-sm">
            <p>Transfer {formatInr(order.amount_inr)} to Katalyst Infomedia and send the reference to care@olready.in.</p>
            <p>
              Quote order number <b className="font-mono">{order.id.slice(0, 8).toUpperCase()}</b>. Our team marks it paid once the money
              arrives.
            </p>
          </div>
        ) : order.gateway === 'test' ? (
          <form action={completeTestPayment}>
            <input type="hidden" name="order_id" value={order.id} />
            <button className="btn btn-gold w-full">Complete test payment</button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
