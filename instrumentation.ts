import type { Instrumentation } from 'next';

/** Every error the server catches while rendering a page, running an action or answering a route is recorded for Ops > Errors. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { sql } = await import('./lib/db');
    const { recordError } = await import('./lib/errors');
    const e = err as { message?: string; stack?: string; digest?: string } | null;
    const ua = request.headers['user-agent'];
    await recordError(sql, {
      kind: 'server',
      message: e?.message ?? String(err),
      stack: e?.stack ?? null,
      digest: e?.digest ?? null,
      path: request.path,
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
      userAgent: Array.isArray(ua) ? ua[0] : ua,
    });
  } catch (e) {
    console.error('onRequestError failed', e);
  }
};
