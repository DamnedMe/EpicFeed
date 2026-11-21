import type { ConceptKey, LessonFeedDraft, LessonPartId } from '@study-feed/core';
import { FEED_LIMITS, MAX_SLUG_LENGTH, SLUG_PATTERN } from '@study-feed/core';
import { z } from 'zod';
import { lessonPartContentSchema } from './import.js';

/**
 * Contratti della generazione (M2, ADR 0011 e ADR 0013): il feed di una
 * lezione come lo produce Claude Desktop e lo invia il server MCP, e il feed
 * salvato che legge la web app.
 *
 * Gli schemi controllano la **forma**: tipi, campi ammessi, lunghezze. Le
 * regole tra elementi (concetti esistenti, stesso numero di opzioni nelle due
 * lingue, parti della lezione) le controlla `checkLessonFeed` del core, sia nel
 * server MCP sia nell'API. Gli oggetti sono `strict`: un campo inatteso è un
 * errore, così un feed malformato non entra nemmeno in parte.
 *
 * Le lunghezze massime sono più larghe degli obiettivi del prompt (es. frase
 * chiave fino a 140 caratteri, accettata fino a 220): un testo appena più
 * lungo non deve far rifare la lezione, uno chiaramente fuori misura sì.
 */

/** Testo breve su una riga, non vuoto. */
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes('\n'), 'Il testo deve stare su una riga');

/** Testo che può andare a capo (spiegazioni), non vuoto. */
const paragraph = (max: number) => z.string().trim().min(1).max(max);

/** Coppia italiano/inglese dello stesso testo (ADR 0011). */
const bilingual = <T extends z.ZodType>(schema: T) => z.strictObject({ it: schema, en: schema });

const slug = z
  .string()
  .max(MAX_SLUG_LENGTH)
  .regex(SLUG_PATTERN, 'Usa il kebab-case: lettere minuscole, cifre e trattini');

const conceptKeySchema = slug.transform((value) => value as ConceptKey);

const partIdSchema = z.uuid().transform((value) => value.toLowerCase() as LessonPartId);

/** Termine del glossario, nella forma inglese del corso. */
const termSchema = line(80);

const comparisonSchema = z.strictObject({
  left: bilingual(line(80)),
  right: bilingual(line(80)),
  rows: z
    .array(
      z.strictObject({
        aspect: bilingual(line(80)),
        left: bilingual(line(200)),
        right: bilingual(line(200)),
      }),
    )
    .max(FEED_LIMITS.comparisonRows.max),
});

const codeSchema = z.strictObject({
  language: z.string().regex(/^[a-z0-9+#-]{1,20}$/, 'Linguaggio non valido'),
  source: z.string().min(1).max(2_000),
});

/** Scheda del feed. */
export const feedCardSchema = z.strictObject({
  id: slug,
  kind: z.enum(['concept', 'steps', 'comparison', 'code']),
  title: bilingual(line(120)),
  keyPoint: bilingual(line(220)),
  body: bilingual(paragraph(900)),
  steps: bilingual(z.array(line(240)).max(FEED_LIMITS.steps.max)).optional(),
  comparison: comparisonSchema.optional(),
  code: codeSchema.optional(),
  terms: z.array(termSchema).max(10),
  conceptKeys: z.array(conceptKeySchema).max(4),
  sourcePartId: partIdSchema,
  origin: z.enum(['summary', 'reading', 'slides']),
});

const quizBase = {
  id: slug,
  question: bilingual(paragraph(400)),
  explanation: bilingual(paragraph(600)),
  conceptKey: conceptKeySchema,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
};

/** Domanda del quiz: scelta multipla o vero/falso. */
export const quizItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...quizBase,
    kind: z.literal('multiple_choice'),
    options: bilingual(z.array(line(200)).max(FEED_LIMITS.multipleChoiceOptions.max)),
    correctIndex: z.number().int().min(0),
  }),
  z.strictObject({ ...quizBase, kind: z.literal('true_false'), answer: z.boolean() }),
]);

/** Concetto della lezione. */
export const conceptSchema = z.strictObject({
  key: conceptKeySchema,
  name: bilingual(line(120)),
  description: bilingual(paragraph(400)),
});

/** Voce del glossario della materia. */
export const glossaryEntrySchema = z.strictObject({
  term: termSchema,
  translation: line(120),
  definition: bilingual(paragraph(400)),
});

/**
 * Feed di una lezione come lo produce Claude. Le quantità massime sono
 * ripetute qui per fermare subito un payload abnorme; quelle minime e le
 * regole tra elementi sono in `checkLessonFeed`.
 */
export const lessonFeedDraftSchema = z.strictObject({
  cards: z.array(feedCardSchema).max(FEED_LIMITS.cards.max),
  quiz: z.array(quizItemSchema).max(FEED_LIMITS.quiz.max),
  concepts: z.array(conceptSchema).max(FEED_LIMITS.concepts.max),
  glossary: z.array(glossaryEntrySchema).max(FEED_LIMITS.glossary.max),
});

/** Feed di una lezione dopo la validazione della forma. */
export type LessonFeedDraftInput = z.infer<typeof lessonFeedDraftSchema>;

type Assert<T extends true> = T;

/**
 * Verifica a tempo di compilazione: ciò che lo schema accetta è un feed del
 * core. Se schema e dominio divergono, la build fallisce qui.
 */
export type DraftMatchesDomain = Assert<
  LessonFeedDraftInput extends LessonFeedDraft ? true : false
>;

/** Versione delle istruzioni di generazione (prompt MCP), es. `2026-11-21.1`. */
export const promptVersionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{1,3}$/, 'Versione del prompt non valida');

/**
 * Corpo della richiesta con cui il server MCP salva il feed di una lezione.
 * `sourcesHash` è l'impronta delle fonti che Claude ha letto: se nel frattempo
 * la lezione è cambiata, l'API rifiuta il feed invece di abbinarlo a fonti
 * diverse da quelle usate.
 */
export const saveLessonFeedRequestSchema = z.strictObject({
  lessonId: z.uuid(),
  sourcesHash: z.string().regex(/^[0-9a-f]{64}$/, 'Impronta non valida'),
  promptVersion: promptVersionSchema,
  feed: lessonFeedDraftSchema,
});

/** Corpo della richiesta di salvataggio di un feed, dopo la validazione. */
export type SaveLessonFeedRequest = z.infer<typeof saveLessonFeedRequestSchema>;

/** Tratto di video di una scheda, calcolato dall'API con l'allineamento del core. */
export const videoAlignmentSchema = z.strictObject({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  language: z.string().max(32),
});

/**
 * Scheda come la legge la web app: la scheda generata più il tratto di video
 * (`null` se l'allineamento è incerto o la parte non è un video: si apre la
 * parte dall'inizio).
 */
export const storedFeedCardSchema = feedCardSchema.extend({
  video: videoAlignmentSchema.nullable(),
});

/** Feed salvato di una lezione, come lo legge la web app (M3). */
export const storedLessonFeedSchema = z.strictObject({
  lessonId: z.uuid(),
  sourcesHash: z.string().regex(/^[0-9a-f]{64}$/),
  promptVersion: promptVersionSchema,
  generatedAt: z.iso.datetime({ offset: true }),
  cards: z.array(storedFeedCardSchema).max(FEED_LIMITS.cards.max),
  quiz: z.array(quizItemSchema).max(FEED_LIMITS.quiz.max),
  concepts: z.array(conceptSchema).max(FEED_LIMITS.concepts.max),
});

/** Feed salvato di una lezione. */
export type StoredLessonFeed = z.infer<typeof storedLessonFeedSchema>;

/**
 * Dimensione massima del corpo di salvataggio (512 KB): un feed reale pesa
 * 30–60 KB con le due lingue; il limite protegge l'API da richieste abnormi.
 */
export const MAX_FEED_BODY_BYTES = 512 * 1024;

// ---------------------------------------------------------------------------
// API della generazione, chiamata dal server MCP con il token "genera"
// ---------------------------------------------------------------------------

/** Prefisso dei token di generazione del server MCP (ADR 0013). */
export const GENERATE_TOKEN_PREFIX = 'sfg_';

/** Token di generazione: prefisso + 43 caratteri base64url (32 byte casuali). */
export const generateTokenSchema = z
  .string()
  .regex(/^sfg_[A-Za-z0-9_-]{43}$/, 'Token di generazione non valido');

/** Risposta di `POST /api/generation/token`: il token in chiaro, mostrato una volta sola. */
export const createGenerateTokenResponseSchema = z.strictObject({
  token: generateTokenSchema,
  expiresAt: z.iso.datetime(),
});

/** Risposta di `POST /api/generation/token`. */
export type CreateGenerateTokenResponse = z.infer<typeof createGenerateTokenResponseSchema>;

/** Risposta di `GET /api/generation/lessons`: lezioni da generare e totali. */
export const lessonsToGenerateResponseSchema = z.strictObject({
  lessons: z.array(
    z.strictObject({
      lessonId: z.uuid(),
      lessonTitle: z.string(),
      chapterTitle: z.string(),
      subjectTitle: z.string(),
      partCount: z.number().int().min(0),
    }),
  ),
  totals: z.strictObject({
    lessons: z.number().int().min(0),
    ready: z.number().int().min(0),
    toGenerate: z.number().int().min(0),
  }),
});

/** Risposta di `GET /api/generation/lessons`. */
export type LessonsToGenerateResponse = z.infer<typeof lessonsToGenerateResponseSchema>;

/**
 * Risposta di `GET /api/generation/lessons/:id`: le fonti della lezione per
 * Claude. I sottotitoli **non** ci sono: nell'MVP schede e quiz nascono solo da
 * riassunti, testi e slide (ADR 0006), e i sottotitoli servono all'API per i
 * tempi. Si indica solo se una parte li ha.
 */
export const lessonSourcesResponseSchema = z.strictObject({
  lessonId: z.uuid(),
  sourcesHash: z.string().regex(/^[0-9a-f]{64}$/),
  lessonTitle: z.string(),
  chapterTitle: z.string(),
  subjectTitle: z.string(),
  parts: z.array(
    z.strictObject({
      lessonPartId: z.uuid(),
      title: z.string(),
      kind: z.enum(['video', 'reading']),
      position: z.number().int().min(0),
      hasSubtitles: z.boolean(),
      content: lessonPartContentSchema,
    }),
  ),
  glossary: z.array(glossaryEntrySchema),
});

/** Risposta di `GET /api/generation/lessons/:id`. */
export type LessonSourcesResponse = z.infer<typeof lessonSourcesResponseSchema>;

/** Risposta di `POST /api/generation/lessons/:id/feed`. */
export const saveLessonFeedResponseSchema = z.strictObject({
  feedId: z.uuid(),
  created: z.boolean(),
  cards: z.number().int().min(0),
  alignedCards: z.number().int().min(0),
});

/** Risposta di `POST /api/generation/lessons/:id/feed`. */
export type SaveLessonFeedResponse = z.infer<typeof saveLessonFeedResponseSchema>;
