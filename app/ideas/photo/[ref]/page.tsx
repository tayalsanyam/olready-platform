import Link from 'next/link';
import { after } from 'next/server';
import { bump, visitorKey } from '@/lib/analytics';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentProfile, STAFF_ROLES } from '@/lib/auth';
import { ideaPhoto, ideaPhotos, savedRefs } from '@/lib/ideas';
import { opsHideIdea, saveItemAction } from '@/lib/actions/ideas';
import { Container, Notice, sp } from '@/components/ui';
import { IdeaGrid } from '@/components/IdeaGrid';
import { IconHeart, IconPin } from '@/components/icons';
import { JsonLd } from '@/components/VendorCard';
import { breadcrumbLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params }: P) {
  const p = await ideaPhoto(sql, (await params).ref);
  if (!p) return { title: 'Not found', robots: { index: false } };
  const by = p.vendor_name ? ` by ${p.vendor_name}` : '';
  return {
    title: `${p.caption || p.topic_name}${by}`,
    description: `${p.topic_name}${by}${p.city_name ? ` in ${p.city_name}` : ''}. Save this idea or get a quote on OLReady.`,
    alternates: { canonical: `/ideas/photo/${p.ref}` },
    openGraph: { images: [p.url] },
  };
}

export default async function Photo({ params, searchParams }: P) {
  const { ref } = await params;
  const q = await searchParams;
  const p = await ideaPhoto(sql, ref);
  if (!p) notFound();
  if (p.vendor_id && (await visitorKey())) after(() => bump(sql, [p.vendor_id!], 'photo_views').catch(() => undefined));
  const viewer = await currentProfile();
  const staff = viewer && STAFF_ROLES.includes(viewer.role);
  const [saved, more, similar] = await Promise.all([
    savedRefs(sql, viewer?.role === 'bride' ? viewer.id : null, 'photo'),
    p.vendor_id ? ideaPhotos(sql, { vendorId: p.vendor_id, exclude: p.ref, limit: 8 }) : Promise.resolve([]),
    ideaPhotos(sql, { topic: p.topic_slug, exclude: p.ref, limit: 12 }),
  ]);
  const on = saved.has(p.ref);
  const self = `/ideas/photo/${p.ref}`;
  const title = p.caption || p.topic_name;
  return (
    <Container>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'ImageObject',
            contentUrl: p.url,
            name: title,
            ...(p.vendor_name ? { creator: { '@type': 'LocalBusiness', name: p.vendor_name } } : {}),
          },
          breadcrumbLd([
            { name: 'Ideas', path: '/ideas' },
            { name: p.topic_name, path: `/ideas/${p.topic_slug}` },
            { name: title, path: self },
          ]),
        ]}
      />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--color-muted)]">
        <Link href="/ideas">Ideas</Link> / <Link href={`/ideas/${p.topic_slug}`}>{p.topic_name}</Link>
      </nav>
      <Notice error={sp(q.error)} ok={sp(q.ok)} />
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-[18px] bg-[var(--color-tint)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={title} className="mx-auto max-h-[78vh] w-auto" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          {p.city_name ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-[var(--color-muted)]">
              <IconPin size={14} />
              {p.city_name}
            </p>
          ) : null}
          {p.rw_slug ? (
            <p className="mt-3 text-sm">
              From the real wedding of{' '}
              <Link className="font-semibold underline underline-offset-4" href={`/real-weddings/${p.rw_slug}`}>
                {p.rw_names}
              </Link>
            </p>
          ) : null}
          <form action={saveItemAction} className="mt-4">
            <input type="hidden" name="kind" value="photo" />
            <input type="hidden" name="ref" value={p.ref} />
            <input type="hidden" name="_back" value={self} />
            <button className={`btn btn-ghost w-full ${on ? 'text-[var(--color-pink)]' : ''}`} aria-pressed={on}>
              <IconHeart size={18} filled={on} />
              {on ? 'Saved to your wedding wall' : 'Save to wedding wall'}
            </button>
          </form>
          {p.vendor_slug ? (
            <div className="mt-4 rounded-[14px] border border-[var(--color-line)] p-4">
              <p className="text-sm text-[var(--color-muted)]">{p.category_name}</p>
              <Link href={`/v/${p.vendor_slug}`} className="text-lg font-semibold hover:text-[var(--color-pink-deep)]">
                {p.vendor_name}
              </Link>
              <div className="mt-3 flex gap-2">
                <Link href={`/enquire?vendor=${p.vendor_slug}`} className="btn btn-pink btn-sm">
                  Request a quote
                </Link>
                <Link href={`/v/${p.vendor_slug}`} className="btn btn-ghost btn-sm">
                  View profile
                </Link>
              </div>
            </div>
          ) : null}
          {p.tags.length ? (
            <p className="mt-4 flex flex-wrap gap-2">
              {p.tags.map((t) => (
                <Link key={t} href={`/ideas/${p.topic_slug}?tag=${t}`} className="chip">
                  {t.replace(/-/g, ' ')}
                </Link>
              ))}
            </p>
          ) : null}
          {staff ? (
            <form action={opsHideIdea} className="mt-6">
              <input type="hidden" name="ref" value={p.ref} />
              <input type="hidden" name="hide" value="1" />
              <input type="hidden" name="_back" value={`/ideas/${p.topic_slug}`} />
              <button className="btn btn-ghost btn-sm">Hide from the gallery</button>
              <p className="hint mt-1">Staff only. The photo stays on the vendor&apos;s profile.</p>
            </form>
          ) : null}
        </div>
      </div>
      {more.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold">More from {p.vendor_name}</h2>
          <IdeaGrid photos={more} saved={saved} backPath={self} />
        </section>
      ) : null}
      {similar.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold">More {p.topic_name.toLowerCase()}</h2>
          <IdeaGrid photos={similar} saved={saved} backPath={self} />
        </section>
      ) : null}
    </Container>
  );
}
