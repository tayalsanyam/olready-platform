import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { aiEnabled } from '@/lib/ai';
import { MAX_ROWS, assistantAllowance, logEntry, recentQuestions } from '@/lib/opsAssistant';
import { askAssistantAction, rerunAssistantAction } from '@/lib/actions/assistant';
import { Card, Notice, PageTitle, sp } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate } from '@/lib/dates';

export const metadata = { title: 'Ask the data' };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const EXAMPLES = [
  'How many leads were verified each week for the last 8 weeks, by city?',
  'Which 10 vendors unlocked the most leads this month, and how many credits did they spend?',
  'What share of open lead needs in Mohali have reached their unlock cap?',
  'Average quote by category for quotes sent in the last 90 days',
  'Revenue by product for paid orders this month, after discounts and refunds',
  'Which Boosts spent the most this week and how many paid visits did they get?',
];

function cell(v: unknown) {
  if (v == null) return <span className="text-[var(--color-muted)]">–</span>;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(v);
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s).toLocaleString('en-IN') : s;
}

export default async function Assistant({ searchParams }: P) {
  const me = await requireRole(['ops', 'admin'], '/ops/assistant');
  const q = await searchParams;
  const id = sp(q.id);
  const [entry, recent, allowance] = await Promise.all([id ? logEntry(sql, id, me) : null, recentQuestions(sql, me.id), assistantAllowance(sql, me.id)]);
  const on = aiEnabled();
  return (
    <>
      <PageTitle
        title="Ask the data"
        sub="Ask in plain words. The assistant writes a query over the reporting views, runs it read-only and explains the answer. It never sees phone numbers, emails or brides' names."
        action={
          <Link href="/ops/data" className="btn btn-ghost btn-sm">
            Data lists
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <form action={askAssistantAction} className="grid gap-3">
              <label>
                <span className="sr-only">Your question</span>
                <textarea
                  name="question"
                  required
                  minLength={4}
                  rows={3}
                  className="input"
                  defaultValue={entry?.kind === 'ask' ? entry.question : ''}
                  placeholder="How many brides asked for venues in Panchkula last month?"
                  disabled={!on}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--color-muted)]">
                  {on ? `${allowance.left} questions left today.` : 'Switched off: add ANTHROPIC_API_KEY to turn it on. You can still run your own queries below.'}
                </p>
                <button className="btn btn-pink btn-sm" disabled={!on || allowance.left <= 0}>
                  Ask
                </button>
              </div>
            </form>
            {!entry ? (
              <div className="mt-4">
                <p className="text-sm font-medium">Try one of these</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLES.map((e) => (
                    <li key={e}>
                      <form action={askAssistantAction}>
                        <input type="hidden" name="question" value={e} />
                        <button className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-left text-sm hover:border-[var(--color-pink)]" disabled={!on}>
                          {e}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {entry ? (
            <Card>
              <p className="text-sm text-[var(--color-muted)]">{entry.kind === 'rerun' ? 'Your edited query' : entry.question}</p>
              {entry.answer ? <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{entry.answer}</p> : null}
              {entry.error ? <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{entry.error}</p> : null}
              {entry.rows && entry.columns?.length ? (
                <>
                  <div className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-[var(--color-line)]">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-[var(--color-tint)] text-xs text-[var(--color-muted)]">
                        <tr>
                          {entry.columns.map((c) => (
                            <th key={c} className="px-3 py-2 font-semibold">
                              {c.replace(/_/g, ' ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-line)]">
                        {entry.rows.map((r, i) => (
                          <tr key={i}>
                            {entry.columns!.map((c) => (
                              <td key={c} className="px-3 py-1.5 tabular-nums">
                                {cell(r[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    {entry.row_count} {entry.row_count === 1 ? 'row' : 'rows'}
                    {entry.row_count === MAX_ROWS ? `, cut at ${MAX_ROWS}` : ''}
                  </p>
                </>
              ) : entry.sql && !entry.error ? (
                <p className="mt-3 text-sm text-[var(--color-muted)]">The query returned no rows.</p>
              ) : null}
              {entry.sql || entry.error ? (
                <details className="mt-4" open={Boolean(entry.error)}>
                  <summary className="cursor-pointer text-sm font-semibold">See or edit the query</summary>
                  <form action={rerunAssistantAction} className="mt-2 grid gap-2">
                    <input type="hidden" name="question" value={entry.question} />
                    <textarea name="sql" rows={8} className="input font-mono text-xs" defaultValue={entry.sql ?? ''} spellCheck={false} aria-label="Query" />
                    <p className="hint">One SELECT over ops_reports views. Runs read-only, for up to 8 seconds, and returns up to {MAX_ROWS} rows.</p>
                    <button className="btn btn-ghost btn-sm justify-self-start">Run this query</button>
                  </form>
                </details>
              ) : null}
            </Card>
          ) : (
            <Card>
              <h2 className="font-semibold">Write your own query</h2>
              <form action={rerunAssistantAction} className="mt-2 grid gap-2">
                <input type="hidden" name="question" value="Own query" />
                <textarea
                  name="sql"
                  rows={5}
                  className="input font-mono text-xs"
                  spellCheck={false}
                  aria-label="Query"
                  defaultValue={'select city, status, count(*) as leads\nfrom ops_reports.leads\ngroup by city, status\norder by city, leads desc'}
                />
                <button className="btn btn-ghost btn-sm justify-self-start">Run this query</button>
              </form>
            </Card>
          )}
        </div>
        <aside>
          <Card>
            <h2 className="font-semibold">Your recent questions</h2>
            {recent.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/ops/assistant?id=${r.id}`} className={`block hover:text-[var(--color-pink-deep)] ${r.id === id ? 'font-semibold' : ''}`}>
                      {r.question}
                    </Link>
                    <span className="text-xs text-[var(--color-muted)]">
                      {fmtDay(r.created_at)}
                      {r.error ? ', failed' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-muted)]">Nothing yet.</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
