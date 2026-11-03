import Link from 'next/link';
import { QuoteReading } from '@/components/QuoteReading';
import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { budgetSummary, canSeeBudget } from '@/lib/budget';
import { formatInr } from '@/lib/catalog';
import { decideQuoteAction } from '@/lib/actions/threads';
import { Badge, Card, Empty, Notice, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Compare quotes', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };
const fmt = (d: Date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(d);

export default async function Compare({ searchParams }: P) {
  const q = await searchParams;
  const { p, w } = await requireBrideWedding('/me/compare');
  const b = await budgetSummary(sql, w.id);
  const showBudget = await canSeeBudget(sql, w.id, p.id);
  const lines = b.lines.filter((l) => l.quotes.length);
  return (
    <>
      <PageTitle
        title="Compare quotes"
        sub="Every quote side by side, by category. Open a conversation to ask what is included before you decide."
        action={
          showBudget ? (
            <Link href="/me/budget" className="btn btn-ghost btn-sm">
              Budget
            </Link>
          ) : null
        }
      />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      {lines.length ? (
        <div className="space-y-8">
          {lines.map((l) => {
            const open = l.quotes.filter((x) => x.status === 'sent');
            const low = open.length > 1 ? Math.min(...open.map((x) => x.amount_inr)) : null;
            return (
              <section key={l.category_id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-semibold">{l.category_name}</h2>
                  {showBudget && l.planned != null ? <span className="text-sm text-[var(--color-muted)]">Your budget {formatInr(l.planned)}</span> : null}
                </div>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {l.quotes.map((x) => {
                    const above = showBudget && l.planned != null && x.amount_inr > l.planned;
                    return (
                      <li key={x.quote_id}>
                        <Card className={`h-full ${x.status === 'accepted' ? 'ring-2 ring-[var(--color-pink)]' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <Link href={`/v/${x.vendor_slug}`} className="font-semibold hover:text-[var(--color-pink-deep)]">
                              {x.vendor_name}
                            </Link>
                            {x.rating ? <span className="rating">★ {x.rating.toFixed(1)}</span> : null}
                          </div>
                          <p className="figure mt-2 text-3xl">{formatInr(x.amount_inr)}</p>
                          {x.lines?.length ? (
                            <ul className="mt-1 space-y-0.5 text-sm">
                              {x.lines.map((l) => (
                                <li key={l.label} className="flex justify-between gap-3">
                                  <span className="text-[var(--color-muted)]">{l.label}</span>
                                  <span className="tabular-nums">{formatInr(l.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {x.status === 'accepted' ? <Badge tone="ok">You accepted</Badge> : null}
                            {low != null && x.amount_inr === low && x.status === 'sent' ? <Badge tone="gold">Lowest</Badge> : null}
                            {above ? <Badge tone="warn">{formatInr(x.amount_inr - l.planned!)} above budget</Badge> : null}
                          </div>
                          {x.details ? <p className="mt-3 whitespace-pre-wrap text-sm">{x.details}</p> : <p className="mt-3 text-sm text-[var(--color-muted)]">No details given. Ask what is included.</p>}
                          {x.reading ? <QuoteReading r={x.reading} /> : null}
                          <p className="mt-2 text-xs text-[var(--color-muted)]">Sent {fmt(x.created_at)}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link href={`/me/threads/${x.thread_id}`} className="btn btn-ghost btn-sm">
                              Open conversation
                            </Link>
                            {x.status === 'sent' ? (
                              <form action={decideQuoteAction}>
                                <input type="hidden" name="quote_id" value={x.quote_id} />
                                <input type="hidden" name="accept" value="1" />
                                <input type="hidden" name="_back" value="/me/compare" />
                                <button className="btn btn-sm">Accept</button>
                              </form>
                            ) : null}
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Empty title="No quotes yet">
          Quotes appear here as vendors send them. <Link className="underline" href="/enquire">Send a request</Link> to get started.
        </Empty>
      )}
    </>
  );
}
