import { Suspense } from 'react';
import { Feel } from '@/components/Feel';
import { TableLabels } from '@/components/TableLabels';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Footer, Header } from '@/components/Header';
import { siteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'OLReady: verified wedding vendors', template: '%s | OLReady' },
  description:
    'Find verified wedding venues, caterers, makeup artists, photographers, decorators, mehendi artists and more in towns across India. Every request is checked on a call; compare quotes in one place.',
  applicationName: 'OLReady',
  openGraph: { siteName: 'OLReady', type: 'website', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
  // Search Console and Bing Webmaster ownership tags, set per deployment.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = { themeColor: '#ffffff', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Same typefaces as the sales site. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Cormorant+Garamond:wght@500;600&family=Great+Vibes&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">
        <Header />
        <main className="pb-6 pt-6">{children}</main>
        <Footer />
        <TableLabels />
        <Suspense fallback={null}>
          <Feel />
        </Suspense>
      </body>
    </html>
  );
}
