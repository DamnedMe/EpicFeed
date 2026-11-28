/**
 * Porta pubblica di `@epicfeed/assistant`: assistente di studio nell'app con
 * la chiave API dello studente (M6, ADR 0021, scelta 0) e domande in coda
 * per Claude Desktop (scelta 1).
 */
export * from './domain/providers.js';
export * from './domain/conversation.js';
export * from './domain/usage.js';
export * from './domain/questions.js';
export * from './application/questions.js';
export * from './contracts/providers.js';
export * from './contracts/questions.js';
