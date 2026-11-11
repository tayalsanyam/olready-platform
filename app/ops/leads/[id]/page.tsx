import { fmtDate } from '@/lib/dates';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatInr, listCategories, listCities } from '@/lib/catalog';
import { PlacePicker } from '@/components/PlacePicker';
import type { Lead } from '@/lib/leads';
import { opsAddNeed, opsAdvance, opsSaveLeadDetails, opsMarkFake, opsRejectLead, opsRemoveNeed, opsReopen, opsSetBudget } from '@/lib/actions/ops';
import { FUNCTION_PRESETS, MAX_FUNCTIONS, TIMES, leadFunctions } from '@/lib/functions';
import { opsRemoveFunctionAction, opsSaveFunctionAction } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';

export const metadata = { title: 'Verify lead' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

const STAGES = [
  { n: 1, title: 'Reached her', script: 'Introduce Olready. Confirm her name, that she sent the request, and the wedding date.' },
  { n: 2, title: 'Needs confirmed', script: 'Confirm the town, each function with its date, town and venue, and the budget. Go through every category below and ask: "Have you booked this yet?" Add each one she still needs.' },
  { n: 3, title: 'Verified', script: 'She is genuine and still looking. Take her email and save it under Her details, so she can sign in to see chats and quotes. Tell her verified vendors will message or call her, and that an enquiry is not a booking.' },
] as const;

export default async function VerifyLead({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [lead] = await sql<(Lead & { city: string; state_name: string; area: string | null; event: string | null })[]>`
    select l.*, ci.name as city, ci.state as state_name, lo.name as area, to_char(l.event_date, 'YYYY-MM-DD') as event
    from mkt.leads l join mkt.cities ci on ci.id = l.city_id left join mkt.localities lo on lo.id = l.locality_id where l.id = ${id}`;
  if (!lead) notFound();
  const needs = await sql<{ id: string; category_id: number; category: string; budget_inr: number | null; tier: string | null; status: string; unlock_cap: number; reopen_rounds: number; brief: string | null; unlocks: number; direct: string | null; booked: string | null }[]>`
    select ln.id, ln.category_id, c.name as category, ln.budget_inr, bt.label as tier, ln.status, ln.unlock_cap, ln.reopen_rounds, ln.brief,
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
  const fns = await leadFunctions(sql, id);
  const quick = (await listCities(sql)).map((c) => ({ id: c.id, name: c.name, state: c.state }));
  const leadTown = { id: lead.city_id, name: lead.city, state: lead.state_name };
  const liveNeeds = needs.filter((n) => n.status !== 'removed');
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
            <span>· {[lead.area, lead.city, lead.state_name].filter(Boolean).join(', ')}{lead.pincode ? ` ${lead.pincode}` : ''}</span>
            <span>· wedding {fmtDate(lead.event, 'not fixed')}</span>
            {lead.guest_count ? <span>· about {lead.guest_count} guests</span> : null}
            {lead.whatsapp_opt_in ? <Badge tone="ok">WhatsApp updates: yes</Badge> : null}
            <span>· via {({ instagram: 'Instagram ad', ops: 'phone or walk-in', direct_request: 'direct request', legacy: 'old site' } as Record<string, string>)[lead.source] ?? lead.source}{lead.campaign ? ` (${lead.campaign})` : ''}</span>
            <Badge tone={lead.status === 'verified' ? 'ok' : closed ? 'bad' : 'warn'}>{lead.status}</Badge>
          </span>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <Card className="mb-5">
        <h2 className="font-semibold">Her details</h2>
        <p className="hint">
          Confirm each of these on the call.{' '}
          {lead.email
            ? 'She signs in on olready.in with her email to see chats and quotes. No password: we email her a code.'
            : 'Ask for her email: without it she cannot sign in, and vendors can only reach her by phone.'}
        </p>
        <form action={opsSaveLeadDetails} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="lead_id" value={id} />
          <label className="text-sm">
            <span className="mb-1 block font-medium">Her name</span>
            <input name="name" className="input" defaultValue={lead.bride_name} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Partner&apos;s name</span>
            <input name="partner_name" className="input" defaultValue={lead.partner_name ?? ''} maxLength={80} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Email she will sign in with</span>
            <input name="email" type="email" className="input" defaultValue={lead.email ?? ''} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Mobile</span>
            <input name="phone" className="input" defaultValue={lead.phone} required inputMode="tel" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Another number (family, optional)</span>
            <input name="alt_phone" className="input" defaultValue={lead.alt_phone ?? ''} inputMode="tel" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Best time to call</span>
            <input name="best_time" className="input" defaultValue={lead.best_time ?? ''} maxLength={80} placeholder="e.g. after 6 pm" />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <PlacePicker
              withArea
              required
              label="Main wedding town"
              townHint="Functions in another town are set on each function below."
              town={leadTown}
              area={lead.area || lead.pincode ? { id: lead.locality_id, name: lead.area ?? '', pincode: lead.pincode } : null}
              quick={quick}
            />
          </div>
          <label className="text-sm sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block font-medium">Notes for the team (vendors do not see these)</span>
            <textarea name="notes" className="input" rows={2} defaultValue={lead.notes.trim()} maxLength={2000} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="whatsapp_opt_in" defaultChecked={lead.whatsapp_opt_in} className="h-4 w-4 accent-[var(--color-pink)]" />
            She agreed to WhatsApp updates about this request
          </label>
          <button className="btn btn-sm justify-self-start lg:justify-self-end">Save details</button>
        </form>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Functions</h2>
            <p className="hint">Confirm each function on the call: date, time, guests, town, venue, and which vendors it needs. A function in another town is shown to vendors who work there.</p>
            <ul className="mt-3 space-y-3">
              {fns.map((f) => (
                <li key={f.id} className="rounded-xl border border-[var(--color-line)] p-3">
                  <form action={opsSaveFunctionAction} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <input type="hidden" name="event_id" value={f.id} />
                    <input name="name" defaultValue={f.name} className="input py-1" aria-label="Function" list="fn-presets-ops" required />
                    <input name="date" type="date" defaultValue={f.event_date ?? ''} className="input py-1" aria-label={`Date of ${f.name}`} />
                    <select name="time" defaultValue={f.time_of_day ?? ''} className="input py-1" aria-label={`Time of ${f.name}`}>
                      <option value="">Time not fixed</option>
                      {Object.entries(TIMES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <input name="guests" defaultValue={f.guests ?? ''} inputMode="numeric" className="input py-1" placeholder="Guests" aria-label={`Guests at ${f.name}`} />
                    <div>
                      <PlacePicker label={`Town for ${f.name}`} town={{ id: f.town_id, name: f.town, state: f.town_state }} quick={quick} names={{ city: 'fn_city_id' }} />
                    </div>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Venue or address</span>
                      <input name="place" defaultValue={f.place ?? ''} maxLength={80} className="input" placeholder="Home, venue name, area" />
                    </label>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:col-span-2">
                      <span className="text-[var(--color-muted)]">Needed for</span>
                      {liveNeeds.map((n) => (
                        <label key={n.id} className="flex items-center gap-1.5">
                          <input type="checkbox" name="need_id" value={n.id} defaultChecked={f.need_ids.includes(n.id)} className="h-4 w-4 accent-[var(--color-pink)]" />
                          {n.category}
                        </label>
                      ))}
                    </div>
                    <button className="btn btn-ghost btn-sm justify-self-start sm:col-span-2">Save {f.name}</button>
                  </form>
                  {fns.length > 1 ? (
                    <form action={opsRemoveFunctionAction} className="mt-1">
                      <input type="hidden" name="lead_id" value={lead.id} />
                      <input type="hidden" name="event_id" value={f.id} />
                      <button className="text-xs text-[var(--color-muted)] underline">Remove {f.name}</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            <datalist id="fn-presets-ops">
              {FUNCTION_PRESETS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            {fns.length < MAX_FUNCTIONS ? (
              <form action={opsSaveFunctionAction} className="mt-3 grid gap-2 border-t border-[var(--color-line)] pt-3 sm:grid-cols-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                {liveNeeds.map((n) => (
                  <input key={n.id} type="hidden" name="need_id" value={n.id} />
                ))}
                <p className="text-sm font-semibold sm:col-span-2">Add another function</p>
                <input name="name" className="input py-1" placeholder="e.g. Sangeet" aria-label="New function" list="fn-presets-ops" required />
                <input name="date" type="date" className="input py-1" aria-label="Date of the new function" />
                <select name="time" defaultValue="" className="input py-1" aria-label="Time of the new function">
                  <option value="">Time not fixed</option>
                  {Object.entries(TIMES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input name="guests" inputMode="numeric" className="input py-1" placeholder="Guests" aria-label="Guests at the new function" />
                <div>
                  <PlacePicker label="Town for the new function" town={leadTown} quick={quick} names={{ city: 'fn_city_id' }} />
                </div>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Venue or address</span>
                  <input name="place" maxLength={80} className="input" placeholder="Home, venue name, area" />
                </label>
                <p className="hint">It is added for every category. Untick the ones it is not for after adding.</p>
                <button className="btn btn-sm justify-self-start sm:justify-self-end">Add function</button>
              </form>
            ) : null}
          </Card>
          <Card>
            <h2 className="font-semibold">Categories</h2>
            <div className="-mx-4 mt-2 overflow-x-auto px-4" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
            <table className="data stack min-w-[520px]">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Budget and what she wants (vendors see this)</th>
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
                        [n.budget_inr != null ? formatInr(n.budget_inr) : null, n.brief].filter(Boolean).join(' · ') || '–'
                      ) : (
                        <form action={opsSetBudget} className="flex flex-wrap gap-1">
                          <input type="hidden" name="need_id" value={n.id} />
                          <input type="hidden" name="_back" value={self} />
                          <input name="budget_inr" className="input w-28 py-1" defaultValue={n.budget_inr ?? ''} inputMode="numeric" placeholder="₹" aria-label={`Budget for ${n.category}`} />
                          <input name="brief" className="input order-last basis-full py-1" defaultValue={n.brief ?? ''} maxLength={240} placeholder="What she wants" aria-label={`What she wants from ${n.category}`} />
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
              <Card key={s.n} className={done ? 'border-[#bfe3cd]' : next ? 'border-[var(--color-pink)]' : 'bg-[var(--color-tint)]'}>
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
