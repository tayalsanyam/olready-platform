import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Footer, Header } from '@/components/Header';
import { siteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'OLReady: verified wedding vendors', template: '%s | OLReady' },
  description:
    'Find verified bridal makeup artists, photographers, decorators, mehendi artists and DJs in Chandigarh, Mohali and Panchkula. Compare quotes in one place.',
  applicationName: 'OLReady',
  openGraph: { siteName: 'OLReady', type: 'website', locale: 'en_IN' },
};

export const viewport: Viewport = { themeColor: '#141414', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen antialiased">
        <Header />
        <main className="pb-6 pt-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
