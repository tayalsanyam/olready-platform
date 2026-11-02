import Link from 'next/link';
import { currentProfile } from '@/lib/auth';
import { Card, Container } from '@/components/ui';

export const metadata = { title: 'Request received', robots: { index: false } };

export default async function Thanks() {
  const p = await currentProfile();
  return (
    <Container className="max-w-xl">
      <Card className="p-6 text-center">
        <h1 className="font-semibold text-2xl">Request received</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Our team will call you shortly to confirm your details. Once you are verified, vendors in each category you picked can
          reach you, and you can compare their quotes in one place.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {p ? (
            <Link href="/me" className="btn">
              Go to my wedding
            </Link>
          ) : (
            <Link href="/login?next=/me" className="btn">
              Sign in to track replies
            </Link>
          )}
          <Link href="/vendors" className="btn btn-ghost">
            Keep browsing
          </Link>
        </div>
      </Card>
    </Container>
  );
}
