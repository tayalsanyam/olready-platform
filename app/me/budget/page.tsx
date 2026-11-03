import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { budgetSummary, canSeeBudget } from '@/lib/budget';
import { formatInr, listCategories } from '@/lib/catalog';
import { addBudgetItemAction, budgetVisibilityAction, saveCategoryBudgetAction, saveTotalBudgetAction, updateBudgetItemAction } from '@/lib/actions/budget';
import { Card, Empty, Notice, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Budget', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const SOURCE: Record<string, string> = { booked: 'booked', lowest_quote: 'lowest quote', planned: 'your budget', none: '' };

export default async function Budget({ searchParams }: P) {
  const q = await searchParams;
  const { p, w } = await requireBrideWedding('/me/budget');
  if (!(await canSeeBudget(sql, w.id, p.id))) {
    return (
      <>
        <PageTitle title="Budget" />
        <Empty title="The couple keeps the budget private">They can share it with family from this page.</Empty>
      </>
    );
  }
  const [b, cats, [me]] = await Promise.all([
    budgetSummary(sql, w.id),
    listCategories(sql, { activeOnly: true }),
    sql<{ role: string }[]>`select role from mkt.wedding_members where wedding_id = ${w.id} and profile_id = ${p.id}`,
  ]);
  const unplanned = cats.filter((c) => !b.lines.some((l) => l.category_id === c.id));
  const left = b.total != null ? b.total - b.likelyTotal : null;
  const pct = b.total ? Math.min(100, Math.round((100 * b.likelyTotal) / b.total)) : 0;
  return (
    <>
      <PageTitle
        title="Budget"
        sub="What you planned, what vendors quoted and what you have booked, in one place."
        action={
          <Link href="/me/compare" className="btn btn-ghost btn-sm">
            Compare quotes
          </Link>
        }
      />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />

      <Card>
        <form action={saveTotalBudgetAction} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">Total wedding budget (₹)</span>
            <input name="total" inputMode="numeric" defaultValue={b.total ?? ''} className="input w-48" placeholder="e.g. 25,00,000" />
          </label>
          <button className="btn btn-ghost btn-sm">Save</button>
        </form>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Planned', b.plannedSum],
            ['Likely total', b.likelyTotal],
            ['Booked', b.bookedSum],
            ['Paid so far (other costs)', b.paidSum],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-[12px] bg-[var(--color-tint)] p-3">
              <p className="text-sm text-[var(--color-muted)]">{label}</p>
              <p className="figure text-2xl">{formatInr(n as number)}</p>
            </div>
          ))}
        </div>
        {b.total != null ? (
          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-[var(--color-tint)]" role="img" aria-label={`Likely total is ${pct}% of your budget`}>
              <div className={`h-full rounded-full ${left! < 0 ? 'bg-[var(--color-pink-deep)]' : 'bg-[var(--color-pink)]'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className={`mt-1 text-sm font-semibold ${left! < 0 ? 'text-[var(--color-pink-deep)]' : ''}`}>
              {left! >= 0 ? `${formatInr(left!)} left in your budget` : `${formatInr(-left!)} over your budget`}
            </p>
          </div>
        ) : null}
        <p className="hint mt-3">
          Likely total counts what you booked, the lowest open quote where you haven&apos;t booked yet, and your own budget where nobody has quoted.
        </p>
      </Card>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="data min-w-[680px]">
          <thead>
            <tr>
              <th>Category</th>
              <th>Your budget</th>
              <th>Quotes</th>
              <th>Booked</th>
              <th>Likely</th>
            </tr>
          </thead>
          <tbody>
            {b.lines.map((l) => {
              const open = l.quotes.filter((x) => x.status === 'sent').map((x) => x.amount_inr);
              const over = l.planned != null && l.likely > l.planned;
              return (
                <tr key={l.category_id}>
                  <td className="font-semibold">{l.category_name}</td>
                  <td>
                    <form action={saveCategoryBudgetAction} className="flex gap-1">
                      <input type="hidden" name="category_id" value={l.category_id} />
                      <input name="budget" inputMode="numeric" defaultValue={l.planned ?? ''} className="input w-28 py-1" aria-label={`Budget for ${l.category_name}`} />
                      <button className="btn btn-ghost btn-sm">Save</button>
                    </form>
                  </td>
                  <td>
                    {open.length ? (
                      <>
                        {open.length} open, {formatInr(Math.min(...open))}
                        {open.length > 1 ? `–${formatInr(Math.max(...open))}` : ''}
                        {l.planned != null && open.every((n) => n > l.planned!) ? <span className="block text-xs text-[var(--color-pink-deep)]">All above your budget</span> : null}
                      </>
                    ) : (
                      <span className="text-[var(--color-muted)]">None yet</span>
                    )}
                  </td>
                  <td>{l.booked ? `${l.booked.vendor}${l.booked.amount != null ? `, ${formatInr(l.booked.amount)}` : ''}` : <span className="text-[var(--color-muted)]">–</span>}</td>
                  <td>
                    <span className={`font-semibold ${over ? 'text-[var(--color-pink-deep)]' : ''}`}>{formatInr(l.likely)}</span>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {SOURCE[l.source]}
                      {l.items ? ` + ${formatInr(l.items)} other` : ''}
                      {over ? `, ${formatInr(l.likely - l.planned!)} over` : ''}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!b.lines.length ? <p className="p-4 text-sm text-[var(--color-muted)]">Add a budget for each category you need, or send a request and quotes will appear here.</p> : null}
      </Card>
      {unplanned.length ? (
        <form action={saveCategoryBudgetAction} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="label">Plan another category</span>
            <select name="category_id" className="input">
              {unplanned.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.plural_name}
                </option>
              ))}
            </select>
          </label>
          <input name="budget" inputMode="numeric" required className="input w-36" placeholder="Budget ₹" aria-label="Budget" />
          <button className="btn btn-ghost btn-sm">Add</button>
        </form>
      ) : null}

      <Card className="mt-6">
        <h2 className="font-semibold">Other costs</h2>
        <p className="hint">Outfits, jewellery, gifts, travel, or a vendor you booked outside OLReady.</p>
        {b.other.length ? (
          <ul className="mt-3 divide-y divide-[var(--color-line)] text-sm">
            {b.other.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <b>{o.label}</b> <span className="text-[var(--color-muted)]">{cats.find((c) => c.id === o.category_id)?.name ?? ''}</span>
                  <span className="block">{formatInr(o.amount_inr)}</span>
                </span>
                <form action={updateBudgetItemAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={o.id} />
                  <label className="text-xs text-[var(--color-muted)]">
                    Paid
                    <input name="paid" inputMode="numeric" defaultValue={o.paid_inr} className="input ml-1 inline-block w-24 py-1" />
                  </label>
                  <button className="btn btn-ghost btn-sm">Save</button>
                  <button name="remove" value="1" className="btn btn-ghost btn-sm" aria-label={`Remove ${o.label}`}>
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={addBudgetItemAction} className="mt-4 grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="label">What for</span>
            <input name="label" required maxLength={80} className="input" placeholder="Wedding lehenga" />
          </label>
          <label className="block">
            <span className="label">Category (optional)</span>
            <select name="category_id" className="input">
              <option value="">None</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Amount ₹</span>
            <input name="amount" required inputMode="numeric" className="input" />
          </label>
          <label className="block">
            <span className="label">Paid ₹</span>
            <input name="paid" inputMode="numeric" className="input" />
          </label>
          <button className="btn btn-sm">Add cost</button>
        </form>
      </Card>

      {me?.role === 'owner' ? (
        <Card className="mt-6">
          <form action={budgetVisibilityAction} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">Who can see the budget</span>
            <label className="flex items-center gap-1">
              <input type="radio" name="vis" value="owners" defaultChecked={b.visibility === 'owners'} /> Just the two of us
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="vis" value="family" defaultChecked={b.visibility === 'family'} /> Everyone in our wedding team
            </label>
            <button className="btn btn-ghost btn-sm">Save</button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
