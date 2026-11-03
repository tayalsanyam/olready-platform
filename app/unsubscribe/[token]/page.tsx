import { sql } from '@/lib/db';
import { unsubscribeNewsletter } from '@/lib/articles';
import { Card, Container } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unsubscribe', robots: { index: false } };

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = /^[0-9a-f]{32}$/.test(token) && (await unsubscribeNewsletter(sql, token));
  return (
    <Container className="max-w-md">
      <Card className="p-6 text-center">
        <h1 className="text-2xl font-semibold">{ok ? 'You are unsubscribed' : 'Link not recognised'}</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          {ok ? 'We will not send you wedding ideas by email any more.' : 'This unsubscribe link is not valid. Reply to any of our emails and we will remove you.'}
        </p>
      </Card>
    </Container>
  );
}
