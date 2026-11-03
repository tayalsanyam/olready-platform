import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { opsClearSuppression } from '@/lib/actions/ops';
import { Badge, Card, Empty, Notice, PageTitle, Stat, sp } from '@/components/ui';

export const metadata = { title: 'Email' };
type P = { searchParams: Promise<Record<string, string | string[]>> };
const fmt = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
const REASON: Record<string, string> = { hard_bounce: 'Bounced', complaint: 'Marked as spam', soft_bounce: 'Kept bouncing', unsubscribed: 'Unsubscribed' };

export default async function Emails({ searchParams }: P) {
  const q = await searchParams;
  await requireRole(['ops', 'admin']);
  const [[c], blocked, errors, byTemplate] = await Promise.all([
    sql<{ queued: number; sent_24h: number; failing: number; suppressed: number }[]>`
      select
        (select count(*) from mkt.email_outbox where sent_at is null)::int as queued,
        (select count(*) from mkt.email_outbox where sent_at > now() - interval '24 hours' and error is null)::int as sent_24h,
        (select count(*) from mkt.email_outbox where sent_at is null and error is not null)::int as failing,
        (select count(*) from mkt.email_suppressions)::int as suppressed`,
    sql<{ email: string; reason: string; detail: string; created_at: Date }[]>`select * from mkt.email_suppressions order by created_at desc limit 200`,
    sql<{ to_email: string; template: string; error: string; created_at: Date }[]>`
      select to_email, template, error, created_at from mkt.email_outbox where error is not null order by created_at desc limit 30`,
    sql<{ template: string; n: number }[]>`
      select template, count(*)::int as n from mkt.email_outbox where created_at > now() - interval '30 days' group by template order by n desc`,
  ]);
  return (
    <>
      <PageTitle title="Email" sub="What the platform sends, and addresses we must not email. Without RESEND_API_KEY, emails wait in the queue." />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Waiting to send" value={c.queued} />
        <Stat label="Sent, 24 hours" value={c.sent_24h} />
        <Stat label="Failing" value={c.failing} />
        <Stat label="Not emailed" value={c.suppressed} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Not emailed</h2>
          <p className="hint">Bounces, spam complaints and unsubscribes. Allow again only when the person asks or the address is fixed.</p>
          {blocked.length ? (
            <ul className="mt-3 divide-y divide-[var(--color-line)] text-sm">
              {blocked.map((b) => (
                <li key={b.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {b.email} <Badge tone={b.reason === 'unsubscribed' ? 'plain' : 'bad'}>{REASON[b.reason]}</Badge>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {fmt(b.created_at)}
                      {b.detail ? `, ${b.detail}` : ''}
                    </span>
                  </span>
                  <form action={opsClearSuppression}>
                    <input type="hidden" name="email" value={b.email} />
                    <button className="btn btn-ghost btn-sm">Allow email again</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nobody blocked" />
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Sent in the last 30 days</h2>
            <ul className="mt-2 text-sm">
              {byTemplate.map((t) => (
                <li key={t.template} className="flex justify-between py-0.5">
                  <span>{t.template.replace(/_/g, ' ')}</span>
                  <span className="figure">{t.n}</span>
                </li>
              ))}
            </ul>
          </Card>
          {errors.length ? (
            <Card>
              <h2 className="font-semibold">Recent problems</h2>
              <ul className="mt-2 space-y-1 text-xs">
                {errors.map((e, i) => (
                  <li key={i}>
                    {fmt(e.created_at)} · {e.template} to {e.to_email}: {e.error}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
