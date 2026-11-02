import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { inviteBySlug } from '@/lib/weddings';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const d = await inviteBySlug(sql, (await params).slug);
  return { title: d?.invite.headline ?? 'Invitation', robots: { index: false } };
}

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d) : 'Time to be announced';

export default async function Invite({ params }: P) {
  const d = await inviteBySlug(sql, (await params).slug);
  if (!d) notFound();
  const t = d.invite.theme;
  const font = t.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)';
  return (
    <div className="-mt-6 min-h-[80vh] px-4 py-12" style={{ background: t.bg, color: t.ink }}>
      <div className="mx-auto max-w-md text-center" style={{ fontFamily: font }}>
        <div className="mx-auto mb-6 h-px w-24" style={{ background: t.accent }} />
        <h1 className="text-4xl leading-tight">{d.invite.headline}</h1>
        {d.invite.wedding_date ? <p className="mt-3 text-lg" style={{ color: t.accent }}>{d.invite.wedding_date}</p> : null}
        <p className="mt-6 whitespace-pre-line text-base opacity-90">{d.invite.message}</p>
        <ul className="mt-8 space-y-4">
          {d.events.map((e) => (
            <li key={e.id} className="rounded-xl border px-4 py-3" style={{ borderColor: t.accent }}>
              <div className="text-xl">{e.name}</div>
              <div className="text-sm opacity-80">{fmt(e.starts_at)}</div>
              {e.venue ? <div className="text-sm opacity-80">{e.venue}</div> : null}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm opacity-70">Please reply on the personal RSVP link sent to you.</p>
        <div className="mx-auto mt-6 h-px w-24" style={{ background: t.accent }} />
      </div>
    </div>
  );
}
