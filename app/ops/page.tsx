import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { Notice, PageTitle, Stat } from '@/components/ui';
import { CALLBACK_TOPICS, openCallbacks } from '@/lib/vendorTools';
import { opsCloseCallback } from '@/lib/actions/vendorTools';

export const metadata = { title: 'Today' };

export default async function OpsHome({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const q = await searchParams;
  const p = await requireStaff();
  const calls = await openCallbacks(sql);
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
      (select count(*) from mkt.booking_reports where created_at > now() - interval '7 days')::int as bookings_7d`;
  const queues: [string, number, string, string?][] = [
    ['Leads to verify', c.to_verify, '/ops/leads'],
    ['Capped leads to decide', c.capped, '/ops/needs'],
    ['Profiles to review', c.vendors_pending, '/ops/vendors?status=pending_review'],
    ['Claims to approve', c.claims, '/ops/vendors'],
    ['Plans waiting for contract', c.contracts, '/ops/payments'],
    ['Bank transfers to confirm', c.transfers, '/ops/payments'],
    ['Disputes to contact', c.disputes_contact, '/ops/reviews', c.disputes_overdue ? `${c.disputes_overdue} past 48 hours` : undefined],
    ['Disputes to decide', c.disputes_decide, '/ops/reviews'],
    ['Real weddings to review', c.weddings, '/ops/content'],
    ['Relationship-manager requests', c.rm_pending, '/ops/rm'],
    ['Chat messages to check', c.flagged, '/ops/moderation'],
    ['Invited reviews to approve', c.reviews_pending, '/ops/reviews'],
  ];
  return (
    <>
      <PageTitle title={`Hello ${p.full_name || 'team'}`} sub="What needs a person today." />
      <Notice error={q.error} ok={q.ok} />
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
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Verified, 7 days" value={c.verified_7d} />
        <Stat label="Unlocks, 7 days" value={c.unlocks_7d} />
        <Stat label="Bookings, 7 days" value={c.bookings_7d} />
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {queues.map(([label, n, href, warn]) => (
          <li key={label}>
            <Link href={href} className={`card block p-4 hover:shadow-md ${n ? '' : 'opacity-60'}`}>
              <div className="text-sm text-[var(--color-muted)]">{label}</div>
              <div className="text-2xl font-semibold">{n}</div>
              {warn ? <div className="text-xs font-semibold text-[var(--color-bad)]">{warn}</div> : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
