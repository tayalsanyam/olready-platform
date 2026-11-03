'use server';

import { DomainError, sql, audit } from '../db';
import { requireProfile, STAFF_ROLES } from '../auth';
import { newSecret, verifyCode } from '../totp';
import { setMfaCookie } from '../mfa';
import { attempt, str } from './run';

const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') ? n : '/ops');

async function staff() {
  const p = await requireProfile('/mfa');
  if (!STAFF_ROLES.includes(p.role)) throw new DomainError('forbidden', 'Only staff use this');
  return p;
}

/** Starts setup: a fresh secret, shown once as a QR code; enabled only after a correct code. */
export async function mfaStartAction(fd: FormData) {
  const next = safeNext(str(fd, 'next'));
  await attempt(`/mfa?next=${encodeURIComponent(next)}`, async () => {
    const p = await staff();
    const [cur] = await sql<{ totp_enabled: boolean }[]>`select totp_enabled from mkt.profiles where id = ${p.id}`;
    if (cur?.totp_enabled) throw new DomainError('enabled', 'Already set up. Enter your code.');
    await sql`update mkt.profiles set totp_secret = ${newSecret()} where id = ${p.id}`;
    return `/mfa?next=${encodeURIComponent(next)}&setup=1`;
  });
}

export async function mfaVerifyAction(fd: FormData) {
  const next = safeNext(str(fd, 'next'));
  await attempt(`/mfa?next=${encodeURIComponent(next)}${str(fd, 'setup') ? '&setup=1' : ''}`, async () => {
    const p = await staff();
    const [row] = await sql<{ totp_secret: string | null; totp_enabled: boolean; totp_last_step: string | null }[]>`
      select totp_secret, totp_enabled, totp_last_step from mkt.profiles where id = ${p.id}`;
    if (!row?.totp_secret) throw new DomainError('no_secret', 'Start setup first');
    const step = verifyCode(row.totp_secret, str(fd, 'code'));
    // A code works once: replaying the same 30-second code is refused.
    if (step == null || (row.totp_last_step != null && step <= Number(row.totp_last_step))) throw new DomainError('bad_code', 'That code is not right. Use the latest one from your app.');
    await sql`update mkt.profiles set totp_enabled = true, totp_last_step = ${step} where id = ${p.id}`;
    if (!row.totp_enabled) await audit(sql, p.id, 'mfa.enable', 'profile', p.id);
    await setMfaCookie(p.id, row.totp_secret);
    return next;
  });
}

/** Admins reset a colleague who lost their phone; they enrol again at next sign-in. */
export async function opsResetMfa(fd: FormData) {
  await attempt('/ops/staff', async () => {
    const { requireRole } = await import('../auth');
    const me = await requireRole(['admin']);
    const email = str(fd, 'email').toLowerCase();
    const [p] = await sql<{ id: string }[]>`update mkt.profiles set totp_secret = null, totp_enabled = false, totp_last_step = null where email = ${email} returning id`;
    if (!p) throw new DomainError('not_found', 'No one with that email');
    await audit(sql, me.id, 'mfa.reset', 'profile', p.id);
    return { ok: `${email} will set up their authenticator again at next sign-in` };
  });
}
