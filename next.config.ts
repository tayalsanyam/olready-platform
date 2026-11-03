import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The dev badge sits over phone-width buttons and screenshots; it never ships.
  devIndicators: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
    ];
    return [
      // Everything except the review widget refuses to be framed by other sites.
      { source: '/((?!widget/).*)', headers: [...common, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      { source: '/widget/:slug', headers: common },
    ];
  },
  experimental: {
    // Photos are shrunk in the browser before upload; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
