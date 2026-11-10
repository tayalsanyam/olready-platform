import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getCity } from '@/lib/catalog';
import { opsSaveLocalityAction } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Areas' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };
const KINDS = ['sector', 'phase', 'area', 'road', 'village'];
const PER = 60;

/** A town's areas (sectors, phases, colonies, roads) and its pincodes. */
export default async function TownAreas({ params, searchParams }: P) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  await requireRole(['ops', 'admin']);
  const town = await getCity(sql, Number(id));
  if (!town) notFound();
  const text = (sp(q.q) ?? '').trim().slice(0, 60);
  const page = Math.max(1, Number(sp(q.page)) || 1);
  const like = `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const areas = await sql<{ id: number; name: string; kind: string; pincode: string | null; active: boolean; source: string; vendors: number; total: number }[]>`
    select l.id, l.name, l.kind, l.pincode, l.active, l.source,
      (select count(*)::int from mkt.vendors v where v.locality_id = l.id and v.status = 'live') as vendors, count(*) over ()::int as total
    from mkt.localities l where l.city_id = ${town.id} and (${text} = '' or lower(l.name) like ${like} or l.pincode like ${like})
    order by l.source = 'curated' desc, l.sort, l.name limit ${PER} offset ${(page - 1) * PER}`;
  const total = areas[0]?.total ?? 0;
  const pins = await sql<{ pincode: string; offices: string[]; manual: boolean }[]>`
    select pincode, offices, manual from mkt.pincodes where city_id = ${town.id} order by pincode limit 400`;
  const self = `/ops/places/${town.id}${text ? `?q=${encodeURIComponent(text)}` : ''}`;
  return (
    <>
      <PageTitle title={`Areas in ${town.name}`} sub={`${town.state}${town.launched ? ' · launched' : ''}`} action={<Link href="/ops/places" className="btn btn-ghost btn-sm">All towns</Link>} />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card>
          <form className="flex gap-2" action={`/ops/places/${town.id}`}>
            <input name="q" defaultValue={text} className="input" placeholder="Find an area or pincode" aria-label="Find an area" />
            <button className="btn btn-sm">Search</button>
          </form>
          <p className="mt-3 text-sm text-[var(--color-muted)]">{total} areas. Areas from post offices are a starting point; switch off any that are not real neighbourhoods.</p>
          <ul className="mt-2 divide-y divide-[var(--color-line)]">
            {areas.map((a) => (
              <li key={a.id} className="py-2">
                <form action={opsSaveLocalityAction} className="grid items-center gap-2 sm:grid-cols-[1fr_110px_100px_auto_auto]">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="city_id" value={town.id} />
                  <input name="name" defaultValue={a.name} className="input py-1" aria-label="Area" />
                  <select name="kind" defaultValue={a.kind} className="input py-1" aria-label={`Kind of ${a.name}`}>
                    {KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                  <input name="pincode" defaultValue={a.pincode ?? ''} className="input py-1" inputMode="numeric" aria-label={`Pincode of ${a.name}`} />
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="active" defaultChecked={a.active} className="h-4 w-4 accent-[var(--color-pink)]" /> On
                  </label>
                  <button className="btn btn-ghost btn-sm">Save</button>
                </form>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {a.vendors} live vendors {a.source !== 'curated' ? <Badge>{a.source.replace('_', ' ')}</Badge> : null}
                </p>
              </li>
            ))}
          </ul>
          {total > PER ? (
            <nav className="mt-3 flex gap-3 text-sm" aria-label="Pages">
              {page > 1 ? <Link href={`${self}${self.includes('?') ? '&' : '?'}page=${page - 1}`}>Previous</Link> : null}
              <span>
                Page {page} of {Math.ceil(total / PER)}
              </span>
              {page * PER < total ? <Link href={`${self}${self.includes('?') ? '&' : '?'}page=${page + 1}`}>Next</Link> : null}
            </nav>
          ) : null}
          <form action={opsSaveLocalityAction} className="mt-4 grid gap-2 border-t border-[var(--color-line)] pt-3 sm:grid-cols-[1fr_110px_100px_auto]">
            <input type="hidden" name="city_id" value={town.id} />
            <input name="name" required className="input py-1" placeholder="Add an area, e.g. VIP Road" aria-label="New area" />
            <select name="kind" defaultValue="area" className="input py-1" aria-label="Kind">
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <input name="pincode" className="input py-1" inputMode="numeric" placeholder="Pincode" aria-label="Pincode" />
            <button className="btn btn-sm">Add area</button>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">Pincodes in {town.name}</h2>
          <p className="hint">From the India Post directory. Move a wrong one on the Places page.</p>
          <ul tabIndex={0} aria-label="Pincodes, scrolls" className="mt-2 max-h-[32rem] space-y-1 overflow-auto text-sm">
            {pins.map((p) => (
              <li key={p.pincode}>
                <span className="font-medium">{p.pincode}</span> <span className="text-[var(--color-muted)]">{p.offices.slice(0, 4).join(', ')}</span>
                {p.manual ? <Badge>set by Ops</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
