import { Container } from '@/components/ui';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { unreadCount } from '@/lib/threads';
import { VendorTabs } from './tabs';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const p = await currentProfile();
  const [v] = p ? await sql<{ id: string }[]>`select id from mkt.vendors where owner_profile_id = ${p.id} limit 1` : [];
  const unread = v ? await unreadCount(sql, { vendorId: v.id }) : 0;
  return (
    <Container>
      <VendorTabs unread={unread} />
      {children}
    </Container>
  );
}
