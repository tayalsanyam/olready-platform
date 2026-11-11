import { openCaptureCount } from '@/lib/captures';
import { openErrorCount } from '@/lib/errors';
import { Marigold, Spark } from '@/components/Art';
import { fmtLongDate, greeting, plural } from '@/lib/dates';
import { plansBehind } from '@/lib/alerts';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { Notice, PageTitle, Stat } from '@/components/ui';
import { formatInr } from '@/lib/catalog';
import { CALLBACK_TOPICS, openCallbacks } from '@/lib/vendorTools';
import { opsCloseCallback } from '@/lib/actions/vendorTools';
import { opsCloseContact } from '@/lib/actions/ops';
import { CONTACT_TOPICS, openContacts } from '@/lib/contact';

export const metadata = { title: 'Today' };

export default async function OpsHome({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const q = await searchParams;
  const p = await requireStaff();
  const [calls, contacts] = await Promise.all([openCallbacks(sql), openContacts(sql)]);
  const behind = (await plansBehind(sql)).length;
  const errors = await openErrorCount(sql);
  const captures = await openCaptureCount(sql);
  const [c] = await sql<Record<string, number>[]>`
    select
      (select count(*) from mkt.leads where status in ('new','verifying'))::int as to_verify,
      (select count(*) from mkt.lead_needs where status = 'capped' and reopen_rounds < 2)::int as capped,
      (select count(*) from mkt.vendors where status = 'pending_review')::int as vendors_pending,
      (select count(*) from mkt.vendor_claims where status = 'submitted')::int as claims,
      (select count(*) from mkt.vendor_subscriptions where status = 'pending_contract')::int as contracts,
      (select count(*) from mkt.orders where status = 'created' and gateway = 'manual')::int as transfers,
      (select count(*) from mkt.review_disputes where status = 'open')::int as disputes_contact,
      (select count(*) from mkt.review_disputes where status = 'open' and contact_due_at < now())::int as disputes_overdue,
      (select count(*) from mkt.review_disputes where status = 'proof_submitted')::int as disputes_decide,
      (select count(*) from mkt.real_weddings where status = 'submitted')::int as weddings,
      (select count(*) from mkt.rm_engagements where status = 'pending_approval')::int as rm_pending,
      (select count(*) from mkt.messages where review_status = 'flagged')::int as flagged,
      (select count(*) from mkt.reviews where status = 'pending')::int as reviews_pending,
      (select count(*) from mkt.leads where verified_at > now() - interval '7 days')::int as verified_7d,
      (select count(*) from mkt.unlocks where created_at > now() - interval '7 days' and not refunded)::int as unlocks_7d,
      (select count(*) from mkt.booking_reports where created_at > now() - interval '7 days')::int as bookings_7d,
      (select count(*) from mkt.banners where status = 'pending')::int as banners,
      (select count(*) from mkt.whatsapp_outbox where status = 'failed' and updated_at > now() - interval '7 days')::int as wa_failed,
      (select count(*) from mkt.assistant_messages where cardinality(flags) > 0 and created_at > now() - interval '7 days')::int as ai_flagged`;
  // Money, for admins: this calendar month in India time, from tax documents so it matches the books.
  const money =
    p.role === 'admin'
      ? (
          await sql<{ billed: number; credited: number; gst: number; invoices: number; plans: number; wallet_owed: number; boost_spend: number; last_billed: number }[]>`
            with m as (select date_trunc('month', now() at time zone 'Asia/Kolkata') as start)
            select
              coalesce(sum(d.total_paise) filter (where d.kind = 'invoice'), 0)::bigint / 100.0 as billed,
              coalesce(sum(d.total_paise) filter (where d.kind = 'credit_note'), 0)::bigint / 100.0 as credited,
              coalesce(sum(case when d.kind = 'invoice' then 1 else -1 end * (d.cgst_paise + d.sgst_paise + d.igst_paise)), 0)::bigint / 100.0 as gst,
              count(*) filter (where d.kind = 'invoice')::int as invoices,
              (select count(*)::int from mkt.vendor_subscriptions s, m where s.status = 'active' and s.starts_at at time zone 'Asia/Kolkata' >= m.start) as plans,
              (select coalesce(sum(delta_inr), 0)::int from mkt.ad_wallet_ledger) as wallet_owed,
              (select coalesce(sum(charged_inr), 0)::int from mkt.boost_visits v, m where v.day >= m.start::date) as boost_spend,
              (select coalesce(sum(total_paise), 0)::bigint / 100.0 from mkt.tax_documents x, m
                where x.kind = 'invoice' and x.issued_at at time zone 'Asia/Kolkata' >= m.start - interval '1 month' and x.issued_at at time zone 'Asia/Kolkata' < m.start) as last_billed
            from mkt.tax_documents d, m
            where d.issued_at at time zone 'Asia/Kolkata' >= m.start`
        )[0]
      : null;
  const queues: [string, number, string, string?][] = [
    ['Leads to verify', c.to_verify, '/ops/leads'],
    ['Capped leads to decide', c.capped, '/ops/needs'],
    ['Profiles to review', c.vendors_pending, '/ops/vendors?status=pending_review'],
    ['Claims to approve', c.claims, '/ops/vendors'],
    ['Plans waiting for contract', c.contracts, '/ops/payments'],
    ['Plans behind on usage', behind, '/ops/usage'],
    ['Numbers to call', captures, '/ops/captures'],
    ['Errors to look at', errors, '/ops/errors'],
    ['Bank transfers to confirm', c.transfers, '/ops/payments'],
    ['Disputes to contact', c.disputes_contact, '/ops/reviews', c.disputes_overdue ? `${c.disputes_overdue} past 48 hours` : undefined],
    ['Disputes to decide', c.disputes_decide, '/ops/reviews'],
    ['Real weddings to review', c.weddings, '/ops/content'],
    ['Relationship-manager requests', c.rm_pending, '/ops/rm'],
    ['Chat messages to check', c.flagged, '/ops/moderation'],
    ['Invited reviews to approve', c.reviews_pending, '/ops/reviews'],
    ['Banners to approve', c.banners, '/ops/promotions'],
    ['WhatsApp messages that failed', c.wa_failed, '/ops/whatsapp'],
    ['Ask Olready answers to check', c.ai_flagged, '/ops/bride-ai'],
  ];
  const waiting = queues.reduce((a, [, n]) => a + (n || 0), 0) + contacts.length + calls.length;
  const trend = await sql<{ leads: number; unlocks: number; bookings: number }[]>`
    select
      (select count(*) from mkt.leads l where (l.created_at at time zone 'Asia/Kolkata')::date = d)::int as leads,
      (select count(*) from mkt.unlocks u where (u.created_at at time zone 'Asia/Kolkata')::date = d and not u.refunded)::int as unlocks,
      (select count(*) from mkt.booking_reports b where (b.created_at at time zone 'Asia/Kolkata')::date = d)::int as bookings
    from generate_series((now() at time zone 'Asia/Kolkata')::date - 13, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') as g(d) order by d`;
  return (
    <>
      <section className="jaali-dark arrive relative mb-5 overflow-hidden rounded-3xl bg-[var(--color-ink)] p-5 text-white sm:p-6">
        <Marigold size={96} className="pointer-events-none absolute -right-7 -top-8 opacity-90" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm text-white/70">{fmtLongDate(new Date())}</p>
            <h1 className="mt-1 text-3xl sm:text-4xl" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
              {greeting()}, {(p.full_name || 'team').split(' ')[0]}
            </h1>
            <p className="mt-1.5 text-white/85">{waiting ? `${plural(waiting, 'thing')} ${waiting === 1 ? 'is' : 'are'} waiting for a person.` : 'Nothing is waiting. Every queue is clear.'}</p>
          </div>
          <dl className="grid grid-cols-3 gap-4">
            {[
              ['Requests in', trend.map((t) => t.leads), '#ffc23d'],
              ['Opened by vendors', trend.map((t) => t.unlocks), '#ff8fb8'],
              ['Bookings', trend.map((t) => t.bookings), '#8fe3b5'],
            ].map(([label, values, colour]) => (
              <div key={label as string}>
                <dt className="text-xs text-white/70">{label as string}, 14 days</dt>
                <dd className="mt-0.5 flex items-end gap-2">
                  <span className="figure text-3xl leading-none">{(values as number[]).reduce((a, b) => a + b, 0)}</span>
                  <span className="hidden sm:block">
                    <Spark values={values as number[]} width={84} height={30} colour={colour as string} label={`${label}, day by day`} />
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <Notice error={q.error} ok={q.ok} />
      {contacts.length ? (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Contact messages ({contacts.length})</h2>
          <ul className="space-y-2">
            {contacts.map((m) => (
              <li key={m.id} className="card p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <b>
                    {m.name} <span className="font-normal text-[var(--color-muted)]">about {CONTACT_TOPICS[m.topic]?.toLowerCase()}</span>
                  </b>
                  <span className="text-xs text-[var(--color-muted)]">{m.created_at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
                <p className="mt-1 text-[var(--color-muted)]">
                  {m.email ? <a className="underline" href={`mailto:${m.email}`}>{m.email}</a> : null}
                  {m.email && m.phone ? ', ' : ''}
                  {m.phone ? <a className="underline" href={`tel:${m.phone}`}>{m.phone}</a> : null}
                </p>
                <form action={opsCloseContact} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input name="note" className="input py-1" placeholder="How you replied" aria-label="Reply note" />
                  <button className="btn btn-ghost btn-sm">Done</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {calls.length ? (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Call back ({calls.length})</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {calls.map((cb) => (
              <li key={cb.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>
                    {cb.name || 'Someone'} <span className="font-normal text-[var(--color-muted)]">({cb.vendor_name ?? cb.role})</span>
                  </b>
                  <a className="font-semibold underline" href={`tel:${cb.phone}`}>
                    {cb.phone}
                  </a>
                </div>
                <p className="mt-1">
                  {CALLBACK_TOPICS[cb.topic]}
                  {cb.preferred_time ? `, ${cb.preferred_time}` : ''}
                </p>
                {cb.note ? <p className="mt-1 text-[var(--color-muted)]">{cb.note}</p> : null}
                <form action={opsCloseCallback} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={cb.id} />
                  <input name="outcome" className="input py-1" placeholder="What happened on the call" aria-label="Call outcome" />
                  <button className="btn btn-ghost btn-sm">Done</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {money ? (
        <section className="mb-6 rounded-[18px] border border-[var(--color-line)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">This month</h2>
            <span className="text-xs text-[var(--color-muted)]">
              From tax invoices and credit notes. <Link href="/ops/data/tax-documents" className="underline">See them all</Link>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Billed, after refunds" value={formatInr(Math.round(Number(money.billed) - Number(money.credited)))} hint={`${money.invoices} invoices; last month ${formatInr(Math.round(Number(money.last_billed)))}`} />
            <Stat label="GST to pay" value={formatInr(Math.round(Number(money.gst)))} hint="Net of credit notes" />
            <Stat label="New plans" value={money.plans} hint={`Boost spend ${formatInr(money.boost_spend)}`} />
            <Stat label="Ads wallets owed" value={formatInr(money.wallet_owed)} hint="Unspent vendor balances" />
          </div>
        </section>
      ) : null}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Verified, 7 days" value={c.verified_7d} />
        <Stat label="Unlocks, 7 days" value={c.unlocks_7d} />
        <Stat label="Bookings, 7 days" value={c.bookings_7d} />
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {[...queues].sort((a, b) => Number(b[1] > 0) - Number(a[1] > 0)).map(([label, n, href, warn]) => (
          <li key={label}>
            <Link href={href} className={`card block p-4 hover:shadow-md ${n ? 'border-[var(--color-pink)]' : 'bg-[var(--color-tint)]'}`}>
              <div className={`text-sm ${n ? 'font-medium' : 'text-[var(--color-muted)]'}`}>{label}</div>
              <div className={`text-2xl font-semibold ${n ? '' : 'text-[var(--color-muted)]'}`}>{n}</div>
              {warn ? <div className="text-xs font-semibold text-[var(--color-bad)]">{warn}</div> : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
