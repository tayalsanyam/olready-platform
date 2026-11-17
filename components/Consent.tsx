'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Fbq = ((...a: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; callMethod?: (...a: unknown[]) => void };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const KEY = 'olr_consent';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * Ad measurement, only with a yes. Nothing from Meta loads until the visitor allows it, and "No thanks"
 * is remembered the same way. Any element with data-cookie-choices reopens the question.
 */
export function Consent({ pixelId }: { pixelId: string }) {
  const path = usePathname();
  const [ask, setAsk] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    const v = read();
    if (v === 'yes') setAllowed(true);
    else if (v !== 'no') setAsk(true);
    const reopen = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-cookie-choices]')) setAsk(true);
    };
    document.addEventListener('click', reopen);
    return () => document.removeEventListener('click', reopen);
  }, []);

  // Load Meta's script once, after the yes.
  useEffect(() => {
    if (!allowed || started.current) return;
    started.current = true;
    const fbq: Fbq = function (...a: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...a);
      else fbq.queue!.push(a);
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.push = fbq;
    window.fbq = window._fbq = fbq;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    fbq('init', pixelId);
    // A number left with us is the result the ads are paid for.
    const lead = () => window.fbq?.('track', 'Lead');
    window.addEventListener('olr:lead', lead);
    return () => window.removeEventListener('olr:lead', lead);
  }, [allowed, pixelId]);

  useEffect(() => {
    if (!allowed) return;
    window.fbq?.('track', 'PageView');
    if (path.startsWith('/enquire/thanks')) window.fbq?.('track', 'Lead');
    if (path === '/welcome') window.fbq?.('track', 'CompleteRegistration');
  }, [allowed, path]);

  const choose = (yes: boolean) => {
    try {
      localStorage.setItem(KEY, yes ? 'yes' : 'no');
    } catch {}
    setAsk(false);
    if (yes) setAllowed(true);
    // Taking a yes back: stop sending and drop Meta's cookies on the next load.
    else if (allowed) {
      document.cookie = '_fbp=; Max-Age=0; path=/';
      document.cookie = '_fbc=; Max-Age=0; path=/';
      location.reload();
    }
  };

  if (!ask) return null;
  return (
    <div role="dialog" aria-label="Cookie choices" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-[var(--color-line)] bg-white p-4 shadow-xl sm:left-4 sm:right-auto sm:mx-0">
      <p className="font-semibold">Can we measure our ads?</p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        The site works without it. If you allow, Meta sets a cookie that tells us which Instagram and Facebook ads brought visitors here.{' '}
        <a href="/privacy#technology" className="underline">
          How we use it
        </a>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-sm" onClick={() => choose(true)}>
          Allow
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(false)}>
          No thanks
        </button>
      </div>
    </div>
  );
}
