import { notFound } from 'next/navigation';
import { sql, DomainError } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getThread, threadAccess, threadMessages, threadQuotes } from '@/lib/threads';
import { ThreadView } from '@/components/ThreadView';
import { PageTitle } from '@/components/ui';

export const metadata = { title: 'Conversation' };
type P = { params: Promise<{ id: string }> };

/** Read-only view for Ops and the bride's assigned RM. */
export default async function StaffThread({ params }: P) {
  const { id } = await params;
  const me = await requireRole(['rm', 'ops', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  try {
    await threadAccess(sql, id, me);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const t = (await getThread(sql, id))!;
  const [messages, quotes] = await Promise.all([threadMessages(sql, id), threadQuotes(sql, id)]);
  return (
    <>
      <PageTitle title={`${t.bride_name} and ${t.vendor_name}`} sub={`${t.category_name} · read only`} />
      <ThreadView thread={t} messages={messages} quotes={quotes} viewerId={me.id} side="staff" backPath={`/ops/threads/${id}`} />
    </>
  );
}
