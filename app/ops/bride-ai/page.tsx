import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { aiEnabled } from '@/lib/ai';
import { getSetting } from '@/lib/db';
import { Badge, Card, PageTitle, Stat, sp } from '@/components/ui';

export const metadata = { title: 'Ask OLReady' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const FLAG_LABEL: Record<string, string> = {
  unknown_vendor: 'Named a vendor not in its lookups (link removed)',
  contact: 'Phone or email in the answer (removed)',
  unsourced_price: 'Gave a price without looking it up',
};

export default async function BrideAi({ searchParams }: P) {
  await requireRole(['ops', 'admin'], '/ops/bride-ai');
  const q = await searchParams;
  const show = sp(q.show) === 'unhelpful' ? 'unhelpful' : 'flagged';
  const [on, [d], days, rows] = await Promise.all([
    getSetting<number>(sql, 'bride_assistant_on', 1),
    sql<{ q_today: number; q_week: number; brides_week: number; up: number; down: number; flagged: number; actions_done: number; actions_total: number }[]>`
      select
        (select count(*)::int from mkt.assistant_messages where role = 'user' and text <> '' and (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date) as q_today,
        (select count(*)::int from mkt.assistant_messages where role = 'user' and text <> '' and created_at > now() - interval '7 days') as q_week,
        (select count(distinct t.profile_id)::int from mkt.assistant_threads t where t.updated_at > now() - interval '7 days') as brides_week,
        (select count(*)::int from mkt.assistant_feedback where helpful and created_at > now() - interval '7 days') as up,
        (select count(*)::int from mkt.assistant_feedback where not helpful and created_at > now() - interval '7 days') as down,
        (select count(*)::int from mkt.assistant_messages where cardinality(flags) > 0 and created_at > now() - interval '7 days') as flagged,
        (select count(*)::int from mkt.assistant_actions where status = 'done' and created_at > now() - interval '7 days') as actions_done,
        (select count(*)::int from mkt.assistant_actions where created_at > now() - interval '7 days') as actions_total`,
    sql<{ day: string; questions: number }[]>`
      select to_char(d, 'DD Mon') as day, (select count(*)::int from mkt.assistant_messages m where m.role = 'user' and m.text <> '' and (m.created_at at time zone 'Asia/Kolkata')::date = d::date) as questions
      from generate_series((now() at time zone 'Asia/Kolkata')::date - 13, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') d order by d`,
    show === 'flagged'
      ? sql<{ id: string; thread_id: string; text: string; flags: string[]; created_at: Date; question: string | null }[]>`
          select m.id, m.thread_id, m.text, m.flags, m.created_at,
            (select u.text from mkt.assistant_messages u where u.thread_id = m.thread_id and u.role = 'user' and u.text <> '' and u.created_at <= m.created_at order by u.created_at desc limit 1) as question
          from mkt.assistant_messages m where cardinality(m.flags) > 0 order by m.created_at desc limit 40`
      : sql<{ id: string; thread_id: string; text: string; flags: string[]; created_at: Date; question: string | null }[]>`
          select m.id, m.thread_id, m.text, m.flags, m.created_at,
            (select u.text from mkt.assistant_messages u where u.thread_id = m.thread_id and u.role = 'user' and u.text <> '' and u.created_at <= m.created_at order by u.created_at desc limit 1) as question
          from mkt.assistant_feedback f join mkt.assistant_messages m on m.id = f.message_id where not f.helpful order by f.created_at desc limit 40`,
  ]);
  const max = Math.max(1, ...days.map((x) => x.questions));
  return (
    <>
      <PageTitle
        title="Ask OLReady"
        sub="The brides' planning helper. Answers are checked automatically; anything caught is listed here."
        action={
          <Link href="/ops/settings" className="btn btn-ghost btn-sm">
            Limits and on/off
          </Link>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {!aiEnabled() ? <Badge tone="warn">Off: ANTHROPIC_API_KEY is not set</Badge> : on ? <Badge tone="ok">On</Badge> : <Badge tone="warn">Switched off in Settings</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Questions today" value={d.q_today} />
        <Stat label="Questions, 7 days" value={d.q_week} hint={`${d.brides_week} ${d.brides_week === 1 ? 'bride' : 'brides'}`} />
        <Stat label="Helpful, 7 days" value={d.up + d.down ? `${Math.round((d.up / (d.up + d.down)) * 100)}%` : '–'} hint={`${d.up} yes, ${d.down} no`} />
        <Stat label="Cards confirmed, 7 days" value={`${d.actions_done} of ${d.actions_total}`} hint={`${d.flagged} answers caught by checks`} />
      </div>
      <Card className="mt-5">
        <h2 className="font-semibold">Questions a day</h2>
        <div className="mt-3 flex h-28 items-end gap-1.5" role="img" aria-label="Questions per day for the last 14 days">
          {days.map((x) => (
            <div key={x.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-[var(--color-pink)]" style={{ height: `${(x.questions / max) * 88}px`, minHeight: x.questions ? 3 : 0 }} title={`${x.day}: ${x.questions}`} />
              <span className="text-[10px] text-[var(--color-muted)]">{x.day.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Answers to review</h2>
          <Link href="/ops/bride-ai" className="chip" aria-current={show === 'flagged'}>
            Caught by checks
          </Link>
          <Link href="/ops/bride-ai?show=unhelpful" className="chip" aria-current={show === 'unhelpful'}>
            Marked not helpful
          </Link>
        </div>
        {rows.length ? (
          <ul className="mt-3 divide-y divide-[var(--color-line)]">
            {rows.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <p className="text-[var(--color-muted)]">“{r.question}”</p>
                <p className="mt-1 line-clamp-3">{r.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {r.flags.map((f) => (
                    <Badge key={f} tone="warn">
                      {FLAG_LABEL[f] ?? f}
                    </Badge>
                  ))}
                  <Link href={`/ops/bride-ai/${r.thread_id}`} className="text-xs underline">
                    Open chat
                  </Link>
                  <span className="text-xs text-[var(--color-muted)]">{r.created_at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-muted)]">Nothing to review.</p>
        )}
      </Card>
    </>
  );
}
