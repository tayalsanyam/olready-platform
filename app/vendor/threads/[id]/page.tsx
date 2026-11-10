import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { getThread, threadMessages, threadQuotes } from '@/lib/threads';
import { postMessageAction, sendQuoteAction } from '@/lib/actions/threads';
import { vendorReportBooking } from '@/lib/actions/vendor';
import { ThreadView } from '@/components/ThreadView';
import { Notice, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversation', robots: { index: false } };

type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

export default async function VendorThread({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  const { profile, vendor } = await requireVendor(`/vendor/threads/${id}`);
  const t = /^[0-9a-f-]{36}$/.test(id) ? await getThread(sql, id) : null;
  if (!t || t.vendor_id !== vendor.id) notFound();
  const [messages, quotes] = await Promise.all([threadMessages(sql, id), threadQuotes(sql, id)]);
  return (
    <>
      <PageTitle title={t.bride_name} sub={`${t.category_name} enquiry${t.picked ? ' · she picked you' : ''}`} />
      <Notice error={q.error} ok={q.ok} />
      <ThreadView
        thread={t}
        messages={messages}
        quotes={quotes}
        viewerId={profile.id}
        side="vendor"
        backPath={`/vendor/threads/${id}`}
        postMessage={postMessageAction}
        sendQuote={sendQuoteAction}
        reportBooking={vendorReportBooking}
      />
    </>
  );
}
