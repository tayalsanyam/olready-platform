import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { listErrors } from '@/lib/errors';
import { opsResolveAllErrors, opsResolveError } from '@/lib/actions/ops';
import { fmtDateTime, plural } from '@/lib/dates';
import { Badge, Card, Empty, Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Errors', robots: { index: false } };

const sp = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Errors({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  await requireRole(['admin', 'ops'], '/ops/errors');
  const q = await searchParams;
  const view = sp(q.view) === 'fixed' ? 'fixed' : 'open';
  const rows = await listErrors(sql, view);
  return (
    <>
      <PageTitle
        title="Errors"
        sub="Every crash a visitor hit, on our servers or in their browser, grouped by what broke. The team is alerted the first time each one appears. Send the details to your developer, then mark it fixed; if it happens again it comes back."
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/ops/errors" className={`btn btn-sm ${view === 'open' ? '' : 'btn-ghost'}`}>
          To look at
        </Link>
        <Link href="/ops/errors?view=fixed" className={`btn btn-sm ${view === 'fixed' ? '' : 'btn-ghost'}`}>
          Marked fixed
        </Link>
        {view === 'open' && rows.length > 1 ? (
          <form action={opsResolveAllErrors} className="ml-auto">
            <button className="btn btn-ghost btn-sm">Mark all {rows.length} fixed</button>
          </form>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{e.message}</p>
                    <p className="hint mt-1">
                      <Badge tone={e.kind === 'server' ? 'bad' : 'warn'}>{e.kind === 'server' ? 'On our server' : "In a visitor's browser"}</Badge> {e.path ?? e.route ?? 'unknown page'}
                      {e.route_type ? ` · while ${{ render: 'showing a page', action: 'saving a form', route: 'answering a request', proxy: 'checking sign-in' }[e.route_type] ?? e.route_type}` : ''}
                    </p>
                    <p className="hint mt-1">
                      {plural(e.occurrences, 'time')} · first {fmtDateTime(e.first_seen)} · last {fmtDateTime(e.last_seen)}
                      {e.digest ? ` · code ${e.digest}` : ''}
                    </p>
                  </div>
                  {view === 'open' ? (
                    <form action={opsResolveError}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="btn btn-ghost btn-sm">Mark fixed</button>
                    </form>
                  ) : null}
                </div>
                {e.stack || e.user_agent ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium">Details for your developer</summary>
                    {e.route ? <p className="hint mt-2">Route file: {e.route}{e.method ? ` (${e.method})` : ''}</p> : null}
                    {e.user_agent ? <p className="hint mt-1 break-words">Browser: {e.user_agent}</p> : null}
                    {e.stack ? (
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-[var(--color-tint)] p-3 text-xs leading-relaxed" tabIndex={0}>
                        {e.stack}
                      </pre>
                    ) : null}
                  </details>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty art="stars" title={view === 'open' ? 'Nothing is broken' : 'Nothing marked fixed yet'}>
          {view === 'open' ? 'No visitor has hit a crash that still needs looking at.' : null}
        </Empty>
      )}
    </>
  );
}
