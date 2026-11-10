'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type OpsGroup = { title: string; items: { href: string; label: string; count?: number }[] };

/** The staff console's menu: a grouped sidebar on wide screens, a grouped drop-down on phones. */
export function OpsNav({ groups, who }: { groups: OpsGroup[]; who: string }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items);
  const active = all.filter((i) => path === i.href || (i.href !== '/ops' && path.startsWith(i.href))).sort((a, b) => b.href.length - a.href.length)[0];
  const waiting = all.reduce((n, i) => n + (i.count ?? 0), 0);
  const list = (onPhone: boolean) =>
    groups.map((g) => (
      <div key={g.title} className={onPhone ? 'break-inside-avoid pb-3' : 'pb-4'}>
        <h2 className="px-2 pb-1 text-xs font-semibold text-[var(--color-muted)]">{g.title}</h2>
        <ul>
          {g.items.map((i) => {
            const on = active?.href === i.href;
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={on ? 'page' : undefined}
                  className={`flex min-h-9 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${on ? 'bg-[var(--color-pink-soft)] font-semibold text-[var(--color-pink-deep)]' : 'hover:bg-[var(--color-tint)]'}`}
                >
                  {i.label}
                  {i.count ? (
                    <span className="rounded-full bg-[var(--color-pink-deep)] px-1.5 text-xs font-semibold text-white" aria-label={`${i.count} waiting`}>
                      {i.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    ));
  return (
    <>
      <nav aria-label="Ops" className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto pr-1 lg:block">
        <p className="px-2 pb-3 text-xs text-[var(--color-muted)]">{who}</p>
        {list(false)}
      </nav>
      {/* Remounting on each page closes the menu after a choice. */}
      <details key={path} className="mb-4 rounded-xl border border-[var(--color-line)] bg-white lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold">
          <span>
            <span className="font-normal text-[var(--color-muted)]">Ops: </span>
            {active?.label ?? 'Menu'}
          </span>
          <span className="flex items-center gap-2 font-normal text-[var(--color-muted)]">
            {waiting ? <span className="rounded-full bg-[var(--color-pink-deep)] px-1.5 text-xs font-semibold text-white">{waiting} waiting</span> : null}
            Menu
          </span>
        </summary>
        <nav aria-label="Ops" className="columns-2 gap-3 border-t border-[var(--color-line)] p-2">
          {list(true)}
        </nav>
      </details>
    </>
  );
}
