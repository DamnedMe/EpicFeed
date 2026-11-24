import { describe, expect, it } from 'vitest';
import { systemClock } from './clock.js';

describe('systemClock', () => {
  it("restituisce l'istante corrente", () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
