'use client';

import { z } from 'zod';
import { localValue } from '../feed/local-state';

/**
 * Dati della sezione Esame che restano sul dispositivo (ADR 0003): lingua
 * dei suggerimenti e ultimo punteggio di ogni esercizio. Le risposte entrano
 * nel ripasso dei concetti come le altre (ADR 0017).
 */

const examPrefsSchema = z.object({
  /** Lingua dei suggerimenti, indipendente da quella di studio (ADR 0014 §1). */
  hintLanguage: z.enum(['it', 'en']).catch('it'),
});
export type ExamPrefs = z.infer<typeof examPrefsSchema>;

/** Preferenze della sezione Esame. */
export const examPrefs = localValue<ExamPrefs>('exam-prefs', examPrefsSchema, {
  hintLanguage: 'it',
});

/** Ultimo punteggio (0–1) per chiave dell'esercizio. */
const examScoresSchema = z.record(z.string().max(200), z.number().min(0).max(1));
export type ExamScores = z.infer<typeof examScoresSchema>;

/** Punteggi degli esercizi fatti. */
export const examScores = localValue<ExamScores>('exam-scores', examScoresSchema, {});
