import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  experimental: {
    // Photos are shrunk in the browser before upload; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
