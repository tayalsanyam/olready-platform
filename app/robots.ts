import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

/**
 * Crawlers match Disallow rules as path prefixes, so "/vendor" would also block every
 * "/vendors/..." listing and "/invite" would block "/invitations". Private areas are listed as
 * "/area/" plus an exact "/area$", never as a bare prefix shared with a public page.
 */
export const PRIVATE_PATHS = [
  '/me$', '/me/', '/vendor$', '/vendor/', '/ops$', '/ops/', '/api/', '/login', '/dev-login', '/mfa', '/rsvp/', '/invite/', '/claim/',
  '/enquire/thanks', '/pay/', '/receipt/', '/invoices/', '/go/', '/review/', '/unsubscribe/', '/widget/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
