import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { plansBehind } from '@/lib/alerts';
import { fmtDate, plural } from '@/lib/dates';
import { Card, Empty, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plan usage', robots: { index: false } };

export default async function PlanUsage() {
  await requireRole(['admin', 'ops', 'rm'], '/ops/usage');
  const rows = await plansBehind(sql);
  return (
    <>
      <PageTitle
        title="Plans behind on usage"
        sub="Vendors who have used far fewer enquiries than the time gone on their plan. They are emailed a nudge on their own; a call from you works better."
      />
      {rows.length ? (
        <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <table className="data stack">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Plan</th>
                <th>Used</th>
                <th>Should be near</th>
                <th>Days left</th>
                <th>Open for them now</th>
                <th>Last unlocked</th>
                <th>Call</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sub_id}>
                  <td>
                    <Link href={`/ops/vendors/${r.vendor_id}`} className="font-medium underline">
                      {r.business}
                    </Link>
                  </td>
                  <td>{r.plan}</td>
                  <td>
                    {r.used} of {r.credits}
                  </td>
                  <td>{r.expected}</td>
                  <td>{r.days_left}</td>
                  <td>{plural(r.open_leads, 'request')}</td>
                  <td>{fmtDate(r.last_unlock, 'never')}</td>
                  <td>{r.phone ? <a href={`tel:${r.phone}`} className="underline">{r.phone}</a> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty title="Every active plan is on pace">Nobody needs a call right now.</Empty>
      )}
    </>
  );
}
