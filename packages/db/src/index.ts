/**
 * `@study-feed/db`: schema Drizzle, tipi delle righe e migrazioni.
 *
 * @packageDocumentation
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { contentVersions, entitlements, lessonParts, lessons } from './schema.js';

export * from './schema.js';

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
