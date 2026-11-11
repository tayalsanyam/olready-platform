import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { allCoupons } from '@/lib/coupons';
import { opsCreateCoupon, opsToggleCoupon } from '@/lib/actions/promotion';
import { Badge, Card, Empty, Field, Notice, PageTitle, sp } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate } from '@/lib/dates';

export const metadata = { title: 'Discount codes' };
type P = { searchParams: Promise<Record<string, string | string[]>> };
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default async function Coupons({ searchParams }: P) {
  const q = await searchParams;
  const me = await requireRole(['ops', 'admin']);
  const [rows, packs] = await Promise.all([allCoupons(sql), sql<{ code: string; name: string }[]>`select code, name from mkt.packs where active order by sort`]);
  const targets = [...packs.map((p) => [p.code, p.name] as const), ['wallet', 'Ads wallet top-ups'] as const, ['rm_30d', 'Relationship manager'] as const];
  return (
    <>
      <PageTitle title="Discount codes" sub="Codes vendors and brides type at checkout. Uses count only once a payment succeeds." />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      {rows.length ? (
        <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
          <table className="data stack min-w-[720px]">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>On</th>
                <th>Used</th>
                <th>Ends</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono font-semibold">
                    {c.code} {c.active ? null : <Badge>off</Badge>}
                    {c.note ? <span className="block font-sans text-xs font-normal text-[var(--color-muted)]">{c.note}</span> : null}
                  </td>
                  <td>
                    {c.kind === 'percent' ? `${c.value}%` : inr(c.value)}
                    {c.max_discount_inr ? `, up to ${inr(c.max_discount_inr)}` : ''}
                    {c.min_amount_inr ? `, min ${inr(c.min_amount_inr)}` : ''}
                  </td>
                  <td>{c.applies_to.length ? c.applies_to.map((a) => targets.find((t) => t[0] === a)?.[1] ?? a).join(', ') : 'Everything'}</td>
                  <td>
                    {c.used}
                    {c.max_uses ? ` of ${c.max_uses}` : ''} · {inr(c.discount_given)} given
                  </td>
                  <td>{fmtDate(c.ends_at, 'never')}</td>
                  <td>
                    {me.role === 'admin' ? (
                      <form action={opsToggleCoupon}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? '0' : '1'} />
                        <button className="btn btn-ghost btn-sm">{c.active ? 'Turn off' : 'Turn on'}</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty art="coins" title="No codes yet" />
      )}
      {me.role === 'admin' ? (
        <Card className="mt-6">
          <h2 className="font-semibold">New code</h2>
          <form action={opsCreateCoupon} className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Code">
              <input name="code" required pattern="[A-Za-z0-9-]{3,24}" className="input uppercase" placeholder="DIWALI10" />
            </Field>
            <Field label="Type">
              <select name="kind" className="input">
                <option value="percent">Percent off</option>
                <option value="fixed">Rupees off</option>
              </select>
            </Field>
            <Field label="Value">
              <input name="value" required inputMode="numeric" className="input" />
            </Field>
            <Field label="Cap ₹ (percent codes, optional)">
              <input name="max_discount" inputMode="numeric" className="input" />
            </Field>
            <Field label="Minimum purchase ₹">
              <input name="min_amount" inputMode="numeric" className="input" defaultValue={0} />
            </Field>
            <Field label="Ends on (optional)">
              <input name="ends_at" type="date" className="input" />
            </Field>
            <Field label="Total uses (optional)">
              <input name="max_uses" inputMode="numeric" className="input" />
            </Field>
            <Field label="Uses per buyer">
              <input name="per_buyer" inputMode="numeric" defaultValue={1} className="input" />
            </Field>
            <Field label="Note (staff only)">
              <input name="note" className="input" />
            </Field>
            <fieldset className="sm:col-span-3">
              <legend className="label mb-1">Applies to (none ticked = everything)</legend>
              <div className="flex flex-wrap gap-2">
                {targets.map(([code, name]) => (
                  <label key={code} className="chip cursor-pointer has-[:checked]:border-[var(--color-pink)] has-[:checked]:bg-[var(--color-pink-soft)]">
                    <input type="checkbox" name="applies_to" value={code} className="sr-only" />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <button className="btn btn-sm">Create code</button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
