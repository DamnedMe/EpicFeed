import { and, asc, count, eq, gt, isNull, lte } from 'drizzle-orm';
import type {
  ExamCorrectionDraft,
  ExamSubmissionDraft,
  SubmissionKind,
} from '../domain/correction.js';
import type { ExamSubmissionRepository, StoredSubmission } from '../application/correction.js';
import type { UserId } from '@epicfeed/shared';
import { examSubmissions, subjects } from '@epicfeed/db';
import type { Database } from '@epicfeed/db';
import { withUserRls } from '@epicfeed/db';

/**
 * Risposte inviate a Claude per la correzione, su Postgres (porta
 * `ExamSubmissionRepository` di `application/ports.ts`, M4). Le letture passano dalla RLS
 * dello studente; le scritture usano la connessione del server e sono sempre
 * filtrate per lo studente. Gli invii scaduti non si vedono più e si
 * cancellano a ogni elenco.
 */
export class DrizzleExamSubmissionRepository implements ExamSubmissionRepository {
  /**
   * @param db - Database.
   * @param now - Orologio del database per la scadenza (sostituibile nei test).
   */
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** {@inheritDoc ExamSubmissionRepository.subjectVisible} */
  async subjectVisible(userId: UserId, subjectId: string): Promise<boolean> {
    const rows = await withUserRls(this.db, userId, (tx) =>
      tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)),
    );
    return rows.length > 0;
  }

  /** {@inheritDoc ExamSubmissionRepository.countPending} */
  async countPending(userId: UserId): Promise<number> {
    const [row] = await withUserRls(this.db, userId, (tx) =>
      tx
        .select({ value: count() })
        .from(examSubmissions)
        .where(and(isNull(examSubmissions.correction), gt(examSubmissions.expiresAt, this.now()))),
    );
    return row?.value ?? 0;
  }

  /** {@inheritDoc ExamSubmissionRepository.create} */
  async create(userId: UserId, draft: ExamSubmissionDraft): Promise<string> {
    const [row] = await this.db
      .insert(examSubmissions)
      .values({ userId, subjectId: draft.subjectId, kind: draft.kind, submission: draft })
      .returning({ id: examSubmissions.id });
    if (!row) throw new Error('Invio non salvato');
    return row.id;
  }

  /** {@inheritDoc ExamSubmissionRepository.list} */
  async list(userId: UserId, filter: 'all' | 'pending'): Promise<StoredSubmission[]> {
    const rows = await withUserRls(this.db, userId, (tx) =>
      tx
        .select()
        .from(examSubmissions)
        .where(
          and(
            gt(examSubmissions.expiresAt, this.now()),
            filter === 'pending' ? isNull(examSubmissions.correction) : undefined,
          ),
        )
        .orderBy(asc(examSubmissions.createdAt), asc(examSubmissions.id)),
    );
    return rows.map(toStored);
  }

  /** {@inheritDoc ExamSubmissionRepository.load} */
  async load(userId: UserId, id: string): Promise<StoredSubmission | null> {
    const [row] = await withUserRls(this.db, userId, (tx) =>
      tx
        .select()
        .from(examSubmissions)
        .where(and(eq(examSubmissions.id, id), gt(examSubmissions.expiresAt, this.now()))),
    );
    return row ? toStored(row) : null;
  }

  /** {@inheritDoc ExamSubmissionRepository.saveCorrection} */
  async saveCorrection(
    userId: UserId,
    id: string,
    correction: ExamCorrectionDraft,
    at: Date,
  ): Promise<boolean> {
    const rows = await this.db
      .update(examSubmissions)
      .set({ correction, correctedAt: at })
      .where(
        and(
          eq(examSubmissions.id, id),
          eq(examSubmissions.userId, userId),
          // Vale la prima correzione: una seconda non sostituisce quella già scaricata.
          isNull(examSubmissions.correction),
        ),
      )
      .returning({ id: examSubmissions.id });
    return rows.length > 0;
  }

  /** {@inheritDoc ExamSubmissionRepository.delete} */
  async delete(userId: UserId, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(examSubmissions)
      .where(and(eq(examSubmissions.id, id), eq(examSubmissions.userId, userId)))
      .returning({ id: examSubmissions.id });
    return rows.length > 0;
  }

  /** {@inheritDoc ExamSubmissionRepository.purgeExpired} */
  async purgeExpired(now: Date): Promise<number> {
    const rows = await this.db
      .delete(examSubmissions)
      .where(lte(examSubmissions.expiresAt, now))
      .returning({ id: examSubmissions.id });
    return rows.length;
  }
}

type Row = typeof examSubmissions.$inferSelect;

function toStored(row: Row): StoredSubmission {
  return {
    id: row.id,
    subjectId: row.subjectId,
    kind: row.kind as SubmissionKind,
    // Validati con gli schemi dei contratti prima del salvataggio.
    submission: row.submission as ExamSubmissionDraft,
    correction: row.correction as ExamCorrectionDraft | null,
    createdAt: row.createdAt.toISOString(),
    correctedAt: row.correctedAt?.toISOString() ?? null,
  };
}
