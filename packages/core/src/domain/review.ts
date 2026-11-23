import type { Card, Grade } from 'ts-fsrs';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';

/**
 * Ripasso dei concetti (M4, ADR 0017): ogni concetto della materia ha una
 * scheda di ripasso FSRS che si aggiorna a ogni risposta, da qualunque parte
 * arrivi (feed, ripasso, quiz, esercizi) e in qualunque lingua.
 *
 * Lo stato è un oggetto semplice con le date in ISO 8601, così si salva in
 * IndexedDB e si sincronizza (cifrato) senza conversioni.
 */

/** Esito di una risposta per il ripasso: le tre valutazioni usate da EpicFeed. */
export type ReviewGrade = 'again' | 'hard' | 'good';

/** Fase FSRS del concetto. */
export type ReviewPhase = 'new' | 'learning' | 'review' | 'relearning';

/** Stato del ripasso di un concetto. */
export interface ConceptReviewState {
  /** Concetto: materia e chiave stabile, vedi {@link conceptId}. */
  readonly conceptId: string;
  /** Quando ripassarlo (ISO 8601). */
  readonly due: string;
  /** Stabilità FSRS in giorni: quanto a lungo il ricordo regge. */
  readonly stability: number;
  /** Difficoltà FSRS da 1 a 10. */
  readonly difficulty: number;
  readonly scheduledDays: number;
  readonly learningSteps: number;
  /** Risposte date sul concetto. */
  readonly reps: number;
  /** Volte in cui il concetto è stato dimenticato dopo essere stato imparato. */
  readonly lapses: number;
  /** Risposte sbagliate in tutto: alimenta l'elenco dei concetti deboli. */
  readonly wrong: number;
  readonly phase: ReviewPhase;
  /** Ultima risposta (ISO 8601), `null` se mai ripassato. */
  readonly lastReview: string | null;
  readonly lastGrade: ReviewGrade | null;
  /** Ultima domanda fatta sul concetto: la prossima volta se ne sceglie un'altra. */
  readonly lastQuestionId: string | null;
}

/** Soglia del punteggio (0–1) sotto cui un esercizio vale "di nuovo" (ADR 0014 §4). */
export const SCORE_AGAIN_BELOW = 0.5;
/** Soglia del punteggio (0–1) da cui un esercizio vale "bene" (ADR 0014 §4: sopra l'80%). */
export const SCORE_GOOD_ABOVE = 0.8;
/** Stabilità minima (giorni) perché un concetto in ripasso conti come stabile. */
export const STABLE_DAYS = 7;

const PHASES: Record<State, ReviewPhase> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};
const STATES: Record<ReviewPhase, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const RATINGS: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

/**
 * Pianificatore FSRS con i parametri predefiniti e senza variazione casuale
 * delle scadenze: lo stesso storico dà sempre le stesse date, su ogni
 * dispositivo (serve anche alla sincronizzazione).
 */
const scheduler = fsrs({ enable_fuzz: false });

/**
 * Identificatore del concetto nel ripasso. La stessa chiave può comparire in
 * più lezioni della materia (es. `queue-operations`): è lo stesso concetto e
 * ha un solo ripasso.
 *
 * @param subjectId - Materia.
 * @param conceptKey - Chiave stabile del concetto nel feed.
 * @returns L'identificatore.
 */
export function conceptId(subjectId: string, conceptKey: string): string {
  return `${subjectId}:${conceptKey}`;
}

/**
 * Valutazione di una risposta a scelta multipla o vero/falso.
 *
 * @param correct - Risposta giusta.
 * @param assisted - Giusta ma con un aiuto (parola scoperta, suggerimento).
 * @returns "di nuovo" se sbagliata, "difficile" se aiutata, altrimenti "bene".
 */
export function gradeFromAnswer(correct: boolean, assisted = false): ReviewGrade {
  if (!correct) return 'again';
  return assisted ? 'hard' : 'good';
}

/**
 * Valutazione di un esercizio corretto con la griglia (ADR 0014 §4).
 *
 * @param score - Punteggio da 0 a 1.
 * @returns "di nuovo" sotto il 50%, "difficile" fino all'80%, "bene" sopra.
 */
export function gradeFromScore(score: number): ReviewGrade {
  if (!(score >= SCORE_AGAIN_BELOW)) return 'again';
  return score > SCORE_GOOD_ABOVE ? 'good' : 'hard';
}

function toCard(state: ConceptReviewState): Card {
  const card: Card = {
    ...createEmptyCard(new Date(state.due)),
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: STATES[state.phase],
  };
  if (state.lastReview) card.last_review = new Date(state.lastReview);
  return card;
}

/**
 * Stato iniziale di un concetto mai ripassato: scade subito.
 *
 * @param id - Concetto.
 * @param now - Adesso.
 * @returns Lo stato nuovo.
 */
export function newReviewState(id: string, now: Date): ConceptReviewState {
  return {
    conceptId: id,
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    wrong: 0,
    phase: 'new',
    lastReview: null,
    lastGrade: null,
    lastQuestionId: null,
  };
}

/**
 * Applica una risposta al ripasso del concetto.
 *
 * Una risposta con una data precedente all'ultima registrata (orologio
 * indietro, storico importato fuori ordine) usa l'ultima data: FSRS non
 * accetta intervalli negativi.
 *
 * @param previous - Stato attuale, o `undefined` se il concetto non è mai stato ripassato.
 * @param id - Concetto.
 * @param grade - Valutazione della risposta.
 * @param now - Momento della risposta.
 * @param questionId - Domanda a cui si è risposto, se c'è.
 * @returns Il nuovo stato, con la prossima scadenza.
 */
export function applyReview(
  previous: ConceptReviewState | undefined,
  id: string,
  grade: ReviewGrade,
  now: Date,
  questionId: string | null = null,
): ConceptReviewState {
  const base = previous ?? newReviewState(id, now);
  const last = base.lastReview ? new Date(base.lastReview) : null;
  const at = last && now < last ? last : now;
  const { card } = scheduler.next(toCard(base), at, RATINGS[grade]);
  return {
    conceptId: id,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    wrong: base.wrong + (grade === 'again' ? 1 : 0),
    phase: PHASES[card.state],
    lastReview: at.toISOString(),
    lastGrade: grade,
    lastQuestionId: questionId ?? base.lastQuestionId,
  };
}

/**
 * Dice se il concetto va ripassato.
 *
 * @param state - Stato del concetto.
 * @param now - Adesso.
 * @returns `true` se la scadenza è passata.
 */
export function isDue(state: ConceptReviewState, now: Date): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}

/**
 * Dice se il concetto è stabile: imparato e con un ricordo che regge almeno
 * {@link STABLE_DAYS} giorni. Serve alle barre per modulo.
 *
 * @param state - Stato del concetto.
 * @returns `true` se stabile.
 */
export function isStable(state: ConceptReviewState): boolean {
  return state.phase === 'review' && state.stability >= STABLE_DAYS;
}

/**
 * Probabilità stimata di ricordare il concetto adesso (0–1), per scegliere
 * cosa ripassare in anticipo quando non scade niente.
 *
 * @param state - Stato del concetto.
 * @param now - Adesso.
 * @returns La probabilità; 0 per un concetto mai ripassato.
 */
export function recallProbability(state: ConceptReviewState, now: Date): number {
  if (state.phase === 'new' || state.stability <= 0) return 0;
  return scheduler.get_retrievability(toCard(state), now, false);
}

/** Giorni di ripasso di fila. */
export interface DayStreak {
  /** Ultimo giorno con un ripasso completato, `AAAA-MM-GG` nell'ora locale. */
  readonly lastDay: string | null;
  readonly days: number;
  readonly best: number;
}

/** Serie vuota. */
export const EMPTY_DAY_STREAK: DayStreak = { lastDay: null, days: 0, best: 0 };

/**
 * Giorno di calendario nell'ora del dispositivo.
 *
 * @param date - Momento.
 * @returns Il giorno `AAAA-MM-GG`.
 */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayNumber(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / 86_400_000);
}

/**
 * Aggiorna la serie dopo una sessione di ripasso completata.
 *
 * @param streak - Serie attuale.
 * @param today - Giorno della sessione (`AAAA-MM-GG`).
 * @returns La serie: invariata se oggi era già contato, +1 se ieri c'era un
 *   ripasso, altrimenti ripartita da 1.
 */
export function extendDayStreak(streak: DayStreak, today: string): DayStreak {
  if (streak.lastDay === today) return streak;
  const consecutive = streak.lastDay !== null && dayNumber(today) - dayNumber(streak.lastDay) === 1;
  const days = consecutive ? streak.days + 1 : 1;
  return { lastDay: today, days, best: Math.max(streak.best, days) };
}

/**
 * Serie da mostrare oggi: se l'ultimo ripasso è più vecchio di ieri la serie
 * si è interrotta e vale 0.
 *
 * @param streak - Serie salvata.
 * @param today - Oggi (`AAAA-MM-GG`).
 * @returns I giorni di fila ancora validi.
 */
export function currentDayStreak(streak: DayStreak, today: string): number {
  if (streak.lastDay === null) return 0;
  return dayNumber(today) - dayNumber(streak.lastDay) <= 1 ? streak.days : 0;
}
