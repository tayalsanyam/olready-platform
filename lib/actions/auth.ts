'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '../db';
import { DEV_COOKIE, devAuthEnabled, supabaseServer } from '../auth';
import { str, withParam } from './run';

const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') ? n : '/');

export async function sendCode(fd: FormData) {
  const email = str(fd, 'email').toLowerCase();
  const next = safeNext(str(fd, 'next') || '/');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(withParam(`/login?next=${encodeURIComponent(next)}`, 'error', 'Enter a valid email'));
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) redirect(withParam(`/login?next=${encodeURIComponent(next)}`, 'error', 'Could not send the code. Try again in a minute.'));
  redirect(`/login?step=code&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

export async function verifyCode(fd: FormData) {
  const email = str(fd, 'email').toLowerCase();
  const token = str(fd, 'token').replace(/\s/g, '');
  const next = safeNext(str(fd, 'next') || '/');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) {
    redirect(withParam(`/login?step=code&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, 'error', 'That code did not work. Check it or ask for a new one.'));
  }
  redirect(next);
}

export async function signOut() {
  (await cookies()).delete(DEV_COOKIE);
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
  (await cookies()).set(DEV_COOKIE, p.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect(p.role === 'vendor' ? '/vendor' : p.role === 'bride' ? '/me' : '/ops');
}
