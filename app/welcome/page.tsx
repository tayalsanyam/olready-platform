import { redirect } from 'next/navigation';
import { currentProfile, STAFF_ROLES } from '@/lib/auth';
import { saveWelcome } from '@/lib/actions/auth';
import { Card, Container, Field, Notice, sp } from '@/components/ui';
import { Marigold } from '@/components/Art';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'One last thing', robots: { index: false } };

/** After every sign-in: staff go to Ops, everyone else gives a mobile number once, then carries on. */
export default async function Welcome({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const q = await searchParams;
  const p = await currentProfile();
  if (!p) redirect('/login');
  const asked = sp(q.next) ?? '';
  const safe = asked.startsWith('/') && !asked.startsWith('//') && !asked.startsWith('/welcome') ? asked : '';
  const staff = STAFF_ROLES.includes(p.role);
  // Where she was going wins; otherwise each kind of account has its own home.
  const home = staff ? '/ops' : p.role === 'vendor' ? '/vendor' : '/me';
  const next = safe && !(staff && (safe === '/me' || safe === '/vendor')) ? safe : home;
  if (staff || p.phone) redirect(next);
  const vendor = p.role === 'vendor';
  return (
    <Container className="max-w-md">
      <Card className="p-6">
        <Marigold size={44} />
        <h1 className="mt-2 text-2xl font-semibold">You are in. What is your mobile number?</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          {vendor ? 'We call this number about verified requests, your plan and anything urgent on your profile.' : 'Our team uses it to confirm your request before any vendor sees it. Vendors do not get it until you say so.'}
        </p>
        <div className="mt-4">
          <Notice error={q.error} />
        </div>
        <form action={saveWelcome} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <Field label="Mobile number">
            <input name="phone" required inputMode="tel" autoComplete="tel" className="input" placeholder="98765 43210" autoFocus />
          </Field>
          {!p.full_name ? (
            <Field label="Your name">
              <input name="full_name" autoComplete="name" className="input" maxLength={80} />
            </Field>
          ) : null}
          <button className="btn btn-pink w-full">Continue</button>
        </form>
      </Card>
    </Container>
  );
}
