import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { sql, getSetting } from './db';

export const MFA_COOKIE = 'olr_mfa';
const HOURS = 12;
const key = () => process.env.MFA_SECRET ?? process.env.CRON_SECRET ?? 'olready-dev-mfa';

/** Bound to the person and their current authenticator secret, so re-enrolling signs other sessions out. */
function sign(profileId: string, secret: string, exp: number) {
  return createHmac('sha256', key()).update(`${profileId}.${secret.slice(0, 8)}.${exp}`).digest('base64url');
}

export async function setMfaCookie(profileId: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + HOURS * 3600;
  (await cookies()).set(MFA_COOKIE, `${exp}.${sign(profileId, secret, exp)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: HOURS * 3600,
  });
}

export async function mfaSatisfied(profileId: string, secret: string) {
  const v = (await cookies()).get(MFA_COOKIE)?.value ?? '';
  const [expS, mac] = v.split('.');
  const exp = Number(expS);
  if (!exp || exp < Date.now() / 1000 || !mac) return false;
  const want = Buffer.from(sign(profileId, secret, exp));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * What a staff member still owes before Ops opens: 'verify' (enrolled, no code this session),
 * 'enrol' (the team requires it and they have not set it up), or null.
 */
export async function mfaNeeded(profileId: string): Promise<'verify' | 'enrol' | null> {
  const [p] = await sql<{ totp_enabled: boolean; totp_secret: string | null }[]>`
    select totp_enabled, totp_secret from mkt.profiles where id = ${profileId}`;
  if (p?.totp_enabled && p.totp_secret) return (await mfaSatisfied(profileId, p.totp_secret)) ? null : 'verify';
  return (await getSetting<number>(sql, 'staff_mfa_required', 0)) ? 'enrol' : null;
}
