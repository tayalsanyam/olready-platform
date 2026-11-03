'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconSearch } from './icons';

type Suggest = { vendors: { slug: string; name: string; sub: string }[]; pages: { label: string; href: string }[] };

/**
 * Header search with suggestions from the chosen city. Arrow keys move through suggestions;
 * Enter opens the highlighted one, or the full results page when nothing is highlighted.
 */
export function SearchBox({ cities, defaultCity = '' }: { cities: { slug: string; name: string }[]; defaultCity?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [s, setS] = useState<Suggest>({ vendors: [], pages: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const list = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = [...s.pages.map((p) => ({ href: p.href, label: p.label, sub: 'Browse' })), ...s.vendors.map((v) => ({ href: `/v/${v.slug}`, label: v.name, sub: v.sub }))];

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setS({ vendors: [], pages: [] });
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`);
        if (r.ok) setS(await r.json());
      } catch {
        /* keep last suggestions */
      }
    }, 180);
  }, [q, city]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const results = () => go(`/search?q=${encodeURIComponent(q.trim())}${city ? `&city=${city}` : ''}`);

  return (
    <form
      role="search"
      className="relative flex w-full items-center rounded-full border border-[var(--color-line)] bg-white pl-3 focus-within:border-[var(--color-pink)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && items[active]) go(items[active].href);
        else if (q.trim()) results();
      }}
    >
      <IconSearch size={16} className="shrink-0 text-[var(--color-muted)]" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search vendors, ideas, guides"
        aria-label="Search"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={list}
        aria-activedescendant={active >= 0 ? `${list}-${active}` : undefined}
        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
      />
      <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" className="max-w-[7.5rem] shrink-0 rounded-r-full bg-transparent py-2 pr-3 text-sm text-[var(--color-muted)] outline-none">
        <option value="">All cities</option>
        {cities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      {open && items.length ? (
        <ul id={list} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white py-1 shadow-lg">
          {items.map((it, i) => (
            <li
              key={it.href}
              id={`${list}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(it.href);
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-[var(--color-tint)]' : ''}`}
            >
              <span className="font-semibold">{it.label}</span>
              <span className="ml-2 text-xs text-[var(--color-muted)]">{it.sub}</span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              results();
            }}
            className="cursor-pointer border-t border-[var(--color-line)] px-3 py-2 text-sm font-semibold text-[var(--color-pink-deep)]"
          >
            See all results for &ldquo;{q.trim()}&rdquo;
          </li>
        </ul>
      ) : null}
    </form>
  );
}
