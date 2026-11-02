import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { formatInr } from '@/lib/catalog';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment receipt', robots: { index: false } };

type P = { params: Promise<{ id: string }> };

/** A transaction receipt confirming payment. The tax invoice is issued separately from Zoho. */
export default async function Receipt({ params }: P) {
  const { id } = await params;
  const { profile, vendor } = await requireVendor();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [o] = await sql<{ id: string; amount_inr: number; gateway: string; gateway_payment_id: string | null; paid_at: Date; buyer_gstin: string | null; pack: string }[]>`
    select o.id, o.amount_inr, o.gateway, o.gateway_payment_id, o.paid_at, o.buyer_gstin, p.name as pack
    from mkt.orders o join mkt.packs p on p.id = o.pack_id
    where o.id = ${id} and o.profile_id = ${profile.id} and o.status = 'paid'`;
  if (!o) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <Card className="space-y-4 p-6">
        <div className="flex justify-between">
          <div>
            <h1 className="text-xl font-semibold">Payment receipt</h1>
            <p className="hint">Receipt no. {o.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right text-sm">
            <b>{process.env.SELLER_NAME ?? 'Katalyst Infomedia'}</b>
            <div>{process.env.SELLER_ADDRESS ?? 'Chandigarh'}</div>
            {process.env.SELLER_GSTIN ? <div>GSTIN {process.env.SELLER_GSTIN}</div> : null}
          </div>
        </div>
        <div className="text-sm">
          <div>Billed to: {vendor.business_name}</div>
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
              <td>OLReady {o.pack}</td>
              <td className="text-right">{formatInr(o.amount_inr)}</td>
            </tr>
            <tr>
              <td className="font-semibold">Total (GST included)</td>
              <td className="text-right font-semibold">{formatInr(o.amount_inr)}</td>
            </tr>
          </tbody>
        </table>
        <p className="hint">This receipt confirms your payment. Your tax invoice is issued separately with your service contract.</p>
      </Card>
    </div>
  );
}
