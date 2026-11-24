/**
 * Dominio di Study Feed: entità e regole pure, senza I/O né framework.
 *
 * @packageDocumentation
 */
export * from './alignment.js';
export * from './catalog.js';
export * from './content.js';
export * from './content-hash.js';
export * from './content-version.js';
export * from './entitlement.js';
export * from '@epicfeed/shared';
export * from './exam.js';
export * from './exam-practice.js';
export * from './exam-correction.js';
export * from './feed.js';
export * from './import.js';
export * from '@epicfeed/shared';
export * from './review.js';
export * from './story.js';
export * from './study-session.js';
export * from './subtitles.js';

// Nucleo condiviso, riesportato finché le funzioni non hanno i loro pacchetti (ADR 0019).
export { DomainError, parseId, normalizeText } from '@epicfeed/shared';
export type {
  Brand,
  BookId,
  ChapterId,
  ContentVersionId,
  DomainErrorCode,
  LessonId,
  LessonPartId,
  SubtitleTrackId,
  UserId,
} from '@epicfeed/shared';
