'use client';

import { usePathname } from 'next/navigation';
import { Tabs } from '@/components/ui';

const items = [
  { href: '/vendor', label: 'Leads' },
  { href: '/vendor/threads', label: 'Conversations' },
  { href: '/vendor/profile', label: 'Profile' },
  { href: '/vendor/packs', label: 'Credits and plans' },
  { href: '/vendor/reviews', label: 'Reviews' },
  { href: '/vendor/weddings', label: 'Real weddings' },
];

export function VendorTabs() {
  const path = usePathname();
  if (path === '/vendor/onboard') return null;
  const active = items
    .filter((i) => path === i.href || path.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return <Tabs items={items} active={active} />;
}
