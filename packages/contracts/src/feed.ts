import { z } from 'zod';
import { storedLessonFeedSchema } from './generation.js';

/**
 * Contratti del feed di studio (M3, ADR 0015): ciò che la web app scarica per
 * studiare una materia, anche offline.
 */

const portalUrlSchema = z
  .url()
  .refine((value) => value.startsWith('https://learn.epicode.edu.mt/'), 'Indirizzo del portale');

/** Materia da cui scegliere il feed. */
export const studySubjectSchema = z.strictObject({
  subjectId: z.uuid(),
  title: z.string().min(1).max(300),
  editionLabel: z.string().min(1).max(64),
  lessons: z.number().int().min(0),
  lessonsWithFeed: z.number().int().min(0),
});

/** Risposta di `GET /api/feed/subjects`. */
export const studySubjectsResponseSchema = z.strictObject({
  subjects: z.array(studySubjectSchema),
});

/** Risposta di `GET /api/feed/subjects`. */
export type StudySubjectsResponse = z.infer<typeof studySubjectsResponseSchema>;

/** Parte di una lezione nel feed (per "Fonte" e "Guarda sul portale"). */
export const studyFeedPartSchema = z.strictObject({
  partId: z.uuid(),
  title: z.string().min(1).max(300),
  kind: z.enum(['video', 'reading', 'slides']),
  position: z.number().int().min(0),
  portalUrl: portalUrlSchema,
});

/** Lezione nel feed di una materia; `feed` è `null` finché non viene generata. */
export const studyFeedLessonSchema = z.strictObject({
  lessonId: z.uuid(),
  title: z.string().min(1).max(300),
  position: z.number().int().min(0),
  portalUrl: portalUrlSchema,
  parts: z.array(studyFeedPartSchema).max(40),
  feed: storedLessonFeedSchema.nullable(),
});

/** Risposta di `GET /api/feed/subjects/:id`: tutta la materia, da tenere sul telefono. */
export const subjectFeedResponseSchema = z.strictObject({
  subjectId: z.uuid(),
  title: z.string().min(1).max(300),
  version: z.string().regex(/^[0-9a-f]{64}$/),
  chapters: z.array(
    z.strictObject({
      chapterId: z.uuid(),
      title: z.string().min(1).max(300),
      lessons: z.array(studyFeedLessonSchema),
    }),
  ),
});

/** Feed di una materia come lo riceve la web app. */
export type SubjectFeedResponse = z.infer<typeof subjectFeedResponseSchema>;
