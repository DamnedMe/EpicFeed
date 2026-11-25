import type { ConceptReviewState, DayStreak, ReviewGrade } from '../domain/review.js';
import {
  applyReview,
  conceptId,
  extendDayStreak,
  isDue,
  isStable,
  localDay,
  recallProbability,
} from '../domain/review.js';
import type { Clock } from '@epicfeed/shared';

/**
 * Casi d'uso del ripasso (M4, ADR 0017): registrare le risposte, preparare la
 * sessione del giorno e riassumere i progressi. Lo stato resta sul
 * dispositivo dietro la porta {@link ProgressStore}; da dove arriva il
 * catalogo dei concetti (la materia scaricata) qui non conta.
 */

/** Da dove arriva una risposta. */
export type AnswerSource = 'feed' | 'review' | 'quiz' | 'exercise' | 'interview';

/** Risposta registrata: lo storico serve alla sincronizzazione e ai riepiloghi. */
export interface AnswerRecord {
  readonly conceptId: string;
  readonly questionId: string | null;
  readonly source: AnswerSource;
  readonly grade: ReviewGrade;
  /** Lingua in cui si è risposto (ADR 0011: i risultati ricordano la lingua). */
  readonly language: 'it' | 'en';
  /** Momento della risposta (ISO 8601). */
  readonly at: string;
}

/** Porta verso i progressi salvati sul dispositivo. */
export interface ProgressStore {
  /** Tutti gli stati di ripasso salvati. */
  loadReviews(): Promise<ConceptReviewState[]>;
  /** Stato di un concetto, se esiste. */
  getReview(conceptId: string): Promise<ConceptReviewState | undefined>;
  /** Salva lo stato e la risposta che lo ha prodotto, insieme. */
  saveAnswer(state: ConceptReviewState, answer: AnswerRecord): Promise<void>;
  /** Serie di giorni con un ripasso completato. */
  loadDayStreak(): Promise<DayStreak>;
  saveDayStreak(streak: DayStreak): Promise<void>;
}

/** Comando di {@link recordAnswer}. */
export interface RecordAnswerCommand {
  readonly subjectId: string;
  readonly conceptKey: string;
  readonly questionId: string | null;
  readonly source: AnswerSource;
  readonly grade: ReviewGrade;
  readonly language: 'it' | 'en';
}

/**
 * Registra una risposta e aggiorna il ripasso del concetto.
 *
 * @param store - Progressi sul dispositivo.
 * @param clock - Orologio.
 * @param command - Risposta data.
 * @returns Il nuovo stato del concetto.
 */
export async function recordAnswer(
  store: ProgressStore,
  clock: Clock,
  command: RecordAnswerCommand,
): Promise<ConceptReviewState> {
  const id = conceptId(command.subjectId, command.conceptKey);
  const now = clock.now();
  const next = applyReview(await store.getReview(id), id, command.grade, now, command.questionId);
  await store.saveAnswer(next, {
    conceptId: id,
    questionId: command.questionId,
    source: command.source,
    grade: command.grade,
    language: command.language,
    at: now.toISOString(),
  });
  return next;
}

/**
 * Segna una sessione di ripasso completata e allunga la serie di giorni.
 *
 * @param store - Progressi sul dispositivo.
 * @param clock - Orologio.
 * @returns La serie aggiornata.
 */
export async function completeReviewSession(
  store: ProgressStore,
  clock: Clock,
): Promise<DayStreak> {
  const streak = extendDayStreak(await store.loadDayStreak(), localDay(clock.now()));
  await store.saveDayStreak(streak);
  return streak;
}

/** Concetto della materia come serve al ripasso. */
export interface ReviewConcept {
  /** Vedi `conceptId`. */
  readonly id: string;
  readonly key: string;
  /** Capitolo (modulo) della prima lezione in cui compare. */
  readonly chapterIndex: number;
}

/** Domanda disponibile per ripassare un concetto. */
export interface ReviewQuestion {
  readonly id: string;
  readonly conceptId: string;
}

/** Concetto scelto per la sessione, con la domanda da fare. */
export interface PlannedReview {
  readonly conceptId: string;
  readonly questionId: string;
  /** `due`: scaduto; `early`: ripasso in anticipo perché oggi non scade niente. */
  readonly reason: 'due' | 'early';
}

/** Concetti al massimo in una sessione: circa 5 minuti con richiamo e domanda. */
export const REVIEW_SESSION_SIZE = 10;

/**
 * Sceglie la domanda per un concetto: una diversa dall'ultima fatta, se c'è.
 * Le domande arrivano nell'ordine della materia, così la scelta è ripetibile.
 */
function pickQuestion(
  questions: readonly ReviewQuestion[],
  state: ConceptReviewState | undefined,
): string | null {
  if (questions.length === 0) return null;
  const last = state?.lastQuestionId;
  const lastIndex = questions.findIndex((question) => question.id === last);
  // Quella dopo l'ultima fatta, in giro: tutte le domande del concetto prima o poi tornano.
  return questions[(lastIndex + 1) % questions.length]?.id ?? null;
}

/**
 * Prepara la sessione di ripasso.
 *
 * Prima i concetti scaduti, dal più in ritardo. Se non ne scade nessuno, si
 * ripassano in anticipo i concetti già visti che si ricordano meno. Un
 * concetto mai visto nel feed non entra: il ripasso non anticipa lo studio.
 * Restano fuori i concetti senza domande.
 *
 * @param concepts - Concetti della materia.
 * @param questions - Domande della materia, nell'ordine del feed.
 * @param states - Stati di ripasso salvati.
 * @param now - Adesso.
 * @param size - Concetti al massimo.
 * @returns I concetti con la domanda da fare, in ordine.
 */
export function planReviewSession(
  concepts: readonly ReviewConcept[],
  questions: readonly ReviewQuestion[],
  states: readonly ConceptReviewState[],
  now: Date,
  size: number = REVIEW_SESSION_SIZE,
): PlannedReview[] {
  const byConcept = new Map<string, ReviewQuestion[]>();
  for (const question of questions) {
    const list = byConcept.get(question.conceptId) ?? [];
    list.push(question);
    byConcept.set(question.conceptId, list);
  }
  const known = new Set(concepts.map((concept) => concept.id));
  const candidates = states.filter(
    (state) => known.has(state.conceptId) && (byConcept.get(state.conceptId)?.length ?? 0) > 0,
  );
  const due = candidates
    .filter((state) => isDue(state, now))
    .sort((a, b) => a.due.localeCompare(b.due) || a.conceptId.localeCompare(b.conceptId));
  const chosen =
    due.length > 0
      ? due.map((state) => ({ state, reason: 'due' as const }))
      : candidates
          .map((state) => ({ state, recall: recallProbability(state, now) }))
          .sort((a, b) => a.recall - b.recall || a.state.conceptId.localeCompare(b.state.conceptId))
          .map(({ state }) => ({ state, reason: 'early' as const }));

  return chosen.slice(0, size).flatMap(({ state, reason }) => {
    const questionId = pickQuestion(byConcept.get(state.conceptId) ?? [], state);
    return questionId ? [{ conceptId: state.conceptId, questionId, reason }] : [];
  });
}

/** Avanzamento di un modulo nel ripasso. */
export interface ChapterProgress {
  readonly chapterIndex: number;
  readonly concepts: number;
  /** Concetti visti almeno una volta. */
  readonly seen: number;
  /** Concetti stabili (vedi `isStable`). */
  readonly stable: number;
}

/** Riepilogo per la schermata Ripasso. */
export interface ReviewSummary {
  /** Concetti scaduti oggi. */
  readonly due: number;
  /** Concetti con almeno un errore, dal più sbagliato; al massimo `weakLimit`. */
  readonly weak: readonly ConceptReviewState[];
  readonly chapters: readonly ChapterProgress[];
}

/**
 * Riassume i progressi della materia.
 *
 * @param concepts - Concetti della materia.
 * @param states - Stati di ripasso salvati.
 * @param now - Adesso.
 * @param weakLimit - Quanti concetti deboli elencare.
 * @returns Scaduti, concetti deboli e avanzamento per modulo.
 */
export function summarizeReview(
  concepts: readonly ReviewConcept[],
  states: readonly ConceptReviewState[],
  now: Date,
  weakLimit = 5,
): ReviewSummary {
  const byId = new Map(states.map((state) => [state.conceptId, state]));
  const chapters = new Map<number, { concepts: number; seen: number; stable: number }>();
  let due = 0;
  for (const concept of concepts) {
    const entry = chapters.get(concept.chapterIndex) ?? { concepts: 0, seen: 0, stable: 0 };
    entry.concepts += 1;
    const state = byId.get(concept.id);
    if (state) {
      entry.seen += 1;
      if (isStable(state)) entry.stable += 1;
      if (isDue(state, now)) due += 1;
    }
    chapters.set(concept.chapterIndex, entry);
  }
  const known = new Set(concepts.map((concept) => concept.id));
  const weak = states
    .filter((state) => known.has(state.conceptId) && state.wrong > 0 && !isStable(state))
    .sort(
      (a, b) =>
        b.wrong - a.wrong ||
        (b.lastReview ?? '').localeCompare(a.lastReview ?? '') ||
        a.conceptId.localeCompare(b.conceptId),
    )
    .slice(0, weakLimit);
  return {
    due,
    weak,
    chapters: [...chapters.entries()]
      .sort(([a], [b]) => a - b)
      .map(([chapterIndex, entry]) => ({ chapterIndex, ...entry })),
  };
}
