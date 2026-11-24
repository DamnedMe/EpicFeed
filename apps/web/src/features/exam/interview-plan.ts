import type { RandomSource } from '@epicfeed/core';
import { drawRandom } from '@epicfeed/core';
import type { ExamExerciseItem } from './catalog';

/**
 * Domande della simulazione del colloquio (ADR 0014 §7): durata e scelta
 * delle domande, coprendo concetti diversi.
 */

/** Durata della simulazione, in minuti (quella dell'esame del corso). */
export const INTERVIEW_MINUTES = 20;

/** Domande per simulazione. */
export const INTERVIEW_QUESTIONS = 4;

/** Esercizi di codice al massimo per simulazione: al colloquio sono brevi e rari. */
export const INTERVIEW_MAX_CODE = 1;

/**
 * Sceglie le domande del colloquio: a caso, un concetto principale diverso
 * per domanda e al massimo {@link INTERVIEW_MAX_CODE} esercizio di codice; se
 * i concetti non bastano, completa con le altre domande.
 *
 * @param exercises - Esercizi della materia (banca e lezioni).
 * @param random - Generatore di numeri casuali.
 * @param count - Quante domande.
 * @returns Le domande, nell'ordine in cui si fanno.
 */
export function pickInterviewQuestions(
  exercises: readonly ExamExerciseItem[],
  random: RandomSource,
  count = INTERVIEW_QUESTIONS,
): ExamExerciseItem[] {
  const shuffled = drawRandom(exercises, exercises.length, random);
  const picked: ExamExerciseItem[] = [];
  const concepts = new Set<string>();
  let code = 0;
  const allowed = (exercise: ExamExerciseItem) =>
    exercise.kind !== 'code' || code < INTERVIEW_MAX_CODE;
  const take = (exercise: ExamExerciseItem) => {
    picked.push(exercise);
    if (exercise.kind === 'code') code += 1;
    for (const key of exercise.conceptKeys) concepts.add(key);
  };
  for (const exercise of shuffled) {
    if (picked.length >= count) break;
    const main = exercise.conceptKeys[0];
    if (allowed(exercise) && (main === undefined || !concepts.has(main))) take(exercise);
  }
  for (const exercise of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(exercise) && allowed(exercise)) take(exercise);
  }
  return picked;
}
