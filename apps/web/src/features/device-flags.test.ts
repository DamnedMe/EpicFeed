import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEED_COPY_COOKIE, setDeviceFlag } from './device-flags';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `document` e `window` minimi: registra i cookie scritti. */
function stubBrowser(protocol: string): string[] {
  const written: string[] = [];
  vi.stubGlobal('window', { location: { protocol } });
  vi.stubGlobal('document', {
    set cookie(value: string) {
      written.push(value);
    },
  });
  return written;
}

describe('setDeviceFlag', () => {
  it('accende il segnale per un anno, Secure su https', () => {
    const written = stubBrowser('https:');
    setDeviceFlag(FEED_COPY_COOKIE, true);
    expect(written).toEqual(['ef-feed-copy=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure']);
  });

  it('lo spegne scadendolo subito', () => {
    const written = stubBrowser('http:');
    setDeviceFlag(FEED_COPY_COOKIE, false);
    expect(written).toEqual(['ef-feed-copy=; Path=/; Max-Age=0; SameSite=Lax']);
  });

  it('fuori dal browser non fa niente', () => {
    expect(() => {
      setDeviceFlag(FEED_COPY_COOKIE, true);
    }).not.toThrow();
  });
});
