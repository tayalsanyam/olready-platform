import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatInr } from '@/lib/catalog';
import { orderProduct, type Order } from '@/lib/payments';
import { opsRefundAction } from '@/lib/actions/promotion';
import { Badge, Card, Field, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Order' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d) : '–');

export default async function OrderPage({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  const me = await requireRole(['ops', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [o] = await sql<(Order & { buyer: string; buyer_email: string | null; vendor_name: string | null; vendor_slug: string | null })[]>`
    select o.*, pr.full_name as buyer, pr.email as buyer_email, v.business_name as vendor_name, v.slug as vendor_slug
    from mkt.orders o join mkt.profiles pr on pr.id = o.profile_id left join mkt.vendors v on v.id = o.vendor_id where o.id = ${id}`;
  if (!o) notFound();
  const [product, refunds] = await Promise.all([
    orderProduct(sql, o),
    sql<{ id: string; amount_inr: number; method: string; gateway_refund_id: string | null; reference: string; reason: string; took_back: Record<string, unknown>; created_at: Date; by: string }[]>`
      select r.*, p.full_name as by from mkt.refunds r join mkt.profiles p on p.id = r.created_by where r.order_id = ${id} order by r.created_at desc`,
  ]);
  const left = o.amount_inr - o.refunded_inr;
  return (
    <>
      <PageTitle title={`Order ${o.id.slice(0, 8).toUpperCase()}`} sub={<Link href="/ops/payments">Payments</Link>} />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-[var(--color-muted)]">Bought</dt>
            <dd className="font-semibold">{product.name}</dd>
            <dt className="text-[var(--color-muted)]">By</dt>
            <dd>
              {o.vendor_slug ? (
                <Link className="underline" href={`/v/${o.vendor_slug}`}>
                  {o.vendor_name}
                </Link>
              ) : (
                o.buyer
              )}{' '}
              <span className="text-[var(--color-muted)]">{o.buyer_email}</span>
            </dd>
            <dt className="text-[var(--color-muted)]">Paid</dt>
            <dd>
              {formatInr(o.amount_inr)}
              {o.discount_inr ? ` (${formatInr(o.discount_inr)} off with ${o.coupon_code})` : ''}
            </dd>
            <dt className="text-[var(--color-muted)]">Status</dt>
            <dd>
              <Badge tone={o.status === 'paid' ? 'ok' : o.status === 'refunded' ? 'warn' : 'plain'}>{o.status}</Badge>
              {o.refunded_inr ? ` ${formatInr(o.refunded_inr)} refunded` : ''}
            </dd>
            <dt className="text-[var(--color-muted)]">Gateway</dt>
            <dd>
              {o.gateway} {o.gateway_payment_id ? <span className="font-mono text-xs">{o.gateway_payment_id}</span> : null}
            </dd>
            <dt className="text-[var(--color-muted)]">Created / paid</dt>
            <dd>
              {fmt(o.created_at)} / {fmt(o.paid_at)}
            </dd>
          </dl>
          {refunds.length ? (
            <>
              <h2 className="mt-5 font-semibold">Refunds</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {refunds.map((r) => (
                  <li key={r.id} className="rounded-[10px] bg-[var(--color-tint)] p-2">
                    <b>{formatInr(r.amount_inr)}</b> by {r.method} {r.gateway_refund_id ?? r.reference} · {fmt(r.created_at)} · {r.by}
                    <span className="block">{r.reason}</span>
                    {Object.keys(r.took_back).length ? <span className="block text-xs text-[var(--color-muted)]">Took back: {JSON.stringify(r.took_back)}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
        {o.status === 'paid' && left > 0 ? (
          <Card>
            <h2 className="font-semibold">Refund</h2>
            {me.role !== 'admin' ? (
              <p className="hint mt-2">Only an admin can refund.</p>
            ) : (
              <form action={opsRefundAction} className="mt-3 space-y-3">
                <input type="hidden" name="order_id" value={o.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={`Amount ₹ (up to ${formatInr(left)})`}>
                    <input name="amount" required inputMode="numeric" defaultValue={left} className="input" />
                  </Field>
                  <Field label="How">
                    <select name="method" className="input" defaultValue={['razorpay', 'payu'].includes(o.gateway) && o.gateway_payment_id ? o.gateway : 'recorded'}>
                      {['razorpay', 'payu'].includes(o.gateway) && o.gateway_payment_id ? <option value={o.gateway}>Through {o.gateway} now</option> : null}
                      <option value="recorded">Already refunded (record it)</option>
                    </select>
                  </Field>
                </div>
                <Field label="Reference (for a recorded refund: gateway refund id or bank UTR)">
                  <input name="reference" className="input" />
                </Field>
                <Field label="Why">
                  <input name="reason" required minLength={3} className="input" />
                </Field>
                <fieldset className="space-y-1 text-sm">
                  <legend className="label">Take back what it gave</legend>
                  {o.pack_id ? (
                    <>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="take_credits" defaultChecked className="h-4 w-4" /> Unused credits from this purchase
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="end_plan" defaultChecked className="h-4 w-4" /> End the plan (plans only)
                      </label>
                    </>
                  ) : null}
                  {o.wallet_topup_inr ? (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="take_wallet" defaultChecked className="h-4 w-4" /> Wallet credit still unspent
                    </label>
                  ) : null}
                  {o.service_code ? <p className="hint">A relationship-manager request not yet started is withdrawn.</p> : null}
                </fieldset>
                <button className="btn btn-sm">Refund</button>
              </form>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
