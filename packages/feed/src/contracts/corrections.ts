import type {
  CorrectionCompletion,
  CorrectionDraft,
  StoredCorrection,
} from '../domain/corrections.js';
import {
  CARD_FIELDS,
  CORRECTION_LIMITS,
  CORRECTION_REASONS,
  QUIZ_FIELDS,
} from '../domain/corrections.js';
import { MAX_SLUG_LENGTH } from '../domain/feed.js';
import * as z from 'zod';
import { line } from './schema-helpers.js';

/**
 * Contratti di Segnala errore (M5, ADR 0020): le correzioni che la web app
 * invia e scarica, e quelle che Claude Desktop completa con il server MCP.
 *
 * Gli schemi controllano la forma; le regole tra campi (campo adatto al tipo
 * di elemento, posizione negli elenchi, testo davvero cambiato) le controlla
 * `checkCorrectionDraft` del dominio.
 */

const language = z.enum(['it', 'en']);
const itemId = z.string().min(1).max(MAX_SLUG_LENGTH);

/** Tratto di testo: non vuoto, entro il limite; il codice può andare a capo. */
const text = z.string().min(1).max(CORRECTION_LIMITS.text);

/** Un intervento sul testo di un campo. */
export const textEditSchema = z.strictObject({
  field: z.enum([...CARD_FIELDS, ...QUIZ_FIELDS]),
  index: z.number().int().min(0).max(40).optional(),
  language,
  original: text,
  corrected: text,
});

const reason = z.enum(CORRECTION_REASONS);

/**
 * Elemento come lo vedeva lo studente: solo contesto per Claude, mai
 * applicato al feed. Basta che sia un oggetto di dimensione ragionevole.
 */
const snapshot = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 16_384, 'Elemento troppo grande');

const bilingualLine = z.strictObject({ it: z.string().max(600), en: z.string().max(600) });

/** Correzione come la crea lo studente. */
export const correctionDraftSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    lessonId: z.uuid(),
    itemType: z.enum(['card', 'quiz']),
    itemId,
    edits: z.array(textEditSchema).min(1).max(2),
    reason,
    snapshot,
  }),
  z.strictObject({
    kind: z.literal('regenerate'),
    lessonId: z.uuid(),
    itemType: z.enum(['card', 'quiz']),
    itemId,
    reason,
    snapshot,
  }),
  z.strictObject({
    kind: z.literal('answer'),
    lessonId: z.uuid(),
    itemId,
    fix: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('multiple_choice'),
        correctIndex: z.number().int().min(0).max(10),
        option: bilingualLine,
      }),
      z.strictObject({ kind: z.literal('true_false'), answer: z.boolean() }),
    ]),
    question: bilingualLine,
    reason,
    snapshot,
  }),
  z.strictObject({
    kind: z.literal('term'),
    from: line(CORRECTION_LIMITS.term),
    to: line(CORRECTION_LIMITS.term),
    reason,
  }),
]);

/**
 * Corpo di `POST /api/corrections`. L'id lo sceglie l'app (UUID), così una
 * correzione fatta senza rete si può reinviare senza doppioni.
 */
export const reportErrorRequestSchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  correction: correctionDraftSchema,
});

/** Corpo di `POST /api/corrections` dopo la validazione. */
export type ReportErrorRequest = z.infer<typeof reportErrorRequestSchema>;

/** Esito del lavoro di Claude. */
export const correctionCompletionSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.literal('done'),
    edits: z.array(textEditSchema).min(1).max(CORRECTION_LIMITS.edits),
  }),
  z.strictObject({
    outcome: z.literal('disputed'),
    note: z.string().trim().min(1).max(CORRECTION_LIMITS.note),
    evidence: z.string().trim().min(1).max(CORRECTION_LIMITS.text).optional(),
  }),
]);

/** Corpo di `POST /api/generation/corrections/:id/completion` (server MCP). */
export const completeCorrectionRequestSchema = z.strictObject({
  completion: correctionCompletionSchema,
});

/** Correzione salvata. */
export const storedCorrectionSchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  correction: correctionDraftSchema,
  claudeStatus: z.enum(['pending', 'done', 'disputed', 'not_needed']),
  completion: correctionCompletionSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

/** Risposta di `GET /api/corrections` e `GET /api/generation/corrections`. */
export const correctionsResponseSchema = z.strictObject({
  corrections: z.array(storedCorrectionSchema),
});

/** Risposta di `GET /api/corrections`. */
export type CorrectionsResponse = z.infer<typeof correctionsResponseSchema>;

/** Dimensione massima del corpo di una correzione (64 KB). */
export const MAX_CORRECTION_REQUEST_BYTES = 64 * 1024;

type Assert<T extends true> = T;

/**
 * Verifiche a tempo di compilazione: ciò che gli schemi accettano è una
 * correzione del dominio, e una correzione del dominio si può inviare così
 * com'è. Se schema e dominio divergono, la build fallisce qui.
 */
export type CorrectionDraftMatchesDomain = Assert<
  z.infer<typeof correctionDraftSchema> extends CorrectionDraft ? true : false
>;
/** Verifica: l'esito di Claude accettato è quello del dominio. */
export type CompletionMatchesDomain = Assert<
  z.infer<typeof correctionCompletionSchema> extends CorrectionCompletion ? true : false
>;
/** Verifica: la correzione salvata inviata è quella del dominio. */
export type StoredMatchesDomain = Assert<
  z.infer<typeof storedCorrectionSchema> extends StoredCorrection ? true : false
>;
