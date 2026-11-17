'use client';

import { usePathname } from 'next/navigation';
import { Tabs } from '@/components/ui';

const items = [
  { href: '/vendor', label: 'Leads' },
  { href: '/vendor/threads', label: 'Conversations' },
  { href: '/vendor/calendar', label: 'Calendar' },
  { href: '/vendor/insights', label: 'Insights' },
  { href: '/vendor/profile', label: 'Profile' },
  { href: '/vendor/packs', label: 'Credits and plans' },
  { href: '/vendor/promote', label: 'Promote' },
  { href: '/vendor/reviews', label: 'Reviews' },
  { href: '/vendor/weddings', label: 'Real weddings' },
];

export function VendorTabs({ unread = 0, teaches = false }: { unread?: number; teaches?: boolean }) {
  const path = usePathname();
  if (path === '/vendor/onboard') return null;
  const shown = teaches ? [...items, { href: '/vendor/classes', label: 'Classes' }] : items;
  const active = shown
    .filter((i) => path === i.href || path.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return <Tabs items={shown.map((i) => (i.href === '/vendor/threads' ? { ...i, count: unread } : i))} active={active} />;
}
