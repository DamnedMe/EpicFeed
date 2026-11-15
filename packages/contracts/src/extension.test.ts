import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from './errors.js';
import { extensionConnectMessageSchema, importTokenSchema } from './extension.js';

const token = `sfi_${'A'.repeat(43)}`;

describe('extensionConnectMessageSchema', () => {
  it('accetta un messaggio di collegamento valido', () => {
    const message = {
      type: 'study-feed/connect',
      token,
      expiresAt: '2026-12-15T12:00:00Z',
      apiBaseUrl: 'https://study-feed.vercel.app',
    };
    expect(extensionConnectMessageSchema.parse(message)).toEqual(message);
  });

  it('rifiuta token malformati e URL non http', () => {
    expect(importTokenSchema.safeParse('sfi_corto').success).toBe(false);
    expect(
      extensionConnectMessageSchema.safeParse({
        type: 'study-feed/connect',
        token,
        expiresAt: '2026-12-15T12:00:00Z',
        apiBaseUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('valida un errore con codice noto', () => {
    expect(
      apiErrorSchema.safeParse({ error: { code: 'RATE_LIMITED', message: 'Troppi import' } })
        .success,
    ).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { code: 'BOH', message: '' } }).success).toBe(false);
  });
});
