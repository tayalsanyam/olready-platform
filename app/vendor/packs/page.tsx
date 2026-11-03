import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { CallbackForm } from '@/components/CallbackForm';
import { formatInr } from '@/lib/catalog';
import { balances } from '@/lib/leads';
import { gatewayStates, packsFor } from '@/lib/payments';
import { buyPack, saveBillingAction } from '@/lib/actions/vendor';
import { Badge, Card, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Credits and plans', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

const gatewayLabel: Record<string, string> = { razorpay: 'Razorpay (UPI, cards)', payu: 'PayU', manual: 'Bank transfer', test: 'Test payment (dev only)' };

export default async function Packs({ searchParams }: P) {
  const q = await searchParams;
  const { profile, vendor } = await requireVendor('/vendor/packs');
  const [packs, gateways, bal, orders, subs] = await Promise.all([
    packsFor(sql, vendor.category_id),
    gatewayStates(sql),
    balances(sql, vendor.id),
    sql<{ id: string; pack: string; amount_inr: number; gateway: string; status: string; created_at: Date; invoice_id: string | null; invoice_no: string | null }[]>`
      select o.id, coalesce(p.name, case when o.wallet_topup_inr is not null then 'Ads wallet top-up' end) as pack, o.amount_inr, o.gateway, o.status, o.created_at,
        d.id as invoice_id, d.number as invoice_no
      from mkt.orders o left join mkt.packs p on p.id = o.pack_id
      left join mkt.tax_documents d on d.order_id = o.id and d.kind = 'invoice'
      where o.vendor_id = ${vendor.id} order by o.created_at desc limit 20`,
    sql<{ id: string; name: string; status: string; ends_at: Date | null }[]>`
      select s.id, p.name, s.status, s.ends_at from mkt.vendor_subscriptions s join mkt.packs p on p.id = s.pack_id
      where s.vendor_id = ${vendor.id} order by s.created_at desc`,
  ]);
  const usable = gateways.filter((g) => g.enabled && g.configured);
  return (
    <>
      <PageTitle
        title="Credits and plans"
        sub={`${bal.planUsable ? bal.plan : 0} plan credits · ${bal.topup} top-up credits. Unlocking a ${vendor.category_name.toLowerCase()} lead costs the credits shown on it.`}
      />
      <Notice error={q.error} ok={q.ok} />
      {subs.some((s) => s.status === 'pending_contract') ? (
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-pink-soft)] px-3 py-2 text-sm">
          Your plan is paid. It activates once our team has your signed contract.
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packs.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{p.name}</h2>
              <Badge tone={p.kind === 'plan' ? 'gold' : 'plain'}>{p.kind === 'plan' ? 'Plan' : 'Top-up'}</Badge>
            </div>
            <p className="mt-1 text-2xl font-semibold">{formatInr(p.price_inr)}</p>
            <p className="hint">GST included · {p.credits} credits{p.validity_days ? ` · ${Math.round(p.validity_days / 30)} months` : ', no expiry'}</p>
            <p className="mt-2 flex-1 text-sm">{p.description}</p>
            {p.requires_contract ? <p className="hint mt-1">Activates once the signed contract is in.</p> : null}
            {usable.length ? (
              <form action={buyPack} className="mt-3 space-y-2">
                <input type="hidden" name="pack_id" value={p.id} />
                <select name="gateway" className="input" aria-label="Payment method">
                  {usable.map((g) => (
                    <option key={g.gateway} value={g.gateway}>
                      {gatewayLabel[g.gateway]}
                    </option>
                  ))}
                </select>
                <details>
                  <summary className="hint cursor-pointer">Add GSTIN or a discount code (optional)</summary>
                  <Field label="GSTIN">
                    <input name="gstin" className="input uppercase" maxLength={15} defaultValue={vendor.gstin ?? ''} />
                  </Field>
                  <Field label="Discount code">
                    <input name="coupon" className="input uppercase" maxLength={24} />
                  </Field>
                </details>
                <button className="btn btn-pink w-full">Buy {p.name}</button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-warn)]">Payments are temporarily unavailable.</p>
            )}
          </Card>
        ))}
      </div>
      {orders.length ? (
        <Card className="mt-6 overflow-x-auto">
          <h2 className="mb-2 font-semibold">Orders</h2>
          <table className="data min-w-[600px] whitespace-nowrap">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pack</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.created_at.toISOString().slice(0, 10)}</td>
                  <td>{o.pack}</td>
                  <td>{formatInr(o.amount_inr)}</td>
                  <td>{o.gateway}</td>
                  <td>{o.status}</td>
                  <td>
                    {o.status === 'paid' || o.status === 'refunded' ? (
                      <span className="flex flex-wrap gap-x-3">
                        {o.invoice_id ? (
                          <a className="underline" href={`/invoices/${o.invoice_id}`} target="_blank" rel="noreferrer">
                            Invoice {o.invoice_no}
                          </a>
                        ) : null}
                        <Link className="underline" href={`/receipt/${o.id}`}>
                          Receipt
                        </Link>
                      </span>
                    ) : o.status === 'created' ? (
                      <Link className="underline" href={`/pay/${o.id}`}>
                        Pay
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Card className="mt-6">
        <h2 className="font-semibold">Billing details</h2>
        <p className="hint">Printed on your tax invoices. Add your GSTIN to claim input tax credit.</p>
        <form action={saveBillingAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Legal name">
            <input name="legal_name" className="input" defaultValue={vendor.legal_name ?? ''} placeholder={vendor.business_name} maxLength={120} />
          </Field>
          <Field label="GSTIN">
            <input name="gstin" className="input uppercase" defaultValue={vendor.gstin ?? ''} maxLength={15} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Billing address">
              <textarea name="billing_address" className="input" rows={2} defaultValue={vendor.billing_address ?? ''} maxLength={300} />
            </Field>
          </div>
          <button className="btn btn-ghost btn-sm justify-self-start">Save billing details</button>
        </form>
      </Card>
      <div className="mt-6">
        <CallbackForm phone={profile.phone ?? vendor.phone} backPath="/vendor/packs" topics={['plans', 'leads', 'profile', 'payments', 'other']} />
      </div>
    </>
  );
}
