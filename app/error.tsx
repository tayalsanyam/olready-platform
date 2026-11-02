'use client';

import Link from 'next/link';

/** Shown when a page fails unexpectedly. Business-rule errors appear inline instead. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = (error as { digest?: string } | null)?.digest;
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Something went wrong</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        Please try again. If it keeps happening, write to care@olready.in
        {digest ? (
          <>
            {' '}
            and quote <span className="font-mono">{digest}</span>
          </>
        ) : null}
        .
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => retry()} className="btn">
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}
