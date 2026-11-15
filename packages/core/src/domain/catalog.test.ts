import { describe, expect, it } from 'vitest';
import { createLesson, createLessonPart } from './catalog.js';
import type { ChapterId, LessonId, LessonPartId } from './ids.js';
import { DomainError } from './errors.js';

const lessonId = '11111111-1111-4111-8111-111111111111' as LessonId;
const chapterId = '22222222-2222-4222-8222-222222222222' as ChapterId;
const partId = '33333333-3333-4333-8333-333333333333' as LessonPartId;

describe('createLesson', () => {
  it('normalizza titolo e id Epicode e congela il risultato', () => {
    const lesson = createLesson({
      id: lessonId,
      chapterId,
      epicodeId: ' 1542 ',
      title: ' Closure ',
      position: 2,
    });
    expect(lesson).toEqual({
      id: lessonId,
      chapterId,
      epicodeId: '1542',
      title: 'Closure',
      position: 2,
    });
    expect(Object.isFrozen(lesson)).toBe(true);
  });

  it('rifiuta id Epicode con caratteri non sicuri', () => {
    expect(() =>
      createLesson({ id: lessonId, chapterId, epicodeId: '../etc', title: 'X', position: 0 }),
    ).toThrow(DomainError);
  });
});

describe('createLessonPart', () => {
  it('crea una parte valida', () => {
    const part = createLessonPart({
      id: partId,
      lessonId,
      epicodeId: 'a1b2',
      kind: 'video',
      title: 'Introduzione',
      position: 0,
    });
    expect(part.kind).toBe('video');
    expect(part.videoId).toBeUndefined();
  });

  it("valida l'id del video", () => {
    const base = {
      id: partId,
      lessonId,
      epicodeId: '66864',
      kind: 'video' as const,
      title: 'Properties of binary trees',
      position: 0,
    };
    expect(createLessonPart({ ...base, videoId: ' 1034168708 ' }).videoId).toBe('1034168708');
    expect(() => createLessonPart({ ...base, videoId: '12a' })).toThrow(/video non valido/);
  });

  it('rifiuta un tipo sconosciuto', () => {
    expect(() =>
      createLessonPart({
        id: partId,
        lessonId,
        epicodeId: 'a1b2',
        kind: 'quiz' as 'video',
        title: 'Quiz',
        position: 0,
      }),
    ).toThrow(/Tipo di parte sconosciuto/);
  });
});
