import type { RubricCriterion } from './exam.js';

/**
 * Regole pure della sezione Esame (M4, ADR 0014 e 0017): composizione del
 * quiz di modulo, punteggio dell'autovalutazione con la griglia e risultato
 * dei test del codice. Niente I/O: le schermate e i test le usano così come sono.
 */

/** Domande del quiz di modulo, come l'autovalutazione ufficiale di fine modulo. */
export const MODULE_QUIZ_SIZE = 50;

/** Durate proposte per il timer facoltativo degli esercizi, in minuti. */
export const EXERCISE_TIMER_MINUTES = [10, 15, 20, 30] as const;

/** Generatore di numeri in [0, 1): `Math.random` nell'app, uno fisso nei test. */
export type RandomSource = () => number;

/**
 * Estrae fino a `size` elementi in ordine casuale (Fisher–Yates parziale),
 * senza ripetizioni e senza modificare l'elenco ricevuto.
 *
 * @param items - Elementi tra cui scegliere.
 * @param size - Quanti estrarne; se sono meno, si prendono tutti mescolati.
 * @param random - Generatore casuale.
 * @returns Gli elementi estratti.
 */
export function drawRandom<T>(items: readonly T[], size: number, random: RandomSource): T[] {
  const pool = [...items];
  const count = Math.max(0, Math.min(Math.floor(size), pool.length));
  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(random() * (pool.length - i));
    const picked = pool[j] as T;
    pool[j] = pool[i] as T;
    pool[i] = picked;
  }
  return pool.slice(0, count);
}

/**
 * Punteggio dell'autovalutazione: punti assegnati sul totale della griglia.
 * Ogni voce si limita ai punti del suo criterio; le voci mancanti valgono 0.
 *
 * @param rubric - Criteri della griglia.
 * @param awarded - Punti assegnati, nello stesso ordine dei criteri.
 * @returns Il punteggio tra 0 e 1 (0 se la griglia è vuota).
 */
export function rubricScore(
  rubric: readonly RubricCriterion[],
  awarded: readonly number[],
): number {
  let total = 0;
  let earned = 0;
  rubric.forEach((criterion, index) => {
    total += criterion.points;
    const value = awarded[index] ?? 0;
    earned += Number.isFinite(value) ? Math.min(Math.max(value, 0), criterion.points) : 0;
  });
  return total > 0 ? earned / total : 0;
}

/** Esito di un test del codice, come lo restituisce l'esecuzione nel browser. */
export interface CodeTestOutcome {
  /** Espressione eseguita. */
  readonly call: string;
  /** Risultato atteso (come lo stampa `repr()`). */
  readonly expected: string;
  /** Risultato ottenuto (`repr()`), oppure `null` se la chiamata ha dato errore. */
  readonly actual: string | null;
  /** Ultima riga dell'errore Python, se c'è stato. */
  readonly error: string | null;
}

/**
 * Un test passa se la chiamata non dà errore e il suo `repr()` coincide con
 * quello atteso (spazi iniziali e finali esclusi).
 *
 * @param outcome - Esito del test.
 * @returns `true` se passa.
 */
export function testPassed(outcome: CodeTestOutcome): boolean {
  return outcome.error === null && outcome.actual?.trim() === outcome.expected.trim();
}
