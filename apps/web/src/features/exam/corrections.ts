'use client';

import type { ExamSubmissionRequest, StoredSubmissionResponse } from '@epicfeed/contracts';
import {
  storedSubmissionSchema,
  submissionsResponseSchema,
  submitResponseSchema,
} from '@epicfeed/contracts';
import { gradeFromScore, rubricScore } from '@epicfeed/core';
import * as z from 'zod';
import type { LocalValue } from '../feed/local-state';
import { localValue } from '../feed/local-state';
import type { AnswerToRecord } from '../review/record';
import type { ExamExerciseItem } from './catalog';

/**
 * Correzione di Claude delle risposte aperte (M4, ADR 0014 §4): l'app invia
 * le risposte, Claude Desktop le corregge con gli strumenti MCP, l'app
 * scarica la correzione, la conserva sul dispositivo, la porta nel ripasso e
 * cancella l'invio dal server (ADR 0003: lo storico resta sul dispositivo).
 */

/** Invio conservato sul dispositivo, con la correzione quando arriva. */
export const correctionEntrySchema = storedSubmissionSchema.extend({
  /** `true` quando i punti della correzione sono entrati nel ripasso. */
  recorded: z.boolean(),
});
export type CorrectionEntry = z.infer<typeof correctionEntrySchema>;

/** Invii conservati al massimo: oltre, si tolgono i più vecchi già corretti. */
export const MAX_CORRECTION_ENTRIES = 40;

/** Invii e correzioni sul dispositivo, dal più recente. */
export const examCorrections: LocalValue<CorrectionEntry[]> = localValue(
  'exam-corrections',
  z.array(correctionEntrySchema).max(MAX_CORRECTION_ENTRIES * 2),
  [],
);

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Esito dell'invio a Claude. */
export type SubmitOutcome =
  | { readonly status: 'sent'; readonly id: string }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'limit'; readonly message: string }
  | { readonly status: 'error' };

/**
 * Tiene al massimo {@link MAX_CORRECTION_ENTRIES} invii: toglie per primi i
 * più vecchi già corretti, mai quelli in attesa.
 *
 * @param entries - Invii, dal più recente.
 * @returns Gli invii da conservare.
 */
export function trimEntries(entries: readonly CorrectionEntry[]): CorrectionEntry[] {
  const kept = [...entries];
  for (let i = kept.length - 1; i >= 0 && kept.length > MAX_CORRECTION_ENTRIES; i -= 1) {
    if (kept[i]?.correction) kept.splice(i, 1);
  }
  return kept;
}

/**
 * Unisce gli invii del server a quelli del dispositivo: le correzioni
 * arrivate entrano negli invii, gli invii in attesa che il server non ha più
 * (scaduti) si tolgono.
 *
 * @param local - Invii sul dispositivo, dal più recente.
 * @param server - Invii sul server.
 * @returns Gli invii aggiornati, dal più recente.
 */
export function mergeSubmissions(
  local: readonly CorrectionEntry[],
  server: readonly StoredSubmissionResponse[],
): CorrectionEntry[] {
  const byId = new Map(server.map((submission) => [submission.id, submission]));
  const merged: CorrectionEntry[] = [];
  for (const entry of local) {
    const remote = byId.get(entry.id);
    byId.delete(entry.id);
    if (entry.correction) merged.push(entry);
    else if (remote) merged.push({ ...remote, recorded: false });
    // In attesa sul dispositivo ma non più sul server: scaduto, si toglie.
  }
  // Invii fatti da un altro dispositivo.
  for (const remote of byId.values()) merged.push({ ...remote, recorded: false });
  merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return trimEntries(merged);
}

/**
 * Risposte da portare nel ripasso per una correzione: per ogni domanda, la
 * valutazione dai punti di Claude (soglie dell'ADR 0014) su ogni concetto.
 *
 * @param entry - Invio corretto.
 * @returns Le risposte da registrare (vuoto senza correzione).
 */
export function answersFromCorrection(entry: CorrectionEntry): AnswerToRecord[] {
  if (!entry.correction) return [];
  const answers: AnswerToRecord[] = [];
  for (const correction of entry.correction.items) {
    const item = entry.submission.items.find((candidate) => candidate.key === correction.key);
    if (!item) continue;
    const grade = gradeFromScore(rubricScore(item.rubric, correction.scores));
    for (const conceptKey of item.conceptKeys) {
      answers.push({
        subjectId: entry.subjectId,
        conceptKey,
        questionId: item.key,
        source: entry.kind,
        grade,
        language: 'en',
      });
    }
  }
  return answers;
}

/**
 * Punteggio (0–1) di ogni esercizio corretto, per l'elenco della sezione.
 *
 * @param entry - Invio corretto.
 * @returns Punteggio per chiave dell'esercizio.
 */
export function scoresFromCorrection(entry: CorrectionEntry): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const correction of entry.correction?.items ?? []) {
    const item = entry.submission.items.find((candidate) => candidate.key === correction.key);
    if (item) scores[item.key] = rubricScore(item.rubric, correction.scores);
  }
  return scores;
}

/**
 * Invia le risposte a Claude e conserva l'invio sul dispositivo.
 *
 * @param fetchImpl - `fetch`.
 * @param draft - Risposte.
 * @param store - Invii sul dispositivo.
 * @param now - Orologio.
 * @returns L'esito.
 */
export async function submitForCorrection(
  fetchImpl: Fetch,
  draft: ExamSubmissionRequest,
  store: LocalValue<CorrectionEntry[]> = examCorrections,
  now: () => Date = () => new Date(),
): Promise<SubmitOutcome> {
  try {
    const response = await fetchImpl('/api/exam/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 409) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return { status: 'limit', message: body?.error?.message ?? 'Troppe risposte in attesa.' };
    }
    if (!response.ok) return { status: 'error' };
    const { id } = submitResponseSchema.parse(await response.json());
    const entry: CorrectionEntry = {
      id,
      subjectId: draft.subjectId,
      kind: draft.kind,
      submission: draft,
      correction: null,
      createdAt: now().toISOString(),
      correctedAt: null,
      recorded: false,
    };
    store.set((previous) => trimEntries([entry, ...previous.filter((e) => e.id !== id)]));
    return { status: 'sent', id };
  } catch {
    return { status: 'error' };
  }
}

/** Servizi usati da {@link syncCorrections} (sostituibili nei test). */
export interface SyncDeps {
  readonly fetch: Fetch;
  readonly store: LocalValue<CorrectionEntry[]>;
  readonly record: (answer: AnswerToRecord) => Promise<unknown>;
  readonly saveScores: (scores: Record<string, number>) => void;
}

/**
 * Scarica le correzioni arrivate: le conserva, le porta nel ripasso (una
 * volta sola) e cancella gli invii corretti dal server. Senza rete non fa
 * niente: riprova alla prossima apertura.
 *
 * @param deps - Servizi.
 * @returns Quante correzioni nuove sono arrivate.
 */
export async function syncCorrections(deps: SyncDeps): Promise<number> {
  let server: StoredSubmissionResponse[];
  try {
    const response = await deps.fetch('/api/exam/submissions', { cache: 'no-store' });
    if (!response.ok) return 0;
    server = submissionsResponseSchema.parse(await response.json()).submissions;
  } catch {
    return 0;
  }

  const merged = mergeSubmissions(deps.store.get(), server);
  const fresh = merged.filter((entry) => entry.correction && !entry.recorded);
  for (const entry of fresh) {
    for (const answer of answersFromCorrection(entry)) await deps.record(answer);
    if (entry.kind === 'exercise') deps.saveScores(scoresFromCorrection(entry));
  }
  const freshIds = new Set(fresh.map((entry) => entry.id));
  deps.store.set(
    merged.map((entry) => (freshIds.has(entry.id) ? { ...entry, recorded: true } : entry)),
  );

  // Le correzioni conservate sul dispositivo non servono più sul server.
  const corrected = server.filter((submission) => submission.correction);
  await Promise.all(
    corrected.map((submission) =>
      deps
        .fetch(`/api/exam/submissions/${encodeURIComponent(submission.id)}`, { method: 'DELETE' })
        .catch(() => null),
    ),
  );
  return fresh.length;
}

/**
 * Ultimo invio per un esercizio, se c'è.
 *
 * @param entries - Invii, dal più recente.
 * @param key - Chiave dell'esercizio.
 * @returns L'invio, oppure `undefined`.
 */
export function latestFor(
  entries: readonly CorrectionEntry[],
  key: string,
): CorrectionEntry | undefined {
  return entries.find(
    (entry) => entry.kind === 'exercise' && entry.submission.items.some((item) => item.key === key),
  );
}

/** Lunghezza massima di una risposta da inviare (come il contratto). */
export const MAX_ANSWER_CHARS = 10_000;

/**
 * Domanda con la risposta, nella forma dell'invio a Claude.
 *
 * @param exercise - Esercizio (dal catalogo della sezione).
 * @param answer - Risposta dello studente.
 * @param extra - Approfondimento del colloquio ed esito dei test, se ci sono.
 * @returns La domanda da inviare.
 */
export function submissionItemFor(
  exercise: ExamExerciseItem,
  answer: string,
  extra: {
    readonly followUpAnswer?: string | null;
    readonly tests?: { readonly passed: number; readonly total: number } | null;
  } = {},
): ExamSubmissionRequest['items'][number] {
  const followUpAnswer = extra.followUpAnswer?.trim() ? extra.followUpAnswer : null;
  return {
    key: exercise.key,
    kind: exercise.kind,
    prompt: exercise.prompt,
    code: exercise.code,
    answer,
    followUp: followUpAnswer === null ? null : exercise.followUp,
    followUpAnswer,
    modelAnswer: exercise.modelAnswer,
    rubric: exercise.rubric.map((criterion) => ({ ...criterion })),
    conceptKeys: [...exercise.conceptKeys],
    tests: extra.tests ?? null,
  };
}
