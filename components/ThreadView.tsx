import { formatInr } from '@/lib/catalog';
import type { ThreadRow } from '@/lib/threads';
import { Badge, Card, Field } from './ui';

type Msg = { id: number; sender_profile_id: string; sender_name: string; sender_role: string; body: string; created_at: Date };
type Quote = { id: string; amount_inr: number; details: string; status: string; created_at: Date };
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
                return (
                  <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-[var(--color-ink)] text-white' : 'bg-[#f2efe8]'}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-1 text-[0.7rem] ${mine ? 'text-white/60' : 'text-[var(--color-muted)]'}`}>
                        {mine ? 'You' : m.sender_name || m.sender_role} · {fmt(m.created_at)}
                      </p>
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
          <form action={props.postMessage} className="mt-3 flex gap-2">
            <input type="hidden" name="thread_id" value={t.id} />
            <input type="hidden" name="_back" value={props.backPath} />
            <textarea name="body" required rows={2} className="input" placeholder="Write a message" maxLength={4000} />
            <button className="btn self-end">Send</button>
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
            <dt className="text-[var(--color-muted)]">Wedding</dt>
            <dd>{t.event_date ?? 'Not fixed'}</dd>
            <dt className="text-[var(--color-muted)]">City</dt>
            <dd>{t.city_name}</dd>
            <dt className="text-[var(--color-muted)]">Budget</dt>
            <dd>{t.budget_inr != null ? formatInr(t.budget_inr) : (t.tier_label ?? '–')}</dd>
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
                  {q.details ? <p className="mt-1 whitespace-pre-wrap">{q.details}</p> : null}
                  {props.decideQuote && q.status === 'sent' ? (
                    <div className="mt-2 flex gap-2">
                      {[true, false].map((accept) => (
                        <form key={String(accept)} action={props.decideQuote}>
                          <input type="hidden" name="quote_id" value={q.id} />
                          <input type="hidden" name="accept" value={accept ? '1' : '0'} />
                          <input type="hidden" name="_back" value={props.backPath} />
                          <button className={`btn btn-sm ${accept ? 'btn-gold' : 'btn-ghost'}`}>{accept ? 'Accept' : 'Decline'}</button>
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
              <Field label="Send a quote (₹)">
                <input name="amount_inr" required className="input" inputMode="numeric" />
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
              <button className="btn btn-gold btn-sm">Report booking</button>
            </form>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
