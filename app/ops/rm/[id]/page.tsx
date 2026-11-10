import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatInr } from '@/lib/catalog';
import { engagementFor, rmNotes } from '@/lib/rm';
import { threadsForBride } from '@/lib/threads';
import { checklist, shortlist } from '@/lib/weddings';
import { rmAddNote } from '@/lib/actions/ops';
import { Badge, Card, Notice, PageTitle } from '@/components/ui';
import { fmtDate, fmtDay, plural } from '@/lib/dates';

export const metadata = { title: 'Bride' };
type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> };

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d) : '–');

export default async function RmBride({ params, searchParams }: P) {
  const { id } = await params;
  const q = await searchParams;
  const me = await requireRole(['rm', 'ops', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const e = await engagementFor(sql, id, me);
  if (!e) notFound();
  const [threads, notes, list, tasks, needs] = await Promise.all([
    threadsForBride(sql, e.profile_id),
    rmNotes(sql, id),
    e.wedding_id ? shortlist(sql, e.wedding_id) : Promise.resolve([]),
    e.wedding_id ? checklist(sql, e.wedding_id) : Promise.resolve([]),
    sql<{ category: string; status: string; budget_inr: number | null; booked: string | null }[]>`
      select c.name as category, ln.status, ln.budget_inr, v.business_name as booked
      from mkt.lead_needs ln join mkt.leads l on l.id = ln.lead_id join mkt.categories c on c.id = ln.category_id
      left join mkt.vendors v on v.id = ln.booked_vendor_id
      where (l.bride_profile_id = ${e.profile_id} or (${e.wedding_id}::uuid is not null and l.wedding_id = ${e.wedding_id}))
        and ln.status <> 'removed' order by c.sort`,
  ]);
  const open = tasks.filter((t) => !t.done).slice(0, 6);
  return (
    <>
      <PageTitle
        title={e.bride_name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {e.bride_phone ? (
              <a className="underline" href={`tel:${e.bride_phone}`}>
                {e.bride_phone}
              </a>
            ) : null}
            <span>{e.bride_email}</span>
            <span>· wedding {fmtDate(e.wedding_date, 'not fixed')}</span>
            <Badge tone={e.status === 'active' ? 'ok' : 'warn'}>{e.status.replace('_', ' ')}</Badge>
          </span>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Requests</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)] text-sm">
            {needs.map((n, i) => (
              <li key={i} className="flex justify-between py-1.5">
                <span>
                  {n.category}
                  {n.budget_inr != null ? <span className="hint"> · {formatInr(n.budget_inr)}</span> : null}
                </span>
                <span>{n.booked ? `booked: ${n.booked}` : n.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 font-semibold">Conversations</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {threads.map((t) => (
              <li key={t.id}>
                <Link className="underline" href={`/ops/threads/${t.id}`}>
                  {t.vendor_name}
                </Link>{' '}
                <span className="hint">
                  {t.category_name} · {t.status.replace('_', ' ')}
                </span>
              </li>
            ))}
            {!threads.length ? <li className="hint">No vendor conversations yet.</li> : null}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Shortlist</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {list.map((s) => (
              <li key={s.vendor_id}>
                <Link className="underline" href={`/v/${s.slug}`}>
                  {s.business_name}
                </Link>{' '}
                <span className="hint">{s.category_name}</span>
              </li>
            ))}
            {!list.length ? <li className="hint">Nothing shortlisted.</li> : null}
          </ul>
          <h3 className="mt-4 font-semibold">Next on her checklist</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {open.map((t) => (
              <li key={t.id}>
                {t.title} <span className="hint">{fmtDate(t.due_date)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="font-semibold">Notes</h2>
          <p className="hint">Internal to the OLReady team.</p>
          {e.status === 'active' ? (
            <form action={rmAddNote} className="mt-2 flex gap-2">
              <input type="hidden" name="id" value={e.id} />
              <textarea name="body" rows={2} required className="input" placeholder="Call summary, next steps" />
              <button className="btn btn-sm self-end">Save</button>
            </form>
          ) : null}
          <ul className="mt-3 space-y-2 text-sm">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-[var(--color-tint)] p-2">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="hint">
                  {n.author} · {fmt(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
