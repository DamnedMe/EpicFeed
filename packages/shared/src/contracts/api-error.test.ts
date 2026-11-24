import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from './api-error.js';

describe('apiErrorSchema', () => {
  it('accetta un errore con codice noto e problemi puntuali', () => {
    const body = {
      error: {
        code: 'INVALID_FEED',
        message: 'feed non valido',
        issues: [{ path: 'cards.0', message: 'vuota' }],
      },
    };
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });

  it('rifiuta un codice sconosciuto o campi in più', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'BOOM', message: 'x' } }).success).toBe(false);
    expect(
      apiErrorSchema.safeParse({ error: { code: 'INTERNAL', message: 'x' }, extra: true }).success,
    ).toBe(false);
  });
});
