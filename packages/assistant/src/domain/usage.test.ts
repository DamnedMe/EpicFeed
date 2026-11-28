import { describe, expect, it } from 'vitest';
import { addRequest, localDay, requestsToday } from './usage.js';

describe('richieste del giorno', () => {
  it('conta e ricomincia a mezzanotte', () => {
    const morning = new Date(2026, 10, 28, 9, 0);
    const tomorrow = new Date(2026, 10, 29, 0, 5);
    expect(localDay(morning)).toBe('2026-11-28');
    let usage = addRequest(null, morning);
    usage = addRequest(usage, morning);
    expect(requestsToday(usage, morning)).toBe(2);
    expect(requestsToday(usage, tomorrow)).toBe(0);
    expect(addRequest(usage, tomorrow)).toEqual({ day: '2026-11-29', count: 1 });
    expect(requestsToday(null, morning)).toBe(0);
  });
});
