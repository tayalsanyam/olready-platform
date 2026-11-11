import { createHash, randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';

const COOKIE = 'olr_v';

/** A random id kept in a cookie so the chat's daily limit and a visitor's own entries can be told apart. Not linked to an account. */
export async function visitorId() {
  const jar = await cookies();
  const have = jar.get(COOKIE)?.value;
  if (have && /^[0-9a-f-]{36}$/.test(have)) return have;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 180 * 86400 });
  return id;
}

/** The network for today as a one-way code, for a shared ceiling. Null for known bots. */
export async function networkKey() {
  const h = await headers();
  const ua = h.get('user-agent') ?? '';
  if (!ua || /bot|crawl|spider|slurp|preview|headless(?!chrome)/i.test(ua)) return null;
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
  const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  return createHash('sha256').update(`${process.env.CRON_SECRET ?? 'olready'}|${day}|${ip}`).digest('hex').slice(0, 32);
}

export async function sameSite() {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === h.get('host');
  } catch {
    return false;
  }
}
