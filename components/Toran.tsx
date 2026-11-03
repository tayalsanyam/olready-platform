/**
 * A toran: the marigold-and-mango-leaf garland hung over a wedding doorway. Drawn in code so
 * it scales to any width. Decorative only. Strands drop in once on load, unless the visitor
 * prefers reduced motion.
 */

const W = 1200;
const MARIGOLD = ['#f6a609', '#f08c00', '#fbbf24'];
const LEAF = '#3f7d3a';
const LEAF_LIGHT = '#5a9b4c';

// Deterministic "random" so server and browser draw the same garland.
const r = (i: number, s = 1) => ((Math.sin(i * 12.9898 * s) * 43758.5453) % 1 + 1) % 1;

function Flower({ x, y, i }: { x: number; y: number; i: number }) {
  const c = MARIGOLD[i % MARIGOLD.length];
  return (
    <g>
      <circle cx={x} cy={y} r={7.2} fill={c} />
      <circle cx={x} cy={y} r={7.2} fill="none" stroke="#c46a00" strokeWidth={0.8} strokeDasharray="1.6 2.1" opacity={0.7} />
      <circle cx={x} cy={y} r={3.4} fill="#e07b00" opacity={0.55} />
    </g>
  );
}

function Leaf({ x, y, angle, scale = 1 }: { x: number; y: number; angle: number; scale?: number }) {
  // A mango leaf: long, pointed, hanging from its stem.
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path d="M0 0 C 7 8, 8 24, 0 38 C -8 24, -7 8, 0 0 Z" fill={LEAF} />
      <path d="M0 2 L0 34" stroke={LEAF_LIGHT} strokeWidth={0.9} />
    </g>
  );
}

export function Toran({ className = '' }: { className?: string }) {
  const strands = 22;
  const gap = W / strands;
  const cord = (x: number) => 6 + Math.sin((x / W) * Math.PI * strands) * 2.5;
  return (
    <div aria-hidden className={`toran pointer-events-none select-none ${className}`}>
      <svg viewBox={`0 0 ${W} 96`} preserveAspectRatio="xMidYMin slice" className="block h-full w-full">
        <path d={`M0 6 ${Array.from({ length: strands * 4 + 1 }, (_, k) => `L${(k * W) / (strands * 4)} ${cord((k * W) / (strands * 4)).toFixed(2)}`).join(' ')}`} stroke="#b45309" strokeWidth={2} fill="none" />
        {Array.from({ length: strands }, (_, i) => {
          const x = gap / 2 + i * gap;
          const long = i % 2 === 0;
          const n = long ? 5 + Math.round(r(i) * 2) : 3;
          const top = cord(x);
          return (
            <g key={i} className="toran-strand" style={{ animationDelay: `${(Math.abs(i - strands / 2) * 45).toFixed(0)}ms` }}>
              {/* leaves fan out from the cord between strands */}
              <Leaf x={x + gap / 2} y={cord(x + gap / 2)} angle={-14 + r(i, 2) * 6} scale={0.82} />
              <Leaf x={x + gap / 2} y={cord(x + gap / 2)} angle={14 - r(i, 3) * 6} scale={0.82} />
              <line x1={x} y1={top} x2={x} y2={top + 8 + n * 12} stroke="#b45309" strokeWidth={1} />
              {Array.from({ length: n }, (_, k) => (
                <Flower key={k} x={x} y={top + 10 + k * 12} i={i + k} />
              ))}
              {long ? <circle cx={x} cy={top + 14 + n * 12} r={3.2} fill="var(--color-pink)" /> : <Leaf x={x} y={top + 6 + n * 12} angle={0} scale={0.45} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
