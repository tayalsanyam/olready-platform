import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { rsvpByToken } from '@/lib/weddings';
import { rsvpAction } from '@/lib/actions/public';
import { Card, Container, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'RSVP', robots: { index: false } };

type P = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[]>> };

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d) : 'Time to be announced';

/** Public: the guest's personal link. No sign-in needed. */
export default async function Rsvp({ params, searchParams }: P) {
  const { token } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const data = await rsvpByToken(sql, token);
  if (!data) notFound();
  const { guest, events } = data;
  return (
    <Container className="max-w-lg">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--color-pink)]">You are invited</p>
        <h1 className="mt-1 font-semibold text-2xl">{guest.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">Dear {guest.name}, please tell us which functions you can join.</p>
        <div className="mt-4">
          <Notice error={q.error} ok={q.ok} />
        </div>
        <form action={rsvpAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          {events.map((e) => (
            <fieldset key={e.id} className="rounded-lg border border-[var(--color-line)] p-3">
              <input type="hidden" name="event_id" value={e.id} />
              <legend className="px-1 font-semibold">{e.name}</legend>
              <p className="hint">
                {fmt(e.starts_at)}
                {e.venue ? ` · ${e.venue}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {(['yes', 'maybe', 'no'] as const).map((r) => (
                  <label key={r} className="flex items-center gap-1.5">
                    <input type="radio" name={`r_${e.id}`} value={r} defaultChecked={e.response === r} required />
                    {r === 'yes' ? 'Coming' : r === 'maybe' ? 'Maybe' : 'Can’t come'}
                  </label>
                ))}
                <label className="flex items-center gap-1.5">
                  People
                  <input name={`h_${e.id}`} type="number" min={1} max={20} defaultValue={e.headcount || 1} className="input w-20" />
                </label>
              </div>
            </fieldset>
          ))}
          <button className="btn btn-pink w-full">Send my reply</button>
        </form>
      </Card>
    </Container>
  );
}
