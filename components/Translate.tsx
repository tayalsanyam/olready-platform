'use client';

import { useEffect } from 'react';

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);

/**
 * Shows the page in Hindi or Punjabi by swapping each piece of English text that has a translation.
 * It only ever changes the text inside existing nodes, after the page is interactive, so forms, links
 * and React keep working; text without a translation is left alone.
 */
export function Translate({ dict }: { dict: Record<string, string> }) {
  useEffect(() => {
    const swap = (raw: string) => {
      const key = raw.replace(/\s+/g, ' ').trim();
      const to = key && dict[key];
      return to ? raw.replace(raw.trim(), to) : null;
    };
    const run = (root: Node) => {
      const el = root.nodeType === 1 ? (root as Element) : root.parentElement;
      if (!el || el.closest('[data-no-translate]')) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = root.nodeType === 3 ? [root as Text] : [];
      while (w.nextNode()) nodes.push(w.currentNode as Text);
      for (const n of nodes) {
        const p = n.parentElement;
        if (!p || SKIP.has(p.tagName) || p.isContentEditable) continue;
        const to = swap(n.nodeValue ?? '');
        if (to && to !== n.nodeValue) n.nodeValue = to;
      }
      if (root.nodeType === 1) {
        for (const e of (root as Element).querySelectorAll<HTMLInputElement>('[placeholder]')) {
          const to = swap(e.placeholder);
          if (to) e.placeholder = to;
        }
      }
    };
    let frame = 0;
    const pending = new Set<Node>();
    const obs = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') pending.add(m.target);
        else m.addedNodes.forEach((n) => pending.add(n));
      }
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          const batch = [...pending];
          pending.clear();
          for (const n of batch) if (n.isConnected) run(n);
        });
    });
    const start = () => {
      run(document.body);
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    // Wait until the page has loaded and React has attached, so the first render matches the server's.
    let timer = 0;
    const go = () => (timer = window.setTimeout(start, 60));
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      obs.disconnect();
      window.removeEventListener('load', go);
    };
  }, [dict]);
  return null;
}

/** English, Hindi, Punjabi. The choice is one cookie, read by the server on the next page. */
export function LangSwitch({ lang }: { lang: string }) {
  const pick = (to: string) => {
    document.cookie = `olr_lang=${to}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    location.reload();
  };
  return (
    <span className="inline-flex items-center gap-1" data-no-translate role="group" aria-label="Language">
      {(
        [
          ['en', 'English'],
          ['hi', 'हिन्दी'],
          ['pa', 'ਪੰਜਾਬੀ'],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          lang={k}
          aria-pressed={lang === k}
          onClick={() => pick(k)}
          className={`rounded-full px-2.5 py-1 text-sm ${lang === k ? 'bg-[var(--color-ink)] text-white' : 'hover:underline'}`}
        >
          {label}
        </button>
      ))}
    </span>
  );
}
