import type { MetadataRoute } from 'next';

/** Lets a bride or vendor add Olready to the phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Olready: verified wedding vendors',
    short_name: 'Olready',
    description: 'Find verified wedding vendors, compare quotes and plan your wedding in one place.',
    start_url: '/?from=app',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'en-IN',
    icons: [
      { src: '/brand/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My wedding', url: '/me' },
      { name: 'Vendor dashboard', url: '/vendor' },
      { name: 'Get quotes', url: '/enquire' },
    ],
  };
}
