import { describe, expect, it } from 'vitest';
import { studySubjectsResponseSchema, subjectFeedResponseSchema } from './feed.js';

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000001`;

const response = (portalUrl: string) => ({
  subjectId: uuid(4),
  title: 'Data Structures and Algorithms',
  version: 'f'.repeat(64),
  chapters: [
    {
      chapterId: uuid(5),
      title: '3. Trees',
      lessons: [
        {
          lessonId: uuid(1),
          title: 'Binary trees',
          position: 1,
          portalUrl,
          parts: [{ partId: uuid(2), title: 'AVL', kind: 'video', position: 0, portalUrl }],
          feed: null,
        },
      ],
    },
  ],
});

describe('contratti del feed di studio', () => {
  it('accetta una materia con i link al portale Epicode', () => {
    const url = 'https://learn.epicode.edu.mt/course/177/curriculum/66863';
    expect(subjectFeedResponseSchema.parse(response(url)).chapters).toHaveLength(1);
  });

  it('rifiuta link fuori dal portale e campi in più', () => {
    expect(subjectFeedResponseSchema.safeParse(response('https://evil.test/x')).success).toBe(
      false,
    );
    const extra = { ...response('https://learn.epicode.edu.mt/course/1/curriculum/2'), x: 1 };
    expect(subjectFeedResponseSchema.safeParse(extra).success).toBe(false);
  });

  it("valida l'elenco delle materie", () => {
    const subject = {
      subjectId: uuid(4),
      title: 'DSA',
      editionLabel: '2024/25',
      lessons: 31,
      lessonsWithFeed: 31,
    };
    expect(studySubjectsResponseSchema.parse({ subjects: [subject] }).subjects).toHaveLength(1);
    expect(
      studySubjectsResponseSchema.safeParse({ subjects: [{ ...subject, lessons: -1 }] }).success,
    ).toBe(false);
  });
});
