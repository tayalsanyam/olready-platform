import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { listCategories, citiesInUse } from '@/lib/catalog';
import { opsCreateLead, opsImportLeads } from '@/lib/actions/ops';
import { metaLeadsConfigured, sourceSummary } from '@/lib/leadIntake';
import { Badge, Card, Notice, PageTitle, sp } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate, plural } from '@/lib/dates';

export const metadata = { title: 'Leads' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const STATUSES = ['new', 'verifying', 'verified', 'rejected', 'fake'] as const;
const SOURCES: Record<string, string> = { website: 'Website', instagram: 'Instagram ad', direct_request: 'Direct request', shortlist: 'Shortlist', ops: 'Phone or walk-in', legacy: 'Old site' };

export default async function OpsLeads({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  const status = STATUSES.find((s) => s === sp(q.status)) ?? null;
  const source = Object.keys(SOURCES).find((x) => x === sp(q.source)) ?? null;
  const rows = await sql<{ id: string; bride_name: string; has_email: boolean; campaign: string | null; city: string; event_date: string | null; source: string; status: string; stage: number; cats: string; created_at: Date }[]>`
    select l.id, l.bride_name, ci.name as city, to_char(l.event_date, 'YYYY-MM-DD') as event_date, l.source, l.status, l.campaign, (l.email is not null) as has_email,
      l.verification_stage as stage, l.created_at,
      coalesce((select string_agg(c.name, ', ' order by c.sort) from mkt.lead_needs ln join mkt.categories c on c.id = ln.category_id
        where ln.lead_id = l.id and ln.status <> 'removed'), '') as cats
    from mkt.leads l join mkt.cities ci on ci.id = l.city_id
    where ${status ? sql`l.status = ${status}` : sql`l.status in ('new','verifying')`}
      ${source ? sql`and l.source = ${source}` : sql``}
    order by l.created_at ${status ? sql`desc` : sql`asc`} limit 200`;
  const [cats, cities, summary] = await Promise.all([listCategories(sql, { activeOnly: true }), citiesInUse(sql), sourceSummary(sql)]);
  const here = (o: { status?: string | null; source?: string | null }) => {
    const u = new URLSearchParams();
    const st = o.status === undefined ? status : o.status;
    const so = o.source === undefined ? source : o.source;
    if (st) u.set('status', st);
    if (so) u.set('source', so);
    const qs = u.toString();
    return `/ops/leads${qs ? `?${qs}` : ''}`;
  };
  return (
    <>
      <PageTitle title="Leads" sub={status ? `Status: ${status}` : 'Waiting for verification, oldest first'} />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={here({ status: null })} className={`btn btn-sm ${status ? 'btn-ghost' : ''}`}>
          To verify
        </Link>
        {STATUSES.slice(2).map((s) => (
          <Link key={s} href={here({ status: s })} className={`btn btn-sm ${status === s ? '' : 'btn-ghost'}`}>
            {s}
          </Link>
        ))}
        <span className="mx-1 self-center text-[var(--color-muted)]">from</span>
        <Link href={here({ source: null })} className={`btn btn-sm ${source ? 'btn-ghost' : ''}`}>
          Anywhere
        </Link>
        {['instagram', 'website', 'ops'].map((s) => (
          <Link key={s} href={here({ source: s })} className={`btn btn-sm ${source === s ? '' : 'btn-ghost'}`}>
            {SOURCES[s]}
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
        <table className="data stack">
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
                <td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td>
                  <Link className="font-semibold underline-offset-4 hover:underline" href={`/ops/leads/${r.id}`}>
                    {r.bride_name}
                  </Link>
                  {!r.has_email ? <span className="hint block">no email yet</span> : null}
                </td>
                <td>{r.city}</td>
                <td className="whitespace-nowrap">{fmtDate(r.event_date, '–')}</td>
                <td>{r.cats || '–'}</td>
                <td>
                  {SOURCES[r.source] ?? r.source}
                  {r.campaign ? <span className="hint block">{r.campaign}</span> : null}
                </td>
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
