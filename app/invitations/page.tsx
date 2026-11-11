import Link from 'next/link';
import { sql } from '@/lib/db';
import { inviteDesigns } from '@/lib/invites';
import { CULTURES, SAMPLE, THEMES } from '@/lib/inviteDesign';
import { Container, Empty, PageTitle, sp } from '@/components/ui';
import { InviteCard } from '@/components/InviteCard';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Free wedding invitation cards, save-the-dates and video invites',
  description:
    'Make a wedding e-invite in minutes: designs for Hindu, Sikh, Punjabi, Muslim, Christian and more. Share on WhatsApp, download as a video or image, collect RSVPs. Free on OLReady.',
  alternates: { canonical: '/invitations' },
};
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Invitations({ searchParams }: P) {
  const q = await searchParams;
  const kind = sp(q.kind) === 'save_the_date' ? 'save_the_date' : 'card';
  const culture = sp(q.culture) && CULTURES[sp(q.culture)!] && sp(q.culture) !== 'generic' ? sp(q.culture)! : null;
  const theme = sp(q.theme) && THEMES[sp(q.theme)!] ? sp(q.theme)! : null;
  const sort = sp(q.sort) === 'newest' ? 'newest' : 'trending';
  const designs = await inviteDesigns(sql, { kind, culture, theme, sort });
  const href = (over: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const v = { kind, culture, theme, sort: sort === 'trending' ? null : sort, ...over };
    for (const [k, x] of Object.entries(v)) if (x && !(k === 'kind' && x === 'card')) u.set(k, x);
    const s = u.toString();
    return `/invitations${s ? `?${s}` : ''}`;
  };
  const opening = culture ? CULTURES[culture].opening : SAMPLE.opening;
  return (
    <Container>
      <PageTitle
        title={kind === 'card' ? 'Wedding invitation cards' : 'Save-the-date cards'}
        sub="Free to make, share and download. Every design also plays as a short video for WhatsApp, and guests reply on their own RSVP links."
        action={
          <Link href="/me/invite" className="btn btn-pink">
            Make my invite
          </Link>
        }
      />
      <div className="mb-3 flex gap-2" role="group" aria-label="Type">
        <Link href={href({ kind: 'card' })} className="chip" aria-current={kind === 'card'}>
          Wedding cards
        </Link>
        <Link href={href({ kind: 'save_the_date' })} className="chip" aria-current={kind === 'save_the_date'}>
          Save the date
        </Link>
      </div>
      <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Culture">
        <Link href={href({ culture: null })} className="chip" aria-current={!culture}>
          All cultures
        </Link>
        {Object.entries(CULTURES)
          .filter(([k]) => k !== 'generic')
          .map(([k, c]) => (
            <Link key={k} href={href({ culture: k })} className="chip" aria-current={culture === k}>
              {c.label}
            </Link>
          ))}
      </div>
      <div className="no-scrollbar -mx-4 mb-5 flex items-center gap-2 overflow-x-auto px-4" role="group" aria-label="Theme and order">
        <Link href={href({ theme: null })} className="chip" aria-current={!theme}>
          Any style
        </Link>
        {Object.entries(THEMES)
          .filter(([k]) => k !== 'save-the-date')
          .map(([k, label]) => (
            <Link key={k} href={href({ theme: k })} className="chip" aria-current={theme === k}>
              {label}
            </Link>
          ))}
        <span className="ml-2 whitespace-nowrap text-sm text-[var(--color-muted)]">Sort</span>
        <Link href={href({ sort: null })} className={`whitespace-nowrap text-sm ${sort === 'trending' ? 'font-semibold text-[var(--color-pink-deep)]' : ''}`}>
          Popular
        </Link>
        <Link href={href({ sort: 'newest' })} className={`whitespace-nowrap text-sm ${sort === 'newest' ? 'font-semibold text-[var(--color-pink-deep)]' : ''}`}>
          Newest
        </Link>
      </div>
      {designs.length ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {designs.map((d) => (
            <li key={d.code}>
              <Link href={`/invitations/${d.code}${culture ? `?culture=${culture}` : ''}`} className="group block">
                <div className="rounded-[8px] shadow-sm ring-1 ring-[var(--color-line)] transition-transform group-hover:-translate-y-0.5">
                  <InviteCard layout={d.layout} theme={d.theme} content={{ ...SAMPLE, kind: d.kind, opening }} compact />
                </div>
                <p className="mt-2 text-sm font-semibold group-hover:text-[var(--color-pink-deep)]">{d.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {CULTURES[d.culture]?.label ?? 'Any culture'}
                  {d.uses ? `, used by ${d.uses} couple${d.uses === 1 ? '' : 's'}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty art="search" title="No designs match">
          Try another culture or style, or <Link className="underline" href="/invitations">see all designs</Link>.
        </Empty>
      )}
    </Container>
  );
}
