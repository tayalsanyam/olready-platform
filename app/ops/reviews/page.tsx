import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { disputeQueue } from '@/lib/reviews';
import { opsContacted, opsDecideDispute } from '@/lib/actions/ops';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';

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
