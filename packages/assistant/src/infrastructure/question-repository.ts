import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { UserId } from '@epicfeed/shared';
import { chapters, lessons, studyQuestions, withUserRls } from '@epicfeed/db';
import type { Database } from '@epicfeed/db';
import type { QuestionItemType, QuestionStatus, StoredQuestion } from '../domain/questions.js';
import type { NewQuestion, QuestionRepository } from '../application/questions.js';

/**
 * Domande in coda su Postgres (porta `QuestionRepository`, M6). Le letture
 * passano dalla RLS dello studente; le scritture usano la connessione del
 * server e sono sempre filtrate per lo studente.
 */
export class DrizzleQuestionRepository implements QuestionRepository {
  /** @param db - Database. */
  constructor(private readonly db: Database) {}

  /** {@inheritDoc QuestionRepository.lessonInSubject} */
  async lessonInSubject(userId: UserId, lessonId: string, subjectId: string): Promise<boolean> {
    const rows = await withUserRls(this.db, userId, (tx) =>
      tx
        .select({ id: lessons.id })
        .from(lessons)
        .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
        .where(and(eq(lessons.id, lessonId), eq(chapters.subjectId, subjectId))),
    );
    return rows.length > 0;
  }

  /** {@inheritDoc QuestionRepository.count} */
  async count(userId: UserId): Promise<{ total: number; pending: number }> {
    const [row] = await withUserRls(this.db, userId, (tx) =>
      tx
        .select({
          total: count(),
          pending: sql<number>`count(*) filter (where ${studyQuestions.status} = 'pending')::int`,
        })
        .from(studyQuestions),
    );
    return { total: row?.total ?? 0, pending: row?.pending ?? 0 };
  }

  /** {@inheritDoc QuestionRepository.insert} */
  async insert(userId: UserId, input: NewQuestion): Promise<boolean> {
    const rows = await this.db
      .insert(studyQuestions)
      .values({
        id: input.id,
        userId,
        subjectId: input.subjectId,
        lessonId: input.lessonId,
        itemType: input.itemType,
        itemId: input.itemId,
        question: input.question,
        language: input.language,
      })
      // Lo stesso id di un altro studente non sovrascrive nulla.
      .onConflictDoNothing({ target: studyQuestions.id })
      .returning({ id: studyQuestions.id });
    return rows.length > 0;
  }

  /** {@inheritDoc QuestionRepository.load} */
  async load(userId: UserId, id: string): Promise<StoredQuestion | null> {
    const [row] = await withUserRls(this.db, userId, (tx) =>
      tx.select().from(studyQuestions).where(eq(studyQuestions.id, id)),
    );
    return row ? toStored(row) : null;
  }

  /** {@inheritDoc QuestionRepository.list} */
  async list(userId: UserId, filter: 'all' | 'pending', limit?: number): Promise<StoredQuestion[]> {
    const rows = await withUserRls(this.db, userId, (tx) => {
      const query = tx
        .select()
        .from(studyQuestions)
        .where(filter === 'pending' ? eq(studyQuestions.status, 'pending') : undefined)
        .orderBy(
          ...(filter === 'pending'
            ? [asc(studyQuestions.createdAt), asc(studyQuestions.id)]
            : [desc(studyQuestions.createdAt), desc(studyQuestions.id)]),
        );
      return limit === undefined ? query : query.limit(limit);
    });
    return rows.map(toStored);
  }

  /** {@inheritDoc QuestionRepository.answer} */
  async answer(userId: UserId, id: string, answer: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(studyQuestions)
      .set({ answer, status: 'answered', answeredAt: at })
      .where(
        and(
          eq(studyQuestions.id, id),
          eq(studyQuestions.userId, userId),
          // Vale la prima risposta.
          eq(studyQuestions.status, 'pending'),
        ),
      )
      .returning({ id: studyQuestions.id });
    return rows.length > 0;
  }

  /** {@inheritDoc QuestionRepository.delete} */
  async delete(userId: UserId, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(studyQuestions)
      .where(and(eq(studyQuestions.id, id), eq(studyQuestions.userId, userId)))
      .returning({ id: studyQuestions.id });
    return rows.length > 0;
  }
}

type Row = typeof studyQuestions.$inferSelect;

function toStored(row: Row): StoredQuestion {
  return {
    id: row.id,
    subjectId: row.subjectId,
    lessonId: row.lessonId,
    // I vincoli della tabella garantiscono i valori.
    itemType: row.itemType as QuestionItemType,
    itemId: row.itemId,
    question: row.question,
    language: row.language as 'it' | 'en',
    status: row.status as QuestionStatus,
    answer: row.answer,
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString() ?? null,
  };
}
