/**
 * Conteggio delle richieste del giorno, mostrato in *Io › Assistente*: aiuta
 * a restare nei limiti gratuiti di Gemini e a tenere d'occhio i costi.
 */

/** Richieste fatte in un giorno (data locale `AAAA-MM-GG`). */
export interface DailyUsage {
  readonly day: string;
  readonly count: number;
}

/**
 * Data locale del giorno, nel formato `AAAA-MM-GG`.
 *
 * @param now - Adesso.
 * @returns La data.
 */
export function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/**
 * Richieste di oggi.
 *
 * @param usage - Conteggio salvato.
 * @param now - Adesso.
 * @returns Il numero (0 se il conteggio è di un altro giorno).
 */
export function requestsToday(usage: DailyUsage | null, now: Date): number {
  return usage?.day === localDay(now) ? usage.count : 0;
}

/**
 * Aggiunge una richiesta al conteggio.
 *
 * @param usage - Conteggio salvato.
 * @param now - Adesso.
 * @returns Il nuovo conteggio (ricomincia a ogni giorno).
 */
export function addRequest(usage: DailyUsage | null, now: Date): DailyUsage {
  return { day: localDay(now), count: requestsToday(usage, now) + 1 };
}
