import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireProfile, STAFF_ROLES } from '@/lib/auth';
import { formatInr, listCities } from '@/lib/catalog';
import { threadsForBride } from '@/lib/threads';
import { weddingFor } from '@/lib/weddings';
import { activatePerkAction, closeNeedAction, saveWeddingAction } from '@/lib/actions/bride';
import { Badge, Card, Empty, Field, Notice, PageTitle } from '@/components/ui';

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
  const needs = await sql<NeedRow[]>`
    select ln.id as need_id, l.id as lead_id, l.status as lead_status, c.name as category_name, ln.status, ln.budget_inr,
      bv.business_name as booked_vendor, ln.booked_outside,
      (select count(*) from mkt.threads t where t.lead_need_id = ln.id)::int as replies
    from mkt.leads l
    join mkt.lead_needs ln on ln.lead_id = l.id
    join mkt.categories c on c.id = ln.category_id
    left join mkt.vendors bv on bv.id = ln.booked_vendor_id
    where (l.bride_profile_id = ${p.id}
       or exists (select 1 from mkt.wedding_members m where m.wedding_id = l.wedding_id and m.profile_id = ${p.id}))
      and ln.status <> 'removed'
    order by l.created_at desc, c.sort`;
  const perks = await sql<{ id: string; perk: string; claim_by: Date; activated_at: Date | null; expires_at: Date | null }[]>`
    select id, perk, claim_by, activated_at, expires_at from mkt.bride_perks where profile_id = ${p.id} order by created_at desc`;
  return (
    <>
      <PageTitle
        title={wedding ? wedding.title : 'Welcome to OLReady'}
        sub={wedding ? [wedding.wedding_date, cities.find((c) => c.id === wedding.city_id)?.name].filter(Boolean).join(' · ') : 'Tell us a little about your wedding to start planning.'}
        action={
          <Link href="/enquire" className="btn btn-gold btn-sm">
            Get more quotes
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />

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
          <Field label="City">
            <select name="city_id" className="input" defaultValue={wedding?.city_id ?? cities[0]?.id}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
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
                    ? `· active until ${k.expires_at!.toISOString().slice(0, 10)}`
                    : `· use by ${k.claim_by.toISOString().slice(0, 10)}`}
                </span>
                {!k.activated_at && k.claim_by > new Date() ? (
                  <form action={activatePerkAction}>
                    <input type="hidden" name="perk_id" value={k.id} />
                    <button className="btn btn-sm btn-gold">Start now</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl">Your requests</h2>
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
                {mine.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {mine.map((t) => (
                      <li key={t.id}>
                        <Link href={`/me/threads/${t.id}`} className="btn btn-ghost btn-sm">
                          {t.vendor_name}
                          {t.status === 'quoted' ? ' · quote' : t.status === 'quote_accepted' ? ' · accepted' : ''}
                        </Link>
                      </li>
                    ))}
                  </ul>
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
        <Empty title="No requests yet">
          <Link className="underline" href="/enquire">
            Tell us what you need
          </Link>{' '}
          and verified vendors will reach you here.
        </Empty>
      )}
    </>
  );
}
