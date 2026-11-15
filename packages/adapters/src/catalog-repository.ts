import { and, eq, sql } from 'drizzle-orm';
import type {
  CatalogPath,
  CatalogRepository,
  CatalogTransaction,
  ContentVersion,
  Entitlement,
  LessonId,
  LessonPartId,
  LessonPartInput,
  NewContentVersion,
  NewSubtitleTrack,
  StoredSubtitleTrack,
  SubtitleAccess,
} from '@study-feed/core';
import { parseContentHash, parseId } from '@study-feed/core';
import {
  chapters,
  contentVersions,
  editions,
  entitlements,
  lessonParts,
  lessons,
  studyPrograms,
  subjects,
  subtitleAccess,
  subtitleTracks,
} from '@study-feed/db';
import type { ContentVersionRow, SubtitleTrackRow } from '@study-feed/db';
import type { Database, DatabaseTransaction } from './database.js';

/**
 * Catalogo condiviso su Postgres (porta `CatalogRepository` del core).
 *
 * Usa la connessione privilegiata del server (le scritture dei client sono
 * negate da RLS e permessi). Ogni scrittura è un `insert … on conflict`, così
 * due import simultanei dello stesso contenuto non creano duplicati né errori.
 */
export class DrizzleCatalogRepository implements CatalogRepository {
  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   */
  constructor(private readonly db: Database) {}

  /**
   * Esegue `work` in una transazione Postgres.
   *
   * @param work - Operazioni sul catalogo.
   * @returns Il valore restituito da `work`.
   */
  async transaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => work(new DrizzleCatalogTransaction(tx)));
  }
}

/** Implementazione di `CatalogTransaction` su una transazione Drizzle. */
class DrizzleCatalogTransaction implements CatalogTransaction {
  constructor(private readonly tx: DatabaseTransaction) {}

  async upsertLessonPath(path: CatalogPath): Promise<LessonId> {
    const [program] = await this.tx
      .insert(studyPrograms)
      .values({ epicodeId: path.studyProgram.epicodeId, title: path.studyProgram.title })
      .onConflictDoUpdate({
        target: studyPrograms.epicodeId,
        set: { title: sql`excluded.title` },
      })
      .returning({ id: studyPrograms.id });

    const [edition] = await this.tx
      .insert(editions)
      .values({ studyProgramId: required(program).id, label: path.edition.label })
      // Aggiornamento senza effetti: serve solo a ottenere l'id con `returning`.
      .onConflictDoUpdate({
        target: [editions.studyProgramId, editions.label],
        set: { label: sql`excluded.label` },
      })
      .returning({ id: editions.id });

    const [subject] = await this.tx
      .insert(subjects)
      .values({ editionId: required(edition).id, ...path.subject })
      .onConflictDoUpdate({
        target: [subjects.editionId, subjects.epicodeId],
        set: { title: sql`excluded.title`, position: sql`excluded.position` },
      })
      .returning({ id: subjects.id });

    const [chapter] = await this.tx
      .insert(chapters)
      .values({ subjectId: required(subject).id, ...path.chapter })
      .onConflictDoUpdate({
        target: [chapters.subjectId, chapters.epicodeId],
        set: { title: sql`excluded.title`, position: sql`excluded.position` },
      })
      .returning({ id: chapters.id });

    const [lesson] = await this.tx
      .insert(lessons)
      .values({ chapterId: required(chapter).id, ...path.lesson })
      .onConflictDoUpdate({
        target: [lessons.chapterId, lessons.epicodeId],
        set: { title: sql`excluded.title`, position: sql`excluded.position` },
      })
      .returning({ id: lessons.id });

    return parseId(required(lesson).id, 'LessonId');
  }

  async upsertLessonPart(lessonId: LessonId, part: LessonPartInput): Promise<LessonPartId> {
    const [row] = await this.tx
      .insert(lessonParts)
      .values({
        lessonId,
        epicodeId: part.epicodeId,
        kind: part.kind,
        title: part.title,
        position: part.position,
        videoId: part.videoId ?? null,
      })
      .onConflictDoUpdate({
        target: [lessonParts.lessonId, lessonParts.epicodeId],
        set: {
          kind: sql`excluded.kind`,
          title: sql`excluded.title`,
          position: sql`excluded.position`,
          videoId: sql`excluded.video_id`,
        },
      })
      .returning({ id: lessonParts.id });
    return parseId(required(row).id, 'LessonPartId');
  }

  async findOrCreateVersion(
    input: NewContentVersion,
  ): Promise<{ version: ContentVersion; created: boolean }> {
    const [inserted] = await this.tx
      .insert(contentVersions)
      .values({
        lessonPartId: input.lessonPartId,
        contentHash: input.contentHash,
        content: input.content,
        firstSeenAt: input.firstSeenAt,
      })
      .onConflictDoNothing({ target: [contentVersions.lessonPartId, contentVersions.contentHash] })
      .returning();
    if (inserted) return { version: toVersion(inserted), created: true };

    const [existing] = await this.tx
      .select()
      .from(contentVersions)
      .where(
        and(
          eq(contentVersions.lessonPartId, input.lessonPartId),
          eq(contentVersions.contentHash, input.contentHash),
        ),
      );
    return { version: toVersion(required(existing)), created: false };
  }

  async findOrCreateSubtitleTrack(
    input: NewSubtitleTrack,
  ): Promise<{ track: StoredSubtitleTrack; created: boolean }> {
    const [inserted] = await this.tx
      .insert(subtitleTracks)
      .values({
        lessonPartId: input.lessonPartId,
        language: input.track.language,
        autoGenerated: input.track.autoGenerated,
        contentHash: input.contentHash,
        cues: input.track.cues,
        firstSeenAt: input.firstSeenAt,
      })
      .onConflictDoNothing({ target: [subtitleTracks.lessonPartId, subtitleTracks.contentHash] })
      .returning();
    if (inserted) return { track: toTrack(inserted), created: true };

    const [existing] = await this.tx
      .select()
      .from(subtitleTracks)
      .where(
        and(
          eq(subtitleTracks.lessonPartId, input.lessonPartId),
          eq(subtitleTracks.contentHash, input.contentHash),
        ),
      );
    return { track: toTrack(required(existing)), created: false };
  }

  async saveEntitlement(entitlement: Entitlement): Promise<boolean> {
    const rows = await this.tx
      .insert(entitlements)
      .values({
        userId: entitlement.userId,
        lessonPartId: entitlement.lessonPartId,
        contentVersionId: entitlement.contentVersionId,
        basis: 'possession_proof',
        grantedAt: entitlement.grantedAt,
      })
      .onConflictDoNothing()
      .returning({ userId: entitlements.userId });
    return rows.length > 0;
  }

  async saveSubtitleAccess(access: SubtitleAccess): Promise<boolean> {
    const rows = await this.tx
      .insert(subtitleAccess)
      .values({
        userId: access.userId,
        subtitleTrackId: access.subtitleTrackId,
        grantedAt: access.grantedAt,
      })
      .onConflictDoNothing()
      .returning({ userId: subtitleAccess.userId });
    return rows.length > 0;
  }
}

function toVersion(row: ContentVersionRow): ContentVersion {
  return {
    id: parseId(row.id, 'ContentVersionId'),
    lessonPartId: parseId(row.lessonPartId, 'LessonPartId'),
    contentHash: parseContentHash(row.contentHash),
    firstSeenAt: row.firstSeenAt,
    generationStatus: row.generationStatus,
  };
}

function toTrack(row: SubtitleTrackRow): StoredSubtitleTrack {
  return {
    id: parseId(row.id, 'SubtitleTrackId'),
    lessonPartId: parseId(row.lessonPartId, 'LessonPartId'),
    language: row.language,
    autoGenerated: row.autoGenerated,
    contentHash: parseContentHash(row.contentHash),
    firstSeenAt: row.firstSeenAt,
  };
}

// `returning` di un insert/upsert restituisce sempre una riga: se manca è un
// guasto (non un caso previsto), e lo segnaliamo invece di proseguire con undefined.
function required<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('Il database non ha restituito la riga attesa');
  return row;
}
