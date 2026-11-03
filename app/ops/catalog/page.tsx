import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { listCategories } from '@/lib/catalog';
import { opsSaveCategory, opsSaveCity } from '@/lib/actions/ops';
import { STATE_CODES } from '@/lib/gst';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Categories' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Catalog({ searchParams }: P) {
  const q = await searchParams;
  await requireAdmin();
  const cats = await listCategories(sql);
  const counts = await sql<{ category_id: number; live: number }[]>`
    select category_id, count(*) filter (where status = 'live')::int as live from mkt.vendors group by category_id`;
  const cities = await sql<{ id: number; slug: string; name: string; state: string; active: boolean; sort: number; live: number; leads: number }[]>`
    select ci.*, (select count(*)::int from mkt.vendors v where v.city_id = ci.id and v.status = 'live') as live,
           (select count(*)::int from mkt.leads l where l.city_id = ci.id) as leads
    from mkt.cities ci order by ci.sort, ci.name`;
  const states = [...new Set(Object.values(STATE_CODES))].sort();
  return (
    <>
      <PageTitle title="Categories" sub="Turn categories on in waves. Credit cost and unlock cap are per category; changes apply to new leads." />
      <Notice error={q.error} ok={q.ok} />
      <Card className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Category</th>
              <th>Wave</th>
              <th>Credits per unlock</th>
              <th>Unlock cap</th>
              <th>Live vendors</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="font-semibold underline-offset-4 hover:underline" href={`/ops/catalog/${c.id}`}>
                    {c.plural_name}
                  </Link>
                </td>
                <td>{c.wave}</td>
                <td>{c.unlock_credit_cost}</td>
                <td>{c.unlock_cap}</td>
                <td>{counts.find((x) => x.category_id === c.id)?.live ?? 0}</td>
                <td>{c.active ? <Badge tone="ok">on</Badge> : <Badge>off</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="mt-5">
        <h2 className="font-semibold">New category</h2>
        <form action={opsSaveCategory} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_120px_120px_auto]">
          <input name="name" required className="input" placeholder="Name (e.g. Florist)" />
          <input name="plural_name" className="input" placeholder="Plural (e.g. Florists)" />
          <input name="unlock_credit_cost" className="input" placeholder="Credits" defaultValue={1} />
          <input name="unlock_cap" className="input" placeholder="Cap" defaultValue={10} />
          <button className="btn btn-sm">Create</button>
        </form>
      </Card>
      <Card className="mt-5">
        <h2 id="cities" className="scroll-mt-24 font-semibold">Cities and towns</h2>
        <p className="hint">Brides and vendors pick from these. Switched-off towns disappear from forms and pages; their data stays.</p>
        <ul className="mt-3 divide-y divide-[var(--color-line)]">
          {cities.map((c) => (
            <li key={c.id}>
              <form action={opsSaveCity} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_180px_70px_auto_auto]">
                <input type="hidden" name="id" value={c.id} />
                <input name="name" defaultValue={c.name} className="input py-1" aria-label="Town" />
                <select name="state" defaultValue={c.state} className="input py-1" aria-label={`State for ${c.name}`}>
                  {states.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input name="sort" defaultValue={c.sort} className="input py-1" aria-label={`Order for ${c.name}`} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={c.active} className="h-4 w-4 accent-[var(--color-pink)]" />
                  On
                  <span className="text-xs text-[var(--color-muted)]">
                    {c.live} vendors, {c.leads} requests
                  </span>
                </label>
                <button className="btn btn-ghost btn-sm">Save</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={opsSaveCity} className="mt-3 grid gap-2 border-t border-[var(--color-line)] pt-3 sm:grid-cols-[1fr_180px_auto]">
          <input name="name" required className="input" placeholder="New town (e.g. Kurali)" aria-label="New town" />
          <select name="state" defaultValue="Punjab" className="input" aria-label="State">
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn-sm">Add town</button>
        </form>
      </Card>
    </>
  );
}
