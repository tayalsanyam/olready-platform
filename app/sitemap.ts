import type { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { costEntries } from '@/lib/costGuide';
import { landingEntries, siteUrl } from '@/lib/seo';
import { ideaPhotos, ideaTopics } from '@/lib/ideas';
import { inviteDesigns } from '@/lib/invites';
import { SECTIONS, publishedArticles } from '@/lib/articles';
import { publishedCollections } from '@/lib/collections';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [landing, vendors, weddings, topics, designs, articles, collections, costs, photos] = await Promise.all([
    landingEntries(sql),
    sql<{ slug: string; updated_at: Date; images: string[] }[]>`
      select v.slug, v.updated_at,
        array_remove(array_prepend(v.cover_image_url, array(select m.url from mkt.vendor_media m where m.vendor_id = v.id order by m.sort, m.created_at limit 8)), null) as images
      from mkt.vendors v where v.status = 'live'`,
    sql<{ slug: string; published_at: Date }[]>`select slug, published_at from mkt.real_weddings where status = 'published'`,
    ideaTopics(sql),
    inviteDesigns(sql),
    publishedArticles(sql, { limit: 5000 }),
    publishedCollections(sql),
    costEntries(sql),
    ideaPhotos(sql, { limit: 5000 }),
  ]);
  const abs = (u: string) => (u.startsWith('http') ? u : `${base}${u}`);
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/vendors`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/for-vendors`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/directory`, changeFrequency: 'weekly', priority: 0.5 },
    ...costs.map((c) => ({ url: base + c.path, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...photos.map((p) => ({ url: `${base}/ideas/photo/${p.ref}`, lastModified: p.created_at, changeFrequency: 'monthly' as const, priority: 0.4, images: [abs(p.url)] })),
    ...['about', 'contact', 'terms', 'privacy', 'refunds'].map((p) => ({ url: `${base}/${p}`, changeFrequency: 'monthly' as const, priority: 0.3 })),
    { url: `${base}/real-weddings`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/ideas`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/invitations`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/blog`, changeFrequency: 'daily', priority: 0.6 },
    ...collections.map((c) => ({ url: `${base}/collections/${c.slug}`, lastModified: c.updated_at, changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...Object.keys(SECTIONS).map((k) => ({ url: `${base}/blog/section/${k}`, changeFrequency: 'weekly' as const, priority: 0.4 })),
    ...articles.map((a) => ({ url: `${base}/blog/${a.slug}`, lastModified: a.updated_at, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ...designs.map((d) => ({ url: `${base}/invitations/${d.code}`, changeFrequency: 'monthly' as const, priority: 0.4 })),
    ...topics.filter((t) => t.photo_count > 0).map((t) => ({ url: `${base}/ideas/${t.slug}`, changeFrequency: 'daily' as const, priority: 0.6 })),
    ...landing.map((l) => ({ url: base + l.path, changeFrequency: 'daily' as const, priority: l.path.split('/').length > 4 ? 0.6 : 0.8 })),
    ...vendors.map((v) => ({ url: `${base}/v/${v.slug}`, lastModified: v.updated_at, changeFrequency: 'weekly' as const, priority: 0.7, images: v.images.map(abs) })),
    ...weddings.map((w) => ({ url: `${base}/real-weddings/${w.slug}`, lastModified: w.published_at, priority: 0.5 })),
  ];
}
