import { describe, expect, it, vi } from 'vitest';
import { LIBRARY_TTL_MS, StudyLibrary } from './library.js';
import { SUBJECT_ID, dsaFeed } from './testing.js';

const subjects = [
  {
    subjectId: SUBJECT_ID,
    title: 'Data Structures',
    editionLabel: '2026',
    lessons: 3,
    lessonsWithFeed: 2,
  },
  {
    subjectId: '40000000-0000-4000-8000-000000000002',
    title: 'Python',
    editionLabel: '2026',
    lessons: 4,
    lessonsWithFeed: 0,
  },
];

function library() {
  let clock = 0;
  const api = {
    listStudySubjects: vi.fn(() => Promise.resolve({ subjects })),
    readStudySubject: vi.fn(() => Promise.resolve(dsaFeed())),
  };
  const lib = new StudyLibrary(api, () => clock);
  return { api, lib, tick: (ms: number) => (clock += ms) };
}

describe('libreria delle materie', () => {
  it('scarica materie e feed una volta e li rinnova dopo qualche minuto', async () => {
    const { api, lib, tick } = library();
    await lib.feed(SUBJECT_ID.toUpperCase());
    await lib.feed(SUBJECT_ID);
    await lib.subjects();
    await lib.subjects();
    expect(api.readStudySubject).toHaveBeenCalledTimes(1);
    expect(api.listStudySubjects).toHaveBeenCalledTimes(1);
    tick(LIBRARY_TTL_MS);
    await lib.feed(SUBJECT_ID);
    expect(api.readStudySubject).toHaveBeenCalledTimes(2);
    lib.forget(SUBJECT_ID);
    await lib.feed(SUBJECT_ID);
    expect(api.readStudySubject).toHaveBeenCalledTimes(3);
  });

  it('sceglie la materia per id o per titolo, solo tra quelle con lezioni generate', async () => {
    const { lib } = library();
    expect(await lib.feedsFor()).toHaveLength(1);
    expect(await lib.feedsFor('data')).toHaveLength(1);
    expect(await lib.feedsFor(SUBJECT_ID)).toHaveLength(1);
    expect(await lib.feedsFor('python')).toHaveLength(0);
  });
});
