import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type {
  CurrentLessonFeed,
  ExamBankDocument,
  ExamBankRepository,
  ExamContentRepository,
  ExamContentRows,
  SubjectForExam,
  CurrentLessonFeedWithDocument,
  ExamPackDocument,
  ExamPackRepository,
  LessonFeedDocument,
  LessonId,
  UserId,
} from '@epicfeed/core';
import { parseId } from '@epicfeed/core';
import {
  chapters,
  lessonExamPacks,
  lessonFeeds,
  lessons,
  subjectExamBanks,
  subjects,
} from '@epicfeed/db';
import type { Database, DatabaseTransaction } from './database.js';
import { withUserRls } from './database.js';

/**
 * Persistenza dei pacchetti d'esame e delle banche degli esercizi su Postgres
 * (porte `ExamPackRepository`, `ExamBankRepository` ed `ExamContentRepository`
 * del core, M4).
 *
 * Le **letture** passano dalla RLS dello studente: si vedono solo i feed di cui
 * possiede tutte le fonti, e quindi solo i loro pacchetti. La **scrittura** usa
 * la connessione del server, dopo che il caso d'uso ha verificato il feed.
 */
export class DrizzleExamPackRepository
  implements ExamPackRepository, ExamBankRepository, ExamContentRepository
{
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

  /** {@inheritDoc ExamContentRepository.loadExamContent} */
  async loadExamContent(userId: UserId, subjectId: string): Promise<ExamContentRows | null> {
    return withUserRls(this.db, userId, async (tx) => {
      const [subject] = await tx
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.id, subjectId));
      if (!subject) return null;

      // Feed corrente di ogni lezione della materia, con il suo pacchetto se c'è.
      const current = await tx
        .selectDistinctOn([lessonFeeds.lessonId], {
          lessonId: lessonFeeds.lessonId,
          packId: lessonExamPacks.id,
          pack: lessonExamPacks.pack,
        })
        .from(lessonFeeds)
        .innerJoin(lessons, eq(lessons.id, lessonFeeds.lessonId))
        .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
        .leftJoin(lessonExamPacks, eq(lessonExamPacks.lessonFeedId, lessonFeeds.id))
        .where(eq(chapters.subjectId, subject.id))
        .orderBy(lessonFeeds.lessonId, desc(lessonFeeds.generatedAt), asc(lessonFeeds.id));

      // La RLS mostra solo la banca dello studente.
      const [bank] = await tx
        .select({ id: subjectExamBanks.id, bank: subjectExamBanks.bank })
        .from(subjectExamBanks)
        .where(eq(subjectExamBanks.subjectId, subject.id));

      return {
        subjectId: subject.id,
        packs: current.flatMap((row) =>
          row.packId && row.pack
            ? [
                {
                  packId: row.packId,
                  lessonId: parseId(row.lessonId, 'LessonId'),
                  // Validato con gli schemi dei contratti al salvataggio.
                  document: row.pack as ExamPackDocument,
                },
              ]
            : [],
        ),
        bank: bank ? { bankId: bank.id, document: bank.bank as ExamBankDocument } : null,
      };
    });
  }

  /** {@inheritDoc ExamBankRepository.listSubjectsForExam} */
  async listSubjectsForExam(userId: UserId): Promise<SubjectForExam[]> {
    const { feeds, banks } = await withUserRls(this.db, userId, async (tx) => ({
      feeds: await currentFeeds(tx, true),
      // La RLS mostra solo le banche dello studente.
      banks: await tx.select({ subjectId: subjectExamBanks.subjectId }).from(subjectExamBanks),
    }));
    const withBank = new Set(banks.map((bank) => bank.subjectId));
    const bySubject = new Map<
      string,
      SubjectForExam & { concepts: SubjectForExam['concepts'][number][] }
    >();
    const sorted = [...feeds].sort(
      (a, b) => a.chapterPosition - b.chapterPosition || a.lessonPosition - b.lessonPosition,
    );
    for (const row of sorted) {
      let subject = bySubject.get(row.subjectId);
      if (!subject) {
        subject = {
          subjectId: row.subjectId,
          subjectTitle: row.subjectTitle,
          concepts: [],
          hasBank: withBank.has(row.subjectId),
        };
        bySubject.set(row.subjectId, subject);
      }
      // Il documento è stato validato con gli schemi dei contratti al salvataggio.
      for (const concept of (row.document as LessonFeedDocument).concepts) {
        if (subject.concepts.some((known) => known.key === concept.key)) continue;
        subject.concepts.push({
          key: concept.key,
          name: concept.name.en,
          description: concept.description.en,
        });
      }
    }
    return [...bySubject.values()].sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle));
  }

  /** {@inheritDoc ExamBankRepository.saveExamBank} */
  async saveExamBank(bank: {
    readonly document: ExamBankDocument;
    readonly generatedBy: UserId;
  }): Promise<{ bankId: string; created: boolean }> {
    const { document } = bank;
    const [inserted] = await this.db
      .insert(subjectExamBanks)
      .values({
        subjectId: document.subjectId,
        generatedBy: bank.generatedBy,
        promptVersion: document.promptVersion,
        bank: document,
        generatedAt: new Date(document.generatedAt),
      })
      // Vale la prima banca: gli esercizi già fatti restano gli stessi.
      .onConflictDoNothing({ target: [subjectExamBanks.subjectId, subjectExamBanks.generatedBy] })
      .returning({ id: subjectExamBanks.id });
    if (inserted) return { bankId: inserted.id, created: true };
    const [existing] = await this.db
      .select({ id: subjectExamBanks.id })
      .from(subjectExamBanks)
      .where(
        and(
          eq(subjectExamBanks.subjectId, document.subjectId),
          eq(subjectExamBanks.generatedBy, bank.generatedBy),
        ),
      );
    if (!existing) throw new Error('Banca non trovata dopo il conflitto');
    return { bankId: existing.id, created: false };
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
      subjectId: subjects.id,
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
