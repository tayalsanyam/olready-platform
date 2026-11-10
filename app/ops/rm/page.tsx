import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { caseload, rmQueue, rmStaff } from '@/lib/rm';
import { opsApproveRm, opsReassignRm, opsRejectRm } from '@/lib/actions/ops';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';
import { fmtDate, fmtDay, plural } from '@/lib/dates';

export const metadata = { title: 'Relationship managers' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d) : '–');

export default async function RmDesk({ searchParams }: P) {
  const q = await searchParams;
  const me = await requireRole(['rm', 'ops', 'admin']);
  if (me.role === 'rm') {
    const mine = await caseload(sql, me.id);
    return (
      <>
        <PageTitle title="My brides" sub="Brides assigned to you. You can read their vendor conversations while assigned." />
        <Notice error={q.error} ok={q.ok} />
        {mine.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {mine.map((e) => (
              <li key={e.id}>
                <Link href={`/ops/rm/${e.id}`} className="card block p-4 hover:shadow-md">
                  <b>{e.bride_name}</b>
                  <div className="hint">
                    {e.wedding_title ?? 'No wedding set up'} · wedding {fmtDate(e.wedding_date, 'not fixed')} · until {fmt(e.ends_at)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No brides assigned to you yet" />
        )}
      </>
    );
  }
  const [queue, staff] = await Promise.all([rmQueue(sql), rmStaff(sql)]);
  const pick = (name: string) => (
    <select name={name} className="input py-1" aria-label="Relationship manager" required>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.full_name} ({s.role}, {s.active} active)
        </option>
      ))}
    </select>
  );
  return (
    <>
      <PageTitle title="Relationship managers" sub="Paid requests arrive after payment. Booking perks arrive directly. Assign an RM to start the clock." />
      <Notice error={q.error} ok={q.ok} />
      {queue.length ? (
        <ul className="space-y-3">
          {queue.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/ops/rm/${e.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {e.bride_name}
                    </Link>
                    <div className="hint">
                      {e.bride_email} · {e.wedding_title ?? 'no wedding yet'} · wedding {fmtDate(e.wedding_date, 'not fixed')}
                    </div>
                  </div>
                  <span className="flex gap-1">
                    <Badge tone={e.source === 'paid' ? 'gold' : 'plain'}>{e.source === 'paid' ? 'paid' : 'booking perk'}</Badge>
                    <Badge tone={e.status === 'active' ? 'ok' : 'warn'}>{e.status.replace('_', ' ')}</Badge>
                  </span>
                </div>
                {e.status === 'pending_approval' ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <form action={opsApproveRm} className="flex gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      {pick('rm_profile_id')}
                      <button className="btn btn-sm">Assign</button>
                    </form>
                    <form action={opsRejectRm} className="flex gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <input name="note" required className="input py-1" placeholder="Why, and is a refund due?" />
                      <button className="btn btn-ghost btn-sm">Decline</button>
                    </form>
                  </div>
                ) : (
                  <form action={opsReassignRm} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      With <b>{e.rm_name}</b> until {fmt(e.ends_at)}
                    </span>
                    <input type="hidden" name="id" value={e.id} />
                    {pick('rm_profile_id')}
                    <button className="btn btn-ghost btn-sm">Reassign</button>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No relationship-manager requests" />
      )}
    </>
  );
}
