import { describe, expect, it } from 'vitest';
import type { ExamBankDocument, ExamPackDocument, LessonId, UserId } from '../domain/index.js';
import { DomainError } from '../domain/index.js';
import type { ExamContentRepository, ExamContentRows } from './exam-study.js';
import { ReadExamContent } from './exam-study.js';

const user = '0a0a0a0a-0000-4000-8000-00000000000a' as UserId;
const subject = '30000000-0000-4000-8000-000000000001';
const lessonA = '10000000-0000-4000-8000-000000000001' as LessonId;
const lessonB = '10000000-0000-4000-8000-000000000002' as LessonId;

function pack(lessonId: string): ExamPackDocument {
  return {
    lessonId,
    feedId: '60000000-0000-4000-8000-000000000001',
    promptVersion: '2026-11-24.1',
    generatedAt: '2026-11-24T10:00:00.000Z',
    questions: [],
    openQuestions: [],
  };
}

const bank: ExamBankDocument = {
  subjectId: subject,
  promptVersion: '2026-11-24.1',
  generatedAt: '2026-11-24T10:00:00.000Z',
  exercises: [],
};

function repository(rows: ExamContentRows | null): ExamContentRepository {
  return { loadExamContent: () => Promise.resolve(rows) };
}

describe('ReadExamContent', () => {
  it('restituisce pacchetti in ordine stabile, banca e impronta', async () => {
    const rows: ExamContentRows = {
      subjectId: subject,
      packs: [
        { packId: 'p2', lessonId: lessonB, document: pack(lessonB) },
        { packId: 'p1', lessonId: lessonA, document: pack(lessonA) },
      ],
      bank: { bankId: 'b1', document: bank },
    };
    const content = await new ReadExamContent(repository(rows)).execute(user, subject);
    expect(content.packs.map((item) => item.lessonId)).toEqual([lessonA, lessonB]);
    expect(content.bank).toBe(bank);
    expect(content.version).toMatch(/^[0-9a-f]{64}$/);

    // Stessi contenuti in un altro ordine: stessa impronta.
    const reversed = await new ReadExamContent(
      repository({ ...rows, packs: [...rows.packs].reverse() }),
    ).execute(user, subject);
    expect(reversed.version).toBe(content.version);
  });

  it('l’impronta cambia se cambia la banca o un pacchetto', async () => {
    const base: ExamContentRows = { subjectId: subject, packs: [], bank: null };
    const empty = await new ReadExamContent(repository(base)).execute(user, subject);
    const withBank = await new ReadExamContent(
      repository({ ...base, bank: { bankId: 'b1', document: bank } }),
    ).execute(user, subject);
    const withPack = await new ReadExamContent(
      repository({
        ...base,
        packs: [{ packId: 'p1', lessonId: lessonA, document: pack(lessonA) }],
      }),
    ).execute(user, subject);
    expect(new Set([empty.version, withBank.version, withPack.version]).size).toBe(3);
    expect(empty.bank).toBeNull();
  });

  it('materia non visibile: NOT_FOUND', async () => {
    await expect(new ReadExamContent(repository(null)).execute(user, subject)).rejects.toThrow(
      DomainError,
    );
  });
});
