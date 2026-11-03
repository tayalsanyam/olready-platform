import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { inviteDesign, inviteDesigns } from '@/lib/invites';
import { CULTURES, SAMPLE, THEMES } from '@/lib/inviteDesign';
import { Container, sp } from '@/components/ui';
import { InviteCard } from '@/components/InviteCard';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params }: P) {
  const d = await inviteDesign(sql, (await params).code);
  if (!d) return { title: 'Not found', robots: { index: false } };
  return {
    title: `${d.name}: free ${d.kind === 'card' ? 'wedding invitation' : 'save-the-date'} design`,
    description: `Use the ${d.name.toLowerCase()} design for your ${d.kind === 'card' ? 'wedding invitation' : 'save-the-date'}. Free to make and share on WhatsApp, with a video version and RSVPs.`,
    alternates: { canonical: `/invitations/${d.code}` },
  };
}

export default async function Design({ params, searchParams }: P) {
  const { code } = await params;
  const q = await searchParams;
  const d = await inviteDesign(sql, code);
  if (!d) notFound();
  const culture = sp(q.culture) && CULTURES[sp(q.culture)!] ? sp(q.culture)! : d.culture;
  const more = (await inviteDesigns(sql, { kind: d.kind })).filter((x) => x.code !== d.code && x.layout === d.layout).slice(0, 4);
  return (
    <Container>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--color-muted)]">
        <Link href="/invitations">Invitations</Link> / {d.name}
      </nav>
      <div className="grid gap-8 md:grid-cols-[minmax(0,420px)_1fr]">
        <div className="rounded-[8px] shadow-md ring-1 ring-[var(--color-line)]">
          <InviteCard layout={d.layout} theme={d.theme} content={{ ...SAMPLE, kind: d.kind, opening: CULTURES[culture]?.opening ?? SAMPLE.opening }} animate />
        </div>
        <div>
          <h1 className="text-3xl font-semibold">{d.name}</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            {d.kind === 'card' ? 'Wedding invitation' : 'Save the date'}
            {d.culture !== 'generic' && CULTURES[d.culture] ? ` suggested for ${CULTURES[d.culture].label} weddings` : ' for any culture'}.{' '}
            {d.themes.map((t) => THEMES[t] ?? t).join(', ')}.
            {d.uses ? ` Used by ${d.uses} couple${d.uses === 1 ? '' : 's'}.` : ''}
          </p>
          <ul className="mt-5 space-y-2 text-sm">
            <li>Your names, families, date and every function from your guest list, filled in for you</li>
            <li>One link to share on WhatsApp, with a personal RSVP link for each guest</li>
            <li>Download as a short video for WhatsApp status, or as an image</li>
            <li>Free. No watermark.</li>
          </ul>
          <Link href={`/me/invite?design=${d.code}&kind=${d.kind}`} className="btn btn-pink mt-6">
            Use this design
          </Link>
          {more.length ? (
            <>
              <h2 className="mt-10 font-semibold">Same layout, other colours</h2>
              <ul className="mt-3 grid grid-cols-4 gap-3">
                {more.map((m) => (
                  <li key={m.code}>
                    <Link href={`/invitations/${m.code}`} aria-label={m.name} className="block rounded-[6px] ring-1 ring-[var(--color-line)]">
                      <InviteCard layout={m.layout} theme={m.theme} content={{ ...SAMPLE, kind: m.kind, events: [] }} compact />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </Container>
  );
}
