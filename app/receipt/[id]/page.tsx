import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { formatInr } from '@/lib/catalog';
import { seller, taxDocuments } from '@/lib/invoices';
import { Card, Container } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment receipt', robots: { index: false } };

type P = { params: Promise<{ id: string }> };

/** A transaction receipt confirming payment, with links to the tax invoice and any credit notes. */
export default async function Receipt({ params }: P) {
  const { id } = await params;
  const profile = await requireProfile(`/receipt/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [o] = await sql<{ id: string; amount_inr: number; gateway: string; gateway_payment_id: string | null; paid_at: Date; buyer_gstin: string | null; product: string; billed_to: string }[]>`
    select o.id, o.amount_inr, o.gateway, o.gateway_payment_id, o.paid_at, o.buyer_gstin,
      coalesce(p.name, s.name, case when o.wallet_topup_inr is not null then 'Ads wallet top-up' end) as product, coalesce(v.business_name, pr.full_name) as billed_to
    from mkt.orders o
    left join mkt.packs p on p.id = o.pack_id
    left join mkt.services s on s.code = o.service_code
    left join mkt.vendors v on v.id = o.vendor_id
    join mkt.profiles pr on pr.id = o.profile_id
    where o.id = ${id} and o.profile_id = ${profile.id} and o.status in ('paid', 'refunded')`;
  if (!o) notFound();
  const docs = await taxDocuments(sql, o.id);
  const s = seller();
  return (
    <Container className="max-w-xl">
      <Card className="space-y-4 p-6">
        <div className="flex justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Payment receipt</h1>
            <p className="hint">Receipt no. {o.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right text-sm">
            <b>{s.name}</b>
            <div>{s.address}</div>
            {s.gstin ? <div>GSTIN {s.gstin}</div> : null}
          </div>
        </div>
        <div className="text-sm">
          <div>Billed to: {o.billed_to}</div>
          {o.buyer_gstin ? <div>GSTIN {o.buyer_gstin}</div> : null}
          <div>Paid on: {o.paid_at.toISOString().slice(0, 10)}</div>
          <div>
            Method: {o.gateway}
            {o.gateway_payment_id ? ` · ref ${o.gateway_payment_id}` : ''}
          </div>
        </div>
        <table className="data">
          <tbody>
            <tr>
              <td>OLReady {o.product}</td>
              <td className="text-right">{formatInr(o.amount_inr)}</td>
            </tr>
            <tr>
              <td className="font-semibold">Total (GST included)</td>
              <td className="text-right font-semibold">{formatInr(o.amount_inr)}</td>
            </tr>
          </tbody>
        </table>
        {docs.length ? (
          <div className="flex flex-wrap gap-2">
            {docs.map((d) => (
              <a key={d.id} href={`/invoices/${d.id}`} target="_blank" rel="noreferrer" className={`btn btn-sm ${d.kind === 'invoice' ? '' : 'btn-ghost'}`}>
                {d.kind === 'invoice' ? 'Tax invoice' : 'Credit note'} {d.number} (PDF)
              </a>
            ))}
          </div>
        ) : null}
        <p className="hint">This receipt confirms your payment. The tax invoice above is your GST document.</p>
      </Card>
    </Container>
  );
}
