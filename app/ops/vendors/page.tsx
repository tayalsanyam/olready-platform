import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { fieldsFor, formatInr, listCategories, citiesInUse } from '@/lib/catalog';
import { opsCreateVendor, opsDecideClaim } from '@/lib/actions/ops';
import { VENDOR_TABS, vendorBook, vendorBookCounts, type VendorTab } from '@/lib/opsBooks';
import { AttributeInputs } from '@/components/AttributeInputs';
import { Bar } from '@/components/Art';
import { fmtDate, plural } from '@/lib/dates';
import { Badge, Card, Empty, Notice, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vendors' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const STATUS: Record<string, [string, 'ok' | 'warn' | 'bad' | 'plain']> = { live: ['Live', 'ok'], pending_review: ['To review', 'warn'], draft: ['Not finished', 'plain'], suspended: ['Paused', 'bad'], closed: ['Closed', 'bad'] };

export default async function OpsVendors({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin', 'rm']);
  // Old links used ?status=; they still land on the right tab.
  const legacy = { pending_review: 'review', live: 'all', draft: 'draft', suspended: 'paused', closed: 'paused' }[sp(q.status) ?? ''];
  const asked = sp(q.tab) ?? legacy ?? 'review';
  const tab = (asked in VENDOR_TABS ? asked : 'review') as VendorTab;
  const find = (sp(q.q) ?? '').slice(0, 80);
  const [cats, cities, counts] = await Promise.all([listCategories(sql), citiesInUse(sql), vendorBookCounts(sql)]);
  const cat = cats.find((c) => c.slug === sp(q.category)) ?? null;
  const vendors = await vendorBook(sql, { tab, q: find, categoryId: cat?.id ?? null });
  const claims = await sql<{ id: string; vendor_id: string; business_name: string; invite_email: string; claimant: string | null }[]>`
    select vc.id, vc.vendor_id, v.business_name, vc.invite_email, p.email as claimant
    from mkt.vendor_claims vc join mkt.vendors v on v.id = vc.vendor_id left join mkt.profiles p on p.id = vc.profile_id
    where vc.status = 'submitted' order by vc.created_at`;
  const createCat = cats.find((c) => c.slug === sp(q.new));
  const createFields = createCat ? await fieldsFor(sql, createCat.id) : [];
  const urgent: VendorTab[] = ['review', 'ending', 'behind', 'contract', 'lapsed'];
  const planTab = ['plan', 'ending', 'behind', 'contract', 'lapsed'].includes(tab);
  return (
    <>
      <PageTitle title="Vendors" sub="Every vendor in one place, by where they stand with us: new, on a plan, running out, lapsed, or never paid." />
      <Notice error={q.error} ok={q.ok} />
      <nav aria-label="Vendor groups" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {(Object.keys(VENDOR_TABS) as VendorTab[]).map((t) => {
          const on = t === tab;
          const hot = urgent.includes(t) && counts[t] > 0;
          return (
            <Link
              key={t}
              href={`/ops/vendors?tab=${t}`}
              aria-current={on ? 'page' : undefined}
              className={`rounded-xl border p-2.5 transition-colors ${on ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white' : hot ? 'border-[#f3c7d9] bg-[var(--color-pink-soft)] hover:border-[var(--color-pink)]' : 'border-[var(--color-line)] bg-white hover:border-[var(--color-ink)]'}`}
            >
              <span className="figure block text-2xl leading-none">{counts[t]}</span>
              <span className={`mt-1 block text-[13px] leading-tight ${on ? 'text-white/85' : 'text-[var(--color-muted)]'}`}>{VENDOR_TABS[t].label}</span>
            </Link>
          );
        })}
      </nav>
      <p className="hint mb-3">{VENDOR_TABS[tab].hint}</p>
      {tab === 'review' ? (
        <>
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
        </>
      ) : null}
      <form className="mb-3 flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={find} className="input max-w-xs py-1.5" placeholder="Business, phone, email or town" aria-label="Find a vendor" />
        <select name="category" defaultValue={cat?.slug ?? ''} className="input w-auto py-1.5" aria-label="Category">
          <option value="">Every category</option>
          {cats.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" data-quiet="">
          Find
        </button>
        {find || cat ? (
          <Link href={`/ops/vendors?tab=${tab}`} className="text-sm underline">
            Clear
          </Link>
        ) : null}
        <span className="hint ml-auto">{plural(vendors.length, 'vendor')} shown</span>
      </form>
      {vendors.length ? (
        <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <table className="data stack">
            <thead>
              <tr>
                <th>Business</th>
                <th>Category and town</th>
                <th>Plan</th>
                <th>Enquiries left</th>
                <th>Activity</th>
                <th>Paid so far</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link className="font-semibold underline-offset-4 hover:underline" href={`/ops/vendors/${v.id}`}>
                      {v.business_name}
                    </Link>
                    {v.phone ? (
                      <a href={`tel:${v.phone}`} className="hint block">
                        {v.phone}
                      </a>
                    ) : (
                      <span className="hint block">no phone</span>
                    )}
                    {v.email ? <span className="hint block break-all">{v.email}</span> : null}
                  </td>
                  <td>
                    {v.category}
                    <span className="hint block">{v.city}</span>
                  </td>
                  <td className="min-w-[11rem]">
                    {v.plan ? (
                      <>
                        <span className="font-medium">{v.plan}</span>{' '}
                        {v.plan_days_left != null && v.plan_days_left <= 30 ? <Badge tone="warn">{plural(v.plan_days_left, 'day')} left</Badge> : null}
                        {v.behind ? <Badge tone="bad">behind</Badge> : null}
                        <span className="mt-1 block">
                          <Bar value={v.plan_used ?? 0} total={v.plan_credits ?? 0} label={`${v.plan_used} of ${v.plan_credits} used`} />
                        </span>
                        <span className="hint block">
                          {v.plan_used} of {v.plan_credits} used · ends {fmtDate(v.plan_ends, 'no end date')}
                        </span>
                      </>
                    ) : v.pending_plan ? (
                      <>
                        <span className="font-medium">{v.pending_plan}</span> <Badge tone="warn">needs contract</Badge>
                      </>
                    ) : v.last_plan ? (
                      <>
                        <span className="text-[var(--color-muted)]">{v.last_plan}</span> <Badge tone="bad">expired</Badge>
                        <span className="hint block">ended {fmtDate(v.last_plan_ended)}</span>
                      </>
                    ) : (
                      <span className="text-[var(--color-muted)]">No plan</span>
                    )}
                  </td>
                  <td>
                    <span className="figure text-lg">{v.credits}</span>
                  </td>
                  <td>
                    {v.status === 'live' ? (
                      <>
                        {v.unlocks_30 ? `${v.unlocks_30} opened in 30 days` : 'None opened in 30 days'}
                        <span className="hint block">
                          last {fmtDate(v.last_unlock, 'never')} · {plural(v.open_leads, 'request')} open for them
                        </span>
                        {planTab || tab === 'new' ? (
                          <span className="hint block">
                            {v.photos} photos · calendar {v.calendar_fresh ? 'up to date' : 'not updated'}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="hint">Joined {fmtDate(v.created_at.toISOString().slice(0, 10))}</span>
                    )}
                  </td>
                  <td>{v.paid_inr ? formatInr(v.paid_inr) : '–'}</td>
                  <td className="space-y-1">
                    <Badge tone={STATUS[v.status]?.[1] ?? 'plain'}>{STATUS[v.status]?.[0] ?? v.status}</Badge>
                    {v.claim_status !== 'claimed' ? <Badge>{v.claim_status === 'invited' ? 'Invited' : 'Not claimed'}</Badge> : null}
                    {v.verified ? <Badge tone="ok">Verified</Badge> : null}
                    {v.assured ? <Badge tone="gold">Assured</Badge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty art="search" title={find || cat ? 'No vendor matches that' : 'Nobody in this group right now'} />
      )}
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
