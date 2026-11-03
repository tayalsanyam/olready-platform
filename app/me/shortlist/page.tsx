import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { formatInr } from '@/lib/catalog';
import { shortlist } from '@/lib/weddings';
import { weddingFunctions } from '@/lib/functions';
import { checkDates, todayIst } from '@/lib/availability';
import { askShortlistedAction, removeShortlistAction } from '@/lib/actions/bride';
import { Card, Empty, Field, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shortlist', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Shortlist({ searchParams }: P) {
  const q = await searchParams;
  const { p, w } = await requireBrideWedding('/me/shortlist');
  const list = await shortlist(sql, w.id);
  const byCat = Map.groupBy(list, (s) => s.category_name);
  // Her function dates against each shortlisted vendor's calendar.
  const fns = (await weddingFunctions(sql, w.id)).filter((f) => f.date && f.date >= todayIst());
  const labels: Record<string, string> = {};
  for (const f of fns) labels[f.date!] = labels[f.date!] ? `${labels[f.date!]} and ${f.name}` : f.name;
  const vendors = await sql<{ id: string; calendar_updated_at: Date | null }[]>`select id, calendar_updated_at from mkt.vendors where id = any(${list.map((s) => s.vendor_id)}::uuid[])`;
  const checks = new Map(
    await Promise.all(vendors.map(async (v) => [v.id, Object.keys(labels).length ? await checkDates(sql, v, Object.keys(labels).slice(0, 8), labels) : []] as const))
  );
  return (
    <>
      <PageTitle title="Shortlist" sub="Vendors your family saved. Ask them all for quotes in one go." />
      <Notice error={q.error} ok={q.ok} />
      {list.length ? (
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {Array.from(byCat, ([cat, items]) => (
              <Card key={cat}>
                <h2 className="font-semibold">{cat}</h2>
                <ul className="mt-2 divide-y divide-[var(--color-line)]">
                  {items.map((s) => (
                    <li key={s.vendor_id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <Link href={`/v/${s.slug}`} className="font-semibold underline-offset-4 hover:underline">
                          {s.business_name}
                        </Link>
                        <div className="hint">{s.starting_price_inr != null ? `from ${formatInr(s.starting_price_inr)} ${s.price_unit}` : 'price on request'}</div>
                        {checks.get(s.vendor_id)?.length ? (
                          <ul className="mt-1 space-y-0.5 text-xs">
                            {checks.get(s.vendor_id)!.map((c) => (
                              <li key={c.day} className={c.tone === 'ok' ? 'text-[#1d5c3a]' : c.tone === 'bad' ? 'text-[var(--color-pink-deep)]' : 'text-[var(--color-muted)]'}>
                                {c.text}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <form action={removeShortlistAction}>
                        <input type="hidden" name="vendor_id" value={s.vendor_id} />
                        <button className="btn btn-ghost btn-sm">Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          <Card className="self-start">
            <h2 className="font-semibold">Ask all shortlisted</h2>
            <p className="hint">One request per category. After our verification call, your shortlisted vendors see it first.</p>
            <form action={askShortlistedAction} className="mt-3 space-y-2">
              <Field label="Mobile number *">
                <input name="phone" required className="input" inputMode="tel" defaultValue={p.phone ?? ''} />
              </Field>
              <button className="btn btn-pink w-full">Send to {byCat.size} categor{byCat.size === 1 ? 'y' : 'ies'}</button>
            </form>
          </Card>
        </div>
      ) : (
        <Empty title="Nothing shortlisted yet">
          Tap Shortlist on any vendor page.{' '}
          <Link href="/vendors" className="underline">
            Browse vendors
          </Link>
        </Empty>
      )}
    </>
  );
}
