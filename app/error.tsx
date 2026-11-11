'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { reportError } from '@/components/reportError';
import { Scene } from '@/components/Art';

/** Shown when a page fails unexpectedly. Business-rule errors appear inline instead. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const digest = error?.digest;
  // Server-side failures are already logged by the server; this covers crashes in the browser.
  useEffect(() => {
    if (!digest) reportError(error);
  }, [error, digest]);
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Scene kind="search" className="mx-auto mb-3" />
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        It is our fault, not yours, and our team has been told. Please try again. If it keeps happening, write to care@olready.in
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
