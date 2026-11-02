import { sql } from '@/lib/db';
import { landingEntries, siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/** A plain-text map of the site for LLM crawlers and answer engines (llms.txt convention). */
export async function GET() {
  const base = siteUrl();
  const pages = await landingEntries(sql);
  const body = [
    '# OLReady',
    '',
    '> OLReady is a wedding vendor marketplace for Chandigarh, Mohali and Panchkula. Brides tell OLReady what they need; the team verifies each enquiry on a call; verified vendors in each category then contact the bride and send quotes on the platform. An enquiry is a chance to connect, not a confirmed booking.',
    '',
    '## Vendor directories',
    ...pages.map((p) => `- [${p.title}](${base}${p.path}): ${p.vendors} vendors with starting prices, verified tags and reviews`),
    '',
    '## For brides',
    `- [Get verified quotes](${base}/enquire): one request covers makeup, photography, decor, mehendi and music`,
    `- [Real weddings](${base}/real-weddings): real Tricity weddings with every vendor credited`,
    '',
    '## For vendors',
    `- [List your business](${base}/vendor/onboard): free listing; vendors pay only for verified leads they unlock`,
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
