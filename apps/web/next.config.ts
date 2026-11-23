import type { NextConfig } from 'next';

/**
 * Configurazione di Next.js.
 *
 * Gli header di sicurezza fissi stanno qui; la Content Security Policy, che
 * ha bisogno di un nonce diverso a ogni richiesta, la imposta `src/proxy.ts`.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // I pacchetti del monorepo sono già compilati in `dist/`: nessuna trascrizione.
  serverExternalPackages: ['postgres'],
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      // Il service worker va sempre ricontrollato, altrimenti un aggiornamento arriverebbe in ritardo.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, max-age=0' },
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
        ],
      },
    ]);
  },
};

export default config;
