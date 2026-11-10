import { fmtDate, fmtDay } from '@/lib/dates';
import { formatInr } from '@/lib/catalog';
import type { ThreadRow } from '@/lib/threads';
import { REPORT_REASONS } from '@/lib/moderation';
import { reportMessageAction } from '@/lib/actions/threads';
import { Badge, Card, Field } from './ui';
import { QuoteReading } from './QuoteReading';
import { FunctionList } from './FunctionList';
import type { QuoteReading as QR } from '@/lib/quoteReader';

type Msg = {
  id: number;
  sender_profile_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_kind: 'image' | 'pdf' | null;
  review_status: 'none' | 'flagged' | 'cleared' | 'hidden';
  created_at: Date;
};
type Quote = { id: string; amount_inr: number; details: string; status: string; created_at: Date; reading?: QR | null; lines?: { label: string; amount: number }[] | null };
type Action = (fd: FormData) => Promise<void>;

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(d);

export function ThreadView(props: {
  thread: ThreadRow;
  messages: Msg[];
  quotes: Quote[];
  viewerId: string;
  side: 'vendor' | 'bride' | 'staff';
  backPath: string;
  postMessage?: Action;
  sendQuote?: Action;
  decideQuote?: Action;
  reportBooking?: Action;
}) {
  const { thread: t, side } = props;
  const booked = t.status === 'booked' || t.need_status === 'closed_booked';
  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div>
        <Card className="min-h-64">
          {props.messages.length ? (
            <ul className="space-y-3">
              {props.messages.map((m) => {
                const mine = m.sender_profile_id === props.viewerId;
                // Hidden messages are removed for both sides; staff still see the original.
                const hidden = m.review_status === 'hidden' && side !== 'staff';
                return (
                  <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-[var(--color-ink)] text-white' : 'bg-[var(--color-tint)]'}`}>
                      {hidden ? (
                        <p className="italic opacity-70">This message was removed by OLReady.</p>
                      ) : (
                        <>
                          {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                          {m.attachment_url ? (
                            m.attachment_kind === 'image' ? (
                              <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mt-1 block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={m.attachment_url} alt={m.attachment_name ?? 'Photo'} className="max-h-60 rounded-lg" loading="lazy" />
                              </a>
                            ) : (
                              <a
                                href={m.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className={`mt-1 inline-flex items-center gap-2 rounded-lg px-2 py-1 underline ${mine ? 'bg-white/15' : 'bg-white'}`}
                              >
                                PDF: {m.attachment_name ?? 'document'}
                              </a>
                            )
                          ) : null}
                        </>
                      )}
                      <p className={`mt-1 text-[0.7rem] ${mine ? 'text-white/60' : 'text-[var(--color-muted)]'}`}>
                        {mine ? 'You' : m.sender_name || m.sender_role} · {fmt(m.created_at)}
                        {side === 'staff' && m.review_status !== 'none' ? ` · ${m.review_status}` : ''}
                      </p>
                      {!mine && !hidden && side !== 'staff' ? (
                        <details className="mt-1 text-[0.7rem]">
                          <summary className="cursor-pointer text-[var(--color-muted)]">Report</summary>
                          <form action={reportMessageAction} className="mt-1 flex flex-wrap items-center gap-1">
                            <input type="hidden" name="message_id" value={m.id} />
                            <input type="hidden" name="_back" value={props.backPath} />
                            <select name="reason" className="input w-auto py-0.5 text-xs" aria-label="Why are you reporting this message?">
                              {Object.entries(REPORT_REASONS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                            <button className="btn btn-ghost btn-sm py-0.5">Send report</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">No messages yet.</p>
          )}
        </Card>
        {props.postMessage ? (
          <form action={props.postMessage} className="mt-3 space-y-2">
            <input type="hidden" name="thread_id" value={t.id} />
            <input type="hidden" name="_back" value={props.backPath} />
            <div className="flex gap-2">
              <textarea name="body" rows={2} className="input" placeholder="Write a message" maxLength={4000} aria-label="Message" />
              <button className="btn self-end">Send</button>
            </div>
            <label className="block text-xs text-[var(--color-muted)]">
              Attach a photo or PDF (up to 4 MB), e.g. a brochure, menu or reference look
              <input type="file" name="attachment" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1 block w-full text-xs" />
            </label>
            <p className="text-xs text-[var(--color-muted)]">Never share OTPs or card details. Pay only through OLReady or after you have met the vendor.</p>
          </form>
        ) : null}
      </div>

      <aside className="space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{side === 'bride' ? t.vendor_name : t.bride_name}</h2>
            <Badge tone={booked ? 'ok' : t.status === 'quote_accepted' ? 'gold' : 'plain'}>{booked ? 'booked' : t.status.replace('_', ' ')}</Badge>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-[var(--color-muted)]">For</dt>
            <dd>{t.category_name}</dd>
            {t.functions && t.functions.length > 1 ? (
              <>
                <dt className="col-span-2 mt-1 text-[var(--color-muted)]">Functions</dt>
                <dd className="col-span-2">
                  <FunctionList fns={t.functions} />
                </dd>
              </>
            ) : (
              <>
                <dt className="text-[var(--color-muted)]">Wedding</dt>
                <dd>{fmtDate(t.event_date, 'Not fixed')}</dd>
              </>
            )}
            <dt className="text-[var(--color-muted)]">City</dt>
            <dd>{t.city_name}</dd>
            <dt className="text-[var(--color-muted)]">Budget</dt>
            <dd>{t.budget_inr != null ? formatInr(t.budget_inr) : (t.tier_label ?? '–')}</dd>
            {t.brief ? (
              <>
                <dt className="text-[var(--color-muted)]">{side === 'bride' ? 'You asked for' : 'She wants'}</dt>
                <dd>{t.brief}</dd>
              </>
            ) : null}
            {side !== 'bride' ? (
              <>
                <dt className="text-[var(--color-muted)]">Phone</dt>
                <dd>
                  <a className="underline" href={`tel:${t.bride_phone}`}>
                    {t.bride_phone}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        </Card>

        <Card>
          <h2 className="font-semibold">Quotes</h2>
          {props.quotes.length ? (
            <ul className="mt-2 space-y-2">
              {props.quotes.map((q) => (
                <li key={q.id} className="rounded-lg border border-[var(--color-line)] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <b>{formatInr(q.amount_inr)}</b>
                    <Badge tone={q.status === 'accepted' ? 'ok' : q.status === 'sent' ? 'gold' : 'plain'}>{q.status}</Badge>
                  </div>
                  {q.lines?.length ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {q.lines.map((l) => (
                        <li key={l.label} className="flex justify-between gap-3">
                          <span className="text-[var(--color-muted)]">{l.label}</span>
                          <span className="tabular-nums">{formatInr(l.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {q.details ? <p className="mt-1 whitespace-pre-wrap">{q.details}</p> : null}
                  {q.reading && q.status !== 'withdrawn' ? <QuoteReading r={q.reading} compact /> : null}
                  {props.decideQuote && q.status === 'sent' ? (
                    <div className="mt-2 flex gap-2">
                      {[true, false].map((accept) => (
                        <form key={String(accept)} action={props.decideQuote}>
                          <input type="hidden" name="quote_id" value={q.id} />
                          <input type="hidden" name="accept" value={accept ? '1' : '0'} />
                          <input type="hidden" name="_back" value={props.backPath} />
                          <button className={`btn btn-sm ${accept ? 'btn-pink' : 'btn-ghost'}`}>{accept ? 'Accept' : 'Decline'}</button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-muted)]">No quote yet.</p>
          )}
          {props.sendQuote && !booked ? (
            <form action={props.sendQuote} className="mt-3 space-y-2">
              <input type="hidden" name="thread_id" value={t.id} />
              <input type="hidden" name="_back" value={props.backPath} />
              {t.functions && t.functions.length > 1 ? (
                <fieldset className="space-y-1.5">
                  <legend className="label">Price each function (optional)</legend>
                  {t.functions.map((f, i) => (
                    <label key={`${f.name}-${i}`} className="grid grid-cols-[1fr_120px] items-center gap-2 text-sm">
                      <span>
                        {f.name}
                        {f.event_date ? <span className="text-[var(--color-muted)]">, {fmtDay(f.event_date)}</span> : null}
                      </span>
                      <input type="hidden" name={`line_label_${i}`} value={f.name} />
                      <input name={`line_amount_${i}`} className="input py-1" inputMode="numeric" placeholder="₹" aria-label={`Price for ${f.name}`} />
                    </label>
                  ))}
                  <p className="hint">With prices here, the total is their sum.</p>
                </fieldset>
              ) : null}
              <Field label={t.functions && t.functions.length > 1 ? 'Or one total (₹)' : 'Send a quote (₹)'}>
                <input name="amount_inr" required={!(t.functions && t.functions.length > 1)} className="input" inputMode="numeric" />
              </Field>
              <textarea name="details" rows={2} className="input" placeholder="What is included" />
              <button className="btn btn-sm">Send quote</button>
            </form>
          ) : null}
        </Card>

        {props.reportBooking && !booked ? (
          <Card>
            <h2 className="font-semibold">Booked?</h2>
            <p className="hint">
              {side === 'vendor'
                ? 'Tell us when this bride books you. You get a bonus credit, and brides see verified bookings on your reviews.'
                : 'Tell us if you booked this vendor. You get 7 days of relationship-manager help to use within 60 days.'}
            </p>
            <form action={props.reportBooking} className="mt-2 space-y-2">
              <input type="hidden" name="thread_id" value={t.id} />
              <input type="hidden" name="_back" value={props.backPath} />
              <input name="amount_inr" className="input" inputMode="numeric" placeholder="Booking amount ₹ (optional)" />
              <button className="btn btn-pink btn-sm">Report booking</button>
            </form>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
