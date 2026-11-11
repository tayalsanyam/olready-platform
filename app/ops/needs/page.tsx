import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { opsReopen } from '@/lib/actions/ops';
import { Card, Empty, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Capped leads' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function CappedNeeds({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  const rows = await sql<{ id: string; lead_id: string; bride_name: string; category: string; unlock_cap: number; reopen_rounds: number; threads: number; quoted: number }[]>`
    select ln.id, l.id as lead_id, l.bride_name, c.name as category, ln.unlock_cap, ln.reopen_rounds,
      (select count(*) from mkt.threads t where t.lead_need_id = ln.id)::int as threads,
      (select count(*) from mkt.threads t where t.lead_need_id = ln.id and t.status in ('quoted','quote_accepted'))::int as quoted
    from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id
    where ln.status = 'capped' order by ln.created_at`;
  return (
    <>
      <PageTitle title="Capped leads" sub="Each lead hit its unlock limit. Reopen only if the bride still wants more options (up to 2 extra rounds of 10)." />
      <Notice error={q.error} ok={q.ok} />
      {rows.length ? (
        <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <table className="data stack">
            <thead>
              <tr>
                <th>Bride</th>
                <th>Category</th>
                <th>Cap</th>
                <th>Quotes sent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="underline" href={`/ops/leads/${r.lead_id}`}>
                      {r.bride_name}
                    </Link>
                  </td>
                  <td>{r.category}</td>
                  <td>
                    {r.unlock_cap} · reopened {r.reopen_rounds}×
                  </td>
                  <td>
                    {r.quoted} of {r.threads}
                  </td>
                  <td>
                    {r.reopen_rounds < 2 ? (
                      <form action={opsReopen}>
                        <input type="hidden" name="need_id" value={r.id} />
                        <input type="hidden" name="_back" value="/ops/needs" />
                        <button className="btn btn-sm">Reopen +10</button>
                      </form>
                    ) : (
                      <span className="hint">No rounds left</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty art="list" title="No capped leads" />
      )}
    </>
  );
}
