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

/**
 * Vecchi indirizzi italiani delle pagine → nuovi indirizzi in inglese (ADR 0019).
 * Permanenti, così link salvati, PWA installata e vecchie versioni
 * dell'estensione continuano a funzionare. La query resta (es. `?code=` del login).
 */
const legacyPages: [string, string][] = [
  ['/accedi/:path*', '/login/:path*'],
  ['/io/salvati', '/profile/saved'],
  ['/io', '/profile'],
  ['/ripasso', '/review'],
  ['/lezioni', '/lessons'],
  ['/estensione', '/extension'],
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // I pacchetti del monorepo sono già compilati in `dist/`: nessuna trascrizione.
  serverExternalPackages: ['postgres'],
  redirects() {
    return Promise.resolve(
      legacyPages.map(([source, destination]) => ({ source, destination, permanent: true })),
    );
  },
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      // Pyodide (M4): la versione è nel percorso, quindi i file non cambiano mai.
      {
        source: '/pyodide/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Worker dei test Python: niente rete se non verso l'app (da cui scarica
      // Pyodide) e WebAssembly permesso solo qui, non nelle pagine.
      {
        source: '/python-worker.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, max-age=0' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
          },
        ],
      },
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
