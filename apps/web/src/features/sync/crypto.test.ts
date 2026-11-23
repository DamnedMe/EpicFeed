import type { ProgressSnapshot } from '@study-feed/core';
import { describe, expect, it } from 'vitest';
import {
  decryptSnapshot,
  derivePasswordKey,
  encryptSnapshot,
  fromBase64,
  toBase64,
} from './crypto';

const snapshot: ProgressSnapshot = {
  version: 1,
  answers: [
    {
      conceptId: 's:stack',
      questionId: 'l1:quiz:q1',
      source: 'feed',
      grade: 'again',
      language: 'en',
      at: '2026-11-23T10:00:00.000Z',
    },
  ],
  reviewDays: ['2026-11-23'],
  bestStreak: 1,
};

describe('cifratura dei progressi', () => {
  it('cifra e decifra con la stessa password, con sale e iv nuovi ogni volta', async () => {
    const key = await derivePasswordKey(' Anna@Example.com ', 'una password lunga');
    const first = await encryptSnapshot(key, snapshot);
    const second = await encryptSnapshot(key, snapshot);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toContain('stack');
    expect(fromBase64(first.salt)).toHaveLength(16);
    expect(fromBase64(first.iv)).toHaveLength(12);
    // Stessa password e stessa email (anche scritta diversa) su un altro dispositivo.
    const other = await derivePasswordKey('anna@example.com', 'una password lunga');
    expect(await decryptSnapshot(other, first)).toEqual(snapshot);
  });

  it('non decifra con un’altra password, un’altra email o un testo alterato', async () => {
    const key = await derivePasswordKey('anna@example.com', 'una password lunga');
    const encrypted = await encryptSnapshot(key, snapshot);
    const wrong = await derivePasswordKey('anna@example.com', 'un’altra password');
    expect(await decryptSnapshot(wrong, encrypted)).toBeNull();
    const otherUser = await derivePasswordKey('bruno@example.com', 'una password lunga');
    expect(await decryptSnapshot(otherUser, encrypted)).toBeNull();
    const bytes = fromBase64(encrypted.ciphertext);
    bytes[5] = (bytes[5] ?? 0) ^ 1;
    expect(await decryptSnapshot(key, { ...encrypted, ciphertext: toBase64(bytes) })).toBeNull();
    expect(await decryptSnapshot(key, { ...encrypted, kdf: 'altro' })).toBeNull();
  });

  it('converte base64 anche per dati grandi', () => {
    const bytes = new Uint8Array(70_000).map((_, index) => (index * 31) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});
