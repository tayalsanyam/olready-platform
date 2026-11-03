import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { disputeQueue } from '@/lib/reviews';
import { opsContacted, opsDecideDispute } from '@/lib/actions/ops';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';
import { pendingReviews } from '@/lib/vendorTools';
import { opsDecideInvitedReview } from '@/lib/actions/vendorTools';

export const metadata = { title: 'Review disputes' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const left = (d: Date) => {
  const h = Math.round((d.getTime() - Date.now()) / 36e5);
  return h < 0 ? `${-h}h overdue` : h <= 48 ? `${h}h left` : `${Math.round(h / 24)}d left`;
};

export default async function Disputes({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  const rows = await disputeQueue(sql);
  return (
    <>
      <PageTitle title="Review disputes" sub="Contact the vendor within 48 hours. They then have 7 days to send proof; without proof the review stays." />
      <Notice error={q.error} ok={q.ok} />
      <PendingInvited />
      <h2 className="mb-2 mt-6 font-semibold">Disputes</h2>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((d) => {
            const due = d.status === 'open' ? d.contact_due_at : d.proof_due_at;
            const overdue = due ? due.getTime() < Date.now() : false;
            return (
              <li key={d.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>{d.vendor_name}</b>
                    <span className="flex items-center gap-2">
                      <Badge tone="warn">{d.status.replace('_', ' ')}</Badge>
                      {due && d.status !== 'proof_submitted' ? <Badge tone={overdue ? 'bad' : 'plain'}>{left(due)}</Badge> : null}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="text-[var(--color-muted)]">Review:</span> {d.review_body || '(no text)'}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="text-[var(--color-muted)]">Vendor says:</span> {d.reason}
                  </p>
                  {d.proof ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      <span className="text-[var(--color-muted)]">Proof:</span> {d.proof}
                    </p>
                  ) : null}
                  {d.status === 'open' ? (
                    <form action={opsContacted} className="mt-3">
                      <input type="hidden" name="dispute_id" value={d.id} />
                      <button className="btn btn-sm">I contacted the vendor</button>
                    </form>
                  ) : d.status === 'proof_submitted' ? (
                    <form action={opsDecideDispute} className="mt-3 flex flex-wrap gap-2">
                      <input type="hidden" name="dispute_id" value={d.id} />
                      <input name="note" className="input flex-1" placeholder="Reason for the decision" required />
                      <button name="uphold" value="1" className="btn btn-sm btn-danger">
                        Remove review
                      </button>
                      <button name="uphold" value="0" className="btn btn-sm btn-ghost">
                        Keep review
                      </button>
                    </form>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No open disputes" />
      )}
    </>
  );
}

/** Reviews written through a vendor's invitation link wait here until Ops publishes or removes them. */
async function PendingInvited() {
  const rows = await pendingReviews(sql);
  if (!rows.length) return null;
  return (
    <section>
      <h2 className="mb-2 font-semibold">Reviews from vendor invitations ({rows.length})</h2>
      <p className="hint mb-2">Check the reviewer looks like a real client: a name and email that are not the vendor&apos;s, and a believable review.</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b>{r.vendor_name}</b>
                <span>
                  from {r.author_name || 'unnamed'} ({r.author_email})
                </span>
                <Badge>
                  Work {r.rating_artist}/5, service {r.rating_service}/5
                </Badge>
              </div>
              {r.body ? <p className="mt-2 text-sm">{r.body}</p> : null}
              <div className="mt-3 flex gap-2">
                <form action={opsDecideInvitedReview}>
                  <input type="hidden" name="review_id" value={r.id} />
                  <input type="hidden" name="publish" value="1" />
                  <button className="btn btn-sm">Publish</button>
                </form>
                <form action={opsDecideInvitedReview}>
                  <input type="hidden" name="review_id" value={r.id} />
                  <input type="hidden" name="publish" value="0" />
                  <button className="btn btn-ghost btn-sm">Remove</button>
                </form>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
