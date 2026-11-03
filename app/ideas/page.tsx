import Link from 'next/link';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { ideaPhotos, ideaTopics, savedRefs } from '@/lib/ideas';
import { Container, Cover, Empty, Notice, PageTitle, sp } from '@/components/ui';
import { IdeaGrid } from '@/components/IdeaGrid';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Wedding ideas: makeup, mehendi, decor, venues and outfits',
  description: 'Browse bridal makeup looks, mehendi designs, decor, venues, outfits and real wedding photos from Tricity vendors. Save what you love and get quotes.',
  alternates: { canonical: '/ideas' },
};
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Ideas({ searchParams }: P) {
  const q = await searchParams;
  const viewer = await currentProfile();
  const [topics, latest, saved] = await Promise.all([
    ideaTopics(sql),
    ideaPhotos(sql, { limit: 24 }),
    savedRefs(sql, viewer?.role === 'bride' ? viewer.id : null, 'photo'),
  ]);
  const shown = topics.filter((t) => t.photo_count > 0);
  return (
    <Container>
      <PageTitle
        title="Wedding ideas"
        sub="Real work from Tricity vendors and real weddings. Tap the heart to save an idea to your wedding wall."
        action={
          <Link href="/look" className="btn btn-ghost">
            Search by photo
          </Link>
        }
      />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      {shown.length ? (
        <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5">
          {shown.map((t) => (
            <li key={t.slug} className="w-40 shrink-0 sm:w-auto">
              <Link href={`/ideas/${t.slug}`} className="group block">
                <span className="block aspect-[4/5] overflow-hidden rounded-[14px]">
                  <Cover url={t.cover_url} name={t.name} />
                </span>
                <span className="mt-1.5 block font-semibold group-hover:text-[var(--color-pink-deep)]">{t.name}</span>
                <span className="text-sm text-[var(--color-muted)]">
                  {t.photo_count} photo{t.photo_count === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <h2 className="mb-3 mt-10 text-xl font-semibold">Latest</h2>
      {latest.length ? (
        <IdeaGrid photos={latest} saved={saved} backPath="/ideas" />
      ) : (
        <Empty title="No photos yet">Vendors' work appears here as soon as they add photos to their profiles.</Empty>
      )}
    </Container>
  );
}
