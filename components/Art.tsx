import type { ReactNode } from 'react';

/** Olready's own drawings: the marigold from the toran, rings, sparklines and small scenes for empty screens. */

export function Marigold({ size = 40, className = '', spin = false }: { size?: number; className?: string; spin?: boolean }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={`${spin ? 'marigold-spin' : ''} ${className}`}>
      {petals.map((a) => (
        <ellipse key={a} cx="24" cy="9.5" rx="5" ry="8" fill="#f6a700" transform={`rotate(${a} 24 24)`} />
      ))}
      {petals.map((a) => (
        <ellipse key={`i${a}`} cx="24" cy="14" rx="3.6" ry="6" fill="#ff8a00" transform={`rotate(${a + 15} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="6" fill="#e26a00" />
      <circle cx="24" cy="24" r="2.6" fill="#ffc23d" />
    </svg>
  );
}

/** A progress ring with something in the middle. value and total in the same unit. */
export function Ring({ value, total, size = 84, stroke = 8, colour = 'var(--color-pink)', children, label }: { value: number; total: number; size?: number; stroke?: number; colour?: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const full = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1e8ec" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={full}
          strokeDashoffset={full * (1 - share)}
          style={{ ['--ring-full' as string]: `${full}` }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">{children}</span>
    </span>
  );
}

/** A small line of the last few days, drawn to its own scale. */
export function Spark({ values, width = 120, height = 36, colour = 'var(--color-pink)', label }: { values: number[]; width?: number; height?: number; colour?: string; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = (width - 6) / (values.length - 1);
  const pts = values.map((v, i) => [3 + i * step, height - 4 - (v / max) * (height - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <path d={`${line} L${lx.toFixed(1)} ${height} L3 ${height} Z`} fill={colour} opacity="0.1" />
      <path d={line} fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill={colour} />
    </svg>
  );
}

/** A thin bar that fills once. */
export function Bar({ value, total, colour = 'var(--color-pink)', label }: { value: number; total: number; colour?: string; label: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-[#f1e8ec]" role="img" aria-label={label}>
      <span className="bar-fill block h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
    </span>
  );
}

const stroke = { stroke: 'var(--color-pink-deep)', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const line = { ...stroke, fill: 'none' };

/** Small scenes for screens with nothing on them yet. */
export function Scene({ kind, className = '' }: { kind: 'letters' | 'calendar' | 'search' | 'stars' | 'garland' | 'list' | 'coins'; className?: string }) {
  return (
    <svg viewBox="0 0 160 96" width="160" height="96" aria-hidden className={className}>
      <ellipse cx="80" cy="84" rx="58" ry="6" fill="#f6e3ec" />
      <g transform="translate(20 6)">
        <circle cx="8" cy="12" r="5" fill="#f6a700" /><circle cx="8" cy="12" r="2" fill="#e26a00" />
        <circle cx="112" cy="20" r="4" fill="#ffc23d" /><circle cx="112" cy="20" r="1.6" fill="#e26a00" />
        <path d="M100 6c3 2 3 5 0 7M22 30c-3 1-4 4-2 6" {...line} strokeWidth={1.2} opacity=".5" />
      </g>
      {kind === 'letters' ? (
        <g>
          <rect x="44" y="34" width="72" height="46" rx="6" fill="#fff" {...stroke} />
          <path d="M44 40l36 24 36-24" {...line} />
          <rect x="62" y="18" width="36" height="30" rx="4" fill="#fff0f7" {...stroke} />
          <path d="M69 28h22M69 35h14" {...line} />
        </g>
      ) : kind === 'calendar' ? (
        <g>
          <rect x="46" y="22" width="68" height="58" rx="8" fill="#fff" {...stroke} />
          <path d="M46 38h68M62 16v12M98 16v12" {...line} />
          <circle cx="64" cy="52" r="3.5" fill="#f6a700" /><circle cx="80" cy="52" r="3.5" fill="#f1e8ec" /><circle cx="96" cy="52" r="3.5" fill="#f1e8ec" />
          <circle cx="64" cy="66" r="3.5" fill="#f1e8ec" /><circle cx="80" cy="66" r="3.5" fill="var(--color-pink)" /><circle cx="96" cy="66" r="3.5" fill="#f1e8ec" />
        </g>
      ) : kind === 'search' ? (
        <g>
          <circle cx="74" cy="46" r="22" fill="#fff" {...stroke} />
          <path d="M91 63l16 16" {...line} strokeWidth={4} />
          <path d="M66 44c2-6 8-9 14-7" {...line} opacity=".6" />
        </g>
      ) : kind === 'stars' ? (
        <g>
          <path d="M80 18l8 17 19 2-14 13 4 19-17-10-17 10 4-19-14-13 19-2z" fill="#fff" {...stroke} />
          <path d="M80 30l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#f6a700" opacity=".9" />
        </g>
      ) : kind === 'list' ? (
        <g>
          <rect x="50" y="16" width="60" height="66" rx="8" fill="#fff" {...stroke} />
          <path d="M60 34l4 4 7-8M78 34h22M60 50l4 4 7-8M78 50h22M78 66h16" {...line} />
          <rect x="59" y="61" width="10" height="10" rx="2" {...line} />
        </g>
      ) : kind === 'coins' ? (
        <g>
          <ellipse cx="68" cy="66" rx="20" ry="8" fill="#fff" {...stroke} /><path d="M48 66v-10M88 66v-10" {...line} /><ellipse cx="68" cy="56" rx="20" ry="8" fill="#ffc23d" {...stroke} />
          <ellipse cx="96" cy="50" rx="16" ry="6.5" fill="#fff" {...stroke} /><path d="M80 50v-9M112 50v-9" {...line} /><ellipse cx="96" cy="41" rx="16" ry="6.5" fill="#fff0f7" {...stroke} />
          <path d="M63 56h10M68 52v8" {...line} strokeWidth={1.3} />
        </g>
      ) : (
        <g>
          <path d="M24 26c30 26 82 26 112 0" {...line} />
          {[36, 54, 72, 90, 108, 126].map((x, i) => (
            <g key={x} transform={`translate(${x} ${[36, 43, 46, 46, 43, 36][i]})`}>
              <circle r="7" fill={i % 2 ? '#ff8a00' : '#f6a700'} /><circle r="2.6" fill="#e26a00" />
              <path d="M0 7v12" {...line} strokeWidth={1.2} /><circle cy="24" r="5" fill={i % 2 ? '#f6a700' : '#ffc23d'} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/** Cover art for a vendor or wedding with no photo yet: a mandala in the brand's colours, different for each name. */
export function CoverArt({ name, className = '' }: { name: string; className?: string }) {
  const seed = Array.from(name).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  const palettes = [
    ['#fff0f7', '#f9c6dc', '#e2005e', '#f6a700'],
    ['#fff6e5', '#ffd98a', '#e26a00', '#e2005e'],
    ['#f6f0ff', '#dccbf7', '#7a3fc2', '#f6a700'],
    ['#eefaf5', '#bfe8d6', '#1f7a4d', '#e2005e'],
    ['#fff1ec', '#ffc9b8', '#d1432a', '#f6a700'],
  ];
  const [bg, soft, deep, pop] = palettes[seed % palettes.length];
  const n = 8 + (seed % 3) * 4;
  const rays = Array.from({ length: n }, (_, i) => (360 / n) * i);
  return (
    <div aria-hidden className={`cover-art relative h-full w-full overflow-hidden ${className}`} style={{ background: bg }}>
      <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <g transform="translate(100 75)">
          {rays.map((a) => (
            <ellipse key={a} cx="0" cy="-62" rx={n > 12 ? 9 : 13} ry="34" fill={soft} opacity=".55" transform={`rotate(${a})`} />
          ))}
          {rays.map((a) => (
            <ellipse key={`m${a}`} cx="0" cy="-38" rx={n > 12 ? 6 : 9} ry="20" fill={deep} opacity=".16" transform={`rotate(${a + 180 / n})`} />
          ))}
          <circle r="27" fill="#fff" opacity=".85" />
          <circle r="27" fill="none" stroke={deep} strokeWidth="1" opacity=".35" strokeDasharray="2 4" />
          {rays.filter((_, i) => i % 2 === 0).map((a) => (
            <circle key={`d${a}`} cx="0" cy="-33" r="2.2" fill={pop} transform={`rotate(${a})`} />
          ))}
        </g>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-3xl font-semibold" style={{ color: deep, fontFamily: 'var(--font-serif)' }}>
        {name.trim().slice(0, 1).toUpperCase()}
      </span>
    </div>
  );
}
