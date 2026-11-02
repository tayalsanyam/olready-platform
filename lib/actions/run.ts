import 'server-only';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { DomainError, sql } from '../db';
import { flushOutbox } from '../email';

export function withParam(path: string, key: string, value: string) {
  const [base, query = ''] = path.split('?');
  const q = new URLSearchParams(query);
  q.delete('error');
  q.delete('ok');
  q.set(key, value);
  return `${base}?${q.toString()}`;
}

/**
 * Runs a server action body. A DomainError goes back to `back` as ?error=;
 * success goes to the returned path (or `back`) with an optional ?ok= message.
 * redirect() is called outside the try so Next's redirect signal is not swallowed.
 */
export async function attempt(back: string, fn: () => Promise<string | { to?: string; ok?: string } | void>) {
  let to: string;
  try {
    const r = await fn();
    if (typeof r === 'string') to = r;
    else if (r && (r.to || r.ok)) to = r.ok ? withParam(r.to ?? back, 'ok', r.ok) : (r.to ?? back);
    else to = back;
    // Send any emails this action queued, after the response is on its way.
    if (process.env.RESEND_API_KEY) after(() => flushOutbox(sql, 20).then(() => undefined, () => undefined));
  } catch (e) {
    if (e instanceof DomainError) to = withParam(back, 'error', e.message);
    else throw e;
  }
  redirect(to);
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/[,₹\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const back = (fd: FormData, fallback: string) => {
  const b = str(fd, '_back');
  return b.startsWith('/') && !b.startsWith('//') ? b : fallback;
};

/** Reads a category's attribute inputs, named attr_<key>, into a plain object. */
export function attrsFromForm(fd: FormData) {
  const out: Record<string, unknown> = {};
  const keys = new Set(Array.from(fd.keys()).filter((k) => k.startsWith('attr_')));
  for (const k of keys) {
    const all = fd.getAll(k).map(String);
    // Multiselects post a hidden marker plus one entry per ticked box.
    const values = all.filter((v) => v !== '__multi');
    out[k.slice(5)] = all.includes('__multi') ? values : (values[0] ?? '');
  }
  return out;
}
