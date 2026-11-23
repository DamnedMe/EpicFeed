/**
 * Ordine del feed e punteggio delle sessioni di studio (ADR 0015, punti 2 e 4).
 *
 * Regole pure: la web app le applica ai feed della materia scaricati. Punti e
 * serie restano sul dispositivo (ADR 0003).
 */

/** Lezione come serve all'ordine del feed: schede e domande con i loro concetti. */
export interface SequenceLessonInput {
  readonly lessonId: string;
  readonly cards: readonly { readonly conceptKeys: readonly string[] }[];
  readonly quiz: readonly { readonly conceptKey: string }[];
}

/** Posizione di una domanda nel suo gruppo (per mostrare "1 di 3"). */
export interface QuizBatchPosition {
  /** Posizione nel gruppo, da 1. */
  readonly position: number;
  /** Domande nel gruppo. */
  readonly size: number;
}

/** Elemento del feed: una scheda o una domanda di una lezione, per indice. */
export type SequenceItem =
  | { readonly type: 'card'; readonly lessonId: string; readonly index: number }
  | {
      readonly type: 'quiz';
      readonly lessonId: string;
      readonly index: number;
      readonly batch: QuizBatchPosition;
    };

/** Ogni quante schede arriva un gruppo di domande della stessa lezione. */
export const QUIZ_EVERY = 3;

/** Quante domande, al massimo, in ogni gruppo (scelta di Damian, 23/11/2026). */
export const QUIZ_BATCH = 3;

/**
 * Sceglie la prossima domanda: la prima non usata su un concetto delle schede
 * appena lette, altrimenti la prima non usata su un concetto già letto in
 * questa lezione. Mai una domanda su un concetto che non si è ancora visto.
 */
function nextQuiz(
  quiz: SequenceLessonInput['quiz'],
  used: Set<number>,
  recentConcepts: Set<string>,
  seenConcepts: Set<string>,
): number | null {
  let fallback: number | null = null;
  for (let index = 0; index < quiz.length; index += 1) {
    if (used.has(index)) continue;
    const concept = quiz[index]?.conceptKey ?? '';
    if (recentConcepts.has(concept)) return index;
    if (seenConcepts.has(concept)) fallback ??= index;
  }
  return fallback;
}

/**
 * Costruisce il feed della materia **in ordine** (capitolo, poi lezione, come
 * sul portale): le schede di ogni lezione e, dopo ogni {@link QUIZ_EVERY}
 * schede, un gruppo di al massimo {@link QUIZ_BATCH} domande della stessa
 * lezione sugli argomenti appena letti (prima quelli delle ultime schede, poi
 * gli altri già visti nella lezione). Alla fine della lezione arriva un ultimo
 * gruppo se dopo l'ultimo c'è almeno una scheda. Le domande su concetti mai
 * comparsi nelle schede non entrano nel feed: in M4 vanno nel ripasso.
 *
 * @param lessons - Lezioni con un feed, nell'ordine della materia.
 * @returns Gli elementi del feed in ordine.
 */
export function buildStudySequence(lessons: readonly SequenceLessonInput[]): SequenceItem[] {
  const items: SequenceItem[] = [];
  for (const lesson of lessons) {
    const used = new Set<number>();
    const seen = new Set<string>();
    let recent = new Set<string>();
    let sinceQuiz = 0;
    const askQuizzes = () => {
      const batch: number[] = [];
      while (batch.length < QUIZ_BATCH) {
        const index = nextQuiz(lesson.quiz, used, recent, seen);
        if (index === null) break;
        used.add(index);
        batch.push(index);
      }
      batch.forEach((index, position) => {
        items.push({
          type: 'quiz',
          lessonId: lesson.lessonId,
          index,
          batch: { position: position + 1, size: batch.length },
        });
      });
      recent = new Set();
      sinceQuiz = 0;
    };
    lesson.cards.forEach((card, index) => {
      items.push({ type: 'card', lessonId: lesson.lessonId, index });
      for (const key of card.conceptKeys) {
        recent.add(key);
        seen.add(key);
      }
      sinceQuiz += 1;
      if (sinceQuiz === QUIZ_EVERY) askQuizzes();
    });
    if (sinceQuiz >= 1) askQuizzes();
  }
  return items;
}

/** Punti di una sessione. */
export const POINTS = {
  /** Parola da indovinare scoperta. */
  blank: 2,
  /** Risposta giusta. */
  answer: 10,
  /** Bonus per ogni risposta giusta di fila oltre la prima. */
  streakStep: 2,
  /** Tetto del bonus di serie. */
  streakMax: 8,
} as const;

/**
 * Punti di una risposta giusta, con il bonus di serie.
 *
 * @param streak - Risposte giuste di fila, contando questa (1 per la prima).
 * @returns I punti guadagnati.
 */
export function answerPoints(streak: number): number {
  const bonus = Math.min(POINTS.streakMax, Math.max(0, streak - 1) * POINTS.streakStep);
  return POINTS.answer + bonus;
}

/** Durata di una sessione di studio. */
export const SESSION_MS = 5 * 60 * 1000;
