import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { reviewsForVendor } from '@/lib/reviews';
import { disputeReviewAction, replyReviewAction, submitProofAction } from '@/lib/actions/vendor';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';

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
                    <p className="mt-2 border-l-2 border-[var(--color-gold)] pl-3 text-sm text-[var(--color-muted)]">Your reply: {r.vendor_reply}</p>
                  ) : (
                    <form action={replyReviewAction} className="mt-3 flex gap-2">
                      <input type="hidden" name="review_id" value={r.id} />
                      <input name="reply" className="input" placeholder="Reply publicly" />
                      <button className="btn btn-sm">Reply</button>
                    </form>
                  )}
                  {d ? (
                    <div className="mt-3 rounded-lg bg-[var(--color-cream)] p-3 text-sm">
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
    </>
  );
}
