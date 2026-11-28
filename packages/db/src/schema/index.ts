/**
 * Schema Postgres di EpicFeed (Supabase, regione UE), un file per funzione:
 * `catalog`, `access`, `feed`, `exam`, `review`, `assistant` (ADR 0019). Le migrazioni
 * restano una sola sequenza in `migrations/`.
 *
 * Sicurezza (architettura §8):
 * - RLS attiva su ogni tabella fin dal primo giorno;
 * - gli studenti (`authenticated`) possono solo **leggere**, e solo ciò che
 *   hanno importato dal proprio account; nessuna policy di scrittura, quindi
 *   insert/update/delete dal client sono sempre negati;
 * - le scritture le fa solo l'API sul server (import, generazione), dopo aver
 *   validato i dati e verificato la prova di possesso;
 * - `anon` (utente non autenticato) non vede nulla.
 */
export * from './catalog.js';
export * from './access.js';
export * from './feed.js';
export * from './exam.js';
export * from './review.js';
export * from './assistant.js';
