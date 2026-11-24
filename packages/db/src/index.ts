/**
 * `@epicfeed/db`: schema Drizzle, tipi delle righe e migrazioni.
 *
 * @packageDocumentation
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  apiTokens,
  contentVersions,
  entitlements,
  lessonParts,
  lessons,
  subtitleTracks,
} from './schema.js';

export * from './schema.js';
export * from './database.js';

/** Riga della tabella `lessons`. */
export type LessonRow = InferSelectModel<typeof lessons>;
/** Riga della tabella `lesson_parts`. */
export type LessonPartRow = InferSelectModel<typeof lessonParts>;
/** Riga della tabella `content_versions`. */
export type ContentVersionRow = InferSelectModel<typeof contentVersions>;
/** Nuova riga per `content_versions`. */
export type NewContentVersionRow = InferInsertModel<typeof contentVersions>;
/** Riga della tabella `entitlements`. */
export type EntitlementRow = InferSelectModel<typeof entitlements>;
/** Riga della tabella `subtitle_tracks`. */
export type SubtitleTrackRow = InferSelectModel<typeof subtitleTracks>;
/** Riga della tabella `api_tokens`. */
export type ApiTokenRow = InferSelectModel<typeof apiTokens>;
