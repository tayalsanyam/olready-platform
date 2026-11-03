import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { listStates } from '@/lib/locations';
import { opsSaveCity, opsSetPincodeTownAction } from '@/lib/actions/ops';
import { PlacePicker } from '@/components/PlacePicker';
import { Badge, Card, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Places' };
type P = { searchParams: Promise<Record<string, string | string[]>> };
const PER = 50;

/** Every town in India: search, launch, rename, switch off; and pincode corrections. */
export default async function Places({ searchParams }: P) {
  const q = await searchParams;
  const me = await requireRole(['ops', 'admin']);
  const admin = me.role === 'admin';
  const text = (sp(q.q) ?? '').trim().slice(0, 60);
  const show = sp(q.show) === 'all' ? 'all' : sp(q.show) === 'used' ? 'used' : 'launched';
  const page = Math.max(1, Number(sp(q.page)) || 1);
  const like = `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await sql<{ id: number; slug: string; name: string; state_code: string; state: string; active: boolean; launched: boolean; live: number; leads: number; areas: number; pins: number; total: number }[]>`
    select c.id, c.slug, c.name, c.state_code, c.state, c.active, c.launched,
      (select count(*)::int from mkt.vendors v where v.city_id = c.id and v.status = 'live') as live,
      (select count(*)::int from mkt.leads l where l.city_id = c.id) as leads,
      (select count(*)::int from mkt.localities l where l.city_id = c.id and l.active) as areas,
      (select count(*)::int from mkt.pincodes p where p.city_id = c.id) as pins,
      count(*) over ()::int as total
    from mkt.cities c
    where (${text} = '' or lower(c.name) like ${like} or lower(c.state) like ${like} or exists (select 1 from unnest(c.aliases) a where lower(a) like ${like}))
      and (${show} = 'all' or (${show} = 'launched' and c.launched)
        or (${show} = 'used' and (exists (select 1 from mkt.vendors v where v.city_id = c.id) or exists (select 1 from mkt.leads l where l.city_id = c.id))))
    order by c.launched desc, c.sort, c.name limit ${PER} offset ${(page - 1) * PER}`;
  const total = rows[0]?.total ?? 0;
  const [counts] = await sql<{ towns: number; launched: number; pins: number; areas: number }[]>`
    select (select count(*)::int from mkt.cities where active) as towns, (select count(*)::int from mkt.cities where launched) as launched,
      (select count(*)::int from mkt.pincodes) as pins, (select count(*)::int from mkt.localities where active) as areas`;
  const states = await listStates(sql);
  const link = (o: Record<string, string | number | null>) => {
    const u = new URLSearchParams();
    const m = { q: text, show, page: 1, ...o };
    if (m.q) u.set('q', String(m.q));
    if (m.show !== 'launched') u.set('show', String(m.show));
    if (Number(m.page) > 1) u.set('page', String(m.page));
    return `/ops/places${u.toString() ? `?${u}` : ''}`;
  };
  const self = link({ page });
  return (
    <>
      <PageTitle
        title="Places"
        sub={`${counts.towns} towns (${counts.launched} launched), ${counts.areas.toLocaleString('en-IN')} areas, ${counts.pins.toLocaleString('en-IN')} pincodes. Launched towns show in menus and on the home page; every town works in forms and search.`}
      />
      <Notice error={q.error} ok={q.ok} />
      <Card>
        <form className="flex flex-wrap items-end gap-2" action="/ops/places">
          <label className="grow">
            <span className="label">Find a town</span>
            <input name="q" defaultValue={text} className="input" placeholder="Town, old name or state" />
          </label>
          <select name="show" defaultValue={show} className="input w-auto" aria-label="Show">
            <option value="launched">Launched</option>
            <option value="used">With vendors or requests</option>
            <option value="all">All towns</option>
          </select>
          <button className="btn btn-sm">Search</button>
        </form>
        <p className="mt-3 text-sm text-[var(--color-muted)]">{total} towns</p>
        <ul className="mt-2 divide-y divide-[var(--color-line)]">
          {rows.map((c) => (
            <li key={c.id} className="py-2">
              {admin ? (
                <form action={opsSaveCity} className="grid items-center gap-2 sm:grid-cols-[1fr_200px_auto_auto_auto]">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="_back" value={self} />
                  <input name="name" defaultValue={c.name} className="input py-1" aria-label="Town" />
                  <select name="state_code" defaultValue={c.state_code} className="input py-1" aria-label={`State for ${c.name}`}>
                    {states.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="launched" defaultChecked={c.launched} className="h-4 w-4 accent-[var(--color-pink)]" /> Launched
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="active" defaultChecked={c.active} className="h-4 w-4 accent-[var(--color-pink)]" /> On
                  </label>
                  <button className="btn btn-ghost btn-sm">Save</button>
                </form>
              ) : (
                <p className="font-medium">
                  {c.name}, {c.state} {c.launched ? <Badge tone="ok">launched</Badge> : null}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {c.live} live vendors · {c.leads} requests · {c.pins} pincodes ·{' '}
                <Link href={`/ops/places/${c.id}`} className="underline">
                  {c.areas} areas
                </Link>{' '}
                ·{' '}
                <Link href={`/vendors/${c.slug}`} className="underline">
                  page
                </Link>
              </p>
            </li>
          ))}
        </ul>
        {total > PER ? (
          <nav className="mt-3 flex gap-3 text-sm" aria-label="Pages">
            {page > 1 ? <Link href={link({ page: page - 1 })}>Previous</Link> : null}
            <span>
              Page {page} of {Math.ceil(total / PER)}
            </span>
            {page * PER < total ? <Link href={link({ page: page + 1 })}>Next</Link> : null}
          </nav>
        ) : null}
      </Card>
      {admin ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="font-semibold">Add a town</h2>
            <p className="hint">Only for a town that is not a district of its own, like Zirakpur. Map its pincodes to it below.</p>
            <form action={opsSaveCity} className="mt-3 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
              <input type="hidden" name="_back" value={self} />
              <input name="name" required className="input" placeholder="Town name" aria-label="New town" />
              <select name="state_code" defaultValue="03" className="input" aria-label="State">
                {states.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm">Add town</button>
            </form>
          </Card>
          <Card>
            <h2 className="font-semibold">Move a pincode to another town</h2>
            <p className="hint">For a pincode the India Post directory files under the wrong district. Reloads of the directory keep your choice.</p>
            <form action={opsSetPincodeTownAction} className="mt-3 space-y-2">
              <input type="hidden" name="_back" value={self} />
              <input name="pincode" required pattern="[1-9][0-9]{5}" inputMode="numeric" className="input" placeholder="Pincode" aria-label="Pincode to move" />
              <PlacePicker required label="Belongs to town" />
              <button className="btn btn-sm">Move pincode</button>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
