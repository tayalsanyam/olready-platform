'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { reportError } from './reportError';

/**
 * The feel of the site in one place: a progress line while a page or a form is loading,
 * a spinner on the button that was pressed, and petals when something worth celebrating happens.
 * It listens at the document, so every link and every form gets it without being changed.
 */
export function Feel() {
  const path = usePathname();
  const query = useSearchParams();
  const [on, setOn] = useState(false);
  const [petals, setPetals] = useState(0);
  const busy = useRef<HTMLElement | null>(null);

  // Arrived: stop the line, free the button, and celebrate if the page says so.
  useEffect(() => {
    setOn(false);
    if (busy.current) {
      busy.current.removeAttribute('aria-busy');
      busy.current = null;
    }
    const t = setTimeout(() => {
      if (document.querySelector('[data-celebrate]')) setPetals((n) => n + 1);
    }, 120);
    return () => clearTimeout(t);
  }, [path, query]);

  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (/\.(pdf|ics|csv|png|jpg|webp)$/.test(url.pathname) || url.pathname.startsWith('/api/') || url.pathname.startsWith('/invoices/')) return;
      setOn(true);
    };
    const submit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const form = e.target as HTMLFormElement;
      if (form.target === '_blank' || form.method === 'dialog') return;
      const btn = (e.submitter as HTMLElement | null) ?? form.querySelector<HTMLElement>('button:not([type="button"])');
      if (btn && !btn.hasAttribute('data-quiet')) {
        btn.setAttribute('aria-busy', 'true');
        busy.current = btn;
      }
      setOn(true);
    };
    // A wait that never ends (a download, a blocked request) should not leave the line running.
    const settle = () => setOn(false);
    // Crashes in the browser are reported to the site's own error log, a few per visit at most.
    let sent = 0;
    const crashed = (ev: ErrorEvent | PromiseRejectionEvent) => {
      if (sent >= 3) return;
      const err = 'reason' in ev ? ev.reason : (ev.error ?? ev.message);
      if (!err) return;
      sent++;
      reportError(err);
    };
    window.addEventListener('error', crashed);
    window.addEventListener('unhandledrejection', crashed);
    document.addEventListener('click', click);
    document.addEventListener('submit', submit);
    window.addEventListener('pageshow', settle);
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('submit', submit);
      window.removeEventListener('pageshow', settle);
      window.removeEventListener('error', crashed);
      window.removeEventListener('unhandledrejection', crashed);
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => {
      setOn(false);
      busy.current?.removeAttribute('aria-busy');
    }, 15000);
    return () => clearTimeout(t);
  }, [on]);

  return (
    <>
      <div className="nav-progress" data-on={on ? '1' : '0'} aria-hidden>
        <i />
      </div>
      {petals ? <Petals key={petals} /> : null}
    </>
  );
}

const COLOURS = ['#f6a700', '#ff8a00', '#ffc23d', '#e2005e', '#ff5c93'];

function Petals() {
  const [gone, setGone] = useState(false);
  const [items] = useState(() =>
    Array.from({ length: 34 }, (_, i) => ({
      left: Math.round(Math.random() * 100),
      x: Math.round((Math.random() - 0.5) * 220),
      r: Math.round(360 + Math.random() * 720) * (i % 2 ? 1 : -1),
      d: (2.4 + Math.random() * 2).toFixed(2),
      w: (Math.random() * 0.9).toFixed(2),
      c: COLOURS[i % COLOURS.length],
      s: (0.7 + Math.random() * 0.8).toFixed(2),
    }))
  );
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 5600);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div className="petals" aria-hidden>
      {items.map((p, i) => (
        <i
          key={i}
          style={{ left: `${p.left}%`, background: p.c, scale: p.s, ['--x' as string]: `${p.x}px`, ['--r' as string]: `${p.r}deg`, ['--d' as string]: `${p.d}s`, ['--w' as string]: `${p.w}s` }}
        />
      ))}
    </div>
  );
}
