import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { reviewsForVendor } from '@/lib/reviews';
import { disputeReviewAction, replyReviewAction, submitProofAction } from '@/lib/actions/vendor';
import { vendorRequestReview } from '@/lib/actions/vendorTools';
import { reviewRequestsFor } from '@/lib/vendorTools';
import { siteUrl } from '@/lib/seo';
import { Badge, Card, Empty, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reviews', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d) : '');

export default async function VendorReviews({ searchParams }: P) {
  const q = await searchParams;
  const { vendor } = await requireVendor('/vendor/reviews');
  const reviews = await reviewsForVendor(sql, vendor.id, { includeDisputed: true });
  const disputes = await sql<{ id: string; review_id: string; status: string; proof_due_at: Date | null; contact_due_at: Date }[]>`
    select id, review_id, status, proof_due_at, contact_due_at from mkt.review_disputes where vendor_id = ${vendor.id}
    order by created_at desc`;
  const requests = await reviewRequestsFor(sql, vendor.id);
  const widget = `<iframe src="${siteUrl()}/widget/${vendor.slug}" title="${vendor.business_name} reviews on OLReady" width="100%" height="320" style="border:0;max-width:420px" loading="lazy"></iframe>`;
  return (
    <>
      <PageTitle title="Reviews" sub="Brides rate the artist and the service separately. Reply publicly, or dispute a review you think is false." />
      <Notice error={q.error} ok={q.ok} />
      {reviews.length ? (
        <ul className="space-y-4">
          {reviews.map((r) => {
            const d = disputes.find((x) => x.review_id === r.id && ['open', 'awaiting_proof', 'proof_submitted'].includes(x.status));
            return (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b>{r.author_name || 'A bride'}</b>
                    <span>
                      Artist {r.rating_artist}/5 · Service {r.rating_service}/5
                    </span>
                    {r.verified_booking ? <Badge tone="ok">Booked via OLReady</Badge> : null}
                    {r.status === 'under_dispute' ? <Badge tone="warn">Under dispute</Badge> : null}
                  </div>
                  {r.body ? <p className="mt-2 text-sm">{r.body}</p> : null}
                  {r.vendor_reply ? (
                    <p className="mt-2 border-l-2 border-[var(--color-pink)] pl-3 text-sm text-[var(--color-muted)]">Your reply: {r.vendor_reply}</p>
                  ) : (
                    <form action={replyReviewAction} className="mt-3 flex gap-2">
                      <input type="hidden" name="review_id" value={r.id} />
                      <input name="reply" className="input" placeholder="Reply publicly" />
                      <button className="btn btn-sm">Reply</button>
                    </form>
                  )}
                  {d ? (
                    <div className="mt-3 rounded-lg bg-[var(--color-tint)] p-3 text-sm">
                      {d.status === 'open' ? (
                        <p>Dispute received. Our team will contact you by {fmt(d.contact_due_at)}.</p>
                      ) : d.status === 'awaiting_proof' ? (
                        <form action={submitProofAction} className="space-y-2">
                          <p>Send your proof by {fmt(d.proof_due_at)}, or the review stays as it is.</p>
                          <input type="hidden" name="dispute_id" value={d.id} />
                          <textarea name="proof" rows={3} required className="input" placeholder="Booking records, chat logs, links" />
                          <button className="btn btn-sm">Send proof</button>
                        </form>
                      ) : (
                        <p>Proof received. Our team is reviewing it.</p>
                      )}
                    </div>
                  ) : r.status === 'published' ? (
                    <details className="mt-3">
                      <summary className="hint cursor-pointer">This review is false</summary>
                      <form action={disputeReviewAction} className="mt-2 space-y-2">
                        <input type="hidden" name="review_id" value={r.id} />
                        <textarea name="reason" required rows={2} className="input" placeholder="Why is it false?" />
                        <button className="btn btn-sm btn-ghost">Open a dispute</button>
                      </form>
                    </details>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No reviews yet">After an event, OLReady asks your brides to review you.</Empty>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Ask a client for a review</h2>
          <p className="hint mt-1">
            For clients who booked you outside OLReady. They get a link, sign in with that email and rate you. Our team checks each one
            before it shows, and it is not marked &ldquo;Booked via OLReady&rdquo;.
          </p>
          <form action={vendorRequestReview} className="mt-3 space-y-3">
            <Field label="Client's name">
              <input name="client_name" required maxLength={80} className="input" />
            </Field>
            <Field label="Client's email">
              <input name="client_email" type="email" required className="input" />
            </Field>
            <button className="btn btn-sm">Send review link</button>
          </form>
          {requests.length ? (
            <ul className="mt-4 divide-y divide-[var(--color-line)] text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {r.client_name} <span className="text-[var(--color-muted)]">{r.client_email}</span>
                  </span>
                  <Badge tone={r.status === 'used' ? 'ok' : 'plain'}>{r.status === 'used' ? 'reviewed' : 'link sent'}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
        <Card>
          <h2 className="font-semibold">Show your OLReady reviews on your website</h2>
          <p className="hint mt-1">Paste this where you want your rating and latest reviews. It updates by itself.</p>
          <textarea readOnly rows={5} className="input mt-3 font-mono text-xs" value={widget} aria-label="Review widget code" />
          <p className="hint mt-2">
            Preview:{' '}
            <a className="underline" href={`/widget/${vendor.slug}`} target="_blank" rel="noreferrer">
              open the widget
            </a>
          </p>
        </Card>
      </div>
    </>
  );
}
