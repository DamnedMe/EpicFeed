import { and, asc, count, eq } from 'drizzle-orm';
import type { UserId } from '@epicfeed/shared';
import { chapters, feedCorrections, lessons, subjects } from '@epicfeed/db';
import type { Database } from '@epicfeed/db';
import { withUserRls } from '@epicfeed/db';
import type {
  ClaudeStatus,
  CorrectionCompletion,
  CorrectionDraft,
  StoredCorrection,
} from '../domain/corrections.js';
import type { CorrectionRepository, NewCorrection } from '../application/corrections.js';

/**
 * Correzioni personali su Postgres (porta `CorrectionRepository`, M5). Le
 * letture passano dalla RLS dello studente; le scritture usano la connessione
 * del server e sono sempre filtrate per lo studente.
 */
export class DrizzleCorrectionRepository implements CorrectionRepository {
  /** @param db - Database. */
  constructor(private readonly db: Database) {}

  /** {@inheritDoc CorrectionRepository.subjectVisible} */
  async subjectVisible(userId: UserId, subjectId: string): Promise<boolean> {
    const rows = await withUserRls(this.db, userId, (tx) =>
      tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)),
    );
    return rows.length > 0;
  }

  /** {@inheritDoc CorrectionRepository.lessonInSubject} */
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

  /** {@inheritDoc CorrectionRepository.count} */
  async count(userId: UserId): Promise<number> {
    const [row] = await withUserRls(this.db, userId, (tx) =>
      tx.select({ value: count() }).from(feedCorrections),
    );
    return row?.value ?? 0;
  }

  /** {@inheritDoc CorrectionRepository.insert} */
  async insert(userId: UserId, input: NewCorrection): Promise<boolean> {
    const rows = await this.db
      .insert(feedCorrections)
      .values({
        id: input.id,
        userId,
        subjectId: input.subjectId,
        lessonId: input.correction.kind === 'term' ? null : input.correction.lessonId,
        kind: input.correction.kind,
        correction: input.correction,
        claudeStatus: input.claudeStatus,
      })
      // Lo stesso id di un altro studente non sovrascrive nulla: resta la riga esistente.
      .onConflictDoNothing({ target: feedCorrections.id })
      .returning({ id: feedCorrections.id });
    return rows.length > 0;
  }

  /** {@inheritDoc CorrectionRepository.load} */
  async load(userId: UserId, id: string): Promise<StoredCorrection | null> {
    const [row] = await withUserRls(this.db, userId, (tx) =>
      tx.select().from(feedCorrections).where(eq(feedCorrections.id, id)),
    );
    return row ? toStored(row) : null;
  }

  /** {@inheritDoc CorrectionRepository.list} */
  async list(userId: UserId, filter: 'all' | 'pending'): Promise<StoredCorrection[]> {
    const rows = await withUserRls(this.db, userId, (tx) =>
      tx
        .select()
        .from(feedCorrections)
        .where(filter === 'pending' ? eq(feedCorrections.claudeStatus, 'pending') : undefined)
        .orderBy(asc(feedCorrections.createdAt), asc(feedCorrections.id)),
    );
    return rows.map(toStored);
  }

  /** {@inheritDoc CorrectionRepository.complete} */
  async complete(
    userId: UserId,
    id: string,
    completion: CorrectionCompletion,
    at: Date,
  ): Promise<boolean> {
    const rows = await this.db
      .update(feedCorrections)
      .set({
        completion,
        claudeStatus: completion.outcome === 'done' ? 'done' : 'disputed',
        completedAt: at,
      })
      .where(
        and(
          eq(feedCorrections.id, id),
          eq(feedCorrections.userId, userId),
          // Vale il primo esito: un secondo non sostituisce quello già scaricato.
          eq(feedCorrections.claudeStatus, 'pending'),
        ),
      )
      .returning({ id: feedCorrections.id });
    return rows.length > 0;
  }

  /** {@inheritDoc CorrectionRepository.delete} */
  async delete(userId: UserId, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(feedCorrections)
      .where(and(eq(feedCorrections.id, id), eq(feedCorrections.userId, userId)))
      .returning({ id: feedCorrections.id });
    return rows.length > 0;
  }
}

type Row = typeof feedCorrections.$inferSelect;

function toStored(row: Row): StoredCorrection {
  return {
    id: row.id,
    subjectId: row.subjectId,
    // Validate con gli schemi dei contratti prima del salvataggio.
    correction: row.correction as CorrectionDraft,
    claudeStatus: row.claudeStatus as ClaudeStatus,
    completion: row.completion as CorrectionCompletion | null,
    createdAt: row.createdAt.toISOString(),
  };
}
