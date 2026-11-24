import type { SQL } from 'drizzle-orm';
import { desc, eq, sql } from 'drizzle-orm';
import type { GenerationStatus } from '../domain/content-version.js';
import {
  chapters,
  contentVersions,
  editions,
  entitlements,
  lessonParts,
  lessons,
  subjects,
  subtitleTracks,
} from '@epicfeed/db';
import type { Database } from '@epicfeed/db';
import { withUserRls } from '@epicfeed/db';

/** Lezione nella lista "Le mie lezioni". */
export interface MyLesson {
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly chapterTitle: string;
  readonly subjectTitle: string;
  readonly editionLabel: string;
  /** Parti della lezione che lo studente ha importato. */
  readonly partCount: number;
  /** Parti con almeno una traccia di sottotitoli. */
  readonly partsWithSubtitles: number;
  /** Quante parti sono in ciascuno stato di generazione (versione più recente). */
  readonly status: Readonly<Record<GenerationStatus, number>>;
  /** Ultimo import dello studente. */
  readonly lastImportedAt: Date;
}

/**
 * Letture della web app sul catalogo dello studente. Passano sempre dalla
 * RLS ({@link withUserRls}): la query non filtra per utente, lo fa il database.
 */
export class MyLessonsQuery {
  /**
   * @param db - Database (la RLS limita le righe all'utente indicato).
   */
  constructor(private readonly db: Database) {}

  /**
   * Elenca le lezioni importate dallo studente, ordinate per materia, capitolo
   * e posizione, con lo stato di generazione delle parti.
   *
   * @param userId - Studente autenticato.
   * @returns Le lezioni visibili allo studente.
   */
  async list(userId: string): Promise<MyLesson[]> {
    const rows = await withUserRls(this.db, userId, async (tx) => {
      // Per ogni parte, la versione più recente tra quelle dello studente.
      const latest = tx
        .selectDistinctOn([entitlements.lessonPartId], {
          lessonPartId: entitlements.lessonPartId,
          status: contentVersions.generationStatus,
          grantedAt: entitlements.grantedAt,
        })
        .from(entitlements)
        .innerJoin(contentVersions, eq(contentVersions.id, entitlements.contentVersionId))
        .orderBy(entitlements.lessonPartId, desc(contentVersions.firstSeenAt))
        .as('latest');

      const countWhere = (condition: SQL) =>
        sql<number>`(count(*) filter (where ${condition}))::int`;
      return tx
        .select({
          lessonId: lessons.id,
          lessonTitle: lessons.title,
          chapterTitle: chapters.title,
          subjectTitle: subjects.title,
          editionLabel: editions.label,
          partCount: sql<number>`count(*)::int`,
          partsWithSubtitles: countWhere(
            sql`exists (select 1 from ${subtitleTracks} st where st.lesson_part_id = ${lessonParts.id})`,
          ),
          pending: countWhere(sql`${latest.status} = 'pending'`),
          generating: countWhere(sql`${latest.status} = 'generating'`),
          ready: countWhere(sql`${latest.status} = 'ready'`),
          failed: countWhere(sql`${latest.status} = 'failed'`),
          lastImportedAt: sql<Date | string>`max(${latest.grantedAt})`,
        })
        .from(latest)
        .innerJoin(lessonParts, eq(lessonParts.id, latest.lessonPartId))
        .innerJoin(lessons, eq(lessons.id, lessonParts.lessonId))
        .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
        .innerJoin(subjects, eq(subjects.id, chapters.subjectId))
        .innerJoin(editions, eq(editions.id, subjects.editionId))
        .groupBy(
          lessons.id,
          lessons.title,
          lessons.position,
          chapters.title,
          chapters.position,
          subjects.title,
          subjects.position,
          editions.label,
        )
        .orderBy(subjects.title, chapters.position, lessons.position);
    });

    return rows.map((row) => ({
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      chapterTitle: row.chapterTitle,
      subjectTitle: row.subjectTitle,
      editionLabel: row.editionLabel,
      partCount: row.partCount,
      partsWithSubtitles: row.partsWithSubtitles,
      status: {
        pending: row.pending,
        generating: row.generating,
        ready: row.ready,
        failed: row.failed,
      },
      lastImportedAt: new Date(row.lastImportedAt),
    }));
  }
}
