import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireProfile } from '@/lib/auth';
import { getVendorBySlug } from '@/lib/vendors';
import { listCategories, listCities } from '@/lib/catalog';
import { weddingFor } from '@/lib/weddings';
import { ASSISTANT_NAME, allowance, ownThread, shownMessages, threadsFor } from '@/lib/brideAssistant';
import { deleteAssistantThread } from '@/lib/actions/brideAssistant';
import { AssistantChat } from '@/components/AssistantChat';
import { Empty, PageTitle, sp } from '@/components/ui';

export const metadata = { title: ASSISTANT_NAME, robots: { index: false } };
type P = { searchParams: Promise<Record<string, string | string[]>> };

const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

export default async function AssistantPage({ searchParams }: P) {
  const q = await searchParams;
  const p = await requireProfile('/me/assistant');
  if (p.role !== 'bride') {
    return (
      <Empty title={`${ASSISTANT_NAME} is for brides and their family`}>
        Vendors can see their leads and insights in <Link className="underline" href="/vendor">your business</Link>.
      </Empty>
    );
  }
  const t = sp(q.t) ? await ownThread(sql, sp(q.t)!, p.id) : null;
  const [threads, messages, a, wedding] = await Promise.all([threadsFor(sql, p.id), t ? shownMessages(sql, t.id) : Promise.resolve([]), allowance(sql, p.id), weddingFor(sql, p.id)]);

  // Starters fit where she is: a vendor or listing she came from, else her plan.
  const starters: string[] = [];
  const vendor = sp(q.vendor) ? await getVendorBySlug(sql, sp(q.vendor)!) : null;
  if (vendor?.status === 'live') {
    starters.push(`Tell me about ${vendor.business_name}: what do I get, and what should I ask?`, `Show me vendors like ${vendor.business_name} at a lower price`);
  }
  const [cats, cities] = await Promise.all([listCategories(sql, { activeOnly: true }), listCities(sql)]);
  const cat = cats.find((c) => c.slug === sp(q.category));
  const city = cities.find((c) => c.slug === sp(q.city)) ?? cities.find((c) => c.id === wedding?.city_id);
  if (cat) starters.push(`Help me choose ${cat.plural_name.toLowerCase()}${city ? ` in ${city.name}` : ''}`, `What do ${cat.plural_name.toLowerCase()} usually cost${city ? ` in ${city.name}` : ''}?`);
  if (wedding) {
    starters.push('What should I book next, and by when?', 'Compare my quotes for me', `Suggest a budget split for my wedding${city ? ` in ${city.name}` : ''}`);
  } else {
    starters.push(`Find a venue in ${city?.name ?? 'Chandigarh'} for 300 guests`, 'Where do I start planning a wedding?', 'How much does bridal makeup cost in the Tricity?');
  }
  starters.push('Show me mehendi designs I might like');

  return (
    <>
      <PageTitle title={ASSISTANT_NAME} sub="Your planning helper. It knows OLReady's vendors and prices and your own plan, and never shares your number." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="order-2 lg:order-1">
          <details className="rounded-2xl border border-[var(--color-line)] bg-white p-3 lg:open:block" open={threads.length > 0 && threads.length < 6}>
            <summary className="cursor-pointer text-sm font-semibold">Your chats ({threads.length})</summary>
            <Link href="/me/assistant" className="btn btn-ghost btn-sm mt-3 w-full">
              New chat
            </Link>
            <ul className="mt-2 space-y-1 text-sm">
              {threads.map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/me/assistant?t=${x.id}`}
                    className={`block rounded-lg px-2 py-1.5 hover:bg-[var(--color-tint)] ${x.id === t?.id ? 'bg-[var(--color-tint)] font-semibold' : ''}`}
                  >
                    <span className="line-clamp-2">{x.title}</span>
                    <span className="text-xs text-[var(--color-muted)]">{fmt(x.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {t ? (
              <form action={deleteAssistantThread} className="mt-3">
                <input type="hidden" name="thread_id" value={t.id} />
                <button className="text-xs text-[var(--color-muted)] underline">Delete this chat</button>
              </form>
            ) : null}
            <p className="mt-3 text-[11px] text-[var(--color-muted)]">Chats are deleted after 90 days without use.</p>
          </details>
        </aside>
        <section className="order-1 min-w-0 lg:order-2">
          <AssistantChat
            key={t?.id ?? 'new'}
            threadId={t?.id ?? null}
            initial={messages.map((m) => ({ id: m.id, role: m.role, text: m.text, helpful: m.helpful, actions: m.actions }))}
            starters={[...new Set(starters)].slice(0, 6)}
            enabled={a.on && a.left > 0}
            offNote={!a.on ? `${ASSISTANT_NAME} is resting right now. Everything else works as usual.` : `You have used today's ${a.perDay} questions. Ask again tomorrow.`}
            left={a.left}
          />
        </section>
      </div>
    </>
  );
}
