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
          { href: '/ops/reviews', label: 'Review disputes' },
        ]
      : []),
    ...(['rm', 'ops', 'admin'].includes(p.role) ? [{ href: '/ops/rm', label: p.role === 'rm' ? 'My brides' : 'Relationship managers' }] : []),
    ...(['content', 'ops', 'admin'].includes(p.role) ? [{ href: '/ops/content', label: 'Real weddings' }] : []),
    ...(p.role === 'admin'
      ? [
          { href: '/ops/catalog', label: 'Categories' },
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
