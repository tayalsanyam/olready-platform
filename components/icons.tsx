import type { SVGProps } from 'react';

/** Small line icons drawn for OLReady; 24px grid, 1.6 stroke, inherit colour. */
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 20, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);
export const IconPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const IconHeart = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
  </svg>
);
export const IconStar = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </svg>
);
export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6l-7-3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
export const IconChat = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5L5 18.5Z" />
  </svg>
);
export const IconPhoneOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4h3l1.5 4-2 1.3a10 10 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2Z" />
    <path d="M4 20 20 4" />
  </svg>
);

/** One icon per vendor category, keyed by category slug. */
export function CategoryIcon({ slug, size = 28 }: { slug: string; size?: number }) {
  const b = base({ size, strokeWidth: 1.4 });
  switch (slug) {
    case 'bridal-makeup':
      return (
        <svg {...b}>
          <path d="M14.5 3.5 20 9l-8.5 8.5L6 12l8.5-8.5Z" />
          <path d="m6 12-2.5 6.5L10 16" />
          <path d="M14 7.5 16.5 10" />
        </svg>
      );
    case 'photographers':
      return (
        <svg {...b}>
          <path d="M4 8h3.5L9 5.5h6L16.5 8H20v10.5H4V8Z" />
          <circle cx="12" cy="13" r="3.4" />
        </svg>
      );
    case 'decorators':
    case 'florists':
      return (
        <svg {...b}>
          <circle cx="12" cy="9" r="2.2" />
          <path d="M12 6.8c0-2 1-3.3 2.3-3.3s2 1.4 1.4 2.9M14.2 9c2 0 3.3 1 3.3 2.3s-1.4 2-2.9 1.4M12 11.2c0 2-1 3.3-2.3 3.3s-2-1.4-1.4-2.9M9.8 9c-2 0-3.3-1-3.3-2.3S7.9 4.7 9.4 5.3" />
          <path d="M12 13.5V21M12 18c-2-.2-3.5-1.3-4-3M12 17c1.8-.3 3.2-1.2 3.8-2.8" />
        </svg>
      );
    case 'mehendi-artists':
      return (
        <svg {...b}>
          <path d="M8 21v-7.5L6 11a1.6 1.6 0 0 1 2.4-2l1.6 1.8V5a1.5 1.5 0 0 1 3 0v4.5V4a1.5 1.5 0 0 1 3 0v7l.2-2.5a1.5 1.5 0 0 1 3 .2L18.5 15a6 6 0 0 1-6 6H8Z" />
          <circle cx="12.5" cy="15" r="1.4" />
        </svg>
      );
    case 'djs-dhol':
    case 'bands':
      return (
        <svg {...b}>
          <path d="M9 18V6.5l10-2V16" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="16.5" cy="16" r="2.5" />
        </svg>
      );
    case 'venues':
      return (
        <svg {...b}>
          <path d="M3.5 20h17M5 20V10l7-5 7 5v10" />
          <path d="M10 20v-5a2 2 0 0 1 4 0v5M8 12h.01M16 12h.01" />
        </svg>
      );
    case 'caterers':
    case 'food-stalls':
      return (
        <svg {...b}>
          <path d="M4 16h16M5 16a7 7 0 0 1 14 0M12 9V7.5M10.5 7.5h3M3.5 19h17" />
        </svg>
      );
    case 'planners':
      return (
        <svg {...b}>
          <rect x="4.5" y="5" width="15" height="15" rx="2" />
          <path d="M4.5 9.5h15M8.5 3.5v3M15.5 3.5v3M8.5 14l2 2 4-4" />
        </svg>
      );
    case 'bridal-wear':
      return (
        <svg {...b}>
          <path d="M9 3.5h6l-1 4 4.5 12.5h-13L10 7.5l-1-4Z" />
          <path d="M10 7.5h4M8 14c2.5 1 5.5 1 8 0" />
        </svg>
      );
    case 'jewellery':
      return (
        <svg {...b}>
          <path d="M7 4h10l3 5-8 11L4 9l3-5Z" />
          <path d="M4 9h16M9.5 4 12 9l2.5-5M12 9v11" />
        </svg>
      );
    case 'invitations':
      return (
        <svg {...b}>
          <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
      );
    default:
      return (
        <svg {...b}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M4 10h16" />
        </svg>
      );
  }
}
