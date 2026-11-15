import { describe, expect, it } from 'vitest';
import { bearerToken, isSameOrigin } from './http';

describe('isSameOrigin', () => {
  it('accetta solo richieste dalla stessa origine', () => {
    const make = (origin?: string) =>
      new Request('https://app.test/api/x', {
        method: 'POST',
        headers: origin ? { origin } : {},
      });
    expect(isSameOrigin(make('https://app.test'))).toBe(true);
    expect(isSameOrigin(make('https://evil.test'))).toBe(false);
    expect(isSameOrigin(make('null'))).toBe(false);
    expect(isSameOrigin(make())).toBe(false);
  });
});

describe('bearerToken', () => {
  it('estrae il token dall’header Authorization', () => {
    const make = (value?: string) =>
      new Request('https://app.test', { headers: value ? { authorization: value } : {} });
    expect(bearerToken(make('Bearer abc'))).toBe('abc');
    expect(bearerToken(make('Basic abc'))).toBeNull();
    expect(bearerToken(make())).toBeNull();
  });
});
