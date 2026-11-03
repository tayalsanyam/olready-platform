import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireBrideWedding } from '@/lib/brideSession';
import { contentFor, inviteDesigns, weddingInvites } from '@/lib/invites';
import { saveInviteAction } from '@/lib/actions/bride';
import { events } from '@/lib/weddings';
import { CULTURES } from '@/lib/inviteDesign';
import { siteUrl } from '@/lib/seo';
import { Notice, PageTitle, sp } from '@/components/ui';
import { InviteStudio } from '@/components/InviteStudio';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'E-invite', robots: { index: false } };

type P = { searchParams: Promise<Record<string, string | string[]>> };

const fmtWhen = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(d) : 'Time to be announced';

export default async function InviteEditor({ searchParams }: P) {
  const q = await searchParams;
  const kind = sp(q.kind) === 'save_the_date' ? 'save_the_date' : 'card';
  const { p, w } = await requireBrideWedding('/me/invite');
  const [designs, saved, evs] = await Promise.all([inviteDesigns(sql, { kind }), weddingInvites(sql, w.id), events(sql, w.id)]);
  const mine = saved.find((s) => s.kind === kind) ?? null;
  const content = mine ? await contentFor(sql, mine) : null;
  const asked = designs.find((d) => d.code === sp(q.design))?.code;
  const dateLine = w.wedding_date
    ? new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${w.wedding_date}T12:00:00+05:30`))
    : '';
  const firstName = (p.full_name || '').split(' ')[0];
  const initial = {
    design: asked ?? mine?.template_code ?? designs[0].code,
    opening: content?.opening ?? CULTURES.generic.opening,
    bride: content?.bride ?? firstName,
    groom: content?.groom ?? (w.partner_name || ''),
    family: content?.family ?? '',
    message: content?.message ?? 'request the pleasure of your company as they begin their life together.',
    photo: mine?.photo_url ?? null,
    publish: mine?.published ?? true,
  };
  return (
    <>
      <PageTitle
        title="E-invite"
        sub="Pick a design, add your words, and share one link. Each guest still answers on their own RSVP link."
        action={
          <Link href="/invitations" className="btn btn-ghost btn-sm">
            Browse all designs
          </Link>
        }
      />
      <Notice error={q.error} ok={q.ok} />
      <div className="mb-5 flex gap-2" role="group" aria-label="Type">
        <Link href="/me/invite" className="chip" aria-current={kind === 'card'}>
          Wedding card{saved.some((s) => s.kind === 'card') ? ' ✓' : ''}
        </Link>
        <Link href="/me/invite?kind=save_the_date" className="chip" aria-current={kind === 'save_the_date'}>
          Save the date{saved.some((s) => s.kind === 'save_the_date') ? ' ✓' : ''}
        </Link>
      </div>
      <InviteStudio
        key={kind + initial.design}
        kind={kind}
        designs={designs}
        initial={initial}
        dateLine={dateLine}
        events={evs.map((e) => ({ name: e.name, when: fmtWhen(e.starts_at), venue: e.venue }))}
        action={saveInviteAction}
        saved={mine ? { slug: mine.slug, published: mine.published } : null}
        site={siteUrl()}
      />
    </>
  );
}
