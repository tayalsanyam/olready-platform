import type { CSSProperties, ReactNode } from 'react';
import { type InviteContent, type InviteLayout, type InviteTheme, SCRIPT, fontFor } from '@/lib/inviteDesign';

/**
 * An e-invite card, drawn entirely from data: six original layouts, any palette.
 * Used by the design gallery, the live editor, the shared invite page and the video export.
 */
export function InviteCard({
  layout,
  theme,
  content,
  animate = false,
  compact = false,
}: {
  layout: InviteLayout;
  theme: InviteTheme;
  content: InviteContent;
  animate?: boolean;
  compact?: boolean;
}) {
  const t = theme;
  const std = content.kind === 'save_the_date';
  // Each line fades in after the previous one when animate is on (respects reduced motion via CSS).
  let step = 0;
  const line = (children: ReactNode, style: CSSProperties = {}, className = '') => (
    <div className={`${className} ${animate ? 'invite-reveal' : ''}`} style={{ ...style, animationDelay: animate ? `${0.35 + 0.45 * step++}s` : undefined }}>
      {children}
    </div>
  );
  const names = (
    <div style={{ fontFamily: SCRIPT, color: t.accent, lineHeight: 1.05 }} className={compact ? 'text-[2.3em]' : 'text-[2.5em]'}>
      {content.bride || 'Bride'}
      <span className="mx-2 inline-block text-[0.55em]" style={{ fontFamily: fontFor(t), color: t.ink }}>
        &amp;
      </span>
      {content.groom || 'Groom'}
    </div>
  );
  const body = (
    <div className="relative z-10 flex h-full flex-col items-center justify-center px-[9%] text-center" style={{ fontFamily: fontFor(t), color: t.ink }}>
      {content.opening ? line(content.opening, { color: t.accent, letterSpacing: '0.04em' }, 'text-[0.8em]') : null}
      {std ? line('Save the date', { letterSpacing: '0.3em', textTransform: 'uppercase' }, 'mt-[0.8em] text-[0.75em] opacity-80') : null}
      {content.photo
        ? line(
            // eslint-disable-next-line @next/next/no-img-element
            <img src={content.photo} alt="" className="mx-auto h-[5.5em] w-[5.5em] rounded-full object-cover" style={{ border: `2px solid ${t.accent}` }} />,
            {},
            'mt-[0.8em]'
          )
        : null}
      {line(names, {}, 'mt-[0.5em]')}
      {content.family ? line(content.family, {}, 'mt-[0.4em] text-[0.62em] opacity-75') : null}
      {content.message && !std ? line(content.message, {}, 'mt-[0.8em] text-[0.78em] opacity-90') : null}
      {content.dateLine
        ? line(content.dateLine, { color: t.accent, borderTop: `1px solid ${t.accent}`, borderBottom: `1px solid ${t.accent}` }, 'mt-[0.8em] px-[1em] py-[0.25em] text-[0.95em] font-semibold')
        : null}
      {!std && content.events.length
        ? line(
            <ul className="mt-[0.8em] grid w-full gap-[0.35em] text-[0.66em]" style={{ gridTemplateColumns: content.events.length > 3 ? '1fr 1fr' : '1fr' }}>
              {content.events.slice(0, 6).map((e, i) => (
                <li key={i}>
                  <span className="font-semibold" style={{ color: t.accent }}>
                    {e.name}
                  </span>
                  <span className="opacity-80">
                    {' '}
                    · {e.when}
                    {e.venue ? ` · ${e.venue}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )
        : null}
      {std ? line('Invitation to follow', {}, 'mt-[0.9em] text-[0.62em] uppercase tracking-[0.25em] opacity-70') : null}
    </div>
  );
  // The wrapper is the size container, so text scales with the card at any width.
  return (
    <div className="mx-auto w-full" style={{ containerType: 'inline-size' }}>
      <div
        className="invite-card relative aspect-[5/7] w-full overflow-hidden"
        style={{ background: t.bg, color: t.ink, fontSize: compact ? '4.6cqw' : '5cqw', borderRadius: 6 }}
      >
        <Frame layout={layout} accent={t.accent} />
        {body}
      </div>
    </div>
  );
}

function Frame({ layout, accent }: { layout: InviteLayout; accent: string }) {
  const s = { stroke: accent, fill: 'none' } as const;
  switch (layout) {
    case 'classic':
      return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
          <rect x="4" y="4" width="92" height="132" {...s} strokeWidth="0.6" />
          <rect x="6" y="6" width="88" height="128" {...s} strokeWidth="0.25" />
        </svg>
      );
    case 'arch':
      return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
          <path d="M8 134 V48 C8 30 22 22 34 18 C42 15 47 10 50 4 C53 10 58 15 66 18 C78 22 92 30 92 48 V134 Z" {...s} strokeWidth="0.6" />
          <path d="M11 131 V49 C11 33 24 26 35 22 C43 19 47 15 50 10 C53 15 57 19 65 22 C76 26 89 33 89 49 V131 Z" {...s} strokeWidth="0.25" />
          <circle cx="50" cy="4" r="1.4" fill={accent} />
        </svg>
      );
    case 'floral': {
      const sprig = (tx: string) => (
        <g transform={tx} fill={accent}>
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse key={i} cx={6 + i * 3.2} cy={6 + i * 1.2} rx="2.6" ry="1.1" transform={`rotate(${30 + i * 12} ${6 + i * 3.2} ${6 + i * 1.2})`} opacity={0.85 - i * 0.12} />
          ))}
          <circle cx="5" cy="5" r="2.2" opacity="0.9" />
          <circle cx="5" cy="5" r="0.9" fill="#fff" opacity="0.6" />
        </g>
      );
      return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
          {sprig('translate(0 0)')}
          {sprig('translate(100 0) scale(-1 1)')}
          {sprig('translate(0 140) scale(1 -1)')}
          {sprig('translate(100 140) scale(-1 -1)')}
          <rect x="7" y="7" width="86" height="126" {...s} strokeWidth="0.2" />
        </svg>
      );
    }
    case 'mandala':
      return (
        <svg className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 100 100" aria-hidden opacity="0.16">
          {Array.from({ length: 24 }).map((_, i) => (
            <ellipse key={i} cx="50" cy="22" rx="4" ry="16" fill="none" stroke={accent} strokeWidth="0.4" transform={`rotate(${i * 15} 50 50)`} />
          ))}
          {[10, 20, 30, 40].map((r) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={accent} strokeWidth="0.3" />
          ))}
        </svg>
      );
    case 'modern':
      return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
          <rect x="0" y="0" width="100" height="3" fill={accent} />
          <rect x="0" y="137" width="100" height="3" fill={accent} />
          <circle cx="50" cy="20" r="0.9" fill={accent} />
          <circle cx="50" cy="120" r="0.9" fill={accent} />
        </svg>
      );
    case 'royal':
      return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
          <rect x="3" y="3" width="94" height="134" {...s} strokeWidth="1.2" />
          <rect x="6" y="6" width="88" height="128" {...s} strokeWidth="0.3" strokeDasharray="1.2 1.2" />
          {[
            [6, 6],
            [94, 6],
            [6, 134],
            [94, 134],
          ].map(([x, y], i) => (
            <rect key={i} x={x - 2} y={y - 2} width="4" height="4" fill={accent} transform={`rotate(45 ${x} ${y})`} />
          ))}
          <path d="M40 12 Q50 4 60 12" {...s} strokeWidth="0.5" />
          <path d="M40 128 Q50 136 60 128" {...s} strokeWidth="0.5" />
        </svg>
      );
  }
}
