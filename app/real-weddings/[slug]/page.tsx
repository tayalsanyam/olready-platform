import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { realWeddingBySlug } from '@/lib/realWeddings';
import { breadcrumbLd, siteUrl } from '@/lib/seo';
import { Container, Cover } from '@/components/ui';
import { JsonLd } from '@/components/VendorCard';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const rw = await realWeddingBySlug(sql, (await params).slug);
  if (!rw) return { title: 'Not found', robots: { index: false } };
  return {
    title: `${rw.couple_names}: ${rw.title}`,
    description: rw.story.slice(0, 160) || `${rw.couple_names}'s wedding${rw.city_name ? ` in ${rw.city_name}` : ''}, with the vendors who made it happen.`,
    alternates: { canonical: `/real-weddings/${rw.slug}` },
    openGraph: rw.cover_image_url ? { images: [rw.cover_image_url] } : undefined,
  };
}

export default async function RealWeddingPage({ params }: P) {
  const rw = await realWeddingBySlug(sql, (await params).slug);
  if (!rw) notFound();
  return (
    <Container className="max-w-4xl">
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: `${rw.couple_names}: ${rw.title}`,
            datePublished: rw.published_at?.toISOString(),
            url: `${siteUrl()}/real-weddings/${rw.slug}`,
            ...(rw.cover_image_url ? { image: rw.cover_image_url } : {}),
            mentions: rw.vendors.map((v) => ({ '@type': 'LocalBusiness', name: v.business_name, url: `${siteUrl()}/v/${v.slug}` })),
          },
          breadcrumbLd([
            { name: 'Real weddings', path: '/real-weddings' },
            { name: rw.couple_names, path: `/real-weddings/${rw.slug}` },
          ]),
        ]}
      />
      <p className="text-sm text-[var(--color-muted)]">
        <Link href="/real-weddings">Real weddings</Link>
        {rw.city_name ? ` · ${rw.city_name}` : ''}
        {rw.wedding_date ? ` · ${rw.wedding_date}` : ''}
      </p>
      <h1 className="mt-1 font-semibold text-3xl">{rw.couple_names}</h1>
      <p className="text-lg text-[var(--color-muted)]">{rw.title}</p>
      <div className="card mt-5 aspect-[16/9] overflow-hidden">
        <Cover url={rw.cover_image_url} name={rw.couple_names} />
      </div>
      {rw.story ? <p className="mt-6 whitespace-pre-line text-lg leading-relaxed">{rw.story}</p> : null}
      {rw.photos.length ? (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rw.photos.map((ph) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={ph.id} src={ph.url} alt={ph.caption || rw.couple_names} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
          ))}
        </div>
      ) : null}
      {rw.vendors.length ? (
        <section className="mt-8">
          <h2 className="font-semibold text-xl">The team behind it</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {rw.vendors.map((v) => (
              <li key={v.id}>
                <Link href={`/v/${v.slug}`} className="card flex items-center justify-between p-3 hover:shadow-md">
                  <span className="font-semibold">{v.business_name}</span>
                  <span className="text-sm text-[var(--color-muted)]">{v.category_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}
