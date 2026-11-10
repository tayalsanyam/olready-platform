import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatInr, listCategories, citiesInUse } from '@/lib/catalog';
import { dataset, runDataset, type Column, type Filters } from '@/lib/opsData';
import { Empty, PageTitle, sp } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate } from '@/lib/dates';

type P = { params: Promise<{ set: string }>; searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params }: P) {
  const d = dataset((await params).set);
  return { title: d?.label ?? 'Data' };
}

const SIZE = 50;

function show(c: Column, v: unknown) {
  if (v == null || v === '') return <span className="text-[var(--color-muted)]">–</span>;
  if (c.kind === 'bool') return v ? 'Yes' : 'No';
  if (c.kind === 'money') return formatInr(Number(v));
  if (c.kind === 'number') return Number(v).toLocaleString('en-IN');
  if (c.kind === 'date' || v instanceof Date) {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : fmtDate(d);
  }
  // Stored codes ("closed_booked", "vendor_new_lead") read as words.
  const s = /^[a-z]+(_[a-z0-9]+)+$/.test(String(v)) ? String(v).replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase()) : String(v);
  return s.length > 80 ? <span title={s}>{s.slice(0, 78)}…</span> : s;
}

export default async function OpsDataSet({ params, searchParams }: P) {
  const { set } = await params;
  const d = dataset(set);
  if (!d) notFound();
  const me = await requireRole(['ops', 'admin'], `/ops/data/${set}`);
  const q = await searchParams;
  const f: Filters = {
    q: sp(q.q),
    status: sp(q.status),
    city: sp(q.city),
    category: sp(q.category),
    from: sp(q.from),
    to: sp(q.to),
    sort: sp(q.sort),
    dir: sp(q.dir) === 'asc' ? 'asc' : 'desc',
  };
  const page = Math.max(1, Number(sp(q.page)) || 1);
  const [{ rows, total }, cities, cats] = await Promise.all([
    runDataset(sql, d, f, page, SIZE),
    d.cityCol ? citiesInUse(sql) : Promise.resolve([]),
    d.categoryCol ? listCategories(sql) : Promise.resolve([]),
  ]);
  const base = Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>;
  const href = (over: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams({ ...base, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) });
    for (const [k, v] of Object.entries(over)) if (v == null) u.delete(k);
    const s = u.toString();
    return `/ops/data/${d.key}${s ? `?${s}` : ''}`;
  };
  const exportHref = `/ops/export?${new URLSearchParams({ set: d.key, ...Object.fromEntries(Object.entries(base).filter(([k]) => !['sort', 'dir'].includes(k))) })}`;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/ops/data" className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
          Data
        </Link>
      </p>
      <PageTitle
        title={d.label}
        sub={`${total.toLocaleString('en-IN')} ${total === 1 ? 'row' : 'rows'}. ${d.blurb}`}
        action={
          me.role === 'admin' ? (
            <a href={exportHref} className="btn btn-ghost btn-sm">
              Download CSV
            </a>
          ) : undefined
        }
      />
      <form className="mb-4 grid gap-2 rounded-2xl border border-[var(--color-line)] bg-white p-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        {d.search.length ? (
          <label className="lg:min-w-64 lg:flex-1">
            <span className="text-xs text-[var(--color-muted)]">Search</span>
            <input name="q" defaultValue={f.q} className="input" placeholder="Name, phone, email…" />
          </label>
        ) : null}
        {d.statuses ? (
          <label>
            <span className="text-xs text-[var(--color-muted)]">{d.statusCol?.endsWith('reason') ? 'Reason' : 'Status'}</span>
            <select name="status" defaultValue={f.status ?? ''} className="input">
              <option value="">All</option>
              {d.statuses.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {cities.length ? (
          <label>
            <span className="text-xs text-[var(--color-muted)]">City</span>
            <select name="city" defaultValue={f.city ?? ''} className="input">
              <option value="">All</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {cats.length ? (
          <label>
            <span className="text-xs text-[var(--color-muted)]">Category</span>
            <select name="category" defaultValue={f.category ?? ''} className="input">
              <option value="">All</option>
              {cats.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.plural_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span className="text-xs text-[var(--color-muted)]">From</span>
          <input type="date" name="from" defaultValue={f.from} className="input" />
        </label>
        <label>
          <span className="text-xs text-[var(--color-muted)]">To</span>
          <input type="date" name="to" defaultValue={f.to} className="input" />
        </label>
        {f.sort ? <input type="hidden" name="sort" value={f.sort} /> : null}
        {f.sort ? <input type="hidden" name="dir" value={f.dir} /> : null}
        <div className="flex gap-2">
          <button className="btn btn-sm">Apply</button>
          <Link href={`/ops/data/${d.key}`} className="btn btn-ghost btn-sm">
            Clear
          </Link>
        </div>
      </form>
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-white" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--color-tint)] text-xs text-[var(--color-muted)]">
              <tr>
                {d.columns.map((c) => {
                  const active = f.sort === c.key;
                  const next = active && f.dir === 'desc' ? 'asc' : 'desc';
                  return (
                    <th key={c.key} className={`px-3 py-2 font-semibold ${c.kind === 'money' || c.kind === 'number' ? 'text-right' : ''}`} aria-sort={active ? (f.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <Link href={href({ sort: c.key, dir: next, page: undefined })} className="hover:text-[var(--color-ink)]">
                        {c.label}
                        {active ? (f.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {rows.map((r, i) => {
                const link = d.link?.(r) ?? null;
                return (
                  <tr key={String(r.id ?? i)} className="align-top hover:bg-[var(--color-tint)]">
                    {d.columns.map((c, j) => (
                      <td key={c.key} className={`px-3 py-2 ${c.kind === 'money' || c.kind === 'number' ? 'text-right tabular-nums' : ''}`}>
                        {j === 0 && link ? (
                          <Link href={link} className="font-medium text-[var(--color-pink-deep)] hover:underline">
                            {show(c, r[c.key])}
                          </Link>
                        ) : (
                          show(c, r[c.key])
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Nothing matches">Change the filters or clear them to see every row.</Empty>
      )}
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="btn btn-ghost btn-sm">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--color-muted)]">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className="btn btn-ghost btn-sm">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
