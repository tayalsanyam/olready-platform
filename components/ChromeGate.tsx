'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

const inArea = (path: string, area: string) => path === area || path.startsWith(`${area}/`);

/** Shows its children only outside the given signed-in areas (e.g. no shop-front chips inside the Ops console). */
export function OutsideAreas({ areas, children }: { areas: string[]; children: ReactNode }) {
  const path = usePathname();
  return areas.some((a) => inArea(path, a)) ? null : <>{children}</>;
}
