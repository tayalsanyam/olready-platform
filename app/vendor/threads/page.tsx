import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireVendor } from '@/lib/vendorSession';
import { threadsForVendor } from '@/lib/threads';
import { Badge, Empty, PageTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversations', robots: { index: false } };

export default async function VendorThreads() {
  const { vendor } = await requireVendor('/vendor/threads');
  const threads = await threadsForVendor(sql, vendor.id);
  return (
    <>
      <PageTitle title="Conversations" sub="Every lead you unlock opens a conversation here." />
      {threads.length ? (
        <ul className="card divide-y divide-[var(--color-line)]">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/vendor/threads/${t.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-[var(--color-cream)]">
                <div>
                  <div className="font-semibold">{t.bride_name}</div>
                  <div className="hint">
                    {t.city_name} · {t.event_date ?? 'date not fixed'}
                  </div>
                </div>
                <Badge tone={t.status === 'booked' ? 'ok' : t.status === 'quote_accepted' ? 'gold' : 'plain'}>{t.status.replace('_', ' ')}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No conversations yet">
          <Link href="/vendor" className="underline">
            Unlock a lead
          </Link>{' '}
          to start one.
        </Empty>
      )}
    </>
  );
}
