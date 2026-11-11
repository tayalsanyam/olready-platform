import Link from 'next/link';
import { sql } from '@/lib/db';
import { currentProfile } from '@/lib/auth';
import { fieldsFor, listCities } from '@/lib/catalog';
import { ideaTopics, savedRefs, topicTags } from '@/lib/ideas';
import { lookEnabled, lookPhotos, lookVendors } from '@/lib/look';
import { shortlistedIds } from '@/lib/weddings';
import { lookPhotoAction } from '@/lib/actions/look';
import { Card, Container, Empty, Notice, PageTitle, sp } from '@/components/ui';
import { PhotoInput } from '@/components/PhotoInput';
import { VendorCard } from '@/components/VendorCard';
import { IdeaGrid } from '@/components/IdeaGrid';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Search by photo: find vendors for the look you love',
  description: 'Show us a bridal look, mehendi design, decor or outfit you love and see vendors known for that style.',
  alternates: { canonical: '/look' },
};
type P = { searchParams: Promise<Record<string, string | string[]>> };

export default async function Look({ searchParams }: P) {
  const q = await searchParams;
  const [topics, cities, viewer] = await Promise.all([ideaTopics(sql), listCities(sql), currentProfile()]);
  const usable = topics.filter((t) => t.category_id);
  const topic = usable.find((t) => t.slug === sp(q.topic)) ?? usable[0];
  const city = cities.find((c) => c.slug === sp(q.city)) ?? cities[0];
  const tags = await topicTags(sql, topic.id);
  const chosen = (sp(q.tags) ?? '').split(',').filter((t) => tags.some((x) => x.slug === t));
  const fromPhoto = sp(q.from) === 'photo';
  const [vendors, photos, fields, hearts, saved] = await Promise.all([
    lookVendors(sql, { categoryId: topic.category_id!, cityId: city?.id ?? null, tags: chosen }),
    lookPhotos(sql, topic.slug, chosen),
    fieldsFor(sql, topic.category_id!),
    shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null),
    savedRefs(sql, viewer?.role === 'bride' ? viewer.id : null, 'photo'),
  ]);
  const self = `/look?topic=${topic.slug}&city=${city?.slug}&tags=${chosen.join(',')}`;
  const toggle = (slug: string) => {
    const next = chosen.includes(slug) ? chosen.filter((x) => x !== slug) : [...chosen, slug];
    return `/look?topic=${topic.slug}&city=${city?.slug}${next.length ? `&tags=${next.join(',')}` : ''}`;
  };
  return (
    <Container>
      <PageTitle
        title="Search by photo"
        sub="Show us a look you love, or pick the styles, and see vendors in your city who are known for it."
      />
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1" action="/look">
              <label className="block">
                <span className="label">Looking for</span>
                <select name="topic" defaultValue={topic.slug} className="input">
                  {usable.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">City</span>
                <select name="city" defaultValue={city?.slug} className="input">
                  {cities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-ghost btn-sm sm:col-span-2 lg:col-span-1">Change</button>
            </form>
          </Card>
          {lookEnabled() ? (
            <Card>
              <h2 className="font-semibold">Upload a photo</h2>
              <p className="hint mt-1">A screenshot from Instagram works. We read the styles and throw the photo away; it is never stored.</p>
              <form action={lookPhotoAction} className="mt-3 space-y-3">
                <input type="hidden" name="topic" value={topic.slug} />
                <input type="hidden" name="city" value={city?.slug} />
                <PhotoInput name="photo" label="Choose a photo" maxSide={1024} />
                <button className="btn btn-pink btn-sm">Find this look</button>
              </form>
            </Card>
          ) : null}
          <Card>
            <h2 className="font-semibold">{lookEnabled() ? 'Or pick the styles' : 'Pick the styles you love'}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link key={t.slug} href={toggle(t.slug)} className="chip" aria-current={chosen.includes(t.slug)} scroll={false}>
                  {t.label}
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div>
          {chosen.length ? (
            <>
              <p className="mb-4 text-sm">
                {fromPhoto ? 'Your photo looks like ' : 'Showing '}
                <b>{chosen.map((c) => tags.find((t) => t.slug === c)?.label).join(', ')}</b> {topic.name.toLowerCase()} in {city?.name}.
              </p>
              {vendors.length ? (
                <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                  {vendors.map((v) => (
                    <div key={v.id}>
                      <VendorCard v={v} fields={fields} backPath={self} shortlisted={hearts.has(v.id)} />
                      <p className="mt-1 text-xs text-[var(--color-muted)]">Known for {v.matched.map((m) => tags.find((t) => t.slug === m)?.label ?? m).join(', ')}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty art="search" title={`No ${topic.name.toLowerCase()} matched in ${city?.name} yet`}>
                  Try fewer styles, or <Link className="underline" href={`/enquire?city=${city?.slug}`}>tell us what you want</Link> and our team will find vendors.
                </Empty>
              )}
              {photos.length ? (
                <section className="mt-10">
                  <h2 className="mb-3 text-xl font-semibold">Photos in this style</h2>
                  <IdeaGrid photos={photos} saved={saved} backPath={self} />
                </section>
              ) : null}
            </>
          ) : (
            <Empty art="search" title="Show us what you love">{lookEnabled() ? 'Upload a photo, or pick a few styles on the left.' : 'Pick a few styles on the left.'}</Empty>
          )}
        </div>
      </div>
    </Container>
  );
}
