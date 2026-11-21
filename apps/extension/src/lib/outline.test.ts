import { describe, expect, it } from 'vitest';
import { isAvailable, isUsefulPart, lessonWork, locate, parseOutline } from './outline';

const now = new Date('2026-11-21T12:00:00Z');

// Forma dell'albero ridotto (pruneTree) osservata sul portale il 21/11/2026; titoli inventati.
const tree = {
  data: [
    {
      id: 66424,
      title: 'Data Structures and Algorithms',
      type: 'unit',
      sort: 1,
      visibility: { hidden: false, opens_at: null, closes_at: null },
      children: [
        {
          id: 66855,
          title: '3. Trees',
          type: 'module',
          sort: 3,
          children: [
            {
              id: 66870,
              title: 'Programmata',
              type: 'activity',
              sort: 2,
              visibility: { hidden: false, opens_at: '2027-01-01T00:00:00Z', closes_at: null },
              children: [],
            },
            {
              id: 66863,
              title: 'Binary  trees',
              type: 'activity',
              sort: 1,
              children: [
                { id: 66865, title: 'Slide', type: 'embed', embed_type: 'googledocs', sort: 1 },
                { id: 66864, title: 'Video', type: 'embed', embed_type: 'vimeo', sort: 0 },
                {
                  id: 66866,
                  title: 'Nascosto',
                  type: 'embed',
                  embed_type: 'vimeo',
                  sort: 2,
                  visibility: { hidden: true },
                },
                { id: 103064, title: 'Summary', type: 'markdown', sort: 6 },
                { id: 66888, title: 'Quiz', type: 'quiz', sort: 9999 },
              ],
            },
          ],
        },
        {
          id: 66425,
          title: '1. Big O',
          type: 'module',
          sort: 1,
          children: [{ id: 66748, title: 'Arrays', type: 'activity', sort: 0, children: [] }],
        },
      ],
    },
    {
      id: 1,
      title: 'Unità nascosta',
      type: 'unit',
      sort: 0,
      visibility: { hidden: true },
      children: [{ id: 2, title: 'Mai', type: 'module', children: [] }],
    },
    { id: 'non valido', type: 'unit' },
  ],
};

describe('parseOutline', () => {
  it('ordina capitoli e lezioni e tiene solo i contenuti visibili adesso', () => {
    const outline = parseOutline('177', tree, now);
    expect(outline?.chapters.map((chapter) => chapter.title)).toEqual(['1. Big O', '3. Trees']);
    const trees = outline?.chapters[1];
    expect(trees).toMatchObject({ id: '66855', unitId: '66424', unitSort: 1, sort: 3 });
    expect(trees?.lessons.map((lesson) => lesson.id)).toEqual(['66863']);
    expect(trees?.lessons[0]?.title).toBe('Binary trees');
    expect(trees?.lessons[0]?.parts.map((part) => part.id)).toEqual([
      '66864',
      '66865',
      '103064',
      '66888',
    ]);
  });

  it('restituisce null se la forma non è quella attesa', () => {
    expect(parseOutline('177', { data: 'x' }, now)).toBeNull();
    expect(parseOutline('177', null, now)).toBeNull();
  });
});

describe('locate', () => {
  const outline = parseOutline('177', tree, now);

  it('trova la lezione dall’attività o da una sua parte', () => {
    if (!outline) throw new Error('indice mancante');
    expect(locate(outline, '66863')?.lesson.id).toBe('66863');
    expect(locate(outline, '103064')?.chapter.id).toBe('66855');
    expect(locate(outline, '66866')).toBeNull();
  });
});

describe('isAvailable', () => {
  it('rispetta nascosto, apertura e chiusura', () => {
    expect(isAvailable(null, now)).toBe(true);
    expect(isAvailable({ hidden: true }, now)).toBe(false);
    expect(isAvailable({ opens_at: '2026-11-22T00:00:00Z' }, now)).toBe(false);
    expect(isAvailable({ closes_at: '2026-11-20T00:00:00Z' }, now)).toBe(false);
    expect(isAvailable({ opens_at: '2026-11-01T00:00:00Z', closes_at: null }, now)).toBe(true);
  });
});

describe('lessonWork', () => {
  it('conta video Vimeo e testi', () => {
    const lesson = parseOutline('177', tree, now)?.chapters[1]?.lessons[0];
    if (!lesson) throw new Error('lezione mancante');
    expect(lessonWork(lesson)).toEqual({ videos: 1, readings: 1 });
    expect(isUsefulPart({ type: 'embed', embedType: 'googledocs' })).toBe(false);
  });
});
