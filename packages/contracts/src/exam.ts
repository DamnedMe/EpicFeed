import type { ExamPackDraft } from '@study-feed/core';
import { EXAM_PACK_LIMITS } from '@study-feed/core';
import { z } from 'zod';
import {
  bilingual,
  conceptKeySchema,
  line,
  paragraph,
  promptVersionSchema,
  slug,
} from './schema-helpers.js';

/**
 * Contratti dei pacchetti d'esame (M4, ADR 0014 e ADR 0017): domande a scelta
 * multipla in più e domande aperte di una lezione, generate da Claude Desktop
 * a partire dal feed della lezione. In inglese; solo i suggerimenti sono nelle
 * due lingue.
 *
 * Come per il feed, gli schemi controllano la forma; le regole tra elementi
 * (concetti del feed, firma e test per il codice, quantità minime) le
 * controlla `checkExamPack` del core, nel server MCP e nell'API.
 */

const difficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** Domanda a scelta multipla d'esame. */
export const examChoiceQuestionSchema = z.strictObject({
  id: slug,
  question: paragraph(500),
  options: z.array(line(200)).max(EXAM_PACK_LIMITS.options.max),
  correctIndex: z.number().int().min(0),
  explanation: paragraph(600),
  conceptKey: conceptKeySchema,
  difficulty: difficultySchema,
});

/** Test di un esercizio di codice. */
export const codeTestSchema = z.strictObject({
  call: line(300),
  expected: line(300),
});

/** Domanda aperta stile esame. */
export const examOpenQuestionSchema = z.strictObject({
  id: slug,
  kind: z.enum(['code', 'explain', 'analyze']),
  prompt: paragraph(1_500),
  code: z.string().min(1).max(3_000).optional(),
  signature: line(200).optional(),
  tests: z.array(codeTestSchema).max(EXAM_PACK_LIMITS.tests.max).optional(),
  hints: z.array(bilingual(paragraph(400))).max(EXAM_PACK_LIMITS.hints.max),
  modelAnswer: paragraph(4_000),
  rubric: z
    .array(z.strictObject({ criterion: line(200), points: z.number().int() }))
    .max(EXAM_PACK_LIMITS.rubric.max),
  conceptKeys: z.array(conceptKeySchema).max(EXAM_PACK_LIMITS.openConcepts.max),
  followUp: paragraph(400),
});

/** Pacchetto d'esame come lo produce Claude. */
export const examPackDraftSchema = z.strictObject({
  questions: z.array(examChoiceQuestionSchema).max(EXAM_PACK_LIMITS.questions.max),
  openQuestions: z.array(examOpenQuestionSchema).max(EXAM_PACK_LIMITS.openQuestions.max),
});

/** Pacchetto d'esame dopo la validazione della forma. */
export type ExamPackDraftInput = z.infer<typeof examPackDraftSchema>;

type Assert<T extends true> = T;

/** Verifica a tempo di compilazione: ciò che lo schema accetta è un pacchetto del core. */
export type ExamPackMatchesDomain = Assert<ExamPackDraftInput extends ExamPackDraft ? true : false>;

/** Pacchetto d'esame salvato, come lo legge la web app. */
export const storedExamPackSchema = examPackDraftSchema.extend({
  lessonId: z.uuid(),
  feedId: z.uuid(),
  promptVersion: promptVersionSchema,
  generatedAt: z.iso.datetime({ offset: true }),
});

/** Pacchetto d'esame salvato. */
export type StoredExamPack = z.infer<typeof storedExamPackSchema>;

/** Dimensione massima del corpo di salvataggio (256 KB; un pacchetto reale pesa 15–30 KB). */
export const MAX_EXAM_BODY_BYTES = 256 * 1024;

/**
 * Corpo di `POST /api/generation/lessons/:id/exam`. `feedId` è il feed che
 * Claude ha letto: se nel frattempo la lezione ha un feed nuovo, l'API
 * rifiuta il pacchetto (i concetti potrebbero essere cambiati).
 */
export const saveExamPackRequestSchema = z.strictObject({
  lessonId: z.uuid(),
  feedId: z.uuid(),
  promptVersion: promptVersionSchema,
  pack: examPackDraftSchema,
});

/** Corpo di `POST /api/generation/lessons/:id/exam`, dopo la validazione. */
export type SaveExamPackRequest = z.infer<typeof saveExamPackRequestSchema>;

/** Risposta di `POST /api/generation/lessons/:id/exam`. */
export const saveExamPackResponseSchema = z.strictObject({
  packId: z.uuid(),
  /** `false` se il feed aveva già un pacchetto (vale il primo). */
  created: z.boolean(),
  questions: z.number().int().min(0),
  openQuestions: z.number().int().min(0),
});

/** Risposta di `POST /api/generation/lessons/:id/exam`. */
export type SaveExamPackResponse = z.infer<typeof saveExamPackResponseSchema>;

/** Risposta di `GET /api/generation/exam`: lezioni con feed ma senza pacchetto d'esame. */
export const lessonsForExamResponseSchema = z.strictObject({
  lessons: z.array(
    z.strictObject({
      lessonId: z.uuid(),
      lessonTitle: z.string(),
      chapterTitle: z.string(),
      subjectTitle: z.string(),
    }),
  ),
  totals: z.strictObject({
    /** Lezioni con un feed. */
    lessons: z.number().int().min(0),
    ready: z.number().int().min(0),
    toGenerate: z.number().int().min(0),
  }),
});

/** Risposta di `GET /api/generation/exam`. */
export type LessonsForExamResponse = z.infer<typeof lessonsForExamResponseSchema>;

/**
 * Risposta di `GET /api/generation/lessons/:id/exam`: il materiale per
 * scrivere il pacchetto, cioè il feed della lezione in inglese (concetti,
 * schede e domande già presenti, da non ripetere).
 */
export const lessonForExamResponseSchema = z.strictObject({
  lessonId: z.uuid(),
  feedId: z.uuid(),
  lessonTitle: z.string(),
  chapterTitle: z.string(),
  subjectTitle: z.string(),
  /** `true` se il feed ha già un pacchetto: salvarne un altro non cambia nulla. */
  hasExamPack: z.boolean(),
  concepts: z.array(z.strictObject({ key: z.string(), name: z.string(), description: z.string() })),
  cards: z.array(
    z.strictObject({
      title: z.string(),
      keyPoint: z.string(),
      body: z.string(),
      steps: z.array(z.string()).optional(),
      code: z.strictObject({ language: z.string(), source: z.string() }).optional(),
      conceptKeys: z.array(z.string()),
    }),
  ),
  feedQuestions: z.array(z.string()),
});

/** Risposta di `GET /api/generation/lessons/:id/exam`. */
export type LessonForExamResponse = z.infer<typeof lessonForExamResponseSchema>;
