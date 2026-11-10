'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

/**
 * A row of section tabs. On narrow screens it scrolls sideways: the right edge fades to show there
 * is more, and the current tab is scrolled into view.
 */
export function Tabs({ items, active }: { items: { href: string; label: string }[]; active?: string }) {
  const cur = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    cur.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);
  return (
    <nav aria-label="Sections" className="no-scrollbar -mx-4 mb-5 overflow-x-auto border-b border-[var(--color-line)] px-4 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]">
      <ul className="flex gap-4 whitespace-nowrap pr-10 text-sm">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              ref={active === i.href ? cur : undefined}
              aria-current={active === i.href ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 ${active === i.href ? 'border-[var(--color-pink)] font-semibold' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'}`}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
