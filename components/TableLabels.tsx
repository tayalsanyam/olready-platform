'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * On phones, data tables stack into cards (see table.data.stack in globals.css). Each cell needs
 * its column heading as a label; this copies the headings onto the cells, on every page and whenever
 * rows change.
 */
export function TableLabels() {
  const path = usePathname();
  useEffect(() => {
    const label = () => {
      for (const t of document.querySelectorAll<HTMLTableElement>('table.data.stack')) {
        const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
        if (!heads.length) continue;
        for (const tr of t.querySelectorAll('tbody tr')) {
          [...tr.children].forEach((td, i) => {
            if (i > 0 && heads[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i]);
          });
        }
      }
    };
    // Wait for the page to settle first: touching rows React has not finished attaching to would
    // show up as a mismatch.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(label, 400);
    };
    soon();
    const mo = new MutationObserver(soon);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      clearTimeout(timer);
    };
  }, [path]);
  return null;
}
