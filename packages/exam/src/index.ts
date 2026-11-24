/**
 * `@epicfeed/exam`: preparazione all'esame (ADR 0014, 0017, 0019). Pacchetti
 * d'esame per lezione e banca degli esercizi per materia, quiz di modulo,
 * esercizi con rubrica, correzione di Claude e colloquio, con i contratti
 * scambiati con server MCP e web app. L'infrastruttura (Drizzle) si importa
 * da `@epicfeed/exam/infrastructure`.
 *
 * @packageDocumentation
 */
export * from './domain/exam.js';
export * from './domain/practice.js';
export * from './domain/correction.js';
export * from './application/study.js';
export * from './application/generation.js';
export * from './application/correction.js';
export * from './contracts/exam.js';
export * from './contracts/correction.js';
