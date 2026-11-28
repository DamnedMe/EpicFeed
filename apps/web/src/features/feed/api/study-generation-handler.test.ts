import { describe, expect, it, vi } from 'vitest';
import type { ContentHash } from '@epicfeed/catalog';
import type { ReadSubjectFeedResult } from '@epicfeed/feed';
import { DomainError } from '@epicfeed/shared';
import { studySubjectsResponseSchema, subjectFeedResponseSchema } from '@epicfeed/feed';
import { accessDeps, record, request, user } from '@/server/generation-test-kit';
import type { StudyGenerationDeps } from './study-generation-handler';
import { handleListStudySubjects, handleReadStudySubject } from './study-generation-handler';

vi.mock('server-only', () => ({}));

const subjectId = '40000000-0000-4000-8000-000000000001';

const feed: ReadSubjectFeedResult = {
  feed: {
    subjectId,
    title: 'DSA',
    version: 'f'.repeat(64) as ContentHash,
    chapters: [],
  },
  outdated: [],
};

function deps(over: Partial<StudyGenerationDeps> = {}): StudyGenerationDeps {
  return {
    ...accessDeps(),
    listSubjects: () =>
      Promise.resolve([
        { subjectId, title: 'DSA', editionLabel: '2026', lessons: 31, lessonsWithFeed: 31 },
      ]),
    readSubjectFeed: () => Promise.resolve(feed),
    ...over,
  };
}

describe('feed per l’assistente di Claude Desktop', () => {
  it('elenca le materie con il token', async () => {
    const response = await handleListStudySubjects(
      request('/api/generation/study/subjects'),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(studySubjectsResponseSchema.parse(await response.json()).subjects).toHaveLength(1);
    expect(record).toHaveBeenCalledWith(user, 'read', null);
    const anonymous = await handleListStudySubjects(
      request('/api/generation/study/subjects', {}, 'sfg_wrong'),
      deps(),
    );
    expect(anonymous.status).toBe(401);
  });

  it('restituisce il feed della materia nella forma della web app', async () => {
    const response = await handleReadStudySubject(
      request(`/api/generation/study/subjects/${subjectId}`),
      subjectId.toUpperCase(),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(subjectFeedResponseSchema.parse(await response.json()).title).toBe('DSA');
  });

  it('404 per un id non valido o una materia non importata', async () => {
    const invalid = await handleReadStudySubject(request('/x'), 'x', deps());
    expect(invalid.status).toBe(404);
    const missing = await handleReadStudySubject(
      request('/x'),
      subjectId,
      deps({ readSubjectFeed: () => Promise.reject(new DomainError('NOT_FOUND', 'x')) }),
    );
    expect(missing.status).toBe(404);
  });
});
