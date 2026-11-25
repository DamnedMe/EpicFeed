import type { ConceptReviewState, DayStreak } from '../domain/review.js';
import type { UserId } from '@epicfeed/shared';
import { applyReview, EMPTY_DAY_STREAK, extendDayStreak } from '../domain/review.js';
import type { AnswerRecord } from './review.js';

/**
 * Sincronizzazione dei progressi tra dispositivi (M4, ADR 0018).
 *
 * Si sincronizza lo **storico** (risposte e giorni di ripasso), non gli stati
 * FSRS: due dispositivi uniscono le risposte e ricalcolano gli stati
 * ripassandole in ordine di tempo. FSRS è senza variazione casuale (ADR 0017),
 * quindi lo stesso storico dà gli stessi stati ovunque e l'unione non dipende
 * dall'ordine in cui i dispositivi si sincronizzano.
 *
 * Qui non c'è cifratura: la copia sul server arriva e parte cifrata dalla
 * porta {@link ProgressVault}, implementata nella web app.
 */

/** Versione del formato della copia; cambia se cambia la forma dei dati. */
export const PROGRESS_SNAPSHOT_VERSION = 1;

/** Giorni di ripasso conservati: più di un anno basta per la serie migliore. */
export const MAX_REVIEW_DAYS = 400;

/** Progressi da sincronizzare. */
export interface ProgressSnapshot {
  readonly version: typeof PROGRESS_SNAPSHOT_VERSION;
  /** Risposte, in ordine di tempo. */
  readonly answers: readonly AnswerRecord[];
  /** Giorni con un ripasso completato (`AAAA-MM-GG`), in ordine. */
  readonly reviewDays: readonly string[];
  /** Serie di giorni migliore mai raggiunta (resta anche oltre i giorni conservati). */
  readonly bestStreak: number;
}

/** Copia vuota (dispositivo nuovo). */
export const EMPTY_SNAPSHOT: ProgressSnapshot = {
  version: PROGRESS_SNAPSHOT_VERSION,
  answers: [],
  reviewDays: [],
  bestStreak: 0,
};

/**
 * Identità di una risposta: la stessa risposta arrivata da due copie conta
 * una volta sola. Il momento ha i millisecondi, quindi due risposte diverse
 * con la stessa chiave sono di fatto impossibili.
 *
 * @param answer - Risposta.
 * @returns La chiave.
 */
export function answerKey(answer: AnswerRecord): string {
  return `${answer.at}|${answer.conceptId}|${answer.source}|${answer.questionId ?? ''}`;
}

/** Ordine di tempo, poi per chiave: lo stesso su ogni dispositivo. */
function compareAnswers(a: AnswerRecord, b: AnswerRecord): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  const ka = answerKey(a);
  const kb = answerKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Unisce due copie: tutte le risposte (senza doppioni), tutti i giorni di
 * ripasso, la serie migliore più alta.
 *
 * @param a - Prima copia.
 * @param b - Seconda copia.
 * @returns L'unione, in ordine.
 */
export function mergeSnapshots(a: ProgressSnapshot, b: ProgressSnapshot): ProgressSnapshot {
  const answers = new Map<string, AnswerRecord>();
  for (const answer of [...a.answers, ...b.answers]) answers.set(answerKey(answer), answer);
  const reviewDays = [...new Set([...a.reviewDays, ...b.reviewDays])]
    .sort()
    .slice(-MAX_REVIEW_DAYS);
  const streak = streakFromDays(reviewDays);
  return {
    version: PROGRESS_SNAPSHOT_VERSION,
    answers: [...answers.values()].sort(compareAnswers),
    reviewDays,
    bestStreak: Math.max(a.bestStreak, b.bestStreak, streak.best),
  };
}

/**
 * Dice se `merged` aggiunge qualcosa a `base` (che ne è un sottoinsieme,
 * perché `merged` è un'unione che la contiene).
 *
 * @param merged - Unione.
 * @param base - Copia di partenza.
 * @returns `true` se l'unione ha risposte, giorni o una serie migliore in più.
 */
export function addsToSnapshot(merged: ProgressSnapshot, base: ProgressSnapshot): boolean {
  const baseKeys = new Set(base.answers.map(answerKey));
  return (
    merged.answers.some((answer) => !baseKeys.has(answerKey(answer))) ||
    merged.reviewDays.some((day) => !base.reviewDays.includes(day)) ||
    merged.bestStreak > base.bestStreak
  );
}

/**
 * Ricalcola gli stati di ripasso ripassando le risposte in ordine di tempo.
 *
 * @param answers - Risposte (anche non ordinate).
 * @returns Lo stato di ogni concetto con almeno una risposta.
 */
export function replayAnswers(answers: readonly AnswerRecord[]): ConceptReviewState[] {
  const states = new Map<string, ConceptReviewState>();
  for (const answer of [...answers].sort(compareAnswers)) {
    const previous = states.get(answer.conceptId);
    states.set(
      answer.conceptId,
      applyReview(previous, answer.conceptId, answer.grade, new Date(answer.at), answer.questionId),
    );
  }
  return [...states.values()];
}

/**
 * Serie di giorni dai giorni di ripasso: la serie che finisce con l'ultimo
 * giorno e la migliore tra quelle contenute.
 *
 * @param days - Giorni `AAAA-MM-GG` (anche non ordinati o ripetuti).
 * @param best - Serie migliore già nota.
 * @returns La serie.
 */
export function streakFromDays(days: readonly string[], best = 0): DayStreak {
  let streak = EMPTY_DAY_STREAK;
  for (const day of [...new Set(days)].sort()) streak = extendDayStreak(streak, day);
  return { ...streak, best: Math.max(streak.best, best) };
}

/** Copia sul server com'è dopo la decifratura. */
export interface RemoteProgress {
  /** Numero di versione sul server: cresce a ogni scrittura. */
  readonly revision: number;
  /** I progressi, oppure `unreadable` se non si decifrano con la chiave del dispositivo. */
  readonly snapshot: ProgressSnapshot | 'unreadable';
}

/** Esito di una scrittura sul server. */
export type PushResult = { readonly ok: true; readonly revision: number } | { readonly ok: false };

/** Porta verso la copia cifrata sul server. */
export interface ProgressVault {
  /** Legge e decifra la copia, oppure `null` se non esiste. */
  pull(): Promise<RemoteProgress | null>;
  /**
   * Cifra e scrive la copia solo se sul server c'è ancora `baseRevision`
   * (`null`: nessuna copia). `{ ok: false }` se un altro dispositivo ha
   * scritto nel frattempo.
   */
  push(snapshot: ProgressSnapshot, baseRevision: number | null): Promise<PushResult>;
}

/** Progressi del dispositivo come servono alla sincronizzazione. */
export interface SyncableProgressStore {
  /** Copia dei progressi del dispositivo. */
  loadSnapshot(): Promise<ProgressSnapshot>;
  /**
   * Unisce una copia arrivata dal server ai progressi del dispositivo e
   * ricalcola gli stati, tutto insieme (le risposte date nel frattempo
   * restano).
   *
   * @returns I progressi del dispositivo dopo l'unione.
   */
  mergeSnapshot(remote: ProgressSnapshot): Promise<ProgressSnapshot>;
}

/** Esito di {@link syncProgress}. */
export type SyncOutcome =
  | { readonly status: 'synced'; readonly revision: number | null; readonly pulled: boolean }
  /** La copia sul server non si decifra con questa chiave: serve la password. */
  | { readonly status: 'locked' }
  /** Altri dispositivi continuano a scrivere: si riprova più tardi. */
  | { readonly status: 'busy' };

/** Tentativi quando un altro dispositivo scrive nello stesso momento. */
const MAX_ATTEMPTS = 3;

/**
 * Sincronizza i progressi: legge la copia sul server, la unisce a quelli del
 * dispositivo e riscrive la copia se il dispositivo aveva qualcosa in più.
 *
 * @param store - Progressi del dispositivo.
 * @param vault - Copia cifrata sul server.
 * @param options.replaceUnreadable - `true` solo con una chiave appena
 *   verificata dal server (accesso, nuova password, sblocco): una copia che non
 *   si decifra è stata scritta con una password vecchia e si rifà da questo
 *   dispositivo. Altrimenti si ferma e chiede la password.
 * @returns L'esito.
 */
export async function syncProgress(
  store: SyncableProgressStore,
  vault: ProgressVault,
  options: { readonly replaceUnreadable?: boolean } = {},
): Promise<SyncOutcome> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remote = await vault.pull();
    let local: ProgressSnapshot;
    let pulled = false;
    if (remote === null) {
      local = await store.loadSnapshot();
      if (local.answers.length === 0 && local.reviewDays.length === 0) {
        return { status: 'synced', revision: null, pulled };
      }
    } else if (remote.snapshot === 'unreadable') {
      if (!options.replaceUnreadable) return { status: 'locked' };
      local = await store.loadSnapshot();
    } else {
      local = await store.mergeSnapshot(remote.snapshot);
      pulled = addsToSnapshot(remote.snapshot, EMPTY_SNAPSHOT);
      if (!addsToSnapshot(local, remote.snapshot)) {
        return { status: 'synced', revision: remote.revision, pulled };
      }
    }
    const result = await vault.push(local, remote?.revision ?? null);
    if (result.ok) return { status: 'synced', revision: result.revision, pulled };
  }
  return { status: 'busy' };
}

/** Copia cifrata com'è salvata sul server (il server non la sa leggere). */
export interface StoredProgress {
  readonly revision: number;
  readonly kdf: string;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

/** Porta del server verso le copie cifrate, una per studente. */
export interface EncryptedProgressRepository {
  /** Copia dello studente, se esiste. */
  get(userId: UserId): Promise<StoredProgress | null>;
  /**
   * Scrive la copia solo se sul server c'è ancora `baseRevision` (`null`:
   * nessuna copia).
   *
   * @returns La nuova versione, oppure `null` se nel frattempo è cambiata.
   */
  put(
    userId: UserId,
    data: Omit<StoredProgress, 'revision'>,
    baseRevision: number | null,
  ): Promise<number | null>;
}
