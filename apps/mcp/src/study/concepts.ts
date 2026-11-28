import type { AnswerRecord, ConceptReviewState, ReviewConcept } from '@epicfeed/review';
import {
  conceptId,
  isDue,
  recallProbability,
  replayAnswers,
  summarizeReview,
} from '@epicfeed/review';
import type { SubjectFeed } from './library.js';

/**
 * Concetti di una materia e concetti deboli dello studente (M6, ADR 0021).
 * Funzioni pure: lo storico arriva già decifrato, il feed dalla libreria.
 *
 * L'elenco dei deboli usa le stesse regole del Ripasso dell'app
 * (`summarizeReview`: almeno un errore e non ancora stabile, dal più
 * sbagliato), così Claude e l'app dicono la stessa cosa.
 */

type Bilingual = { readonly it: string; readonly en: string };

/** Concetto della materia, con dove compare. */
export interface StudyConcept extends ReviewConcept {
  readonly subjectId: string;
  readonly subjectTitle: string;
  readonly name: Bilingual;
  readonly description: Bilingual;
  readonly chapterTitle: string;
  readonly lessonId: string;
  readonly lessonTitle: string;
}

/** Concetto debole con i numeri del ripasso. */
export interface WeakConcept {
  readonly concept: StudyConcept;
  readonly state: ConceptReviewState;
  /** Probabilità stimata di ricordarlo adesso (0–1). */
  readonly recall: number;
  readonly due: boolean;
}

/** Riepilogo dei progressi di una materia. */
export interface SubjectProgress {
  readonly subjectId: string;
  readonly subjectTitle: string;
  readonly concepts: number;
  readonly seen: number;
  readonly due: number;
  readonly weak: readonly WeakConcept[];
}

/**
 * Concetti di una materia, uno per chiave: nome e descrizione vengono dalla
 * prima lezione in cui compaiono, come nel Ripasso dell'app.
 *
 * @param feed - Materia scaricata.
 * @returns I concetti, nell'ordine dei moduli.
 */
export function subjectConcepts(feed: SubjectFeed): StudyConcept[] {
  const concepts = new Map<string, StudyConcept>();
  feed.chapters.forEach((chapter, chapterIndex) => {
    for (const lesson of chapter.lessons) {
      for (const concept of lesson.feed?.concepts ?? []) {
        const id = conceptId(feed.subjectId, concept.key);
        if (concepts.has(id)) continue;
        concepts.set(id, {
          id,
          key: concept.key,
          chapterIndex,
          subjectId: feed.subjectId,
          subjectTitle: feed.title,
          name: concept.name,
          description: concept.description,
          chapterTitle: chapter.title,
          lessonId: lesson.lessonId,
          lessonTitle: lesson.title,
        });
      }
    }
  });
  return [...concepts.values()];
}

/**
 * Progressi e concetti deboli di una materia.
 *
 * @param feed - Materia scaricata.
 * @param answers - Storico delle risposte (tutte le materie).
 * @param now - Adesso.
 * @param limit - Quanti concetti deboli elencare.
 * @returns Il riepilogo.
 */
export function subjectProgress(
  feed: SubjectFeed,
  answers: readonly AnswerRecord[],
  now: Date,
  limit = 8,
): SubjectProgress {
  const concepts = subjectConcepts(feed);
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const states = replayAnswers(answers.filter((answer) => byId.has(answer.conceptId)));
  const summary = summarizeReview(concepts, states, now, limit);
  return {
    subjectId: feed.subjectId,
    subjectTitle: feed.title,
    concepts: concepts.length,
    seen: states.length,
    due: summary.due,
    weak: summary.weak.flatMap((state) => {
      const concept = byId.get(state.conceptId);
      return concept
        ? [{ concept, state, recall: recallProbability(state, now), due: isDue(state, now) }]
        : [];
    }),
  };
}
