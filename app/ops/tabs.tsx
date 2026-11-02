'use client';

import { usePathname } from 'next/navigation';
import { Tabs } from '@/components/ui';

export function OpsTabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = items.filter((i) => path === i.href || (i.href !== '/ops' && path.startsWith(i.href))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return <Tabs items={items} active={active} />;
}
