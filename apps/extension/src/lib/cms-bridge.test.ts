import { describe, expect, it } from 'vitest';
import {
  BRIDGE_SOURCE,
  isAllowedPath,
  isBridgeRequest,
  isBridgeResponse,
  pruneTree,
  treeCourseId,
} from './cms-bridge';

describe('isAllowedPath', () => {
  it('ammette le letture dell’import', () => {
    expect(isAllowedPath('/items/content/66750?fields[]=id&fields[]=type&fields[]=parent')).toBe(
      true,
    );
    expect(isAllowedPath('/items/courses/177?fields[]=id&fields[]=tenant.name')).toBe(true);
    expect(
      isAllowedPath('/items/content/1?fields[]=children.visibility.hidden&fields[]=summary'),
    ).toBe(true);
  });

  it('rifiuta jolly, altre collezioni, elenchi, filtri e campi non previsti', () => {
    for (const path of [
      '/items/courses/177?fields[]=*.*',
      '/items/courses/177?fields[]=campo_non_previsto',
      '/items/content_completions/1?fields[]=id',
      '/items/content?fields[]=id',
      '/items/content/1?fields[]=id&filter[id][_eq]=1',
      '/items/content/1',
      '/items/content/abc?fields[]=id',
      '/v2/content/checkmark-completion/177?fields[]=id',
    ]) {
      expect(isAllowedPath(path)).toBe(false);
    }
  });
});

describe('messaggi del ponte', () => {
  it('riconosce richieste di lettura e di indice ben formate', () => {
    const get = { source: BRIDGE_SOURCE, kind: 'request', id: '1', path: '/x' };
    const outline = { source: BRIDGE_SOURCE, kind: 'outline', id: '2', courseId: '177' };
    expect(isBridgeRequest(get)).toBe(true);
    expect(isBridgeRequest(outline)).toBe(true);
    expect(isBridgeResponse(get)).toBe(false);
    expect(isBridgeRequest({ ...outline, courseId: '177&x' })).toBe(false);
    expect(isBridgeRequest({ ...get, source: 'altro' })).toBe(false);
    expect(isBridgeRequest({ source: BRIDGE_SOURCE, kind: 'request', id: '1' })).toBe(false);
    expect(isBridgeRequest(null)).toBe(false);
  });

  it('riconosce le risposte', () => {
    const response = { source: BRIDGE_SOURCE, kind: 'response', id: '1', status: 200, body: {} };
    expect(isBridgeResponse(response)).toBe(true);
    expect(isBridgeRequest(response)).toBe(false);
    expect(isBridgeResponse({ ...response, status: '200' })).toBe(false);
  });
});

describe('treeCourseId', () => {
  // La richiesta che il portale fa per la barra laterale (osservata il 21/11/2026).
  const tree =
    'https://cms.epicode.edu.mt/items/content?fields=id,title,type,children.id&filter%5Bcourses%5D%5Bcourse%5D%5B_eq%5D=177&filter%5Btype%5D=unit';

  it('riconosce l’albero del corso', () => {
    expect(treeCourseId(tree)).toBe('177');
  });

  it('ignora le altre richieste', () => {
    expect(treeCourseId(tree.replace('unit', 'module'))).toBeNull();
    expect(treeCourseId(tree.replace('cms.epicode.edu.mt', 'cms.example.com'))).toBeNull();
    expect(treeCourseId(tree.replace('/items/content?', '/items/content/1?'))).toBeNull();
    expect(treeCourseId(tree.replace('_eq%5D=177', '_eq%5D=1,2'))).toBeNull();
    expect(treeCourseId('non un url')).toBeNull();
  });
});

describe('pruneTree', () => {
  it('tiene solo i campi dell’indice, fino alle parti', () => {
    const pruned = pruneTree({
      data: [
        {
          id: 1,
          title: 'Unità',
          type: 'unit',
          sort: 1,
          body: { blocks: ['testo lungo'] },
          visibility: { id: 9, hidden: false, opens_at: null, closes_at: null, extra: 'x' },
          children: [
            {
              id: 2,
              title: 'Modulo',
              type: 'module',
              children: [
                {
                  id: 3,
                  type: 'activity',
                  children: [{ id: 4, type: 'embed', embed_type: 'vimeo', children: [5, 6] }],
                },
              ],
            },
          ],
        },
        'non un nodo',
      ],
    });
    expect(pruned).toEqual({
      data: [
        {
          id: 1,
          title: 'Unità',
          type: 'unit',
          sort: 1,
          visibility: { hidden: false, opens_at: null, closes_at: null },
          children: [
            {
              id: 2,
              title: 'Modulo',
              type: 'module',
              children: [
                {
                  id: 3,
                  type: 'activity',
                  children: [{ id: 4, type: 'embed', embed_type: 'vimeo' }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('rifiuta risposte senza elenco', () => {
    expect(pruneTree({ data: {} })).toBeNull();
    expect(pruneTree(null)).toBeNull();
  });
});
