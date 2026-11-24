/**
 * `@epicfeed/shared`: il nucleo condiviso da tutte le funzioni (ADR 0019).
 * Contiene solo ciò che ogni funzione usa: errori di dominio, id tipizzati e
 * regole sul testo. Nessuna logica di una funzione specifica.
 *
 * @packageDocumentation
 */
export * from './errors.js';
export * from './ids.js';
export * from './text.js';
