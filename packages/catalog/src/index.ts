/**
 * `@epicfeed/catalog`: corsi, materie, capitoli, lezioni e parti; contenuti
 * con forma canonica, impronta e versioni; permessi con prova di possesso;
 * sottotitoli (ADR 0002, 0006, 0019). L'infrastruttura (Drizzle) si importa da
 * `@epicfeed/catalog/infrastructure`, solo lato server.
 *
 * @packageDocumentation
 */
export * from './domain/catalog.js';
export * from './domain/content.js';
export * from './domain/content-hash.js';
export * from './domain/content-version.js';
export * from './domain/entitlement.js';
export * from './domain/subtitles.js';
export * from './application/ports.js';
export * from './application/possession-proof-verifier.js';
export * from './contracts/content.js';
