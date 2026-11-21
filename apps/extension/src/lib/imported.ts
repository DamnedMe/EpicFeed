/**
 * Memoria locale delle lezioni già importate da questo browser, per saltarle
 * negli import di capitolo e corso (meno traffico verso il portale e ripresa
 * di un import interrotto). È solo un aiuto: l'import resta idempotente sul
 * server, e "Importa la lezione" reimporta sempre.
 */

/** Chiave in `storage.local`. */
export const IMPORTED_KEY = 'importedLessons';

/** Lezioni ricordate al massimo (le più vecchie si dimenticano). */
const MAX_ENTRIES = 3000;

/** Id dell'attività → data dell'ultimo import (ISO 8601). */
export type ImportedLessons = Record<string, string>;

/**
 * Legge la memoria in modo tollerante (dati mancanti o corrotti = vuota).
 *
 * @param value - Valore letto dallo storage.
 * @returns Le lezioni ricordate.
 */
export function readImported(value: unknown): ImportedLessons {
  if (typeof value !== 'object' || value === null) return {};
  const out: ImportedLessons = {};
  for (const [id, date] of Object.entries(value)) {
    if (/^\d{1,12}$/.test(id) && typeof date === 'string') out[id] = date;
  }
  return out;
}

/**
 * Aggiunge una lezione alla memoria, tenendo solo le più recenti.
 *
 * @param current - Memoria attuale.
 * @param activityId - Lezione importata.
 * @param at - Data dell'import.
 * @returns La memoria aggiornata.
 */
export function withImported(
  current: ImportedLessons,
  activityId: string,
  at: Date,
): ImportedLessons {
  const entries = Object.entries({ ...current, [activityId]: at.toISOString() })
    .sort(([, a], [, b]) => a.localeCompare(b))
    .slice(-MAX_ENTRIES);
  return Object.fromEntries(entries);
}
