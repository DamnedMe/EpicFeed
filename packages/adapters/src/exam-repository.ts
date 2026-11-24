import { asc, desc, eq, sql } from 'drizzle-orm';
import type {
  CurrentLessonFeed,
  CurrentLessonFeedWithDocument,
  ExamPackDocument,
  ExamPackRepository,
  LessonFeedDocument,
  LessonId,
  UserId,
} from '@study-feed/core';
import { parseId } from '@study-feed/core';
import { chapters, lessonExamPacks, lessonFeeds, lessons, subjects } from '@study-feed/db';
import type { Database, DatabaseTransaction } from './database.js';
import { withUserRls } from './database.js';

/**
 * Persistenza dei pacchetti d'esame su Postgres (porta `ExamPackRepository`
 * del core, M4).
 *
 * Le **letture** passano dalla RLS dello studente: si vedono solo i feed di cui
 * possiede tutte le fonti, e quindi solo i loro pacchetti. La **scrittura** usa
 * la connessione del server, dopo che il caso d'uso ha verificato il feed.
 */
export class DrizzleExamPackRepository implements ExamPackRepository {
  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   */
  constructor(private readonly db: Database) {}

  /** {@inheritDoc ExamPackRepository.listCurrentFeeds} */
  async listCurrentFeeds(userId: UserId): Promise<CurrentLessonFeed[]> {
    const rows = await withUserRls(this.db, userId, (tx) => currentFeeds(tx, false));
    return rows
      .sort(
        (a, b) =>
          a.subjectTitle.localeCompare(b.subjectTitle) ||
          a.chapterPosition - b.chapterPosition ||
          a.lessonPosition - b.lessonPosition ||
          a.lessonId.localeCompare(b.lessonId),
      )
      .map(toCurrentFeed);
  }

  /** {@inheritDoc ExamPackRepository.loadCurrentFeed} */
  async loadCurrentFeed(
    userId: UserId,
    lessonId: LessonId,
  ): Promise<CurrentLessonFeedWithDocument | null> {
    const [row] = await withUserRls(this.db, userId, (tx) =>
      currentFeeds(tx, true).where(eq(lessonFeeds.lessonId, lessonId)),
    );
    if (!row) return null;
    // Il documento è stato validato con gli schemi dei contratti al salvataggio.
    return { ...toCurrentFeed(row), document: row.document as LessonFeedDocument };
  }

  /** {@inheritDoc ExamPackRepository.saveExamPack} */
  async saveExamPack(pack: {
    readonly document: ExamPackDocument;
    readonly generatedBy: UserId;
  }): Promise<{ packId: string; created: boolean }> {
    const { document } = pack;
    const [inserted] = await this.db
      .insert(lessonExamPacks)
      .values({
        lessonFeedId: document.feedId,
        promptVersion: document.promptVersion,
        pack: document,
        generatedBy: pack.generatedBy,
        generatedAt: new Date(document.generatedAt),
      })
      // Vale il primo pacchetto del feed, come per i feed: un secondo
      // salvataggio non cambia le domande che si stanno già studiando.
      .onConflictDoNothing({ target: lessonExamPacks.lessonFeedId })
      .returning({ id: lessonExamPacks.id });
    if (inserted) return { packId: inserted.id, created: true };
    const [existing] = await this.db
      .select({ id: lessonExamPacks.id })
      .from(lessonExamPacks)
      .where(eq(lessonExamPacks.lessonFeedId, document.feedId));
    if (!existing) throw new Error('Pacchetto non trovato dopo il conflitto');
    return { packId: existing.id, created: false };
  }
}

/**
 * Feed corrente (il più recente visibile) di ogni lezione, con titoli,
 * posizioni e se ha un pacchetto. Va eseguita dentro {@link withUserRls}.
 *
 * @param withDocument - `true` per leggere anche il documento del feed.
 */
function currentFeeds(tx: DatabaseTransaction, withDocument: boolean) {
  return tx
    .selectDistinctOn([lessonFeeds.lessonId], {
      lessonId: lessonFeeds.lessonId,
      feedId: lessonFeeds.id,
      document: withDocument ? lessonFeeds.feed : sql<unknown>`null`,
      lessonTitle: lessons.title,
      lessonPosition: lessons.position,
      chapterTitle: chapters.title,
      chapterPosition: chapters.position,
      subjectTitle: subjects.title,
      hasExamPack: sql<boolean>`exists (
        select 1 from ${lessonExamPacks} p where p.lesson_feed_id = ${lessonFeeds.id}
      )`,
    })
    .from(lessonFeeds)
    .innerJoin(lessons, eq(lessons.id, lessonFeeds.lessonId))
    .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
    .innerJoin(subjects, eq(subjects.id, chapters.subjectId))
    .orderBy(lessonFeeds.lessonId, desc(lessonFeeds.generatedAt), asc(lessonFeeds.id))
    .$dynamic();
}

type CurrentFeedRow = Awaited<ReturnType<typeof currentFeeds>>[number];

function toCurrentFeed(row: CurrentFeedRow): CurrentLessonFeed {
  return {
    lessonId: parseId(row.lessonId, 'LessonId'),
    lessonTitle: row.lessonTitle,
    chapterTitle: row.chapterTitle,
    subjectTitle: row.subjectTitle,
    feedId: row.feedId,
    hasExamPack: row.hasExamPack,
  };
}
