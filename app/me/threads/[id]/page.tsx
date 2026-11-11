import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { DomainError } from '@/lib/db';
import { getThread, markThreadRead, threadAccess, threadMessages, threadQuotes } from '@/lib/threads';
import { decideQuoteAction, postMessageAction } from '@/lib/actions/threads';
import { brideReportBooking } from '@/lib/actions/bride';
import { ThreadView } from '@/components/ThreadView';
import { Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversation', robots: { index: false } };

type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function BrideThread({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  const p = await requireProfile(`/me/threads/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  try {
    const a = await threadAccess(sql, id, p);
    if (a.side !== 'bride') notFound();
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const t = (await getThread(sql, id))!;
  await markThreadRead(sql, id, 'bride');
  const [messages, quotes] = await Promise.all([threadMessages(sql, id), threadQuotes(sql, id)]);
  return (
    <>
      <PageTitle title={t.vendor_name} sub={`${t.category_name} · ${t.city_name} · ${t.picked ? 'You picked this vendor' : 'This vendor wrote to you'}`} />
      <Notice error={q.error} ok={q.ok} />
      <ThreadView
        thread={t}
        messages={messages}
        quotes={quotes}
        viewerId={p.id}
        side="bride"
        backPath={`/me/threads/${id}`}
        postMessage={postMessageAction}
        decideQuote={decideQuoteAction}
        reportBooking={brideReportBooking}
      />
    </>
  );
}
