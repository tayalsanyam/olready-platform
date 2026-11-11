import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireProfile, STAFF_ROLES } from '@/lib/auth';
import { otpauthUri } from '@/lib/totp';
import { mfaStartAction, mfaVerifyAction } from '@/lib/actions/mfa';
import { Card, Container, Notice, sp } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Authenticator', robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Mfa({ searchParams }: P) {
  const q = await searchParams;
  const next = (sp(q.next) ?? '/ops').startsWith('/') ? (sp(q.next) ?? '/ops') : '/ops';
  const p = await requireProfile(`/mfa?next=${encodeURIComponent(next)}`);
  if (!STAFF_ROLES.includes(p.role)) redirect('/');
  const [row] = await sql<{ totp_enabled: boolean; totp_secret: string | null; email: string | null }[]>`
    select totp_enabled, totp_secret, email from mkt.profiles where id = ${p.id}`;
  const setup = !row.totp_enabled && sp(q.setup) === '1' && row.totp_secret;
  const qr = setup ? await QRCode.toString(otpauthUri(row.totp_secret!, row.email ?? p.full_name), { type: 'svg', margin: 1, width: 200 }) : null;
  return (
    <Container className="max-w-md">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold">{row.totp_enabled ? 'Enter your code' : 'Set up your authenticator'}</h1>
        <div className="mt-3">
          <Notice error={sp(q.error)} ok={sp(q.ok)} />
        </div>
        {row.totp_enabled ? (
          <p className="mt-2 text-[var(--color-muted)]">Open your authenticator app and enter the 6-digit code for Olready Ops. You stay signed in for 12 hours.</p>
        ) : setup ? (
          <>
            <p className="mt-2 text-[var(--color-muted)]">Scan this with Google Authenticator, Authy or Microsoft Authenticator, then enter the code it shows.</p>
            <div className="mx-auto mt-4 w-[200px]" dangerouslySetInnerHTML={{ __html: qr! }} />
            <p className="mt-3 break-all text-center font-mono text-xs text-[var(--color-muted)]">Or type this key: {row.totp_secret}</p>
          </>
        ) : (
          <form action={mfaStartAction} className="mt-4">
            <input type="hidden" name="next" value={next} />
            <p className="text-[var(--color-muted)]">Ops holds bride phone numbers and payments, so staff confirm each sign-in with an app on their phone.</p>
            <button className="btn btn-pink mt-4 w-full">Start setup</button>
          </form>
        )}
        {row.totp_enabled || setup ? (
          <form action={mfaVerifyAction} className="mt-5 space-y-3">
            <input type="hidden" name="next" value={next} />
            {setup ? <input type="hidden" name="setup" value="1" /> : null}
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="input text-center text-2xl tracking-[0.4em]" aria-label="6-digit code" />
            <button className="btn btn-pink w-full">{setup ? 'Turn on and continue' : 'Continue'}</button>
          </form>
        ) : null}
      </Card>
    </Container>
  );
}
