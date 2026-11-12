import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { listCategories, citiesInUse } from '@/lib/catalog';
import { opsCreateLead, opsImportLeads } from '@/lib/actions/ops';
import { metaLeadsConfigured, sourceSummary } from '@/lib/leadIntake';
import { LEAD_TABS, leadBook, leadBookCounts, type LeadTab } from '@/lib/opsBooks';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';
import { CapturesList } from './CapturesList';
import { CappedNeeds } from './CappedNeeds';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leads' };

const SOURCES: Record<string, string> = { website: 'Website', instagram: 'Instagram ad', direct_request: 'Direct request', shortlist: 'Shortlist', ops: 'Phone or walk-in', legacy: 'Old site' };
const sp = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const NEED_TONE: Record<string, 'ok' | 'warn' | 'gold' | 'plain'> = { open: 'plain', capped: 'warn', closed_booked: 'ok', closed_by_bride: 'plain' };

export default async function OpsLeads({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  await requireRole(['ops', 'admin']);
  const q = await searchParams;
  // Old links used ?status=; they still land on the right tab.
  const legacy = { new: 'verify', verifying: 'verify', verified: 'live', rejected: 'closed', fake: 'closed' }[sp(q.status) ?? ''];
  const tab = ((sp(q.tab) ?? legacy ?? 'verify') in LEAD_TABS ? (sp(q.tab) ?? legacy ?? 'verify') : 'verify') as LeadTab;
  const find = (sp(q.q) ?? '').slice(0, 80);
  const source = Object.keys(SOURCES).find((x) => x === sp(q.source)) ?? null;
  const [counts, cats, cities, summary] = await Promise.all([leadBookCounts(sql), listCategories(sql, { activeOnly: true }), citiesInUse(sql), sourceSummary(sql)]);
  const rows = tab === 'call' ? [] : await leadBook(sql, { tab, q: find, source });
  const here = (o: { tab?: LeadTab; source?: string | null }) => {
    const u = new URLSearchParams();
    u.set('tab', o.tab ?? tab);
    const so = o.source === undefined ? source : o.source;
    if (so) u.set('source', so);
    if (find && !o.tab) u.set('q', find);
    return `/ops/leads?${u}`;
  };
  // The tabs that mean "someone should act" are tinted when they hold anything.
  const urgent: LeadTab[] = ['call', 'verify', 'quiet', 'capped'];
  return (
    <>
      <PageTitle title="Leads" sub="Every lead in one place, from a number left on the site to a booking." />
      <Notice error={q.error} ok={q.ok} />
      <nav aria-label="Lead stages" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {(Object.keys(LEAD_TABS) as LeadTab[]).map((t) => {
          const on = t === tab;
          const hot = urgent.includes(t) && counts[t] > 0;
          return (
            <Link
              key={t}
              href={here({ tab: t })}
              aria-current={on ? 'page' : undefined}
              className={`rounded-xl border p-2.5 transition-colors ${on ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white' : hot ? 'border-[#f3c7d9] bg-[var(--color-pink-soft)] hover:border-[var(--color-pink)]' : 'border-[var(--color-line)] bg-white hover:border-[var(--color-ink)]'}`}
            >
              <span className="figure block text-2xl leading-none">{counts[t]}</span>
              <span className={`mt-1 block text-[13px] leading-tight ${on ? 'text-white/85' : 'text-[var(--color-muted)]'}`}>{LEAD_TABS[t].label}</span>
            </Link>
          );
        })}
      </nav>
      <p className="hint mb-3">{LEAD_TABS[tab].hint}</p>

      {tab === 'call' ? (
        <CapturesList view={sp(q.view) === 'done' ? 'done' : 'open'} />
      ) : (
        <>
          <form className="mb-3 flex flex-wrap items-center gap-2" role="search">
            <input type="hidden" name="tab" value={tab} />
            <input name="q" defaultValue={find} className="input max-w-xs py-1.5" placeholder="Name, phone, town or campaign" aria-label="Find a lead" />
            <select name="source" defaultValue={source ?? ''} className="input w-auto py-1.5" aria-label="Where it came from">
              <option value="">From anywhere</option>
              {Object.entries(SOURCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="btn btn-sm" data-quiet="">
              Find
            </button>
            {find || source ? (
              <Link href={`/ops/leads?tab=${tab}`} className="text-sm underline">
                Clear
              </Link>
            ) : null}
          </form>
          {tab === 'capped' ? (
            <div className="mb-5">
              <CappedNeeds />
            </div>
          ) : null}
          {rows.length ? (
            <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
              <table className="data stack">
                <thead>
                  <tr>
                    <th>Bride</th>
                    <th>Town</th>
                    <th>Wedding</th>
                    <th>Needs, and how vendors responded</th>
                    <th>From</th>
                    <th>Stage</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/ops/leads/${r.id}`} className="font-semibold underline">
                          {r.bride_name}
                        </Link>
                        <a href={`tel:${r.phone}`} className="hint block">
                          {r.phone}
                        </a>
                        {!r.has_email ? <span className="hint block">no email yet</span> : null}
                      </td>
                      <td>{r.city}</td>
                      <td>{fmtDate(r.event_date, 'not fixed')}</td>
                      <td>
                        <ul className="flex flex-wrap gap-1.5">
                          {r.needs.map((n) => (
                            <li key={n.category}>
                              <Badge tone={NEED_TONE[n.status] ?? 'plain'}>
                                {n.category}
                                {r.status === 'verified' ? ` · ${n.status === 'closed_booked' ? 'booked' : n.status === 'closed_by_bride' ? 'closed' : `${n.unlocks}/${n.cap} opened${n.quotes ? `, ${n.quotes} quoted` : ''}`}` : ''}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        {SOURCES[r.source] ?? r.source}
                        {r.campaign ? <span className="hint block">{r.campaign}</span> : null}
                      </td>
                      <td>
                        {r.status === 'verified' ? (
                          <Badge tone="ok">Verified</Badge>
                        ) : r.status === 'rejected' || r.status === 'fake' ? (
                          <Badge tone="bad">{r.status === 'fake' ? 'Fake' : 'Rejected'}</Badge>
                        ) : (
                          <Badge tone="warn">Call step {Math.min(3, r.verification_stage + 1)} of 3</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Empty art="letters" title={find || source ? 'No lead matches that' : 'Nothing here right now'}>
              {tab === 'verify' ? 'New requests from the site, ads and the team appear here for their call.' : null}
            </Empty>
          )}
        </>
      )}

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer font-semibold">Bring in leads from an Instagram or Facebook ad</summary>
        <p className="hint mt-2">
          Open the leads sheet from Meta, copy every row with the heading row, and paste it here. Each row becomes a request waiting for its call.
          A lead already brought in is skipped, and a phone number with a request still waiting gets the new services added to it.{' '}
          {metaLeadsConfigured() ? 'New ad leads also arrive here on their own.' : 'Leads can also arrive on their own once the Meta keys are set.'}
        </p>
        <form action={opsImportLeads} className="mt-3 grid gap-3 sm:grid-cols-2">
          <textarea name="sheet" required rows={6} className="input font-mono text-xs sm:col-span-2" aria-label="Leads sheet" placeholder={'full_name\tphone_number\temail\tcity\tcampaign_name\nSimran Kaur\t+919876543210\tsimran@example.com\tMohali\tDiwali bridal'} />
          <label className="text-sm">
            <span className="mb-1 block font-medium">Town, when the sheet has none</span>
            <select name="city_id" className="input">
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">These came from</span>
            <select name="source" className="input">
              <option value="instagram">Instagram or Facebook ad</option>
              <option value="ops">Phone, walk-in or other</option>
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Service, when the sheet has none</legend>
            <div className="flex flex-wrap gap-3">
              {cats.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="category_id" value={c.id} /> {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn btn-sm sm:justify-self-start">Bring in leads</button>
        </form>
      </details>
      {summary.length ? (
        <details className="card mt-4 p-4">
          <summary className="cursor-pointer font-semibold">Where leads came from, last 90 days</summary>
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
            <table className="data stack">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Campaign</th>
                  <th>Leads</th>
                  <th>Verified</th>
                  <th>Opened by a vendor</th>
                  <th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={`${r.source}|${r.campaign ?? ''}`}>
                    <td>{SOURCES[r.source] ?? r.source}</td>
                    <td>{r.campaign ?? '–'}</td>
                    <td>{r.leads}</td>
                    <td>{r.verified}</td>
                    <td>{r.unlocked}</td>
                    <td>{r.booked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      <details className="card mt-4 p-4">
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
