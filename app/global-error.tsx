'use client';

import { useEffect } from 'react';
import { reportError } from '@/components/reportError';

/** The last resort, when even the page frame fails. Plain markup: no shared styles can be assumed. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error?.digest) reportError(error);
  }, [error]);
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '15vh 24px', textAlign: 'center', color: '#111014' }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Olready is having a moment</h1>
        <p style={{ color: '#6b6870', maxWidth: 420, margin: '12px auto 0' }}>
          Something broke on our side and our team has been told. Please try again in a minute{error?.digest ? `, and quote ${error.digest} if you write to care@olready.in` : ''}.
        </p>
        <button onClick={() => retry()} style={{ marginTop: 20, padding: '10px 18px', borderRadius: 999, border: 0, background: '#e2005e', color: '#fff', fontSize: 15, cursor: 'pointer' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
