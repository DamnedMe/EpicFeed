import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@epicfeed/db';
import {
  GENERATE_TOKEN_TTL_MS,
  GenerateTokenService,
  IMPORT_TOKEN_TTL_MS,
  ImportTokenService,
  hashToken,
} from './import-tokens.js';
import { GenerationRateLimiter, ImportRateLimiter } from './rate-limiter.js';
import { setupTestDatabase as setup, TEST_USERS } from '@epicfeed/db/testing';

const { anna, bruno } = TEST_USERS;

let pg: PGlite;
let db: Database;
let now = new Date('2026-11-15T12:00:00Z');
const clock = () => now;

beforeAll(async () => {
  ({ pg, db } = await setup());
});

afterAll(async () => {
  await pg.close();
});

describe('ImportTokenService', () => {
  it('crea un token che vale per il suo utente e salva solo l’impronta', async () => {
    const service = new ImportTokenService(db, clock);
    const issued = await service.issue(anna, 'Chrome sul PC');
    expect(issued.token).toMatch(/^sfi_[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt.getTime() - now.getTime()).toBe(IMPORT_TOKEN_TTL_MS);
    expect(await service.verify(issued.token)).toBe(anna);

    const stored = (await pg.query<{ token_hash: string }>('select token_hash from api_tokens'))
      .rows;
    expect(stored).toEqual([{ token_hash: hashToken(issued.token) }]);
    expect(JSON.stringify(stored)).not.toContain(issued.token);
  });

  it('rifiuta token malformati, sconosciuti, scaduti e revocati', async () => {
    const service = new ImportTokenService(db, clock);
    expect(await service.verify('Bearer x')).toBeNull();
    expect(await service.verify(`sfi_${'A'.repeat(43)}`)).toBeNull();

    const issued = await service.issue(bruno);
    expect(await service.revoke(anna, issued.id)).toBe(false); // non è suo
    expect(await service.verify(issued.token)).toBe(bruno);
    expect(await service.revoke(bruno, issued.id)).toBe(true);
    expect(await service.verify(issued.token)).toBeNull();

    const expiring = await service.issue(bruno);
    now = new Date(now.getTime() + IMPORT_TOKEN_TTL_MS + 1);
    expect(await service.verify(expiring.token)).toBeNull();
    expect(await service.listActive(bruno)).toEqual([]);
  });

  it('elenca i token attivi senza segreti', async () => {
    const service = new ImportTokenService(db, clock);
    const issued = await service.issue(anna, 'Portatile');
    const list = await service.listActive(anna);
    expect(list.map((t) => t.label)).toEqual(['Portatile']);
    expect(list[0]?.id).toBe(issued.id);
    expect(Object.keys(list[0] ?? {})).not.toContain('tokenHash');
  });
});

describe('ImportRateLimiter', () => {
  it('blocca oltre il limite e riapre dopo la finestra', async () => {
    const limiter = new ImportRateLimiter(db, { limit: 2, windowMs: 60_000 }, clock);
    const lesson = null;
    expect(await limiter.isAllowed(anna)).toBe(true);
    await limiter.record(anna, lesson, 1);
    await limiter.record(anna, lesson, 1);
    expect(await limiter.isAllowed(anna)).toBe(false);
    expect(await limiter.isAllowed(bruno)).toBe(true);
    now = new Date(now.getTime() + 61_000);
    expect(await limiter.isAllowed(anna)).toBe(true);
  });
});

describe('GenerateTokenService', () => {
  it('crea token sfg_ di 90 giorni, separati da quelli di import', async () => {
    const generate = new GenerateTokenService(db, clock);
    const imports = new ImportTokenService(db, clock);
    const issued = await generate.issue(anna, 'Claude Desktop');
    expect(issued.token).toMatch(/^sfg_[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt.getTime() - now.getTime()).toBe(GENERATE_TOKEN_TTL_MS);
    expect(await generate.verify(issued.token)).toBe(anna);

    // Un token di un tipo non vale per l'altro, nemmeno cambiando il prefisso.
    expect(await imports.verify(issued.token)).toBeNull();
    expect(await imports.verify(issued.token.replace('sfg_', 'sfi_'))).toBeNull();
    const importToken = await imports.issue(anna);
    expect(await generate.verify(importToken.token)).toBeNull();

    // Elenco e revoca restano nel proprio tipo.
    expect((await generate.listActive(anna)).map((t) => t.id)).toEqual([issued.id]);
    expect(await imports.revoke(anna, issued.id)).toBe(false);
    expect(await generate.revoke(anna, issued.id)).toBe(true);
    expect(await generate.verify(issued.token)).toBeNull();
  });
});

describe('GenerationRateLimiter', () => {
  it('blocca oltre il limite e riapre dopo la finestra', async () => {
    const limiter = new GenerationRateLimiter(db, { limit: 2, windowMs: 60_000 }, clock);
    expect(await limiter.isAllowed(anna)).toBe(true);
    await limiter.record(anna, 'read', null);
    await limiter.record(anna, 'save', null);
    expect(await limiter.isAllowed(anna)).toBe(false);
    expect(await limiter.isAllowed(bruno)).toBe(true);
    now = new Date(now.getTime() + 61_000);
    expect(await limiter.isAllowed(anna)).toBe(true);
  });
});
