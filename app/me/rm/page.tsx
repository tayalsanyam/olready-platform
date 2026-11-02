import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { formatInr } from '@/lib/catalog';
import { gatewayStates } from '@/lib/payments';
import { currentEngagement, rmService } from '@/lib/rm';
import { buyRmAction } from '@/lib/actions/bride';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Relationship manager', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

const gatewayLabel: Record<string, string> = { razorpay: 'Razorpay (UPI, cards)', payu: 'PayU', manual: 'Bank transfer', test: 'Test payment (dev only)' };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d) : '');

export default async function RelationshipManager({ searchParams }: P) {
  const q = await searchParams;
  const p = await requireProfile('/me/rm');
  const [svc, e, gateways] = await Promise.all([rmService(sql), currentEngagement(sql, p.id), gatewayStates(sql)]);
  const usable = gateways.filter((g) => g.enabled && g.configured);
  return (
    <>
      <PageTitle title="Relationship manager" sub="A person from the OLReady team who plans with you, shortlists vendors and handles the follow-ups." />
      <Notice error={q.error} ok={q.ok} />
      {e ? (
        <Card className="max-w-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{e.source === 'perk' ? 'Your booking perk' : svc?.name}</h2>
            <Badge tone={e.status === 'active' ? 'ok' : 'warn'}>{e.status.replace('_', ' ')}</Badge>
          </div>
          {e.status === 'pending_payment' ? (
            <p className="mt-2 text-sm">
              Waiting for payment.{' '}
              {e.order_id ? (
                <Link className="underline" href={`/pay/${e.order_id}`}>
                  Complete payment
                </Link>
              ) : null}
            </p>
          ) : e.status === 'pending_approval' ? (
            <p className="mt-2 text-sm">We have your request. Our team assigns your relationship manager within one working day.</p>
          ) : (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                <b>{e.rm_name}</b> is your relationship manager until {fmt(e.ends_at)}.
              </p>
              {e.rm_phone ? (
                <p>
                  Call or WhatsApp:{' '}
                  <a className="underline" href={`tel:${e.rm_phone}`}>
                    {e.rm_phone}
                  </a>
                </p>
              ) : null}
              {e.rm_email ? (
                <p>
                  Email:{' '}
                  <a className="underline" href={`mailto:${e.rm_email}`}>
                    {e.rm_email}
                  </a>
                </p>
              ) : null}
              <p className="hint">Your RM can see your requests and vendor conversations while assigned, to help you compare quotes.</p>
            </div>
          )}
        </Card>
      ) : svc?.active ? (
        <Card className="max-w-xl">
          <h2 className="font-semibold">{svc.name}</h2>
          <p className="mt-1 text-2xl font-semibold">{formatInr(svc.price_inr)}</p>
          <p className="hint">GST included · {svc.length_days} days or until your wedding, whichever comes first</p>
          <p className="mt-2 text-sm">{svc.description}</p>
          {usable.length ? (
            <form action={buyRmAction} className="mt-3 space-y-2">
              <select name="gateway" className="input" aria-label="Payment method">
                {usable.map((g) => (
                  <option key={g.gateway} value={g.gateway}>
                    {gatewayLabel[g.gateway]}
                  </option>
                ))}
              </select>
              <button className="btn btn-pink w-full">Get a relationship manager</button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-warn)]">Payments are temporarily unavailable.</p>
          )}
          <p className="hint mt-2">You pay first; our team then confirms and assigns your RM. If we cannot take you on, we refund you.</p>
        </Card>
      ) : (
        <Card className="max-w-xl">
          <p className="text-sm">The relationship-manager service is not open right now.</p>
        </Card>
      )}
    </>
  );
}
