import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatInr } from '@/lib/catalog';
import { gatewayStates } from '@/lib/payments';
import { opsActivateSub, opsMarkPaid, opsSavePack, opsToggleGateway } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Payments' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function OpsPayments({ searchParams }: P) {
  const q = await searchParams;
  const me = await requireRole(['ops', 'admin']);
  const admin = me.role === 'admin';
  const [gateways, subs, transfers, packs, recent] = await Promise.all([
    gatewayStates(sql),
    sql<{ id: string; vendor: string; pack: string; amount_inr: number; created_at: Date }[]>`
      select s.id, v.business_name as vendor, p.name as pack, coalesce(o.amount_inr, p.price_inr) as amount_inr, s.created_at
      from mkt.vendor_subscriptions s join mkt.vendors v on v.id = s.vendor_id join mkt.packs p on p.id = s.pack_id
      left join mkt.orders o on o.id = s.order_id where s.status = 'pending_contract' order by s.created_at`,
    sql<{ id: string; vendor: string; pack: string; amount_inr: number; created_at: Date }[]>`
      select o.id, v.business_name as vendor, p.name as pack, o.amount_inr, o.created_at
      from mkt.orders o join mkt.vendors v on v.id = o.vendor_id join mkt.packs p on p.id = o.pack_id
      where o.status = 'created' and o.gateway = 'manual' order by o.created_at`,
    sql<{ id: number; code: string; name: string; kind: string; credits: number; price_inr: number; validity_days: number | null; active: boolean; description: string }[]>`
      select id, code, name, kind, credits, price_inr, validity_days, active, description from mkt.packs order by sort`,
    sql<{ id: string; vendor: string; pack: string; amount_inr: number; gateway: string; status: string; created_at: Date }[]>`
      select o.id, v.business_name as vendor, p.name as pack, o.amount_inr, o.gateway, o.status, o.created_at
      from mkt.orders o join mkt.vendors v on v.id = o.vendor_id join mkt.packs p on p.id = o.pack_id order by o.created_at desc limit 30`,
  ]);
  return (
    <>
      <PageTitle title="Payments" sub="Plans activate after the invoice and signed contract are uploaded. Top-ups credit on payment." />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Plans waiting for invoice and contract</h2>
          {subs.length ? (
            <ul className="mt-2 space-y-3">
              {subs.map((s) => (
                <li key={s.id} className="rounded-lg border border-[var(--color-line)] p-3">
                  <div className="text-sm">
                    <b>{s.vendor}</b> · {s.pack} · {formatInr(s.amount_inr)}
                  </div>
                  <form action={opsActivateSub} className="mt-2 grid gap-2">
                    <input type="hidden" name="sub_id" value={s.id} />
                    <input name="invoice_url" required className="input" placeholder="Zoho tax invoice link" />
                    <input name="contract_url" required className="input" placeholder="Signed contract link" />
                    <button className="btn btn-sm justify-self-start">Activate plan</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-muted)]">None.</p>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Bank transfers to confirm</h2>
          {transfers.length ? (
            <ul className="mt-2 space-y-2">
              {transfers.map((t) => (
                <li key={t.id}>
                  <form action={opsMarkPaid} className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="order_id" value={t.id} />
                    <span className="flex-1">
                      <b>{t.vendor}</b> · {t.pack} · {formatInr(t.amount_inr)} · <span className="font-mono">{t.id.slice(0, 8).toUpperCase()}</span>
                    </span>
                    <input name="reference" required className="input w-40 py-1" placeholder="Bank ref" />
                    <button className="btn btn-sm">Mark paid</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-muted)]">None.</p>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Payment methods</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)] text-sm">
            {gateways.map((g) => (
              <li key={g.gateway} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {g.gateway} {g.configured ? null : <Badge tone="warn">keys missing</Badge>}
                </span>
                {admin ? (
                  <form action={opsToggleGateway}>
                    <input type="hidden" name="gateway" value={g.gateway} />
                    <input type="hidden" name="enabled" value={g.enabled ? '0' : '1'} />
                    <button className={`btn btn-sm ${g.enabled ? '' : 'btn-ghost'}`}>{g.enabled ? 'On' : 'Off'}</button>
                  </form>
                ) : (
                  <Badge tone={g.enabled ? 'ok' : 'plain'}>{g.enabled ? 'on' : 'off'}</Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="hint mt-2">When a method is off, vendors see it as temporarily unavailable.</p>
        </Card>
        <Card className="overflow-x-auto">
          <h2 className="font-semibold">Recent orders</h2>
          <table className="data mt-2">
            <tbody>
              {recent.map((o) => (
                <tr key={o.id}>
                  <td>{o.created_at.toISOString().slice(0, 10)}</td>
                  <td>{o.vendor}</td>
                  <td>{o.pack}</td>
                  <td>{formatInr(o.amount_inr)}</td>
                  <td>{o.gateway}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {admin ? (
        <Card className="mt-5 overflow-x-auto">
          <h2 className="font-semibold">Packs</h2>
          <p className="hint">
            Prices include GST and apply to new purchases only. Pro, Phoenix and Privy prices here are also the prices the sales
            site shows and charges; it picks up a change within a few minutes.
          </p>
          <div className="mt-2 space-y-2">
            {packs.map((p) => (
              <form key={p.id} action={opsSavePack} className="grid items-center gap-2 sm:grid-cols-[1fr_90px_110px_100px_2fr_70px_auto]">
                <input type="hidden" name="pack_id" value={p.id} />
                <input name="name" className="input py-1" defaultValue={p.name} aria-label="Name" />
                <input name="credits" className="input py-1" defaultValue={p.credits} aria-label="Credits" />
                <input name="price_inr" className="input py-1" defaultValue={p.price_inr} aria-label="Price ₹" />
                <input name="validity_days" className="input py-1" defaultValue={p.validity_days ?? ''} placeholder="days" aria-label="Validity days" />
                <input name="description" className="input py-1" defaultValue={p.description} aria-label="Description" />
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="active" defaultChecked={p.active} /> on
                </label>
                <button className="btn btn-ghost btn-sm">Save</button>
              </form>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
