import Link from 'next/link';
import { sql } from '@/lib/db';
import { classFee, classLength, classWhen, LEVELS, upcomingClasses } from '@/lib/classes';
import { Badge, Container, Empty, PageTitle, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
type P = { searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ searchParams }: P) {
  const q = await searchParams;
  return {
    title: 'Self-makeup and mehendi classes',
    description: 'Learn self-makeup and mehendi from working wedding artists. Small classes, in person and online. Ask for a seat with your name and number.',
    alternates: { canonical: '/classes' },
    robots: sp(q.city) ? { index: false, follow: true } : undefined,
  };
}

export default async function Classes({ searchParams }: P) {
  const q = await searchParams;
  const all = await upcomingClasses(sql);
  const towns = [...new Map(all.filter((c) => c.city).map((c) => [c.city!, c.city!])).keys()].sort();
  const town = towns.find((t) => t.toLowerCase() === (sp(q.city) ?? '').toLowerCase()) ?? null;
  const list = town ? all.filter((c) => c.city === town || c.mode === 'online') : all;
  return (
    <Container>
      <PageTitle
        title="Learn from the artists brides book"
        sub="Self-makeup and mehendi classes taught by verified wedding artists. Ask for a seat, and the artist calls you to confirm. You pay the artist directly."
      />
      {towns.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="/classes" className="chip" aria-current={!town}>
            All towns
          </Link>
          {towns.map((t) => (
            <Link key={t} href={`/classes?city=${encodeURIComponent(t.toLowerCase())}`} className="chip" aria-current={town === t}>
              {t}
            </Link>
          ))}
        </div>
      ) : null}
      {list.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((c) => {
            const left = c.seats - c.taken;
            return (
              <li key={c.id}>
                <Link href={`/classes/${c.id}`} className="card block h-full p-4 hover:border-[var(--color-pink)]">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge>{c.mode === 'online' ? 'Online' : (c.city ?? 'In person')}</Badge>
                    <Badge>{LEVELS[c.level]}</Badge>
                    {left <= 0 ? <Badge tone="warn">Full</Badge> : left <= 3 ? <Badge tone="warn">{left} {left === 1 ? 'seat' : 'seats'} left</Badge> : null}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold">{c.title}</h2>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">with {c.vendor}</p>
                  <p className="mt-3 text-sm">
                    {classWhen(c.starts_at)} <span className="text-[var(--color-muted)]">for {classLength(c.duration_min)}</span>
                  </p>
                  <p className="mt-1 font-semibold">{classFee(c.fee_inr)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No classes are open right now">
          Artists add new dates through the season.{' '}
          <Link href="/vendors/chandigarh/bridal-makeup" className="underline">
            Browse makeup artists
          </Link>{' '}
          in the meantime.
        </Empty>
      )}
      <p className="mt-8 text-sm text-[var(--color-muted)]">
        Are you a makeup or mehendi artist? <Link href="/vendor/classes" className="underline">List your class</Link>. It is free.
      </p>
    </Container>
  );
}
