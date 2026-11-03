import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, devAuthEnabled } from '@/lib/auth';
import { sendCode, signOut, verifyCode } from '@/lib/actions/auth';
import { Card, Container, Field, Notice, sp } from '@/components/ui';
import { IconShield } from '@/components/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in or create your account', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

/**
 * One page for signing in and signing up: there is no password, so a first sign-in with a new
 * email creates the account. The two doors only change the copy and where she lands next.
 */
export default async function Login({ searchParams }: P) {
  const q = await searchParams;
  const next = sp(q.next) ?? '';
  const as = sp(q.as) === 'vendor' || next.startsWith('/vendor') ? 'vendor' : 'bride';
  if (devAuthEnabled()) redirect(`/dev-login?next=${encodeURIComponent(next || (as === 'vendor' ? '/vendor' : '/me'))}`);
  const p = await currentProfile();
  const codeStep = sp(q.step) === 'code';
  const door = (k: 'bride' | 'vendor') => `/login?as=${k}${next && !(k === 'bride' && next.startsWith('/vendor')) ? `&next=${encodeURIComponent(next)}` : ''}`;
  return (
    <Container className="max-w-md">
      <h1 className="text-center text-2xl font-semibold">{p ? 'You are signed in' : as === 'vendor' ? 'Your business on OLReady' : 'Plan your wedding on OLReady'}</h1>
      <p className="mt-1 text-center text-sm text-[var(--color-muted)]">
        {p ? p.email : 'No password. We email you a code; a new email creates your account.'}
      </p>
      {!p && !codeStep ? (
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-[var(--color-tint)] p-1 text-sm font-semibold" role="tablist" aria-label="I am">
          {(['bride', 'vendor'] as const).map((k) => (
            <Link
              key={k}
              href={door(k)}
              role="tab"
              aria-selected={as === k}
              className={`rounded-full px-3 py-2 text-center ${as === k ? 'bg-white text-[var(--color-ink)] shadow-sm' : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'}`}
            >
              {k === 'bride' ? 'Planning a wedding' : 'Wedding business'}
            </Link>
          ))}
        </div>
      ) : null}
      <Card className="mt-4 p-6">
        <Notice error={q.error} />
        {p ? (
          <div className="space-y-3">
            <Link href={p.role === 'vendor' ? '/vendor' : p.role === 'bride' ? '/me' : '/ops'} className="btn btn-pink w-full">
              {p.role === 'vendor' ? 'Go to your business' : p.role === 'bride' ? 'Go to my wedding' : 'Open the Ops console'}
            </Link>
            <form action={signOut}>
              <button className="btn btn-ghost w-full">Sign out</button>
            </form>
          </div>
        ) : codeStep ? (
          <form action={verifyCode} className="space-y-3">
            <input type="hidden" name="email" value={sp(q.email) ?? ''} />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="as" value={as} />
            <input type="hidden" name="full_name" value={sp(q.name) ?? ''} />
            <Field label={`Code sent to ${sp(q.email)}`} hint="It can take a minute. Check spam if it does not arrive.">
              <input name="token" required className="input text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} autoFocus />
            </Field>
            <button className="btn btn-pink w-full">Continue</button>
            <Link href={door(as)} className="block text-center text-sm underline">
              Use a different email
            </Link>
          </form>
        ) : (
          <form action={sendCode} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="as" value={as} />
            <Field label="Email">
              <input name="email" type="email" required className="input" autoComplete="email" />
            </Field>
            <Field label="Your name" hint="Only needed the first time.">
              <input name="full_name" className="input" autoComplete="name" maxLength={80} />
            </Field>
            <button className="btn btn-pink w-full">Email me a code</button>
          </form>
        )}
      </Card>
      {!p ? (
        <div className="mt-5 space-y-2 text-sm text-[var(--color-muted)]">
          {as === 'vendor' ? (
            <>
              <p>New here? After the code you will add your business: category, city and prices. Our team checks it before it goes live.</p>
              <p>
                Want to know more first? <Link href="/for-vendors" className="font-semibold text-[var(--color-pink-deep)] underline-offset-4 hover:underline">See how OLReady works for vendors</Link>
              </p>
            </>
          ) : (
            <>
              <p className="flex gap-2">
                <IconShield size={18} className="mt-0.5 shrink-0 text-[var(--color-pink)]" />
                Your account keeps your requests, quotes, shortlist, budget, guest list and invites in one place. Already sent a request? Use the same
                email and it is waiting for you.
              </p>
              <p>
                Just want quotes? <Link href="/enquire" className="font-semibold text-[var(--color-pink-deep)] underline-offset-4 hover:underline">Send a request without an account</Link>
              </p>
            </>
          )}
        </div>
      ) : null}
    </Container>
  );
}
