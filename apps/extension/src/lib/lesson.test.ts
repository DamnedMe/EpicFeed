import { describe, expect, it } from 'vitest';
import { importLessonRequestSchema } from '@epicfeed/contracts';
import { DirectusClient } from './directus';
import { buildLessonDraft } from './lesson';
import type { CourseOutline } from './outline';

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
    const full = (
      responses.activity as { data: Record<string, unknown> & { children: { id: number }[] } }
    ).data;
    const byId: Record<string, unknown> = {
      '66864': responses.ref,
      '66863': { data: { ...full, parent: 66855 } },
      '66855': { data: { id: 66855, title: '3. Trees', type: 'module', sort: 2, parent: 66424 } },
      '66424': { data: { id: 66424, title: 'Unit', type: 'unit', sort: 1, parent: null } },
    };
    const client = new DirectusClient((path) => {
      paths.push(decodeURIComponent(path));
      if (path.startsWith('/items/courses')) return Promise.resolve(responses.course);
      const contentId = /\/items\/content\/(\d+)/.exec(path)?.[1] ?? '';
      if (paths.length === 1) return Promise.resolve(byId[contentId]);
      if (path.includes('summary')) {
        return Promise.resolve({ data: full.children.find((c) => String(c.id) === contentId) });
      }
      return Promise.resolve(byId[contentId]);
    });
    const ref = await client.contentRef('66864');
    const draft = buildLessonDraft(
      await client.activity(ref.parent ?? ''),
      await client.course('177'),
    );

    expect(paths.every((path) => !path.includes('*'))).toBe(true);
    expect(paths[0]).toBe('/items/content/66864?fields[]=id&fields[]=type&fields[]=parent');
    // ref, attività, modulo, unità, 3 parti utili (il video nascosto no), corso.
    expect(paths).toHaveLength(8);

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

  it('con l’indice del corso legge solo le parti utili, con il ritmo indicato', async () => {
    const paths: string[] = [];
    const full = (
      responses.activity as { data: { children: { id: number; visibility?: unknown }[] } }
    ).data;
    const outline: CourseOutline = {
      courseId: '177',
      chapters: [
        {
          id: '66855',
          title: '3. Trees',
          sort: 2,
          unitId: '66424',
          unitSort: 1,
          lessons: [
            {
              id: '66863',
              title: 'Binary trees',
              sort: 1,
              // L'indice contiene già solo le parti visibili.
              parts: full.children
                .filter((child) => !(child.visibility as { hidden?: boolean } | undefined)?.hidden)
                .map((child) => {
                  const c = child as unknown as {
                    id: number;
                    title: string;
                    type: string;
                    embed_type?: string;
                    sort: number;
                  };
                  return {
                    id: String(c.id),
                    title: c.title,
                    type: c.type,
                    embedType: c.embed_type ?? null,
                    sort: c.sort,
                  };
                }),
            },
          ],
        },
      ],
    };
    let waits = 0;
    const client = new DirectusClient((path) => {
      paths.push(decodeURIComponent(path));
      const contentId = /\/items\/content\/(\d+)/.exec(path)?.[1] ?? '';
      return Promise.resolve({ data: full.children.find((c) => String(c.id) === contentId) });
    });
    const activity = await client.activity('66863', {
      outline,
      beforePart: () => {
        waits += 1;
        return Promise.resolve();
      },
    });
    const draft = buildLessonDraft(activity, {
      id: '177',
      title: 'DSA',
      starts_at: null,
      tenant: null,
    });

    // Solo le 3 parti utili: niente attività, modulo, unità.
    expect(paths).toHaveLength(3);
    expect(paths.every((path) => path.includes('fields[]=summary'))).toBe(true);
    expect(waits).toBe(2);
    expect(draft.request.path.chapter).toEqual({
      epicodeId: '66855',
      title: '3. Trees',
      position: 1002,
    });
    expect(draft.request.parts.map((part) => part.epicodeId)).toEqual(['66864', '66866', '103064']);
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
