/** Sends a browser-side crash to the site's own error log. Never throws, never blocks. */
export function reportError(error: unknown, extra: { digest?: string } = {}) {
  try {
    const e = error as { message?: string; stack?: string; digest?: string } | null;
    const body = JSON.stringify({ message: e?.message ?? String(error), stack: e?.stack ?? null, digest: extra.digest ?? e?.digest ?? null, path: location.pathname });
    void fetch('/api/errors', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  } catch {
    /* nothing to do */
  }
}
