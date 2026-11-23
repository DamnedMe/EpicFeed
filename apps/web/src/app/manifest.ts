import type { MetadataRoute } from 'next';

/**
 * Manifest della PWA (ADR 0015, punto 6): EpicFeed si installa sulla
 * schermata Home e si apre a tutto schermo sul feed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EpicFeed',
    short_name: 'EpicFeed',
    description: 'Le lezioni Epicode trasformate in schede, quiz e ripasso.',
    lang: 'it',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0B0E',
    theme_color: '#0B0B0E',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
