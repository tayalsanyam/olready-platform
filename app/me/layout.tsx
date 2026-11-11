import { redirect } from 'next/navigation';
import { Container } from '@/components/ui';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { unreadCount } from '@/lib/threads';
import { BrideTabs } from './tabs';

export default async function BrideLayout({ children }: { children: React.ReactNode }) {
  const p = await currentProfile();
  if (p && !p.phone && (p.role === 'bride' || p.role === 'vendor')) redirect('/welcome?next=/me');
  const unread = p ? await unreadCount(sql, { brideProfileId: p.id }) : 0;
  return (
    <Container>
      <BrideTabs unread={unread} />
      {children}
    </Container>
  );
}
