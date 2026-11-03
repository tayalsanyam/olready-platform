import { requireStaff } from '@/lib/auth';
import { Container } from '@/components/ui';
import { OpsTabs } from './tabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Ops', template: '%s | Ops' }, robots: { index: false } };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const p = await requireStaff();
  const items = [
    { href: '/ops', label: 'Today' },
    ...(['ops', 'admin'].includes(p.role)
      ? [
          { href: '/ops/leads', label: 'Leads' },
          { href: '/ops/needs', label: 'Capped leads' },
          { href: '/ops/vendors', label: 'Vendors' },
          { href: '/ops/payments', label: 'Payments' },
          { href: '/ops/promotions', label: 'Promotions' },
          { href: '/ops/coupons', label: 'Discount codes' },
          { href: '/ops/emails', label: 'Email' },
          { href: '/ops/whatsapp', label: 'WhatsApp' },
          { href: '/ops/reviews', label: 'Reviews' },
          { href: '/ops/moderation', label: 'Moderation' },
          { href: '/ops/data', label: 'Data' },
          { href: '/ops/assistant', label: 'Ask the data' },
          { href: '/ops/bride-ai', label: 'Ask OLReady' },
        ]
      : []),
    ...(['rm', 'ops', 'admin'].includes(p.role) ? [{ href: '/ops/rm', label: p.role === 'rm' ? 'My brides' : 'Relationship managers' }] : []),
    ...(['content', 'ops', 'admin'].includes(p.role)
      ? [
          { href: '/ops/content', label: 'Real weddings' },
          { href: '/ops/articles', label: 'Articles' },
          { href: '/ops/collections', label: 'Collections' },
        ]
      : []),
    ...(p.role === 'admin'
      ? [
          { href: '/ops/catalog', label: 'Categories' },
          { href: '/ops/staff', label: 'Staff' },
          { href: '/ops/settings', label: 'Settings' },
        ]
      : []),
  ];
  return (
    <Container className="max-w-7xl">
      <OpsTabs items={items} />
      {children}
    </Container>
  );
}
