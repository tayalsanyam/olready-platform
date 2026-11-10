import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { listCategories } from '@/lib/catalog';
import { opsSaveCategory } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Categories' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Catalog({ searchParams }: P) {
  const q = await searchParams;
  await requireAdmin();
  const cats = await listCategories(sql);
  const counts = await sql<{ category_id: number; live: number }[]>`
    select category_id, count(*) filter (where status = 'live')::int as live from mkt.vendors group by category_id`;
  return (
    <>
      <PageTitle title="Categories" sub="Turn categories on in waves. Credit cost and unlock cap are per category; changes apply to new leads." />
      <Notice error={q.error} ok={q.ok} />
      <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
        <table className="data stack">
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
        <h2 id="cities" className="scroll-mt-24 font-semibold">Towns, areas and pincodes</h2>
        <p className="hint">Every district in India is a town. Launch towns, add areas and fix pincodes in Places.</p>
        <Link href="/ops/places" className="btn btn-ghost btn-sm mt-3">
          Open Places
        </Link>
      </Card>
    </>
  );
}
