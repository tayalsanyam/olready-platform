import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { allCollections, collectionById } from '@/lib/collections';
import { listCategories, citiesInUse } from '@/lib/catalog';
import { browseVendors } from '@/lib/vendors';
import { opsSaveCollection } from '@/lib/actions/content2';
import { Badge, Card, Field, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Collections' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Collections({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['content', 'ops', 'admin']);
  const id = sp(q.id);
  const editing = id && /^[0-9a-f-]{36}$/.test(id) ? await collectionById(sql, id) : null;
  const [list, cats, cities] = await Promise.all([allCollections(sql), listCategories(sql, { activeOnly: true }), citiesInUse(sql)]);
  const categoryId = Number(sp(q.category)) || editing?.category_id || cats[0]?.id;
  const cityId = Number(sp(q.city)) || editing?.city_id || cities[0]?.id;
  const vendors = categoryId ? await browseVendors(sql, { categoryId, cityId, sort: 'rating', limit: 100 }) : [];
  const chosen = new Set(editing?.vendor_ids ?? []);
  return (
    <>
      <PageTitle
        title="Collections"
        sub="Hand-picked lists such as “Farmhouses for small weddings in Mohali”. Each becomes its own page for search engines."
        action={
          <Link href="/ops/collections" className="btn btn-ghost btn-sm">
            New collection
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <Card className="p-0">
          <ul className="divide-y divide-[var(--color-line)]">
            {list.length ? (
              list.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <Link href={`/ops/collections?id=${c.id}`} className={`font-semibold hover:underline ${c.id === editing?.id ? 'text-[var(--color-pink-deep)]' : ''}`}>
                    {c.title}
                  </Link>
                  <span className="flex items-center gap-2">
                    <Badge tone={c.status === 'published' ? 'ok' : 'warn'}>{c.status}</Badge>
                    {c.status === 'published' ? (
                      <Link className="underline" href={`/collections/${c.slug}`} target="_blank">
                        View
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))
            ) : (
              <li className="p-3 text-sm text-[var(--color-muted)]">No collections yet.</li>
            )}
          </ul>
        </Card>
        <Card>
          <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Category">
              <select name="category" defaultValue={categoryId} className="input">
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.plural_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <select name="city" defaultValue={cityId} className="input">
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn btn-ghost btn-sm">Show vendors</button>
          </form>
          <form action={opsSaveCollection} className="mt-4 space-y-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <input type="hidden" name="category_id" value={categoryId} />
            <input type="hidden" name="city_id" value={cityId} />
            <Field label="Title *">
              <input name="title" required minLength={5} maxLength={120} defaultValue={editing?.title} className="input" placeholder="Farmhouses for small weddings in Mohali" />
            </Field>
            <Field label="Introduction" hint="Two or three sentences on why these vendors are on the list">
              <textarea name="intro" rows={3} maxLength={2000} defaultValue={editing?.intro} className="input" />
            </Field>
            <fieldset>
              <legend className="label">Vendors (best rated first; tick 3 to 30)</legend>
              {vendors.length ? (
                <ul className="mt-2 max-h-80 divide-y divide-[var(--color-line)] overflow-y-auto rounded-xl border border-[var(--color-line)] text-sm">
                  {vendors.map((v) => (
                    <li key={v.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2">
                        <input type="checkbox" name="vendor_ids" value={v.id} defaultChecked={chosen.has(v.id)} className="h-4 w-4 accent-[var(--color-pink)]" />
                        <span className="flex-1">{v.business_name}</span>
                        <span className="text-xs text-[var(--color-muted)]">
                          {v.city_name}
                          {v.review_count ? `, ★ ${v.rating?.toFixed(1)}` : ''}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint mt-2">No live vendors in this category and city.</p>
              )}
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="publish" defaultChecked={editing?.status === 'published'} className="h-4 w-4 accent-[var(--color-pink)]" />
              Published
            </label>
            <button className="btn btn-pink btn-sm">Save collection</button>
          </form>
        </Card>
      </div>
    </>
  );
}
