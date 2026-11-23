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

/** Elemento del feed: una scheda o una domanda di una lezione, per indice. */
export type SequenceItem =
  | { readonly type: 'card'; readonly lessonId: string; readonly index: number }
  | { readonly type: 'quiz'; readonly lessonId: string; readonly index: number };

/** Ogni quante schede arriva una domanda della stessa lezione. */
export const QUIZ_EVERY = 3;

/**
 * Sceglie la prossima domanda: la prima non usata su un concetto appena visto,
 * altrimenti la prima non usata.
 */
function nextQuiz(
  quiz: SequenceLessonInput['quiz'],
  used: Set<number>,
  recentConcepts: Set<string>,
): number | null {
  let fallback: number | null = null;
  for (let index = 0; index < quiz.length; index += 1) {
    if (used.has(index)) continue;
    if (recentConcepts.has(quiz[index]?.conceptKey ?? '')) return index;
    fallback ??= index;
  }
  return fallback;
}

/**
 * Costruisce il feed della materia **in ordine** (capitolo, poi lezione, come
 * sul portale): le schede di ogni lezione, con una domanda della stessa lezione
 * dopo ogni {@link QUIZ_EVERY} schede, preferendo i concetti appena letti.
 * Alla fine della lezione arriva un'ultima domanda se dall'ultima sono passate
 * almeno due schede. Le domande restanti non si perdono: in M4 vanno nel ripasso.
 *
 * @param lessons - Lezioni con un feed, nell'ordine della materia.
 * @returns Gli elementi del feed in ordine.
 */
export function buildStudySequence(lessons: readonly SequenceLessonInput[]): SequenceItem[] {
  const items: SequenceItem[] = [];
  for (const lesson of lessons) {
    const used = new Set<number>();
    let recent = new Set<string>();
    let sinceQuiz = 0;
    const askQuiz = () => {
      const index = nextQuiz(lesson.quiz, used, recent);
      if (index === null) return;
      used.add(index);
      items.push({ type: 'quiz', lessonId: lesson.lessonId, index });
      recent = new Set();
      sinceQuiz = 0;
    };
    lesson.cards.forEach((card, index) => {
      items.push({ type: 'card', lessonId: lesson.lessonId, index });
      for (const key of card.conceptKeys) recent.add(key);
      sinceQuiz += 1;
      if (sinceQuiz === QUIZ_EVERY) askQuiz();
    });
    if (sinceQuiz >= 2) askQuiz();
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
