import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { FLAG_LABELS, REPORT_REASONS, moderationQueue } from '@/lib/moderation';
import { opsModerateAction } from '@/lib/actions/threads';
import { Badge, Card, Empty, Notice, PageTitle, sp } from '@/components/ui';

export const metadata = { title: 'Chat moderation' };
type P = { searchParams: Promise<Record<string, string | string[]>> };
const fmt = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
const VIEWS = [
  ['flagged', 'To check'],
  ['hidden', 'Hidden'],
  ['cleared', 'Cleared'],
] as const;

export default async function Moderation({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  const view = (VIEWS.find(([k]) => k === sp(q.view))?.[0] ?? 'flagged') as 'flagged' | 'hidden' | 'cleared';
  const rows = await moderationQueue(sql, view);
  const self = `/ops/moderation?view=${view}`;
  return (
    <>
      <PageTitle
        title="Chat moderation"
        sub="Messages flagged automatically or reported by the other side. Hiding removes the words for both sides; staff can still read them."
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-4 flex gap-2" role="group" aria-label="Show">
        {VIEWS.map(([k, label]) => (
          <Link key={k} href={`/ops/moderation?view=${k}`} className="chip" aria-current={view === k}>
            {label}
          </Link>
        ))}
      </div>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <b>{m.sender_name || m.sender_role}</b> ({m.sender_role}) in {m.vendor_name} with {m.bride_name}
                  </span>
                  <span className="text-[var(--color-muted)]">{fmt(m.created_at)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.flags.map((f) => (
                    <Badge key={f} tone="warn">
                      {FLAG_LABELS[f] ?? f}
                    </Badge>
                  ))}
                  {m.reports.map((r, i) => (
                    <Badge key={i} tone="bad">
                      Reported by {r.by || 'user'}: {REPORT_REASONS[r.reason] ?? r.reason}
                    </Badge>
                  ))}
                </div>
                {m.before.length ? (
                  <ol className="mt-3 space-y-1 border-l-2 border-[var(--color-line)] pl-3 text-xs text-[var(--color-muted)]">
                    {m.before.map((b, i) => (
                      <li key={i}>
                        <b>{b.sender_name}:</b> {b.body}
                      </li>
                    ))}
                  </ol>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[var(--color-tint)] p-3 text-sm">{m.body || '(file only)'}</p>
                {m.attachment_url ? (
                  <a className="text-sm underline" href={m.attachment_url} target="_blank" rel="noreferrer">
                    Open attachment
                  </a>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {view !== 'hidden' ? (
                    <form action={opsModerateAction}>
                      <input type="hidden" name="message_id" value={m.id} />
                      <input type="hidden" name="decision" value="hide" />
                      <input type="hidden" name="_back" value={self} />
                      <button className="btn btn-sm">Hide</button>
                    </form>
                  ) : (
                    <form action={opsModerateAction}>
                      <input type="hidden" name="message_id" value={m.id} />
                      <input type="hidden" name="decision" value="show" />
                      <input type="hidden" name="_back" value={self} />
                      <button className="btn btn-ghost btn-sm">Show again</button>
                    </form>
                  )}
                  {view === 'flagged' ? (
                    <form action={opsModerateAction}>
                      <input type="hidden" name="message_id" value={m.id} />
                      <input type="hidden" name="decision" value="clear" />
                      <input type="hidden" name="_back" value={self} />
                      <button className="btn btn-ghost btn-sm">It&apos;s fine</button>
                    </form>
                  ) : null}
                  <Link href={`/ops/threads/${m.thread_id}`} className="btn btn-ghost btn-sm">
                    Open conversation
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={view === 'flagged' ? 'Nothing to check' : 'Nothing here'} />
      )}
    </>
  );
}
