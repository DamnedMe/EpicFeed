import type { AnswerSource, ReviewGrade } from '@study-feed/core';
import { recordAnswer, systemClock } from '@study-feed/core';
import { notifyProgress, progressStore } from './progress-store';

/** Risposta da portare nel ripasso. */
export interface AnswerToRecord {
  readonly subjectId: string;
  readonly conceptKey: string;
  readonly questionId: string | null;
  readonly source: AnswerSource;
  readonly grade: ReviewGrade;
  readonly language: 'it' | 'en';
}

/**
 * Porta una risposta nel ripasso del concetto (M4, ADR 0017). Non blocca mai
 * lo studio: se IndexedDB manca o una scrittura fallisce, la risposta resta
 * solo nella sessione.
 *
 * @param answer - Risposta data.
 * @returns `true` se registrata.
 */
export async function recordStudyAnswer(answer: AnswerToRecord): Promise<boolean> {
  try {
    const store = await progressStore();
    if (!store) return false;
    await recordAnswer(store, systemClock, answer);
    notifyProgress();
    return true;
  } catch {
    return false;
  }
}
