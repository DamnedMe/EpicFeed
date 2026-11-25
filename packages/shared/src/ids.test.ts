import { describe, expect, it } from 'vitest';
import { parseId } from './ids.js';

describe('parseId', () => {
  it('accetta un UUID e lo porta in minuscolo', () => {
    expect(parseId(' 0B5A2C1E-6F1D-4A7B-9C3E-2D4F6A8B0C1D ', 'LessonId')).toBe(
      '0b5a2c1e-6f1d-4a7b-9c3e-2d4f6a8b0c1d',
    );
  });

  it.each(['', 'non-un-uuid', '0b5a2c1e-6f1d-4a7b-9c3e-2d4f6a8b0c1', "1' OR '1'='1"])(
    'rifiuta %j',
    (value) => {
      expect(() => parseId(value, 'LessonId')).toThrow(/LessonId non è un UUID valido/);
    },
  );
});
