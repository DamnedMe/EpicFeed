import { describe, expect, it } from 'vitest';
import { BRIDGE_SOURCE, isAllowedPath, isBridgeMessage } from './cms-bridge';

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
      '/items/courses/177?fields[]=enrollments',
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

describe('isBridgeMessage', () => {
  it('riconosce solo i messaggi del ponte del tipo giusto', () => {
    const request = { source: BRIDGE_SOURCE, kind: 'request', id: '1', path: '/x' };
    expect(isBridgeMessage(request, 'request')).toBe(true);
    expect(isBridgeMessage(request, 'response')).toBe(false);
    expect(isBridgeMessage({ source: 'altro', kind: 'request', id: '1' }, 'request')).toBe(false);
    expect(isBridgeMessage(null, 'request')).toBe(false);
  });
});
