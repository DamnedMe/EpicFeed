import { describe, expect, it } from 'vitest';
import { readImported, withImported } from './imported';

describe('memoria delle lezioni importate', () => {
  it('legge in modo tollerante', () => {
    expect(readImported(null)).toEqual({});
    expect(readImported({ '1': '2026-11-21T00:00:00.000Z', x: 'no', '2': 3 })).toEqual({
      '1': '2026-11-21T00:00:00.000Z',
    });
  });

  it('aggiunge e aggiorna la data', () => {
    const first = withImported({}, '1', new Date('2026-11-20T00:00:00Z'));
    const second = withImported(first, '1', new Date('2026-11-21T00:00:00Z'));
    expect(second).toEqual({ '1': '2026-11-21T00:00:00.000Z' });
  });
});
