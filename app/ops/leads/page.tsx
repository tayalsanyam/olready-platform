import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { listCategories, citiesInUse } from '@/lib/catalog';
import { opsCreateLead } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Leads' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const STATUSES = ['new', 'verifying', 'verified', 'rejected', 'fake'] as const;

export default async function OpsLeads({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  const status = STATUSES.find((s) => s === sp(q.status)) ?? null;
  const rows = await sql<{ id: string; bride_name: string; city: string; event_date: string | null; source: string; status: string; stage: number; cats: string; created_at: Date }[]>`
    select l.id, l.bride_name, ci.name as city, to_char(l.event_date, 'YYYY-MM-DD') as event_date, l.source, l.status,
      l.verification_stage as stage, l.created_at,
      coalesce((select string_agg(c.name, ', ' order by c.sort) from mkt.lead_needs ln join mkt.categories c on c.id = ln.category_id
        where ln.lead_id = l.id and ln.status <> 'removed'), '') as cats
    from mkt.leads l join mkt.cities ci on ci.id = l.city_id
    where ${status ? sql`l.status = ${status}` : sql`l.status in ('new','verifying')`}
    order by l.created_at ${status ? sql`desc` : sql`asc`} limit 200`;
  const [cats, cities] = await Promise.all([listCategories(sql, { activeOnly: true }), citiesInUse(sql)]);
  return (
    <>
      <PageTitle title="Leads" sub={status ? `Status: ${status}` : 'Waiting for verification, oldest first'} />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/ops/leads" className={`btn btn-sm ${status ? 'btn-ghost' : ''}`}>
          To verify
        </Link>
        {STATUSES.slice(2).map((s) => (
          <Link key={s} href={`/ops/leads?status=${s}`} className={`btn btn-sm ${status === s ? '' : 'btn-ghost'}`}>
            {s}
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Received</th>
              <th>Bride</th>
              <th>City</th>
              <th>Wedding</th>
              <th>Needs</th>
              <th>Source</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.created_at.toISOString().slice(0, 16).replace('T', ' ')}</td>
                <td>
                  <Link className="font-semibold underline-offset-4 hover:underline" href={`/ops/leads/${r.id}`}>
                    {r.bride_name}
                  </Link>
                </td>
                <td>{r.city}</td>
                <td>{r.event_date ?? '–'}</td>
                <td>{r.cats || '–'}</td>
                <td>{r.source}</td>
                <td>
                  <Badge tone={r.status === 'verified' ? 'ok' : r.status === 'new' ? 'warn' : 'plain'}>{r.status === 'verifying' ? `${r.stage}/3` : r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-4 text-sm text-[var(--color-muted)]">Nothing here.</p> : null}
      </Card>
      <details className="card mt-6 p-4">
        <summary className="cursor-pointer font-semibold">Add a lead by hand (Instagram, phone, walk-in)</summary>
        <form action={opsCreateLead} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input name="name" required className="input" placeholder="Bride name" />
          <input name="phone" required className="input" placeholder="Mobile" />
          <input name="email" className="input" placeholder="Email" />
          <select name="city_id" className="input" aria-label="City">
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="event_date" type="date" className="input" aria-label="Wedding date" />
          <select name="source" className="input" aria-label="Source">
            <option value="instagram">Instagram</option>
            <option value="ops">Phone or walk-in</option>
          </select>
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            {cats.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="category_id" value={c.id} /> {c.name}
              </label>
            ))}
          </div>
          <button className="btn btn-sm sm:col-span-3 sm:justify-self-start">Create lead</button>
        </form>
      </details>
    </>
  );
}
