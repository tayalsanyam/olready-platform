import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { allClasses, classFee, classWhen } from '@/lib/classes';
import { opsSetClass } from '@/lib/actions/classes';
import { Badge, Empty, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Classes' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function OpsClasses({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin', 'content'], '/ops/classes');
  const list = await allClasses(sql);
  const now = Date.now();
  return (
    <>
      <PageTitle title="Classes" sub="Classes artists have listed. They go live at once; hide one that should not be on the site. Seat requests also land in Leads > Numbers to call." />
      <Notice error={q.error} ok={q.ok} />
      {list.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-muted)]">
                {['Class', 'Artist', 'When', 'Fee', 'Seats asked', 'Status', ''].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const past = c.starts_at.getTime() < now;
                return (
                  <tr key={c.id} className="border-t border-[var(--color-line)]">
                    <td className="px-3 py-2 font-medium">{c.status === 'hidden' ? c.title : <Link href={`/classes/${c.id}`}>{c.title}</Link>}</td>
                    <td className="px-3 py-2">
                      <Link href={`/ops/vendors/${c.vendor_id}`} className="underline">
                        {c.vendor}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{classWhen(c.starts_at)}</td>
                    <td className="px-3 py-2">{classFee(c.fee_inr)}</td>
                    <td className="px-3 py-2">
                      {c.taken} of {c.seats}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={c.status === 'live' && !past ? 'ok' : 'plain'}>{c.status === 'live' ? (past ? 'Finished' : 'On the site') : c.status === 'hidden' ? 'Hidden' : 'Cancelled by artist'}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.status !== 'cancelled' && !past ? (
                        <form action={opsSetClass}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="status" value={c.status === 'live' ? 'hidden' : 'live'} />
                          <button className="btn btn-ghost btn-sm">{c.status === 'live' ? 'Hide' : 'Put back'}</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No classes listed yet">Makeup and mehendi artists list classes from their dashboard, under Classes.</Empty>
      )}
    </>
  );
}
