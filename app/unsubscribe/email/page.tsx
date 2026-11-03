import { sql } from '@/lib/db';
import { suppress, verifyUnsubscribe } from '@/lib/email';
import { Card, Container, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unsubscribe', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function EmailUnsubscribe({ searchParams }: P) {
  const q = await searchParams;
  const email = verifyUnsubscribe(sp(q.e) ?? '', sp(q.t) ?? '');
  if (email) await suppress(sql, email, 'unsubscribed', 'link');
  return (
    <Container className="max-w-md">
      <Card className="p-6 text-center">
        <h1 className="text-2xl font-semibold">{email ? 'You will not get our emails any more' : 'Link not recognised'}</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          {email
            ? `We have stopped all emails to ${email}. Sign-in codes still arrive when you ask for one. Changed your mind? Write to care@olready.in.`
            : 'This unsubscribe link is not valid. Reply to any of our emails and we will remove you.'}
        </p>
      </Card>
    </Container>
  );
}
