import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { inviteBySlug } from '@/lib/invites';
import { InviteCard } from '@/components/InviteCard';
import { InviteReplay } from '@/components/InviteReplay';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const d = await inviteBySlug(sql, (await params).slug);
  if (!d) return { title: 'Invitation', robots: { index: false } };
  const title = `${d.content.bride} & ${d.content.groom}${d.content.kind === 'save_the_date' ? ': save the date' : ': wedding invitation'}`;
  return { title, description: d.content.dateLine || 'You are invited', robots: { index: false }, openGraph: { title, images: d.invite.photo_url ? [d.invite.photo_url] : undefined } };
}

export default async function Invite({ params }: P) {
  const d = await inviteBySlug(sql, (await params).slug);
  if (!d) notFound();
  const t = d.invite.theme;
  return (
    <div className="-mt-6 min-h-[85vh] px-4 py-8" style={{ background: `color-mix(in srgb, ${t.bg} 88%, ${t.accent})` }}>
      <div className="mx-auto max-w-md">
        <InviteReplay>
          <div className="rounded-[8px] shadow-xl">
            <InviteCard layout={d.invite.layout} theme={t} content={d.content} animate />
          </div>
        </InviteReplay>
        {d.content.kind === 'card' ? (
          <p className="mt-5 text-center text-sm" style={{ color: t.ink }}>
            Please reply on the personal RSVP link the family sent you.
          </p>
        ) : null}
        <p className="mt-8 text-center text-xs opacity-70" style={{ color: t.ink }}>
          Made with OLReady.{' '}
          <Link href="/invitations" className="underline">
            Make your own invite, free
          </Link>
        </p>
      </div>
    </div>
  );
}
