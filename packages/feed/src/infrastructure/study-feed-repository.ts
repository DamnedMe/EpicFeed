import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { LessonFeedDocument, StoredFeedCard } from '../domain/feed.js';
import type {
  StudyFeedLessonRow,
  StudyFeedRepository,
  StudyFeedSubjectRows,
  StudySubject,
} from '../application/study-feed.js';
import type { UserId } from '@epicfeed/shared';
import { parseId } from '@epicfeed/shared';
import { chapters, editions, lessonFeeds, lessonParts, lessons, subjects } from '@epicfeed/db';
import type { Database } from '@epicfeed/db';
import { withUserRls } from '@epicfeed/db';

/**
 * Persistenza del feed di studio su Postgres (porta `StudyFeedRepository` del
 * core, ADR 0015).
 *
 * Le **letture** passano dalla RLS dello studente ({@link withUserRls}): le
 * query non filtrano per utente, lo fa il database (materie, lezioni e parti
 * importate, feed di cui possiede tutte le fonti). La **scrittura** del
 * riallineamento usa la connessione del server, come il salvataggio dei feed,
 * ed è protetta dalla versione letta.
 */
export class DrizzleStudyFeedRepository implements StudyFeedRepository {
  /**
   * @param db - Database.
   */
  constructor(private readonly db: Database) {}

  /** {@inheritDoc StudyFeedRepository.listSubjects} */
  async listSubjects(userId: UserId): Promise<StudySubject[]> {
    const rows = await withUserRls(this.db, userId, (tx) =>
      tx
        .select({
          subjectId: subjects.id,
          title: subjects.title,
          editionLabel: editions.label,
          lessons: sql<number>`count(distinct ${lessons.id})::int`,
          // La sottoquery passa anch'essa dalla RLS: contano solo i feed visibili.
          lessonsWithFeed: sql<number>`(count(distinct ${lessons.id}) filter (where exists (
            select 1 from ${lessonFeeds} lf where lf.lesson_id = ${lessons.id}
          )))::int`,
        })
        .from(subjects)
        .innerJoin(editions, eq(editions.id, subjects.editionId))
        .innerJoin(chapters, eq(chapters.subjectId, subjects.id))
        .innerJoin(lessons, eq(lessons.chapterId, chapters.id))
        .groupBy(subjects.id, subjects.title, editions.label, subjects.position)
        .orderBy(desc(editions.label), asc(subjects.position), asc(subjects.title)),
    );
    return rows.map((row) => ({ ...row }));
  }

  /** {@inheritDoc StudyFeedRepository.loadSubjectFeeds} */
  async loadSubjectFeeds(userId: UserId, subjectId: string): Promise<StudyFeedSubjectRows | null> {
    return withUserRls(this.db, userId, async (tx) => {
      const [subject] = await tx
        .select({ id: subjects.id, epicodeId: subjects.epicodeId, title: subjects.title })
        .from(subjects)
        .where(eq(subjects.id, subjectId));
      if (!subject) return null;

      const lessonRows = await tx
        .select({
          lessonId: lessons.id,
          epicodeId: lessons.epicodeId,
          title: lessons.title,
          position: lessons.position,
          chapterId: chapters.id,
          chapterTitle: chapters.title,
          chapterPosition: chapters.position,
        })
        .from(lessons)
        .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
        .where(eq(chapters.subjectId, subject.id))
        .orderBy(asc(chapters.position), asc(chapters.id), asc(lessons.position), asc(lessons.id));
      if (lessonRows.length === 0) return null;
      const lessonIds = lessonRows.map((row) => row.lessonId);

      const parts = await tx
        .select({
          lessonId: lessonParts.lessonId,
          partId: lessonParts.id,
          epicodeId: lessonParts.epicodeId,
          title: lessonParts.title,
          kind: lessonParts.kind,
          position: lessonParts.position,
        })
        .from(lessonParts)
        .where(inArray(lessonParts.lessonId, lessonIds))
        .orderBy(asc(lessonParts.position), asc(lessonParts.id));

      // Per ogni lezione il feed più recente tra quelli visibili allo studente.
      const feeds = await tx
        .selectDistinctOn([lessonFeeds.lessonId], {
          lessonId: lessonFeeds.lessonId,
          feedId: lessonFeeds.id,
          document: lessonFeeds.feed,
        })
        .from(lessonFeeds)
        .where(inArray(lessonFeeds.lessonId, lessonIds))
        .orderBy(lessonFeeds.lessonId, desc(lessonFeeds.generatedAt));

      const partsByLesson = new Map<string, StudyFeedLessonRow['parts'][number][]>();
      for (const part of parts) {
        const list = partsByLesson.get(part.lessonId) ?? [];
        list.push({
          partId: parseId(part.partId, 'LessonPartId'),
          epicodeId: part.epicodeId,
          title: part.title,
          kind: part.kind,
          position: part.position,
        });
        partsByLesson.set(part.lessonId, list);
      }
      const feedByLesson = new Map(feeds.map((feed) => [feed.lessonId, feed]));

      return {
        subjectId: subject.id,
        epicodeId: subject.epicodeId,
        title: subject.title,
        lessons: lessonRows.map((row): StudyFeedLessonRow => {
          const feed = feedByLesson.get(row.lessonId);
          return {
            lessonId: parseId(row.lessonId, 'LessonId'),
            epicodeId: row.epicodeId,
            title: row.title,
            position: row.position,
            chapterId: parseId(row.chapterId, 'ChapterId'),
            chapterTitle: row.chapterTitle,
            chapterPosition: row.chapterPosition,
            parts: partsByLesson.get(row.lessonId) ?? [],
            // Il documento è stato validato con gli schemi dei contratti al salvataggio.
            feed: feed
              ? { feedId: feed.feedId, document: feed.document as LessonFeedDocument }
              : null,
          };
        }),
      };
    });
  }

  /** {@inheritDoc StudyFeedRepository.updateFeedAlignment} */
  async updateFeedAlignment(
    feedId: string,
    cards: readonly StoredFeedCard[],
    version: number,
    previousVersion: number,
  ): Promise<boolean> {
    const updated = await this.db
      .update(lessonFeeds)
      .set({
        feed: sql`jsonb_set(
          jsonb_set(${lessonFeeds.feed}, '{cards}', ${JSON.stringify(cards)}::jsonb),
          '{alignmentVersion}', to_jsonb(${version}::int)
        )`,
      })
      .where(
        and(
          eq(lessonFeeds.id, feedId),
          sql`coalesce((${lessonFeeds.feed} ->> 'alignmentVersion')::int, 1) = ${previousVersion}`,
        ),
      )
      .returning({ id: lessonFeeds.id });
    return updated.length > 0;
  }
}
