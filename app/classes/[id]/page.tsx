import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { classFee, classLength, classWhen, getClass, LEVELS } from '@/lib/classes';
import { askForSeat } from '@/lib/actions/classes';
import { Badge, Card, Container, Field, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

const open = (c: NonNullable<Awaited<ReturnType<typeof getClass>>>) => c.status === 'live' && c.starts_at.getTime() > Date.now();

export async function generateMetadata({ params }: P) {
  const c = await getClass(sql, (await params).id);
  if (!c || c.status === 'hidden') return { title: 'Class' };
  return {
    title: `${c.title} with ${c.vendor}`,
    description: `${c.title}: a ${LEVELS[c.level].toLowerCase()} class with ${c.vendor}, ${classWhen(c.starts_at)}. ${classFee(c.fee_inr)}.`,
    alternates: { canonical: `/classes/${c.id}` },
    robots: open(c) ? undefined : { index: false },
  };
}

export default async function ClassPage({ params, searchParams }: P) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const c = await getClass(sql, id);
  if (!c || c.status === 'hidden') notFound();
  const left = c.seats - c.taken;
  const taking = open(c) && left > 0;
  return (
    <Container>
      <p className="text-sm">
        <Link href="/classes" className="text-[var(--color-muted)] hover:underline">
          Classes
        </Link>
      </p>
      <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{c.mode === 'online' ? 'Online' : (c.city ?? 'In person')}</Badge>
            <Badge>{LEVELS[c.level]}</Badge>
            {c.status === 'cancelled' ? <Badge tone="warn">Cancelled</Badge> : null}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{c.title}</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Taught by{' '}
            <Link href={`/v/${c.vendor_slug}`} className="underline">
              {c.vendor}
            </Link>
            , {c.category.toLowerCase()}
          </p>
          {c.summary ? <p className="mt-5 max-w-prose whitespace-pre-line leading-relaxed">{c.summary}</p> : null}
          <dl className="mt-6 grid max-w-xl gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {(
              [
                ['When', classWhen(c.starts_at)],
                ['Length', classLength(c.duration_min)],
                ['Where', c.mode === 'online' ? (c.venue || 'Online, link sent by the artist') : [c.venue, c.city].filter(Boolean).join(', ')],
                ['Class size', `${c.seats} ${c.seats === 1 ? 'seat' : 'seats'}`],
                ['Included', c.includes],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[var(--color-muted)]">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
        <Card id="seat" className="h-fit">
          <p className="text-2xl font-semibold">{classFee(c.fee_inr)}</p>
          <p className="text-sm text-[var(--color-muted)]">
            {c.fee_inr ? 'per seat, paid to the artist' : 'no fee'}
            {taking && left <= 3 ? `. ${left} ${left === 1 ? 'seat' : 'seats'} left` : ''}
          </p>
          <Notice error={q.error} ok={q.ok} />
          {q.ok ? null : taking ? (
            <form action={askForSeat} className="mt-3 space-y-3">
              <input type="hidden" name="class_id" value={c.id} />
              <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              <Field label="Your name">
                <input name="name" className="input" required minLength={2} maxLength={80} autoComplete="name" />
              </Field>
              <Field label="Mobile number">
                <input name="phone" className="input" required inputMode="tel" autoComplete="tel" placeholder="98765 43210" />
              </Field>
              <Field label="Anything the artist should know" hint="Optional">
                <input name="note" className="input" maxLength={300} placeholder="I am a beginner; it is for my sister’s wedding" />
              </Field>
              <button className="btn w-full">Ask for a seat</button>
              <p className="text-xs text-[var(--color-muted)]">
                Your name and number go to {c.vendor} for this class, and to the Olready team. {c.vendor} calls you to confirm. See our{' '}
                <Link href="/privacy" className="underline">
                  privacy policy
                </Link>
                .
              </p>
            </form>
          ) : (
            <p className="mt-3 text-sm">
              {c.status === 'cancelled' ? 'This class was cancelled.' : open(c) ? 'This class is full.' : 'This class has finished.'}{' '}
              <Link href="/classes" className="underline">
                See other classes
              </Link>
            </p>
          )}
        </Card>
      </div>
    </Container>
  );
}
