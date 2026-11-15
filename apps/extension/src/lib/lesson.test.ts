import { describe, expect, it } from 'vitest';
import { importLessonRequestSchema } from '@study-feed/contracts';
import { DirectusClient } from './directus';
import { buildLessonDraft } from './lesson';

// Risposte con la forma osservata nel file HAR del 14/11 (testi inventati).
const responses: Record<string, unknown> = {
  ref: { data: { id: 66864, type: 'embed', parent: 66863 } },
  activity: {
    data: {
      id: 66863,
      title: 'Binary  trees',
      type: 'activity',
      sort: 1,
      parent: {
        id: 66855,
        title: '3. Trees',
        type: 'module',
        sort: 2,
        parent: { id: 66424, sort: 1 },
      },
      children: [
        {
          id: 66864,
          title: 'Properties of binary trees',
          type: 'embed',
          embed_type: 'vimeo',
          sort: 0,
          url: 'https://player.vimeo.com/video/1034168708?title=0&amp;byline=0',
          summary: { it: '# Alberi binari', en: '# Binary trees' },
          markdown: null,
          visibility: { hidden: false },
        },
        {
          id: 66865,
          title: 'Slide',
          type: 'embed',
          embed_type: 'googledocs',
          sort: 1,
          url: null,
          summary: {},
        },
        {
          id: 66866,
          title: 'Senza riassunto',
          type: 'embed',
          embed_type: 'vimeo',
          sort: 2,
          url: 'https://player.vimeo.com/video/42',
          summary: null,
        },
        {
          id: 66870,
          title: 'Nascosto',
          type: 'embed',
          embed_type: 'vimeo',
          sort: 3,
          url: 'https://player.vimeo.com/video/43',
          visibility: { hidden: true },
        },
        {
          id: 103064,
          title: 'Binary trees - Summary',
          type: 'markdown',
          sort: 6,
          markdown: '# Riassunto',
        },
        { id: 66888, title: 'Quiz', type: 'quiz', sort: 9999 },
      ],
    },
  },
  course: {
    data: {
      id: 177,
      title: 'Data Structures and Algorithms ',
      starts_at: '2025-02-27T15:09:03.000Z',
      tenant: { id: 5, name: 'EIT' },
    },
  },
};

describe('DirectusClient + buildLessonDraft', () => {
  it('chiede solo i campi necessari e costruisce un payload valido', async () => {
    const paths: string[] = [];
    const client = new DirectusClient((path) => {
      paths.push(decodeURIComponent(path));
      const key = path.startsWith('/items/courses')
        ? 'course'
        : paths.length === 1
          ? 'ref'
          : 'activity';
      return Promise.resolve(responses[key]);
    });
    const ref = await client.contentRef('66864');
    const draft = buildLessonDraft(
      await client.activity(ref.parent ?? ''),
      await client.course('177'),
    );

    expect(paths.every((path) => !path.includes('*'))).toBe(true);
    expect(paths[0]).toBe('/items/content/66864?fields[]=id&fields[]=type&fields[]=parent');

    expect(importLessonRequestSchema.safeParse(draft.request).success).toBe(true);
    expect(draft.request.path).toEqual({
      studyProgram: { epicodeId: '5', title: 'EIT' },
      edition: { label: '2024/25' },
      subject: { epicodeId: '177', title: 'Data Structures and Algorithms', position: 0 },
      chapter: { epicodeId: '66855', title: '3. Trees', position: 1002 },
      lesson: { epicodeId: '66863', title: 'Binary trees', position: 1 },
    });
    expect(draft.request.parts.map((part) => part.epicodeId)).toEqual(['66864', '66866', '103064']);
    expect(draft.request.parts[1]?.content).toEqual({ kind: 'video', summaries: {} });
    expect(draft.videos).toEqual([
      { partEpicodeId: '66864', videoId: '1034168708' },
      { partEpicodeId: '66866', videoId: '42' },
    ]);
    expect(draft.skipped).toBe(3);
  });

  it('senza istituto usa un corso di studi generico', () => {
    const activity = (responses.activity as { data: Parameters<typeof buildLessonDraft>[0] }).data;
    const draft = buildLessonDraft(activity, {
      id: '1',
      title: 'Corso',
      starts_at: null,
      tenant: null,
    });
    expect(draft.request.path.studyProgram).toEqual({ epicodeId: 'epicode', title: 'Epicode' });
    expect(draft.request.path.edition.label).toBe('Senza data');
  });
});
