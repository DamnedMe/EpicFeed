/* global self, caches */
/*
 * Service worker di EpicFeed (M3, ADR 0015 punto 6). Scritto a mano, senza
 * dipendenze: tiene la cornice dell'app per aprirla anche senza rete. La
 * materia non passa da qui: il feed la conserva in localStorage e la
 * rivaluta con l'ETag (`feed-client.ts`).
 *
 * Strategie:
 * - file di `/_next/static/` (JS, CSS, font): hanno l'impronta nel nome e non
 *   cambiano mai, quindi prima la cache, poi la rete;
 * - pagine del feed (`/`): prima la rete, e la copia in cache solo se la rete
 *   manca. Una risposta che rimanda all'accesso cancella la copia: dopo
 *   l'uscita il feed non resta aperto offline;
 * - tutto il resto (API, altre pagine, altri siti): non lo tocca.
 */

/** Cambiare la versione svuota le cache vecchie all'attivazione. */
const VERSION = 'v1';
const SHELL_CACHE = `epicfeed-shell-${VERSION}`;
const STATIC_CACHE = `epicfeed-static-${VERSION}`;
/** Pagine conservate per l'uso offline. */
const OFFLINE_PAGES = ['/'];
/** Tetto ai file statici in cache: a ogni deploy cambiano nome, i vecchi si scartano. */
const STATIC_LIMIT = 120;

self.addEventListener('install', () => {
  // La nuova versione prende il posto della vecchia senza aspettare che si chiudano le schede.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith('epicfeed-') && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate' && OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(networkFirstPage(request, url.pathname));
  }
});

/**
 * File statico con impronta: dalla cache se c'è, altrimenti dalla rete
 * (e lo si conserva).
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    await trim(cache, STATIC_LIMIT);
  }
  return response;
}

/**
 * Pagina del feed: dalla rete, con la copia in cache come riserva offline.
 * Si conserva solo una risposta 200 della pagina stessa (non un rimando
 * all'accesso); un rimando cancella la copia.
 *
 * @param {Request} request
 * @param {string} path
 * @returns {Promise<Response>}
 */
async function networkFirstPage(request, path) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected && response.type === 'basic') {
      await cache.put(path, response.clone());
    } else if (response.redirected || response.status === 401 || response.status === 403) {
      await cache.delete(path);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(path);
    if (cached) return cached;
    throw error;
  }
}

/**
 * Tiene al massimo `limit` voci, togliendo le più vecchie.
 *
 * @param {Cache} cache
 * @param {number} limit
 */
async function trim(cache, limit) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}
