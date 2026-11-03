'use client';

import { usePathname } from 'next/navigation';
import { Tabs } from '@/components/ui';

const items = [
  { href: '/me', label: 'My wedding' },
  { href: '/me/shortlist', label: 'Shortlist' },
  { href: '/me/wall', label: 'Wedding wall' },
  { href: '/me/checklist', label: 'Checklist' },
  { href: '/me/guests', label: 'Guests and RSVP' },
  { href: '/me/invite', label: 'E-invite' },
  { href: '/me/family', label: 'Family' },
  { href: '/me/rm', label: 'Relationship manager' },
  { href: '/me/reviews', label: 'Reviews' },
  { href: '/me/real-wedding', label: 'Share our wedding' },
];

export function BrideTabs() {
  const path = usePathname();
  const active = items.filter((i) => path === i.href || (i.href !== '/me' && path.startsWith(i.href))).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? (path.startsWith('/me/threads') ? '/me' : undefined);
  return <Tabs items={items} active={active} />;
}
