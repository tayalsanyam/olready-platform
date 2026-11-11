import { createClient } from '@supabase/supabase-js';
import type { Db } from './db';
import { DomainError } from './db';
import { render } from './email';
import { siteUrl } from './seo';

/**
 * Sign-in codes are made by Supabase but sent by us, through Resend, from the Olready address:
 * a six-digit code, plus a link that opens this site (never a developer's machine). If our own
 * sending is not set up or fails, Supabase's built-in email is used so nobody is locked out.
 */

export function ownSignInEmail() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.RESEND_API_KEY);
}

/** Ten codes an hour to one address is plenty; more is someone hammering the form. */
async function throttle(db: Db, email: string) {
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from mkt.email_outbox where to_email = ${email} and template = 'login_code' and created_at > now() - interval '1 hour'`;
  if (n >= 10) throw new DomainError('too_many', 'Too many codes asked for. Wait an hour, or use the last code we sent.');
}

export async function sendSignInCode(db: Db, input: { email: string; name?: string; next: string }): Promise<'own' | 'fallback'> {
  if (!ownSignInEmail()) return 'fallback';
  await throttle(db, input.email);
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: input.email, options: { data: input.name ? { full_name: input.name } : undefined } });
    if (error || !data?.properties?.email_otp) throw new Error(error?.message ?? 'no code');
    const { email_otp, hashed_token, verification_type } = data.properties;
    const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(hashed_token)}&type=${verification_type === 'signup' ? 'signup' : 'magiclink'}&next=${encodeURIComponent(input.next)}`;
    const { subject, text } = render('login_code', { code: email_otp, link });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'Olready <care@olready.in>', to: input.email, subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    // A record that a code went out, without the code itself.
    await db`insert into mkt.email_outbox (to_email, template, payload, sent_at) values (${input.email}, 'login_code', '{}'::jsonb, now())`;
    return 'own';
  } catch (e) {
    console.error('own sign-in email failed, using Supabase email', e);
    const { recordError } = await import('./errors');
    await recordError(db, { kind: 'server', message: `Sign-in email could not be sent by Resend: ${e instanceof Error ? e.message : String(e)}`, path: '/login', route: '/login' });
    return 'fallback';
  }
}
