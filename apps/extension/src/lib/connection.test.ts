import { describe, expect, it } from 'vitest';
import { acceptConnection, usableConnection } from './connection';

const token = `sfi_${'B'.repeat(43)}`;
const future = new Date(Date.now() + 86_400_000).toISOString();
const app = 'https://study-feed.vercel.app';
const message = { type: 'study-feed/connect', token, expiresAt: future, apiBaseUrl: app };

describe('acceptConnection', () => {
  it('accetta il collegamento dalla web app ammessa', () => {
    expect(acceptConnection(message, app, [app])).toEqual({
      token,
      expiresAt: future,
      apiBaseUrl: app,
    });
  });

  it('rifiuta mittenti diversi dall’apiBaseUrl, origini non ammesse e token scaduti', () => {
    expect(acceptConnection(message, 'https://evil.test', [app])).toBeNull();
    expect(
      acceptConnection({ ...message, apiBaseUrl: 'https://evil.test' }, 'https://evil.test', [app]),
    ).toBeNull();
    expect(
      acceptConnection({ ...message, expiresAt: '2020-01-01T00:00:00Z' }, app, [app]),
    ).toBeNull();
    expect(acceptConnection({ type: 'altro' }, app, [app])).toBeNull();
    expect(acceptConnection(message, undefined, [app])).toBeNull();
  });
});

describe('usableConnection', () => {
  it('valida il collegamento salvato', () => {
    expect(usableConnection({ token, expiresAt: future, apiBaseUrl: app })).not.toBeNull();
    expect(
      usableConnection({ token, expiresAt: '2020-01-01T00:00:00Z', apiBaseUrl: app }),
    ).toBeNull();
    expect(usableConnection(undefined)).toBeNull();
  });
});
