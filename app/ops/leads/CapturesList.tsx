import Link from 'next/link';
import { sql } from '@/lib/db';
import { CAPTURE_SOURCES, listCaptures } from '@/lib/captures';
import { listCategories } from '@/lib/catalog';
import { opsCloseCapture, opsConvertCapture } from '@/lib/actions/ops';
import { PlacePicker } from '@/components/PlacePicker';
import { fmtDateTime } from '@/lib/dates';
import { Badge, Card, Empty } from '@/components/ui';

/** Visitors who left a number: call, then start a request or close it. */
export async function CapturesList({ view }: { view: 'open' | 'done' }) {
  const [rows, cats] = await Promise.all([listCaptures(sql, view), listCategories(sql, { activeOnly: true })]);
  const towns = rows.length
    ? await sql<{ id: number; name: string; state: string }[]>`select id, name, state from mkt.cities where id = any(${rows.map((r) => r.city_id).filter((x): x is number => x != null)})`
    : [];
  return (
    <>
      <div className="mb-4 flex gap-2">
        <Link href="/ops/leads?tab=call" className={`btn btn-sm ${view === 'open' ? '' : 'btn-ghost'}`}>
          To call
        </Link>
        <Link href="/ops/leads?tab=call&view=done" className={`btn btn-sm ${view === 'done' ? '' : 'btn-ghost'}`}>
          Done
        </Link>
      </div>
      {rows.length ? (
        <ul className="grid gap-4 xl:grid-cols-2">
          {rows.map((c) => {
            const town = towns.find((t) => t.id === c.city_id) ?? null;
            return (
              <li key={c.id}>
                <Card className="h-full">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <a href={`tel:${c.phone}`} className="figure text-2xl underline decoration-[var(--color-pink)] underline-offset-4">
                        {c.phone}
                      </a>
                      <p className="mt-0.5 font-semibold">{c.name ?? 'Name not given'}</p>
                    </div>
                    <div className="text-right">
                      <Badge tone="gold">{CAPTURE_SOURCES[c.source]}</Badge>
                      <p className="hint mt-1">{fmtDateTime(c.created_at)}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {c.page ? (
                      <>
                        <dt className="text-[var(--color-muted)]">Was on</dt>
                        <dd className="break-all">
                          <Link href={c.page} className="underline">
                            {c.page}
                          </Link>
                        </dd>
                      </>
                    ) : null}
                    {c.city || c.category ? (
                      <>
                        <dt className="text-[var(--color-muted)]">Looks like</dt>
                        <dd>{[c.category, c.city].filter(Boolean).join(' in ')}</dd>
                      </>
                    ) : null}
                    {c.vendors.length ? (
                      <>
                        <dt className="text-[var(--color-muted)]">Saved</dt>
                        <dd>
                          {c.vendors.map((v, i) => (
                            <span key={v.slug}>
                              {i ? ', ' : ''}
                              <Link href={`/v/${v.slug}`} className="underline">
                                {v.name}
                              </Link>
                            </span>
                          ))}
                        </dd>
                      </>
                    ) : null}
                    {c.note ? (
                      <>
                        <dt className="text-[var(--color-muted)]">Note</dt>
                        <dd>{c.note}</dd>
                      </>
                    ) : null}
                    {c.outcome ? (
                      <>
                        <dt className="text-[var(--color-muted)]">Outcome</dt>
                        <dd>
                          {c.outcome}
                          {c.lead_id ? (
                            <>
                              {' · '}
                              <Link href={`/ops/leads/${c.lead_id}`} className="underline">
                                open the request
                              </Link>
                            </>
                          ) : null}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {c.has_request && view === 'open' ? <p className="hint mt-2">This number already has a request from the last 30 days. Check Leads before starting another.</p> : null}
                  {c.chat?.length ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium">What she asked the chat helper ({c.chat.filter((m) => m.role === 'user').length})</summary>
                      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm" tabIndex={0}>
                        {c.chat.map((m, i) => (
                          <li key={i} className={m.role === 'user' ? 'font-medium' : 'text-[var(--color-muted)]'}>
                            {m.role === 'user' ? 'She: ' : 'Helper: '}
                            {m.text.slice(0, 600)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {view === 'open' ? (
                    <div className="mt-4 space-y-3 border-t border-[var(--color-line)] pt-3">
                      <form action={opsConvertCapture} className="grid gap-3">
                        <input type="hidden" name="id" value={c.id} />
                        <p className="text-sm font-semibold">After the call: start her request</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm">
                            <span className="mb-1 block font-medium">Her name</span>
                            <input name="name" className="input" defaultValue={c.name ?? ''} required />
                          </label>
                          <PlacePicker label="Wedding town" required town={town} />
                        </div>
                        <fieldset>
                          <legend className="mb-1 text-sm font-medium">She needs</legend>
                          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                            {cats.map((k) => (
                              <label key={k.id} className="flex items-center gap-1.5 text-sm">
                                <input type="checkbox" name="category_id" value={k.id} defaultChecked={k.id === c.category_id} /> {k.name}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <button className="btn btn-sm justify-self-start">Start request</button>
                      </form>
                      <form action={opsCloseCapture} className="flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <select name="outcome" className="input w-auto py-1" aria-label="Why it is being closed" defaultValue="No answer">
                          <option>No answer</option>
                          <option>Not planning a wedding</option>
                          <option>Wrong number</option>
                          <option>Already has a request</option>
                          <option>A vendor, not a bride</option>
                        </select>
                        <button className="btn btn-ghost btn-sm">Close without a request</button>
                      </form>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty art="letters" title={view === 'open' ? 'No numbers waiting' : 'Nothing handled yet'}>
          {view === 'open' ? 'When a visitor leaves a number it appears here, and the team alert list hears.' : null}
        </Empty>
      )}
    </>
  );
}
