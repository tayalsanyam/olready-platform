import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatInr, listCategories } from '@/lib/catalog';
import type { Lead } from '@/lib/leads';
import { opsAddNeed, opsAdvance, opsMarkFake, opsRejectLead, opsRemoveNeed, opsReopen, opsSetBudget, opsSetGuests } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Verify lead' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

const STAGES = [
  { n: 1, title: 'Reached her', script: 'Introduce OLReady. Confirm her name, that she sent the request, and the wedding date.' },
  { n: 2, title: 'Needs confirmed', script: 'Confirm city and budget. Go through every category below and ask: "Have you booked this yet?" Add each one she still needs.' },
  { n: 3, title: 'Verified', script: 'She is genuine and still looking. Tell her verified vendors will message her on OLReady, and that an enquiry is not a booking.' },
] as const;

export default async function VerifyLead({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [lead] = await sql<(Lead & { city: string; event: string | null })[]>`
    select l.*, ci.name as city, to_char(l.event_date, 'YYYY-MM-DD') as event from mkt.leads l join mkt.cities ci on ci.id = l.city_id where l.id = ${id}`;
  if (!lead) notFound();
  const needs = await sql<{ id: string; category_id: number; category: string; budget_inr: number | null; tier: string | null; status: string; unlock_cap: number; reopen_rounds: number; unlocks: number; direct: string | null; booked: string | null }[]>`
    select ln.id, ln.category_id, c.name as category, ln.budget_inr, bt.label as tier, ln.status, ln.unlock_cap, ln.reopen_rounds,
      (select count(*) from mkt.unlocks u where u.lead_need_id = ln.id and not u.refunded)::int as unlocks,
      dv.business_name as direct, bv.business_name as booked
    from mkt.lead_needs ln join mkt.categories c on c.id = ln.category_id
    left join mkt.budget_tiers bt on bt.id = ln.budget_tier_id
    left join mkt.vendors dv on dv.id = ln.direct_vendor_id
    left join mkt.vendors bv on bv.id = ln.booked_vendor_id
    where ln.lead_id = ${id} order by c.sort`;
  const unlocks = await sql<{ id: string; vendor: string; category: string; credits_spent: number; refunded: boolean; created_at: Date }[]>`
    select u.id, v.business_name as vendor, c.name as category, u.credits_spent, u.refunded, u.created_at
    from mkt.unlocks u join mkt.lead_needs ln on ln.id = u.lead_need_id join mkt.vendors v on v.id = u.vendor_id
    join mkt.categories c on c.id = ln.category_id where ln.lead_id = ${id} order by u.created_at`;
  const cats = await listCategories(sql, { activeOnly: true });
  const missing = cats.filter((c) => !needs.some((n) => n.category_id === c.id && n.status !== 'removed'));
  const closed = lead.status === 'fake' || lead.status === 'rejected';
  const self = `/ops/leads/${id}`;
  return (
    <>
      <PageTitle
        title={lead.bride_name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <a className="font-semibold underline" href={`tel:${lead.phone}`}>
              {lead.phone}
            </a>
            {lead.email ? <span>{lead.email}</span> : null}
            <span>· {lead.city}</span>
            <span>· wedding {lead.event ?? 'not fixed'}</span>
            {lead.guest_count ? <span>· about {lead.guest_count} guests</span> : null}
            {lead.whatsapp_opt_in ? <Badge tone="ok">WhatsApp updates: yes</Badge> : null}
            <span>· via {lead.source}</span>
            <Badge tone={lead.status === 'verified' ? 'ok' : closed ? 'bad' : 'warn'}>{lead.status}</Badge>
          </span>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <form action={opsSetGuests} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="lead_id" value={lead.id} />
            <input type="hidden" name="_back" value={self} />
            <label className="text-sm">
              <span className="block text-[var(--color-muted)]">Guests (ask on the call; venues and caterers need it)</span>
              <input name="guest_count" type="number" min={1} max={20000} defaultValue={lead.guest_count ?? ''} className="input w-32 py-1" />
            </label>
            <button className="btn btn-ghost btn-sm">Save guests</button>
          </form>
          <Card>
            <h2 className="font-semibold">Categories</h2>
            <div className="-mx-4 mt-2 overflow-x-auto px-4">
            <table className="data min-w-[520px]">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Budget</th>
                  <th>Status</th>
                  <th>Unlocks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {needs.map((n) => (
                  <tr key={n.id} className={n.status === 'removed' ? 'opacity-50' : ''}>
                    <td>
                      {n.category}
                      {n.direct ? <div className="hint">Direct request: {n.direct}</div> : null}
                    </td>
                    <td>
                      {closed || n.status === 'removed' ? (
                        n.budget_inr != null ? formatInr(n.budget_inr) : '–'
                      ) : (
                        <form action={opsSetBudget} className="flex gap-1">
                          <input type="hidden" name="need_id" value={n.id} />
                          <input type="hidden" name="_back" value={self} />
                          <input name="budget_inr" className="input w-28 py-1" defaultValue={n.budget_inr ?? ''} inputMode="numeric" aria-label={`Budget for ${n.category}`} />
                          <button className="btn btn-ghost btn-sm">Save</button>
                        </form>
                      )}
                      {n.tier ? <div className="hint">{n.tier}</div> : null}
                    </td>
                    <td>{n.booked ? `booked: ${n.booked}` : n.status}</td>
                    <td>
                      {n.unlocks}/{n.unlock_cap}
                      {n.reopen_rounds ? <div className="hint">reopened {n.reopen_rounds}×</div> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      {n.status === 'capped' && n.reopen_rounds < 2 ? (
                        <form action={opsReopen}>
                          <input type="hidden" name="need_id" value={n.id} />
                          <input type="hidden" name="_back" value={self} />
                          <button className="btn btn-sm">Reopen +10</button>
                        </form>
                      ) : null}
                      {n.unlocks === 0 && !['removed', 'closed_booked'].includes(n.status) && !closed ? (
                        <form action={opsRemoveNeed}>
                          <input type="hidden" name="need_id" value={n.id} />
                          <input type="hidden" name="_back" value={self} />
                          <button className="btn btn-ghost btn-sm">Remove</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {!closed && missing.length ? (
              <div className="mt-4 rounded-lg bg-[var(--color-tint)] p-3">
                <p className="text-sm font-semibold">Ask about each of these. Add the ones she still needs:</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {missing.map((c) => (
                    <form key={c.id} action={opsAddNeed} className="flex items-center gap-2">
                      <input type="hidden" name="lead_id" value={id} />
                      <input type="hidden" name="category_id" value={c.id} />
                      <span className="min-w-0 flex-1 text-sm">{c.name}</span>
                      <input name="budget_inr" className="input w-28 py-1" placeholder="Budget ₹" inputMode="numeric" aria-label={`Budget for ${c.name}`} />
                      <button className="btn btn-sm">Add</button>
                    </form>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          {unlocks.length ? (
            <Card>
              <h2 className="font-semibold">Vendors who unlocked</h2>
              <form action={opsMarkFake} className="mt-2 space-y-3">
                <input type="hidden" name="lead_id" value={id} />
                <ul className="divide-y divide-[var(--color-line)] text-sm">
                  {unlocks.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                      <label className="flex items-center gap-2">
                        {u.refunded || closed ? null : <input type="checkbox" name="refund" value={u.id} defaultChecked />}
                        <span>
                          {u.vendor} <span className="text-[var(--color-muted)]">· {u.category}</span>
                        </span>
                      </label>
                      <span>
                        {u.credits_spent} credit{u.credits_spent > 1 ? 's' : ''}
                        {u.refunded ? ' · refunded' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {!closed ? (
                  <div className="rounded-lg border border-[#f5c2bd] p-3">
                    <p className="text-sm font-semibold">Fake or wrong lead</p>
                    <p className="hint">Removes the lead. Ticked vendors get their credits back.</p>
                    <div className="mt-2 flex gap-2">
                      <input name="reason" required className="input" placeholder="What was wrong?" />
                      <button className="btn btn-danger btn-sm">Remove lead</button>
                    </div>
                  </div>
                ) : null}
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {STAGES.map((s) => {
            const done = lead.verification_stage >= s.n;
            const next = lead.verification_stage + 1 === s.n && !closed;
            return (
              <Card key={s.n} className={done ? 'border-[#bfe3cd]' : next ? 'border-[var(--color-pink)]' : 'opacity-60'}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {s.n}. {s.title}
                  </h3>
                  {done ? <Badge tone="ok">done</Badge> : null}
                </div>
                <p className="mt-1 text-sm">{s.script}</p>
                {next ? (
                  <form action={opsAdvance} className="mt-2 space-y-2">
                    <input type="hidden" name="lead_id" value={id} />
                    <input type="hidden" name="stage" value={s.n} />
                    <input name="notes" className="input" placeholder="Notes from the call" />
                    <button className={`btn btn-sm ${s.n === 3 ? 'btn-pink' : ''}`}>{s.n === 3 ? 'Mark verified' : 'Done'}</button>
                  </form>
                ) : null}
              </Card>
            );
          })}
          {lead.notes ? (
            <Card>
              <h3 className="font-semibold">Notes</h3>
              <p className="mt-1 whitespace-pre-line text-sm">{lead.notes.trim()}</p>
            </Card>
          ) : null}
          {!closed && !unlocks.length ? (
            <Card>
              <h3 className="font-semibold">Could not verify</h3>
              <form action={opsRejectLead} className="mt-2 flex gap-2">
                <input type="hidden" name="lead_id" value={id} />
                <input name="reason" className="input" placeholder="Not reachable, already booked…" />
                <button className="btn btn-ghost btn-sm">Close lead</button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
