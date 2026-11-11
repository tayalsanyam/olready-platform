import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { CoverArt, Scene } from './Art';

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

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div className={`card p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
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

/** Moments worth petals: a request sent, a booking, a payment, a profile going live. */
const CELEBRATE = /congratulations|booking recorded|payment (received|confirmed)|is live|plan is active|thank you for your review|welcome/i;

/** Shows ?error= and ?ok= messages set by server actions. */
export function Notice({ error, ok }: { error?: string | string[]; ok?: string | string[] }) {
  const e = Array.isArray(error) ? error[0] : error;
  const o = Array.isArray(ok) ? ok[0] : ok;
  if (!e && !o) return null;
  return (
    <div
      role={e ? 'alert' : 'status'}
      data-notice={e ? 'error' : 'ok'}
      data-celebrate={!e && o && CELEBRATE.test(o) ? '' : undefined}
      className={`arrive mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
        e ? 'border-[#f5c2bd] bg-[#fde7e5] text-[var(--color-bad)]' : 'border-[#bfe3cd] bg-[#e3f4ea] text-[var(--color-ok)]'
      }`}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden className="pop mt-px shrink-0">
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity=".15" />
        {e ? <path d="M10 5.5v5.5M10 14.2v.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M6 10.4l2.7 2.7L14.2 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <span>{e ?? o}</span>
    </div>
  );
}

export function Empty({ title, children, art = 'garland' }: { title: string; children?: ReactNode; art?: Parameters<typeof Scene>[0]['kind'] | null }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e3d6dd] bg-[var(--color-tint)]/60 px-6 py-8 text-center">
      {art ? <Scene kind={art} className="mx-auto mb-2" /> : null}
      <p className="font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-[var(--color-muted)]">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, extra }: { label: string; value: ReactNode; hint?: string; extra?: ReactNode }) {
  return (
    <div className="card card-lift flex items-end justify-between gap-2 p-3">
      <div className="min-w-0">
        <div className="text-sm text-[var(--color-muted)]">{label}</div>
        <div className="figure mt-0.5 text-3xl">{value}</div>
        {hint ? <div className="hint mt-0.5">{hint}</div> : null}
      </div>
      {extra}
    </div>
  );
}

export { Tabs } from './TabsNav';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint mt-1 block">{hint}</span> : null}
    </label>
  );
}

/** A vendor's cover photo, or drawn cover art when there is none yet. */
export function Cover({ url, name, className = '' }: { url: string | null; name: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`h-full w-full object-cover ${className}`} loading="lazy" />;
  }
  return <CoverArt name={name} className={className} />;
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
