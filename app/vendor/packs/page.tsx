import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { formatInr } from '@/lib/catalog';
import { balances } from '@/lib/leads';
import { gatewayStates, packsFor } from '@/lib/payments';
import { buyPack } from '@/lib/actions/vendor';
import { Badge, Card, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Credits and plans', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

const gatewayLabel: Record<string, string> = { razorpay: 'Razorpay (UPI, cards)', payu: 'PayU', manual: 'Bank transfer', test: 'Test payment (dev only)' };

export default async function Packs({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor('/vendor/packs');
  const [packs, gateways, bal, orders, subs] = await Promise.all([
    packsFor(sql, vendor.category_id),
    gatewayStates(sql),
    balances(sql, vendor.id),
    sql<{ id: string; pack: string; amount_inr: number; gateway: string; status: string; created_at: Date }[]>`
      select o.id, p.name as pack, o.amount_inr, o.gateway, o.status, o.created_at
      from mkt.orders o left join mkt.packs p on p.id = o.pack_id where o.vendor_id = ${vendor.id} order by o.created_at desc limit 20`,
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
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-gold-soft)] px-3 py-2 text-sm">
          Your plan is paid. It activates once our team uploads your invoice and the signed contract.
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
            {p.requires_contract ? <p className="hint mt-1">Activates after invoice and signed contract.</p> : null}
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
                  <summary className="hint cursor-pointer">Add GSTIN (optional)</summary>
                  <Field label="GSTIN">
                    <input name="gstin" className="input uppercase" maxLength={15} />
                  </Field>
                </details>
                <button className="btn btn-gold w-full">Buy {p.name}</button>
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
          <table className="data">
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
                    {o.status === 'paid' ? (
                      <Link className="underline" href={`/receipt/${o.id}`}>
                        Receipt
                      </Link>
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
    </>
  );
}
