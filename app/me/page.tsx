import { CallbackForm } from '@/components/CallbackForm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireProfile, STAFF_ROLES } from '@/lib/auth';
import { formatInr, getCity, listCities } from '@/lib/catalog';
import { getLocality } from '@/lib/locations';
import { PlacePicker } from '@/components/PlacePicker';
import { threadsForBride } from '@/lib/threads';
import { weddingFor } from '@/lib/weddings';
import { activatePerkAction, closeNeedAction, saveWeddingAction } from '@/lib/actions/bride';
import { needFunctions } from '@/lib/functions';
import { Badge, Card, Empty, Field, Notice } from '@/components/ui';
import { Marigold, Ring } from '@/components/Art';
import { todayIst } from '@/lib/availability';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate, plural } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My wedding', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

type NeedRow = {
  need_id: string;
  lead_id: string;
  lead_status: string;
  category_name: string;
  status: string;
  budget_inr: number | null;
  booked_vendor: string | null;
  booked_outside: { vendor_name: string } | null;
  replies: number;
  picked: { id: string; name: string; slug: string }[];
};

const leadStatus: Record<string, [string, 'plain' | 'gold' | 'ok' | 'warn' | 'bad']> = {
  new: ['We will call you to verify', 'warn'],
  verifying: ['Verification in progress', 'warn'],
  verified: ['Verified', 'ok'],
  rejected: ['Closed', 'plain'],
  fake: ['Closed', 'plain'],
};

export default async function MyWedding({ searchParams }: P) {
  const q = await searchParams;
  const p = await requireProfile('/me');
  if (p.role === 'vendor') redirect('/vendor');
  if (STAFF_ROLES.includes(p.role)) redirect('/ops');
  const [wedding, cities, threads] = await Promise.all([weddingFor(sql, p.id), listCities(sql), threadsForBride(sql, p.id)]);
  const [town, area] = await Promise.all([getCity(sql, wedding?.city_id), getLocality(sql, wedding?.locality_id)]);
  const needs = await sql<NeedRow[]>`
    select ln.id as need_id, l.id as lead_id, l.status as lead_status, c.name as category_name, ln.status, ln.budget_inr,
      bv.business_name as booked_vendor, ln.booked_outside,
      (select count(*) from mkt.threads t where t.lead_need_id = ln.id)::int as replies,
      coalesce((select json_agg(json_build_object('id', pv.id, 'name', pv.business_name, 'slug', pv.slug) order by pv.business_name)
        from mkt.vendors pv where pv.id = any(ln.preferred_vendor_ids) or pv.id = ln.direct_vendor_id), '[]'::json) as picked
    from mkt.leads l
    join mkt.lead_needs ln on ln.lead_id = l.id
    join mkt.categories c on c.id = ln.category_id
    left join mkt.vendors bv on bv.id = ln.booked_vendor_id
    where (l.bride_profile_id = ${p.id}
       or exists (select 1 from mkt.wedding_members m where m.wedding_id = l.wedding_id and m.profile_id = ${p.id}))
      and ln.status <> 'removed'
    order by l.created_at desc, c.sort`;
  const [{ notify_email: notify }] = await sql<{ notify_email: boolean }[]>`select notify_email from mkt.profiles where id = ${p.id}`;
  const fnsByNeed = await needFunctions(sql, needs.map((n) => n.need_id));
  const [wa] = await sql<{ any: boolean; on: boolean }[]>`
    select count(*) > 0 as any, coalesce(bool_or(whatsapp_opt_in), false) as on from mkt.leads where bride_profile_id = ${p.id}`;
  const perks = await sql<{ id: string; perk: string; claim_by: Date; activated_at: Date | null; expires_at: Date | null }[]>`
    select id, perk, claim_by, activated_at, expires_at from mkt.bride_perks where profile_id = ${p.id} order by created_at desc`;
  const [prog] = wedding
    ? await sql<{ tasks: number; done: number; guests: number; replied: number; cats: number; booked: number; budget: number; committed: number }[]>`
        select
          (select count(*) from mkt.checklist_items where wedding_id = ${wedding.id})::int as tasks,
          (select count(*) from mkt.checklist_items where wedding_id = ${wedding.id} and done)::int as done,
          (select count(*) from mkt.guests where wedding_id = ${wedding.id})::int as guests,
          (select count(distinct r.guest_id) from mkt.guest_rsvps r join mkt.guests g on g.id = r.guest_id where g.wedding_id = ${wedding.id} and r.response <> 'pending')::int as replied,
          (select count(*) from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id where (l.wedding_id = ${wedding.id} or l.bride_profile_id = ${p.id}) and ln.status <> 'removed')::int as cats,
          (select count(*) from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id where (l.wedding_id = ${wedding.id} or l.bride_profile_id = ${p.id}) and ln.status = 'closed_booked')::int as booked,
          coalesce((select total_budget_inr from mkt.weddings where id = ${wedding.id}), 0)::float as budget,
          coalesce((select sum(br.amount_inr) from (select max(b.amount_inr) as amount_inr from mkt.booking_reports b join mkt.lead_needs ln on ln.id = b.lead_need_id join mkt.leads l on l.id = ln.lead_id
            where l.wedding_id = ${wedding.id} or l.bride_profile_id = ${p.id} group by b.lead_need_id) br), 0)::float as committed`
    : [{ tasks: 0, done: 0, guests: 0, replied: 0, cats: 0, booked: 0, budget: 0, committed: 0 }];
  const daysToGo = wedding?.wedding_date ? Math.round((Date.parse(`${wedding.wedding_date}T00:00:00Z`) - Date.parse(`${todayIst()}T00:00:00Z`)) / 864e5) : null;
  return (
    <>
      {wedding ? (
        <section className="jaali arrive relative mb-6 overflow-hidden rounded-3xl bg-[var(--color-pink-soft)] p-5 sm:p-7">
          <Marigold size={120} className="pointer-events-none absolute -right-8 -top-10 opacity-90" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 pr-12 sm:pr-0">
              <p className="text-sm font-medium text-[var(--color-pink-deep)]">{[area?.name, town?.name].filter(Boolean).join(', ') || 'Your wedding'}</p>
              <h1 className="mt-1 text-4xl leading-tight sm:text-5xl" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, letterSpacing: '-0.01em' }}>
                {wedding.title}
              </h1>
              <p className="mt-1 text-[var(--color-muted)]">{wedding.wedding_date ? fmtLongDate(wedding.wedding_date) : 'Add your date below to start the countdown'}</p>
            </div>
            <div className="flex items-center gap-4">
              {daysToGo != null ? (
                <div className="rounded-2xl bg-white/90 px-5 py-3 text-center shadow-[0_10px_30px_-18px_rgb(166_0_72/.6)]">
                  <div className="figure text-5xl leading-none text-[var(--color-pink)]">{Math.abs(daysToGo)}</div>
                  <div className="mt-1 text-xs font-medium text-[var(--color-muted)]">{daysToGo > 0 ? plural(daysToGo, 'day').replace(/^\d+ /, '') + ' to go' : daysToGo === 0 ? 'It is today' : 'days married'}</div>
                </div>
              ) : null}
              <Link href="/enquire" className="btn btn-pink btn-sm">
                Get more quotes
              </Link>
            </div>
          </div>
          <ul className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { href: '#requests', v: prog.booked, t: prog.cats, label: 'Vendors booked', hint: prog.cats ? `${prog.booked} of ${plural(prog.cats, 'category', 'categories')}` : 'Send a request to begin', colour: 'var(--color-pink)' },
              { href: '/me/checklist', v: prog.done, t: prog.tasks, label: 'Checklist', hint: prog.tasks ? `${prog.done} of ${prog.tasks} done` : 'Add your date to get one', colour: '#f6a700' },
              { href: '/me/guests', v: prog.replied, t: prog.guests, label: 'Guests replied', hint: prog.guests ? `${prog.replied} of ${prog.guests}` : 'Add your guest list', colour: '#7a3fc2' },
              { href: '/me/budget', v: prog.committed, t: prog.budget, label: 'Budget booked', hint: prog.budget ? `${formatInr(prog.committed)} of ${formatInr(prog.budget)}` : 'Set a total budget', colour: '#1f7a4d' },
            ].map((r) => (
              <li key={r.label}>
                <Link href={r.href} className="card card-lift flex h-full items-center gap-3 bg-white/95 p-3">
                  <Ring value={r.v} total={r.t} size={56} stroke={6} colour={r.colour} label={`${r.label}: ${r.hint}`}>
                    <span className="figure text-base">{r.t ? `${Math.round((Math.min(r.v, r.t) / r.t) * 100)}%` : '–'}</span>
                  </Ring>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{r.label}</span>
                    <span className="hint block">{r.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="jaali arrive relative mb-6 overflow-hidden rounded-3xl bg-[var(--color-pink-soft)] p-6 sm:p-8">
          <Marigold size={120} className="pointer-events-none absolute -right-8 -top-10 opacity-90" />
          <h1 className="relative text-4xl sm:text-5xl" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
            Welcome to Olready
          </h1>
          <p className="relative mt-2 max-w-xl text-[var(--color-muted)]">Tell us a little about your wedding. Your checklist, budget, guest list and invite all start from the date and the town.</p>
        </section>
      )}
      <Notice error={q.error} ok={q.ok} />

      <Link
        href="/me/assistant"
        className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-pink-soft)] px-4 py-3 hover:bg-[var(--color-tint)]"
      >
        <span>
          <span className="block font-semibold">Ask Olready</span>
          <span className="block text-sm text-[var(--color-muted)]">Find vendors, plan your budget, compare quotes: ask in your own words.</span>
        </span>
        <span aria-hidden className="text-xl text-[var(--color-pink-deep)]">›</span>
      </Link>

      <details className="card mb-6 p-4" open={!wedding}>
        <summary className="cursor-pointer font-semibold">{wedding ? 'Wedding details' : 'Set up your wedding'}</summary>
        <form action={saveWeddingAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Your name">
            <input name="full_name" className="input" defaultValue={p.full_name} />
          </Field>
          <Field label="Partner's name">
            <input name="partner_name" className="input" defaultValue={wedding?.partner_name ?? ''} />
          </Field>
          <Field label="Call it">
            <input name="title" className="input" defaultValue={wedding?.title ?? ''} placeholder="Anu weds Kabir" />
          </Field>
          <Field label="Wedding date" hint="Your checklist is dated back from this.">
            <input name="wedding_date" type="date" className="input" defaultValue={wedding?.wedding_date ?? ''} />
          </Field>
          <div className="sm:col-span-2">
            <PlacePicker
              withArea
              label="Where is the wedding?"
              town={town ? { id: town.id, name: town.name, state: town.state } : null}
              area={area ? { id: area.id, name: area.name, pincode: wedding?.pincode ?? area.pincode } : wedding?.pincode ? { id: null, name: '', pincode: wedding.pincode } : null}
              quick={cities.map((c) => ({ id: c.id, name: c.name, state: c.state }))}
            />
          </div>
          <label className="flex items-center gap-2 self-end py-2 text-sm">
            <input type="checkbox" name="notify_email" defaultChecked={notify} className="h-4 w-4 accent-[var(--color-pink)]" />
            Email me when vendors reply or quote
          </label>
          {wa.any ? (
            <label className="flex items-center gap-2 self-end py-2 text-sm">
              <input type="hidden" name="whatsapp_shown" value="1" />
              <input type="checkbox" name="whatsapp_opt_in" defaultChecked={wa.on} className="h-4 w-4 accent-[var(--color-pink)]" />
              WhatsApp me when my requests are verified and vendors quote or reply
            </label>
          ) : null}
          <div className="self-end">
            <button className="btn">{wedding ? 'Save' : 'Start planning'}</button>
          </div>
        </form>
      </details>

      {perks.length ? (
        <Card className="mb-6">
          <h2 className="font-semibold">Your perks</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {perks.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  7 days of relationship-manager help{' '}
                  {k.activated_at
                    ? `· active until ${fmtDate(k.expires_at)}`
                    : `· use by ${fmtDate(k.claim_by)}`}
                </span>
                {!k.activated_at && k.claim_by > new Date() ? (
                  <form action={activatePerkAction}>
                    <input type="hidden" name="perk_id" value={k.id} />
                    <button className="btn btn-sm btn-pink">Start now</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <h2 id="requests" className="mb-3 scroll-mt-24 font-semibold text-xl">Your requests</h2>
      {needs.length ? (
        <ul className="space-y-3">
          {needs.map((n) => {
            const [label, tone] = leadStatus[n.lead_status] ?? ['', 'plain'];
            const mine = threads.filter((t) => t.lead_need_id === n.need_id);
            return (
              <li key={n.need_id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <b>{n.category_name}</b>
                    {n.budget_inr != null ? <span className="hint">budget {formatInr(n.budget_inr)}</span> : null}
                    {(fnsByNeed.get(n.need_id)?.length ?? 0) > 1 ? (
                      <span className="hint">for {fnsByNeed.get(n.need_id)!.map((f) => f.name).join(', ')}</span>
                    ) : null}
                  </div>
                  {n.status === 'closed_booked' ? (
                    <Badge tone="ok">Booked: {n.booked_vendor}</Badge>
                  ) : n.status === 'closed_by_bride' ? (
                    <Badge>{n.booked_outside ? `Booked outside: ${n.booked_outside.vendor_name}` : 'Closed'}</Badge>
                  ) : (
                    <Badge tone={n.lead_status === 'verified' && n.replies === 0 ? 'plain' : tone}>
                      {n.lead_status !== 'verified'
                        ? label
                        : n.replies === 0
                          ? 'Verified · waiting for vendors'
                          : `${n.replies} vendor${n.replies === 1 ? '' : 's'} replied`}
                    </Badge>
                  )}
                </div>
                {mine.length || n.picked.length ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(() => {
                      const pickedIds = new Set(n.picked.map((v) => v.id));
                      const chat = (t: (typeof mine)[number]) => (
                        <li key={t.id}>
                          <Link href={`/me/threads/${t.id}`} className="btn btn-ghost btn-sm">
                            {t.vendor_name}
                            {t.status === 'quoted' ? ' · quote' : t.status === 'quote_accepted' ? ' · accepted' : ''}
                            {t.unread_bride ? <span className="ml-1.5 rounded-full bg-[var(--color-pink)] px-1.5 text-xs font-semibold leading-5 text-white">{t.unread_bride} new</span> : null}
                          </Link>
                        </li>
                      );
                      const fromPicked = mine.filter((t) => pickedIds.has(t.vendor_id));
                      const others = mine.filter((t) => !pickedIds.has(t.vendor_id));
                      const waiting = n.picked.filter((v) => !mine.some((t) => t.vendor_id === v.id));
                      return (
                        <>
                          {n.picked.length ? (
                            <div>
                              <h3 className="text-sm font-semibold">Vendors you picked</h3>
                              <ul className="mt-2 flex flex-wrap gap-2">
                                {fromPicked.map(chat)}
                                {waiting.map((v) => (
                                  <li key={v.id}>
                                    <Link href={`/v/${v.slug}`} className="btn btn-ghost btn-sm text-[var(--color-muted)]">
                                      {v.name} · not replied yet
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {others.length ? (
                            <div>
                              <h3 className="text-sm font-semibold">{n.picked.length ? 'Other vendors who wrote to you' : 'Vendors who wrote to you'}</h3>
                              <ul className="mt-2 flex flex-wrap gap-2">{others.map(chat)}</ul>
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ) : null}
                {['open', 'capped'].includes(n.status) ? (
                  <details className="mt-3">
                    <summary className="hint cursor-pointer">Booked someone else, or no longer need this?</summary>
                    <form action={closeNeedAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input type="hidden" name="need_id" value={n.need_id} />
                      <input name="outside_vendor" className="input" placeholder="Who did you book? (optional)" />
                      <input name="reason" className="input" placeholder="Why? (optional)" />
                      <button className="btn btn-sm btn-ghost">Close this</button>
                    </form>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty art="letters" title="No requests yet">
          <Link className="underline" href="/enquire">
            Tell us what you need
          </Link>{' '}
          and verified vendors will reach you here.
        </Empty>
      )}
      <div className="mt-8">
        <CallbackForm phone={p.phone} backPath="/me" topics={['booking', 'payments', 'other']} />
      </div>
    </>
  );
}
