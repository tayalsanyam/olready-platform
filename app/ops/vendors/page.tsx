import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { fieldsFor, listCategories, citiesInUse } from '@/lib/catalog';
import { opsCreateVendor, opsDecideClaim } from '@/lib/actions/ops';
import { AttributeInputs } from '@/components/AttributeInputs';
import { Badge, Card, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Vendors' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const STATUSES = ['pending_review', 'live', 'draft', 'suspended', 'closed'];

export default async function OpsVendors({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  const status = STATUSES.includes(sp(q.status) ?? '') ? sp(q.status)! : null;
  const [cats, cities] = await Promise.all([listCategories(sql), citiesInUse(sql)]);
  const cat = cats.find((c) => c.slug === sp(q.category)) ?? null;
  const vendors = await sql<{ id: string; slug: string; business_name: string; category: string; city: string; status: string; claim_status: string; verified: boolean; assured: boolean; created_at: Date }[]>`
    select v.id, v.slug, v.business_name, c.name as category, ci.name as city, v.status, v.claim_status,
      v.verified_at is not null as verified, v.assured, v.created_at
    from mkt.vendors v join mkt.categories c on c.id = v.category_id join mkt.cities ci on ci.id = v.city_id
    where ${status ? sql`v.status = ${status}` : sql`true`} and ${cat ? sql`v.category_id = ${cat.id}` : sql`true`}
    order by (v.status = 'pending_review') desc, v.created_at desc limit 300`;
  const claims = await sql<{ id: string; vendor_id: string; business_name: string; invite_email: string; claimant: string | null }[]>`
    select vc.id, vc.vendor_id, v.business_name, vc.invite_email, p.email as claimant
    from mkt.vendor_claims vc join mkt.vendors v on v.id = vc.vendor_id left join mkt.profiles p on p.id = vc.profile_id
    where vc.status = 'submitted' order by vc.created_at`;
  const createCat = cats.find((c) => c.slug === sp(q.new));
  const createFields = createCat ? await fieldsFor(sql, createCat.id) : [];
  const qs = (k: string, v: string | null) => {
    const u = new URLSearchParams();
    if (status && k !== 'status') u.set('status', status);
    if (cat && k !== 'category') u.set('category', cat.slug);
    if (v) u.set(k, v);
    return `/ops/vendors?${u}`;
  };
  return (
    <>
      <PageTitle title="Vendors" sub={`${vendors.length} shown`} />
      <Notice error={q.error} ok={q.ok} />
      {claims.length ? (
        <Card className="mb-5">
          <h2 className="font-semibold">Claims to approve</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)] text-sm">
            {claims.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link className="font-semibold underline" href={`/ops/vendors/${c.vendor_id}`}>
                    {c.business_name}
                  </Link>{' '}
                  · invited {c.invite_email} · claimed by {c.claimant}
                  {c.claimant && c.claimant !== c.invite_email ? <Badge tone="warn">different email</Badge> : null}
                </span>
                <span className="flex gap-2">
                  {['1', '0'].map((a) => (
                    <form key={a} action={opsDecideClaim}>
                      <input type="hidden" name="claim_id" value={c.id} />
                      <input type="hidden" name="approve" value={a} />
                      <button className={`btn btn-sm ${a === '1' ? '' : 'btn-ghost'}`}>{a === '1' ? 'Approve' : 'Reject'}</button>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={qs('status', null)} className={`btn btn-sm ${status ? 'btn-ghost' : ''}`}>
          All
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs('status', s)} className={`btn btn-sm ${status === s ? '' : 'btn-ghost'}`}>
            {s.replace('_', ' ')}
          </Link>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={qs('category', null)} className={`btn btn-sm ${cat ? 'btn-ghost' : ''}`}>
          Every category
        </Link>
        {cats.map((c) => (
          <Link key={c.slug} href={qs('category', c.slug)} className={`btn btn-sm ${cat?.slug === c.slug ? '' : 'btn-ghost'}`}>
            {c.name}
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
        <table className="data stack">
          <thead>
            <tr>
              <th>Business</th>
              <th>Category</th>
              <th>City</th>
              <th>Status</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link className="font-semibold underline-offset-4 hover:underline" href={`/ops/vendors/${v.id}`}>
                    {v.business_name}
                  </Link>
                </td>
                <td>{v.category}</td>
                <td>{v.city}</td>
                <td>
                  <Badge tone={v.status === 'live' ? 'ok' : v.status === 'pending_review' ? 'warn' : 'plain'}>{v.status.replace('_', ' ')}</Badge>
                </td>
                <td className="space-x-1">
                  {v.claim_status !== 'claimed' ? <Badge>{v.claim_status}</Badge> : null}
                  {v.verified ? <Badge tone="ok">verified</Badge> : null}
                  {v.assured ? <Badge tone="gold">assured</Badge> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <details className="card mt-6 p-4" open={Boolean(createCat)}>
        <summary className="cursor-pointer font-semibold">Build a profile for a vendor (they claim it before it goes live)</summary>
        {!createCat ? (
          <form className="mt-3 flex flex-wrap gap-2">
            {cats.filter((c) => c.active).map((c) => (
              <button key={c.slug} name="new" value={c.slug} className="btn btn-ghost btn-sm">
                {c.name}
              </button>
            ))}
          </form>
        ) : (
          <form action={opsCreateVendor} className="mt-3 space-y-3">
            <input type="hidden" name="category_id" value={createCat.id} />
            <p className="text-sm">
              Category: <b>{createCat.name}</b>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="business_name" required className="input" placeholder="Business name" />
              <select name="city_id" className="input" aria-label="City">
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input name="starting_price_inr" className="input" placeholder="Starting price ₹" inputMode="numeric" />
              <input name="phone" className="input" placeholder="Phone" />
              <input name="email" className="input" placeholder="Owner email" />
              <input name="instagram" className="input" placeholder="Instagram" />
            </div>
            <AttributeInputs fields={createFields} />
            <button className="btn btn-sm">Create draft</button>
          </form>
        )}
      </details>
    </>
  );
}
