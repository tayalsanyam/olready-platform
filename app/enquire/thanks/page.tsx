import Link from 'next/link';
import { currentProfile } from '@/lib/auth';
import { Container } from '@/components/ui';
import { Marigold } from '@/components/Art';

export const metadata = { title: 'Request received', robots: { index: false } };

const NEXT = [
  { t: 'We call you', d: 'A person from our team rings to confirm your functions, dates and budget. Usually within one working day.' },
  { t: 'Vendors see it', d: 'Only after that call, and only vendors in the categories and towns you need.' },
  { t: 'Quotes arrive', d: 'They message and quote on OLReady. Compare them side by side and pick who you like.' },
];

export default async function Thanks() {
  const p = await currentProfile();
  return (
    <Container className="max-w-2xl">
      <div className="jaali relative overflow-hidden rounded-3xl bg-[var(--color-pink-soft)] p-6 text-center sm:p-10" data-celebrate="">
        <Marigold size={72} className="pop mx-auto" />
        <h1 className="mt-3 text-4xl sm:text-5xl" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
          We have your request
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[var(--color-muted)]">You only had to tell us once. Here is what happens now.</p>
        <ol className="mx-auto mt-6 grid max-w-xl gap-3 text-left sm:grid-cols-3">
          {NEXT.map((s, i) => (
            <li key={s.t} className="card arrive bg-white/95 p-4" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
              <span className="figure text-2xl text-[var(--color-pink)]">{i + 1}</span>
              <p className="mt-1 font-semibold">{s.t}</p>
              <p className="hint mt-1">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {p ? (
            <Link href="/me" className="btn btn-pink">
              Go to my wedding
            </Link>
          ) : (
            <Link href="/login?next=/me" className="btn btn-pink">
              Sign in to track replies
            </Link>
          )}
          <Link href="/vendors" className="btn btn-ghost">
            Keep browsing
          </Link>
        </div>
      </div>
    </Container>
  );
}
