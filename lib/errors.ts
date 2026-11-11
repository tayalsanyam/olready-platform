import { createHash } from 'node:crypto';
import type { Db } from './db';

/**
 * Error monitoring kept in our own database: every crash a visitor hits on the server or in the
 * browser is stored, grouped by what broke and where, and the team is alerted the first time a
 * new fault appears (or a fixed one comes back). Recording an error must never cause another.
 */

export type ErrorInput = {
  kind: 'server' | 'client';
  message: string;
  stack?: string | null;
  path?: string | null;
  route?: string | null;
  routeType?: string | null;
  method?: string | null;
  digest?: string | null;
  userAgent?: string | null;
};

// Not faults: redirects, not-found pages, and requests the visitor abandoned.
const IGNORE = /NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|AbortError|The operation was aborted|ResizeObserver loop|Load failed|Failed to fetch|NetworkError|ChunkLoadError|Script error\.?$/i;

/** Links carry private tokens (claim, RSVP, review, calendar). Keep the shape, drop the secret. */
export function scrubPath(path: string | null | undefined) {
  if (!path) return null;
  return path
    .split('?')[0]
    .split('/')
    .map((seg) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) ? ':id' : seg.length >= 20 && /^[A-Za-z0-9_-]+$/.test(seg) ? ':token' : seg))
    .join('/')
    .slice(0, 300);
}

const scrubText = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '<number>')
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, '$1<hidden>')
    .replace(/\b(sk|rk|pk|re|whsec)[-_][A-Za-z0-9_-]{12,}/g, '<key>');

export function fingerprintOf(e: Pick<ErrorInput, 'kind' | 'message' | 'route' | 'path'>) {
  // Ids and numbers inside a message would split one fault into many.
  const msg = e.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\d+/g, 'N').slice(0, 200);
  return createHash('sha1').update(`${e.kind}|${msg}|${e.route ?? scrubPath(e.path) ?? ''}`).digest('hex').slice(0, 20);
}

export async function recordError(db: Db, input: ErrorInput): Promise<{ stored: boolean; isNew: boolean }> {
  try {
    const message = scrubText(String(input.message || 'Unknown error')).slice(0, 500);
    if (IGNORE.test(message) || IGNORE.test(input.digest ?? '')) return { stored: false, isNew: false };
    const path = scrubPath(input.path);
    const fingerprint = fingerprintOf({ kind: input.kind, message, route: input.route ?? null, path });
    const [row] = await db<{ id: string; occurrences: number }[]>`
      insert into mkt.error_events (fingerprint, kind, message, stack, path, route, route_type, method, digest, user_agent)
      values (${fingerprint}, ${input.kind}, ${message}, ${input.stack ? scrubText(input.stack).slice(0, 6000) : null}, ${path}, ${input.route?.slice(0, 200) ?? null},
        ${input.routeType?.slice(0, 40) ?? null}, ${input.method?.slice(0, 10) ?? null}, ${input.digest?.slice(0, 60) ?? null}, ${input.userAgent?.slice(0, 300) ?? null})
      on conflict (fingerprint) do update set
        occurrences = mkt.error_events.occurrences + 1, last_seen = now(), path = coalesce(excluded.path, mkt.error_events.path),
        digest = coalesce(excluded.digest, mkt.error_events.digest), stack = coalesce(mkt.error_events.stack, excluded.stack),
        resolved_at = null, resolved_by = null
      returning id, occurrences`;
    // First sighting, or back after being marked fixed (the count restarts then): tell the team once a day.
    const isNew = row.occurrences === 1;
    if (isNew) {
      const { staffAlert } = await import('./alerts');
      await staffAlert(db, 'error', `${message.slice(0, 120)}${path ? ` on ${path}` : ''}`, '/ops/errors', `error:${fingerprint}:${new Date().toISOString().slice(0, 10)}`);
    }
    return { stored: true, isNew };
  } catch (e) {
    console.error('could not record error', e);
    return { stored: false, isNew: false };
  }
}

export type ErrorRow = {
  id: string; kind: 'server' | 'client'; message: string; stack: string | null; path: string | null; route: string | null; route_type: string | null;
  method: string | null; digest: string | null; user_agent: string | null; occurrences: number; first_seen: Date; last_seen: Date; resolved_at: Date | null;
};

export async function listErrors(db: Db, view: 'open' | 'fixed' = 'open') {
  return db<ErrorRow[]>`
    select id, kind, message, stack, path, route, route_type, method, digest, user_agent, occurrences, first_seen, last_seen, resolved_at
    from mkt.error_events where ${view === 'open' ? db`resolved_at is null` : db`resolved_at is not null`}
    order by last_seen desc limit 200`;
}

/** Zero if the table is not there yet, so a deploy that lands before its migration cannot break Ops. */
export async function openErrorCount(db: Db) {
  try {
    const [r] = await db<{ n: number }[]>`select count(*)::int as n from mkt.error_events where resolved_at is null`;
    return r.n;
  } catch {
    return 0;
  }
}

/** Marked fixed. If it happens again it reopens and the team hears. */
export async function resolveError(db: Db, id: string, actor: string) {
  await db`update mkt.error_events set resolved_at = now(), resolved_by = ${actor}, occurrences = 0 where id = ${id}`;
}

export async function resolveAllErrors(db: Db, actor: string) {
  await db`update mkt.error_events set resolved_at = now(), resolved_by = ${actor}, occurrences = 0 where resolved_at is null`;
}

/** Daily: forget faults fixed more than 60 days ago. */
export async function purgeOldErrors(db: Db) {
  const rows = await db`delete from mkt.error_events where resolved_at < now() - interval '60 days' returning id`;
  return rows.length;
}
