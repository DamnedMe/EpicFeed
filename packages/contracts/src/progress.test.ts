import { describe, expect, it } from 'vitest';
import { progressPutSchema, progressResponseSchema, PROGRESS_KDF } from './progress.js';

const valid = {
  kdf: PROGRESS_KDF,
  salt: `${'A'.repeat(22)}==`,
  iv: 'B'.repeat(16),
  ciphertext: 'C'.repeat(40),
};

describe('progressPutSchema', () => {
  it('accetta una copia cifrata con la versione di partenza', () => {
    expect(progressPutSchema.safeParse({ ...valid, baseRevision: null }).success).toBe(true);
    expect(progressPutSchema.safeParse({ ...valid, baseRevision: 3 }).success).toBe(true);
  });

  it('rifiuta campi non validi o in più', () => {
    for (const body of [
      { ...valid, baseRevision: 0 },
      { ...valid, salt: 'short', baseRevision: null },
      { ...valid, iv: '!'.repeat(16), baseRevision: null },
      { ...valid, ciphertext: 'x', baseRevision: null },
      { ...valid, kdf: 'MD5!', baseRevision: null },
      { ...valid, baseRevision: null, plaintext: 'no' },
    ]) {
      expect(progressPutSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('progressResponseSchema', () => {
  it('richiede la versione', () => {
    expect(progressResponseSchema.safeParse({ ...valid, revision: 2 }).success).toBe(true);
    expect(progressResponseSchema.safeParse(valid).success).toBe(false);
  });
});
