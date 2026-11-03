import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { collectionBySlug, collectionVendors } from '@/lib/collections';
import { fieldsFor } from '@/lib/catalog';
import { currentProfile } from '@/lib/auth';
import { shortlistedIds } from '@/lib/weddings';
import { breadcrumbLd, itemListLd } from '@/lib/seo';
import { Container, PageTitle } from '@/components/ui';
import { JsonLd, VendorCard } from '@/components/VendorCard';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const c = await collectionBySlug(sql, (await params).slug);
  if (!c || c.status !== 'published') return { title: 'Not found', robots: { index: false } };
  return { title: c.title, description: c.intro.slice(0, 155) || c.title, alternates: { canonical: `/collections/${c.slug}` } };
}

export default async function CollectionPage({ params }: P) {
  const c = await collectionBySlug(sql, (await params).slug);
  if (!c || c.status !== 'published') notFound();
  const [vendors, fields, viewer] = await Promise.all([collectionVendors(sql, c.vendor_ids), c.category_id ? fieldsFor(sql, c.category_id) : Promise.resolve([]), currentProfile()]);
  const hearts = await shortlistedIds(sql, viewer?.role === 'bride' ? viewer.id : null);
  return (
    <Container>
      <JsonLd data={[itemListLd(vendors), breadcrumbLd([{ name: 'Collections', path: `/collections/${c.slug}` }, { name: c.title, path: `/collections/${c.slug}` }])]} />
      <PageTitle
        title={c.title}
        sub={`${vendors.length} hand-picked by the OLReady team${c.city_name ? ` in ${c.city_name}` : ''}.`}
        action={
          <Link href="/enquire" className="btn btn-pink">
            Get verified quotes
          </Link>
        }
      />
      {c.intro ? <p className="mb-6 max-w-[68ch] whitespace-pre-line">{c.intro}</p> : null}
      <ol className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {vendors.map((v, i) => (
          <li key={v.id}>
            <p className="mb-1 text-sm font-semibold text-[var(--color-pink-deep)]">{i + 1}.</p>
            <VendorCard v={v} fields={fields} backPath={`/collections/${c.slug}`} shortlisted={hearts.has(v.id)} />
          </li>
        ))}
      </ol>
    </Container>
  );
}
