import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { checklist } from '@/lib/weddings';
import { addChecklistAction, toggleChecklistAction } from '@/lib/actions/bride';
import { Card, Notice, PageTitle } from '@/components/ui';
import { todayIst } from '@/lib/availability';
import { fmtDate, fmtDay, plural } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Checklist', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Checklist({ searchParams }: P) {
  const q = await searchParams;
  const { w } = await requireBrideWedding('/me/checklist');
  const items = await checklist(sql, w.id);
  const done = items.filter((i) => i.done).length;
  const today = todayIst();
  return (
    <>
      <PageTitle title="Checklist" sub={`${done} of ${items.length} done${w.wedding_date ? '' : ' · add your wedding date to get due dates'}`} />
      <Notice error={q.error} ok={q.ok} />
      <Card>
        <ul className="divide-y divide-[var(--color-line)]">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2">
              <form action={toggleChecklistAction}>
                <input type="hidden" name="item_id" value={i.id} />
                <button
                  aria-label={i.done ? `Mark ${i.title} not done` : `Mark ${i.title} done`}
                  className={`flex h-5 w-5 items-center justify-center rounded border ${i.done ? 'border-[var(--color-ok)] bg-[var(--color-ok)] text-white' : 'border-[var(--color-line)] bg-white'}`}
                >
                  {i.done ? '✓' : ''}
                </button>
              </form>
              <div className="flex-1">
                <span className={i.done ? 'text-[var(--color-muted)] line-through' : ''}>{i.title}</span>
                {i.category_slug && !i.done ? (
                  <Link href={`/enquire?category=${i.category_slug}`} className="ml-2 text-xs underline">
                    get quotes
                  </Link>
                ) : null}
              </div>
              {i.due_date ? (
                <span className={`text-xs ${!i.done && i.due_date < today ? 'font-semibold text-[var(--color-bad)]' : 'text-[var(--color-muted)]'}`}>
                  {fmtDate(i.due_date)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <form action={addChecklistAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <input name="title" required className="input" placeholder="Add a task" />
          <input name="due_date" type="date" className="input" aria-label="Due date" />
          <button className="btn btn-sm">Add</button>
        </form>
      </Card>
    </>
  );
}
