import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';

describe('DomainError', () => {
  it('espone codice, messaggio e nome', () => {
    const error = new DomainError('INVALID_ID', 'id non valido');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      code: 'INVALID_ID',
      message: 'id non valido',
      name: 'DomainError',
    });
  });
});
