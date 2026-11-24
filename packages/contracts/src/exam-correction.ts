import type { ExamCorrectionDraft, ExamSubmissionDraft } from '@study-feed/core';
import { EXAM_CORRECTION_LIMITS } from '@study-feed/core';
import { z } from 'zod';
import { line, paragraph } from './schema-helpers.js';

/**
 * Contratti della correzione di Claude (M4, ADR 0014 §4): invio delle
 * risposte dall'app, lettura e correzione da Claude Desktop. Tutto in
 * inglese. Le risposte e il codice non si accorciano né si ripuliscono:
 * l'indentazione conta e i suggerimenti si riferiscono alle righe.
 */

/** Testo libero di più righe, lasciato com'è (spazi compresi), non vuoto. */
const raw = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0, 'Il testo non può essere vuoto');

/** Una domanda con la risposta dello studente. */
export const submissionItemSchema = z.strictObject({
  key: z.string().min(1).max(200),
  kind: z.enum(['code', 'explain', 'analyze']),
  prompt: paragraph(3_000),
  code: z.string().max(3_000).nullable(),
  answer: raw(10_000),
  followUp: paragraph(400).nullable(),
  followUpAnswer: raw(5_000).nullable(),
  modelAnswer: paragraph(4_000),
  rubric: z
    .array(z.strictObject({ criterion: line(200), points: z.number().int().min(1).max(5) }))
    .min(1)
    .max(5),
  conceptKeys: z.array(z.string().min(1).max(80)).max(3),
  tests: z
    .strictObject({ passed: z.number().int().min(0), total: z.number().int().min(1) })
    .nullable(),
});

/** Corpo di `POST /api/exam/submissions`. */
export const examSubmissionRequestSchema = z.strictObject({
  subjectId: z.uuid(),
  kind: z.enum(['exercise', 'interview']),
  items: z
    .array(submissionItemSchema)
    .min(EXAM_CORRECTION_LIMITS.items.min)
    .max(EXAM_CORRECTION_LIMITS.items.max),
});

/** Corpo di `POST /api/exam/submissions`, dopo la validazione. */
export type ExamSubmissionRequest = z.infer<typeof examSubmissionRequestSchema>;

/** Dimensione massima di un invio (64 KB; un colloquio reale pesa 10–20 KB). */
export const MAX_SUBMISSION_BODY_BYTES = 64 * 1024;

/** Suggerimento di revisione sulle righe della risposta. */
export const codeSuggestionSchema = z.strictObject({
  title: line(120),
  explanation: paragraph(600),
  fromLine: z.number().int().min(1),
  toLine: z.number().int().min(1),
  replacement: z.string().max(4_000),
});

/** Correzione come la scrive Claude. */
export const examCorrectionSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(200),
        scores: z.array(z.number().int().min(0)).max(5),
        comment: paragraph(1_500),
        suggestions: z.array(codeSuggestionSchema).max(EXAM_CORRECTION_LIMITS.suggestions.max),
      }),
    )
    .min(EXAM_CORRECTION_LIMITS.items.min)
    .max(EXAM_CORRECTION_LIMITS.items.max),
  summary: paragraph(2_000),
});

/** Correzione come la scrive Claude. */
export type ExamCorrectionDraftRequest = z.infer<typeof examCorrectionSchema>;

/** Dimensione massima del corpo di una correzione (64 KB). */
export const MAX_CORRECTION_BODY_BYTES = 64 * 1024;

/** Corpo di `POST /api/generation/exam/submissions/:id/correction`. */
export const saveCorrectionRequestSchema = z.strictObject({ correction: examCorrectionSchema });

/** Risposta di `POST /api/generation/exam/submissions/:id/correction`. */
export const saveCorrectionResponseSchema = z.strictObject({ saved: z.literal(true) });

/** Invio salvato, con la correzione se c'è. */
export const storedSubmissionSchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  kind: z.enum(['exercise', 'interview']),
  submission: examSubmissionRequestSchema,
  correction: examCorrectionSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  correctedAt: z.iso.datetime({ offset: true }).nullable(),
});

/** Invio salvato. */
export type StoredSubmissionResponse = z.infer<typeof storedSubmissionSchema>;

/** Risposta degli elenchi di invii (app e Claude Desktop). */
export const submissionsResponseSchema = z.strictObject({
  submissions: z.array(storedSubmissionSchema),
});

/** Risposta degli elenchi di invii. */
export type SubmissionsResponse = z.infer<typeof submissionsResponseSchema>;

/** Risposta di `POST /api/exam/submissions`. */
export const submitResponseSchema = z.strictObject({ id: z.uuid() });

type Assert<T extends true> = T;

/** Verifica in compilazione: l'invio validato è un invio del dominio. */
export type SubmissionMatchesDomain = Assert<
  ExamSubmissionRequest extends ExamSubmissionDraft ? true : false
>;
/** Verifica in compilazione: la correzione validata è una correzione del dominio. */
export type CorrectionMatchesDomain = Assert<
  z.infer<typeof examCorrectionSchema> extends ExamCorrectionDraft ? true : false
>;
