import type { MetadataRoute } from 'next';
import { sql } from '@/lib/db';
import { landingEntries, siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [landing, vendors, weddings] = await Promise.all([
    landingEntries(sql),
    sql<{ slug: string; updated_at: Date }[]>`select slug, updated_at from mkt.vendors where status = 'live'`,
    sql<{ slug: string; published_at: Date }[]>`select slug, published_at from mkt.real_weddings where status = 'published'`,
  ]);
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/vendors`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/real-weddings`, changeFrequency: 'weekly', priority: 0.6 },
    ...landing.map((l) => ({ url: base + l.path, changeFrequency: 'daily' as const, priority: l.path.split('/').length > 4 ? 0.6 : 0.8 })),
    ...vendors.map((v) => ({ url: `${base}/v/${v.slug}`, lastModified: v.updated_at, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...weddings.map((w) => ({ url: `${base}/real-weddings/${w.slug}`, lastModified: w.published_at, priority: 0.5 })),
  ];
}
