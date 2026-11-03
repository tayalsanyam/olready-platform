import { sql } from '@/lib/db';
import { landingEntries, siteUrl } from '@/lib/seo';
import { costEntries } from '@/lib/costGuide';
import { publishedArticles } from '@/lib/articles';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/** A plain-text map of the site for LLM crawlers and answer engines (llms.txt convention). */
export async function GET() {
  const base = siteUrl();
  const [pages, costs, articles] = await Promise.all([landingEntries(sql), costEntries(sql), publishedArticles(sql, { limit: 60 })]);
  const body = [
    '# OLReady',
    '',
    '> OLReady is a wedding vendor marketplace for Chandigarh, Mohali and Panchkula. Brides tell OLReady what they need; the team verifies each enquiry on a call; verified vendors in each category then contact the bride and send quotes on the platform. An enquiry is a chance to connect, not a confirmed booking.',
    '',
    '## Vendor directories',
    ...pages.map((p) => `- [${p.title}](${base}${p.path}): ${p.vendors} vendors with starting prices, verified tags and reviews`),
    '',
    '## Price guides',
    '> Starting prices from live OLReady listings, and the middle of real quotes sent on OLReady in the last year where there are enough.',
    ...costs.map((c) => `- [${c.title}](${base}${c.path})`),
    '',
    '## Planning guides',
    ...articles.slice(0, 60).map((a) => `- [${a.title}](${base}/blog/${a.slug})`),
    '',
    '## For brides',
    `- [Wedding ideas](${base}/ideas): photos from Tricity vendors' real work, by topic`,
    `- [Every page](${base}/directory): all towns, categories, price guides and guides in one place`,
    `- [Get verified quotes](${base}/enquire): one request covers makeup, photography, decor, mehendi and music`,
    `- [Real weddings](${base}/real-weddings): real Tricity weddings with every vendor credited`,
    '- A request can list several functions (for example Mehendi, Sangeet, Wedding and Reception) with a date and guest count for each, and say which functions each vendor is needed for. Vendors can price each function separately.',
    '',
    '## For vendors',
    `- [List your business](${base}/for-vendors): free listing; vendors pay only for verified leads they unlock`,
    '',
    '## Policies',
    `- [Terms of use](${base}/terms)`,
    `- [Privacy policy](${base}/privacy)`,
    `- [Refunds and cancellations](${base}/refunds)`,
    `- [Contact](${base}/contact)`,
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
