/**
 * `@epicfeed/feed`: il feed di studio (ADR 0011, 0013, 0015, 0019). Regole
 * delle schede a battute e delle domande, allineamento ai minuti dei video,
 * sessioni da 5 minuti, casi d'uso di generazione (Claude Desktop via MCP),
 * slide e feed per materia, contratti scambiati con server MCP e web app.
 * L'infrastruttura (Drizzle) si importa da `@epicfeed/feed/infrastructure`.
 *
 * @packageDocumentation
 */
export * from './domain/alignment.js';
export * from './domain/feed.js';
export * from './domain/slides.js';
export * from './domain/story.js';
export * from './domain/study-session.js';
export * from './application/generation.js';
export * from './application/slides.js';
export * from './application/study-feed.js';
export * from './contracts/feed.js';
export * from './contracts/generation.js';
export * from './contracts/schema-helpers.js';
