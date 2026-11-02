import Link from 'next/link';
import type { ReactNode } from 'react';

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 ${className}`}>{children}</div>;
}

export function PageTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {sub ? <p className="mt-1 text-[var(--color-muted)]">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

const badgeTones = {
  gold: 'bg-[var(--color-pink-soft)] text-[var(--color-pink-deep)]',
  ok: 'bg-[#e3f4ea] text-[var(--color-ok)]',
  warn: 'bg-[#fdf0dc] text-[var(--color-warn)]',
  bad: 'bg-[#fde7e5] text-[var(--color-bad)]',
  plain: 'bg-[#f0ede6] text-[var(--color-ink)]',
};

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

/** Shows ?error= and ?ok= messages set by server actions. */
export function Notice({ error, ok }: { error?: string | string[]; ok?: string | string[] }) {
  const e = Array.isArray(error) ? error[0] : error;
  const o = Array.isArray(ok) ? ok[0] : ok;
  if (!e && !o) return null;
  return (
    <div
      role={e ? 'alert' : 'status'}
      data-notice={e ? 'error' : 'ok'}
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
        e ? 'border-[#f5c2bd] bg-[#fde7e5] text-[var(--color-bad)]' : 'border-[#bfe3cd] bg-[#e3f4ea] text-[var(--color-ok)]'
      }`}
    >
      {e ?? o}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-white/60 p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm text-[var(--color-muted)]">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="text-sm text-[var(--color-muted)]">{label}</div>
      <div className="figure mt-0.5 text-3xl">{value}</div>
      {hint ? <div className="hint mt-0.5">{hint}</div> : null}
    </div>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string }[]; active?: string }) {
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto border-b border-[var(--color-line)] px-4">
      <ul className="flex gap-4 whitespace-nowrap text-sm">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className={`inline-block border-b-2 py-2 ${
                active === i.href ? 'border-[var(--color-pink)] font-semibold' : 'border-transparent text-[var(--color-muted)]'
              }`}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint mt-1 block">{hint}</span> : null}
    </label>
  );
}

/** Coloured placeholder when a vendor has no cover photo yet. */
export function Cover({ url, name, className = '' }: { url: string | null; name: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`h-full w-full object-cover ${className}`} loading="lazy" />;
  }
  const hue = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 40;
  return (
    <div
      aria-hidden
      className={`flex h-full w-full items-center justify-center text-4xl font-semibold text-[var(--color-pink-deep)]/70 ${className}`}
      style={{ background: `hsl(${325 + (hue % 20)} 60% ${93 - (hue % 6)}%)` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="rating" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
        ★ {value.toFixed(1)}
      </span>
      {count != null ? <span className="text-[var(--color-muted)]">{count} review{count === 1 ? '' : 's'}</span> : null}
    </span>
  );
}

export function sp(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
