'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, DomainError } from '../db';
import { DEV_COOKIE, currentProfile, devAuthEnabled, supabaseServer } from '../auth';
import { sendSignInCode } from '../signin';
import { siteUrl } from '../seo';
import { normalisePhone } from '../leads';
import { MFA_COOKIE } from '../mfa';
import { str, withParam } from './run';

const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') ? n : '/');

/** Where someone lands after signing in when no page asked for them: brides plan, vendors work. */
const landing = (next: string, as: string) => safeNext(next || (as === 'vendor' ? '/vendor' : '/me'));

/** Every sign-in passes through /welcome, which asks for a mobile number once and sends staff to Ops. */
const welcome = (next: string, as: string) => `/welcome?as=${as}${next ? `&next=${encodeURIComponent(safeNext(next))}` : ''}`;

export async function sendCode(fd: FormData) {
  const email = str(fd, 'email').toLowerCase();
  const as = str(fd, 'as') === 'vendor' ? 'vendor' : 'bride';
  const name = str(fd, 'full_name').slice(0, 80);
  const next = landing(str(fd, 'next'), as);
  const back = `/login?as=${as}&next=${encodeURIComponent(next)}`;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(withParam(back, 'error', 'Enter a valid email'));
  // A new email creates the account; the name is kept for its profile. We send the code ourselves when we can.
  let sent: 'own' | 'fallback';
  try {
    sent = await sendSignInCode(sql, { email, name, next: welcome(next, as) });
  } catch (e) {
    redirect(withParam(back, 'error', e instanceof DomainError ? e.message : 'Could not send the code. Try again in a minute.'));
  }
  if (sent === 'fallback') {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: name ? { full_name: name } : undefined, emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(welcome(next, as))}` },
    });
    if (error) redirect(withParam(back, 'error', 'Could not send the code. Try again in a minute.'));
  }
  redirect(`/login?step=code&as=${as}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}${name ? `&name=${encodeURIComponent(name)}` : ''}`);
}

export async function verifyCode(fd: FormData) {
  const email = str(fd, 'email').toLowerCase();
  const token = str(fd, 'token').replace(/\s/g, '');
  const as = str(fd, 'as') === 'vendor' ? 'vendor' : 'bride';
  const next = landing(str(fd, 'next'), as);
  const supabase = await supabaseServer();
  // A code we sent ourselves is a magic-link or sign-up code; one Supabase sent is an email code. Each can be tried once.
  let error: unknown = true;
  for (const type of ['email', 'magiclink', 'signup'] as const) {
    ({ error } = await supabase.auth.verifyOtp({ email, token, type }));
    if (!error) break;
  }
  if (error) {
    redirect(withParam(`/login?step=code&as=${as}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, 'error', 'That code did not work. Check it or ask for a new one.'));
  }
  // A new sign-in always asks staff for their authenticator code again.
  (await cookies()).delete(MFA_COOKIE);
  const name = str(fd, 'full_name').slice(0, 80);
  if (name) {
    const { data } = await supabase.auth.getUser();
    if (data.user) await sql`update mkt.profiles set full_name = ${name} where auth_user_id = ${data.user.id} and full_name = ''`;
  }
  redirect(welcome(str(fd, 'next'), as));
}

/** Saves the mobile number asked for after the first sign-in. */
export async function saveWelcome(fd: FormData) {
  const next = safeNext(str(fd, 'next') || '/');
  const p = await currentProfile();
  if (!p) redirect('/login');
  const here = `/welcome?next=${encodeURIComponent(next)}`;
  let phone: string;
  try {
    phone = normalisePhone(str(fd, 'phone'));
  } catch {
    redirect(withParam(here, 'error', 'Enter a valid 10-digit mobile number'));
  }
  const name = str(fd, 'full_name').slice(0, 80);
  await sql`update mkt.profiles set phone = ${phone}, full_name = case when ${name} <> '' then ${name} else full_name end where id = ${p.id}`;
  if (p.role === 'bride') {
    // She signed up but has not asked for anything yet: the team can call.
    const [has] = await sql`select 1 from mkt.leads where bride_profile_id = ${p.id} or phone = ${phone} limit 1`;
    if (!has) {
      const { saveCapture } = await import('../captures');
      await saveCapture(sql, { phone, name: name || p.full_name, source: 'signup', page: next, townSlug: (await cookies()).get('olr_town')?.value ?? null, visitor: `profile:${p.id}` }).catch(() => {});
    }
  }
  redirect(next);
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(DEV_COOKIE);
  jar.delete(MFA_COOKIE);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect('/');
}

/** Local development only: sign in as a seeded profile. */
export async function devSignIn(fd: FormData) {
  if (!devAuthEnabled()) redirect('/login');
  const id = str(fd, 'profile_id');
  const [p] = await sql<{ id: string; role: string }[]>`select id, role from mkt.profiles where id = ${id}`;
  if (!p) redirect('/dev-login');
  const jar = await cookies();
  jar.delete(MFA_COOKIE);
  jar.set(DEV_COOKIE, p.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect(p.role === 'vendor' ? '/vendor' : p.role === 'bride' ? '/me' : '/ops');
}
