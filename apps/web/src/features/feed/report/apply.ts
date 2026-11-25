import type { CorrectionOutcome, StoredCorrection } from '@epicfeed/feed';
import { applyCorrections } from '@epicfeed/feed';
import type { SubjectFeed } from '../model';

/**
 * Applica le correzioni dello studente alla materia scaricata, sul
 * dispositivo (ADR 0020, scelta 4). La copia del feed salvata non cambia:
 * si corregge solo ciò che si disegna.
 */

/** Materia corretta, con gli esiti per correzione e gli elementi toccati. */
export interface CorrectedSubject {
  readonly feed: SubjectFeed;
  /** Esito di ogni correzione di lezione presente nella materia. */
  readonly outcomes: ReadonlyMap<string, CorrectionOutcome>;
  /** Elementi corretti, come `lessonId:itemId` (segno *Corretta da te*). */
  readonly corrected: ReadonlySet<string>;
}

/**
 * Chiave di un elemento corretto.
 *
 * @param lessonId - Lezione.
 * @param itemId - Id della scheda o della domanda nel feed.
 * @returns La chiave usata in {@link CorrectedSubject.corrected}.
 */
export function correctedKey(lessonId: string, itemId: string): string {
  return `${lessonId}:${itemId}`;
}

/**
 * Applica le correzioni della materia a ogni lezione con un feed. Se non ci
 * sono correzioni per la materia restituisce lo stesso oggetto, così il feed
 * non si ricalcola.
 *
 * @param feed - Materia scaricata.
 * @param corrections - Correzioni dello studente (di tutte le materie).
 * @returns La materia corretta.
 */
export function correctSubject(
  feed: SubjectFeed,
  corrections: readonly StoredCorrection[],
): CorrectedSubject {
  const own = corrections.filter((c) => c.subjectId === feed.subjectId);
  const outcomes = new Map<string, CorrectionOutcome>();
  const corrected = new Set<string>();
  if (own.length === 0) return { feed, outcomes, corrected };
  const chapters = feed.chapters.map((chapter) => ({
    ...chapter,
    lessons: chapter.lessons.map((lesson) => {
      if (!lesson.feed) return lesson;
      const result = applyCorrections(lesson.feed, lesson.lessonId, own);
      for (const [id, outcome] of result.outcomes) outcomes.set(id, outcome);
      for (const id of result.correctedItems) corrected.add(correctedKey(lesson.lessonId, id));
      return { ...lesson, feed: result.feed };
    }),
  }));
  return { feed: { ...feed, chapters }, outcomes, corrected };
}
