import type { Connection } from './connection';
import { runImportJob, type ImportJobDeps } from './import-job';
import type { BatchPlan, BatchProgress, ImportStatus, ReadActivityResponse } from './messages';
import { BATCH_PACING, jitter, type Pacing } from './pacing';

/** Errori consecutivi dopo cui l'import a lotti si ferma. */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** Attesa massima accettata per il limite orario di EpicFeed (secondi). */
export const MAX_RATE_LIMIT_WAIT_S = 30 * 60;

/** Errori dell'API che fermano tutto: riguarderebbero anche le lezioni successive. */
const FATAL_API_CODES = new Set(['UNAUTHORIZED', 'RATE_LIMITED']);

/** Dipendenze dell'import a lotti (il service worker passa quelle reali). */
export interface BatchJobDeps extends Omit<ImportJobDeps, 'videoPauseMs' | 'waitForRateLimit'> {
  /** Legge una lezione dal portale, tramite lo script nella pagina. */
  readLesson(activityId: string): Promise<ReadActivityResponse>;
  /** `true` se lo studente ha chiesto di interrompere. */
  isCancelled(): boolean;
  /** Ricorda una lezione importata, per saltarla nei lotti successivi. */
  markImported(activityId: string): Promise<void>;
  /** Ora corrente in ms (iniettabile nei test). */
  now(): number;
  /** Generatore casuale per le pause (iniettabile nei test). */
  random?: () => number;
  /** Ritmo (predefinito {@link BATCH_PACING}). */
  pacing?: Pacing;
}

/**
 * Importa un capitolo o un corso, una lezione alla volta.
 *
 * Per ogni lezione: pausa casuale (più lunga al cambio di capitolo), lettura
 * dal portale con pause tra le parti, sottotitoli con pause tra i video,
 * invio a EpicFeed. Ogni lezione è un import a sé: se una fallisce si passa
 * alla successiva; ci si ferma solo per errori che colpirebbero anche le
 * altre (sessione del portale, collegamento con EpicFeed, scheda chiusa),
 * dopo {@link MAX_CONSECUTIVE_FAILURES} errori di fila o su richiesta.
 *
 * @param plan - Lezioni da importare, in ordine.
 * @param connection - Collegamento con la web app.
 * @param deps - Dipendenze.
 * @returns Lo stato finale `batch-done` (anche già comunicato con `report`).
 */
export async function runBatchJob(
  plan: BatchPlan,
  connection: Connection,
  deps: BatchJobDeps,
): Promise<ImportStatus> {
  const pacing = deps.pacing ?? BATCH_PACING;
  const random = deps.random ?? Math.random;
  const failed: { title: string; message: string }[] = [];
  let imported = 0;
  let freshLessons = 0;
  let empty = 0;
  let missingSubtitles = 0;
  let consecutiveFailures = 0;
  let stopped: string | null = null;
  let previousChapter: string | null = null;

  const wait = async (ms: number, progress: BatchProgress, reason: 'pacing' | 'rate-limit') => {
    await deps.report({ phase: 'pause', progress, until: deps.now() + ms, reason });
    await deps.pause(ms);
  };
  const fail = (title: string, message: string): boolean => {
    failed.push({ title, message });
    consecutiveFailures += 1;
    if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) return false;
    stopped = 'Troppi errori di fila: import fermato.';
    return true;
  };

  for (const [index, lesson] of plan.lessons.entries()) {
    const progress: BatchProgress = {
      scope: plan.scope,
      title: plan.title,
      index,
      total: plan.lessons.length,
      lessonTitle: lesson.title,
    };
    if (previousChapter !== null && !deps.isCancelled()) {
      const range =
        previousChapter === lesson.chapterId ? pacing.betweenLessons : pacing.betweenChapters;
      await wait(jitter(range, random), progress, 'pacing');
    }
    if (deps.isCancelled()) {
      stopped = 'Import interrotto.';
      break;
    }
    previousChapter = lesson.chapterId;

    await deps.report({ phase: 'reading', progress });
    const read = await deps.readLesson(lesson.id);
    if (!read.ok) {
      if (read.fatal) {
        failed.push({ title: lesson.title, message: read.error });
        stopped = read.error;
        break;
      }
      if (fail(lesson.title, read.error)) break;
      continue;
    }
    if (!read.preview) {
      empty += 1;
      continue;
    }

    const result = await runImportJob(read.preview, connection, {
      ...deps,
      videoPauseMs: () => jitter(pacing.betweenVideos, random),
      // Gli stati intermedi portano l'avanzamento del lotto; l'esito della
      // singola lezione confluisce nel riepilogo finale.
      report: (status) =>
        status.phase === 'subtitles' || status.phase === 'sending'
          ? deps.report({ ...status, progress })
          : Promise.resolve(),
      waitForRateLimit: async (seconds) => {
        if (seconds > MAX_RATE_LIMIT_WAIT_S || deps.isCancelled()) return false;
        await wait(seconds * 1000, progress, 'rate-limit');
        return !deps.isCancelled();
      },
    });

    if (result.phase === 'done') {
      imported += 1;
      consecutiveFailures = 0;
      missingSubtitles += result.missingSubtitles;
      if (result.result.parts.some((part) => part.newEntitlement)) freshLessons += 1;
      await deps.markImported(lesson.id);
    } else if (result.phase === 'error') {
      if (result.code === 'EMPTY') {
        empty += 1;
        continue;
      }
      if (result.code && FATAL_API_CODES.has(result.code)) {
        failed.push({ title: lesson.title, message: result.message });
        stopped = result.message;
        break;
      }
      if (fail(lesson.title, result.message)) break;
    }
  }

  const status: ImportStatus = {
    phase: 'batch-done',
    scope: plan.scope,
    title: plan.title,
    total: plan.lessons.length,
    imported,
    freshLessons,
    empty,
    failed,
    missingSubtitles,
    stopped,
  };
  await deps.report(status);
  return status;
}
