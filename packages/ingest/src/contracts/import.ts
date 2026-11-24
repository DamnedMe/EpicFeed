import { MAX_PARTS_PER_LESSON } from '../domain/import.js';
import {
  MAX_SUBTITLE_TRACKS,
  catalogNodeSchema,
  catalogPositionSchema,
  catalogTitleSchema,
  epicodeIdSchema,
  lessonPartContentSchema,
  subtitleTrackSchema,
} from '@epicfeed/catalog';
import * as z from 'zod';

/**
 * Contratto dell'import di una lezione: è il corpo di `POST /api/import` che
 * l'estensione invia e che l'API valida prima di passarlo al caso d'uso
 * `ImportLesson` del core.
 *
 * Qui si controlla solo la **forma** (tipi, lunghezze massime, campi ammessi);
 * le regole di dominio (normalizzazione, impronta, permessi) restano nel core.
 * Gli oggetti sono `strict`: un campo in più è un errore, così l'estensione non
 * può inviare per sbaglio dati che non ci servono (es. campi del portale che l'app non usa).
 */

/** Parte di lezione importata. */
export const importedPartSchema = z.strictObject({
  epicodeId: epicodeIdSchema,
  title: catalogTitleSchema,
  position: catalogPositionSchema,
  kind: z.enum(['video', 'reading']),
  videoId: z
    .string()
    .regex(/^[0-9]{1,20}$/, 'Id del video non valido')
    .optional(),
  content: lessonPartContentSchema,
  subtitles: z.array(subtitleTrackSchema).max(MAX_SUBTITLE_TRACKS).optional(),
});

/** Corpo di `POST /api/import`. */
export const importLessonRequestSchema = z.strictObject({
  path: z.strictObject({
    studyProgram: z.strictObject({ epicodeId: epicodeIdSchema, title: catalogTitleSchema }),
    edition: z.strictObject({ label: z.string().min(1).max(64) }),
    subject: catalogNodeSchema,
    chapter: catalogNodeSchema,
    lesson: catalogNodeSchema,
  }),
  parts: z.array(importedPartSchema).min(1).max(MAX_PARTS_PER_LESSON),
});

/** Corpo di `POST /api/import`, dopo la validazione. */
export type ImportLessonRequest = z.infer<typeof importLessonRequestSchema>;

/** Esito di una parte nella risposta di `POST /api/import`. */
export const importedPartResultSchema = z.strictObject({
  epicodeId: epicodeIdSchema,
  lessonPartId: z.uuid(),
  contentVersionId: z.uuid(),
  newVersion: z.boolean(),
  newEntitlement: z.boolean(),
  generationStatus: z.enum(['pending', 'generating', 'ready', 'failed']),
  subtitles: z.array(
    z.strictObject({ language: z.string(), subtitleTrackId: z.uuid(), newTrack: z.boolean() }),
  ),
});

/** Risposta di `POST /api/import` andato a buon fine. */
export const importLessonResponseSchema = z.strictObject({
  lessonId: z.uuid(),
  parts: z.array(importedPartResultSchema),
});

/** Risposta di `POST /api/import` andato a buon fine. */
export type ImportLessonResponse = z.infer<typeof importLessonResponseSchema>;

/**
 * Dimensione massima del corpo di `POST /api/import` (4 MB): una lezione reale
 * pesa 20–80 KB, il limite protegge l'API da richieste abnormi.
 */
export const MAX_IMPORT_BODY_BYTES = 4 * 1024 * 1024;
