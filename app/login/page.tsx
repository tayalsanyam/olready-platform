import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, devAuthEnabled } from '@/lib/auth';
import { sendCode, signOut, verifyCode } from '@/lib/actions/auth';
import { Card, Container, Field, Notice, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Login({ searchParams }: P) {
  const q = await searchParams;
  const next = sp(q.next) ?? '/';
  if (devAuthEnabled()) redirect(`/dev-login?next=${encodeURIComponent(next)}`);
  const p = await currentProfile();
  const codeStep = sp(q.step) === 'code';
  return (
    <Container className="max-w-md">
      <Card className="p-6">
        <h1 className="font-semibold text-2xl">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Brides, families and vendors sign in with a one-time code sent to their email.
        </p>
        <div className="mt-4">
          <Notice error={q.error} />
        </div>
        {p ? (
          <div className="space-y-3">
            <p>You are signed in as {p.email}.</p>
            <form action={signOut}>
              <button className="btn btn-ghost">Sign out</button>
            </form>
          </div>
        ) : codeStep ? (
          <form action={verifyCode} className="space-y-3">
            <input type="hidden" name="email" value={sp(q.email) ?? ''} />
            <input type="hidden" name="next" value={next} />
            <Field label={`Code sent to ${sp(q.email)}`}>
              <input name="token" required className="input tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} />
            </Field>
            <button className="btn w-full">Sign in</button>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="block text-center text-sm underline">
              Use a different email
            </Link>
          </form>
        ) : (
          <form action={sendCode} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <Field label="Email">
              <input name="email" type="email" required className="input" autoComplete="email" />
            </Field>
            <button className="btn w-full">Email me a code</button>
          </form>
        )}
      </Card>
    </Container>
  );
}
