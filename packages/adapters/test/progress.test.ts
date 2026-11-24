import type { PGlite } from '@electric-sql/pglite';
import type { UserId } from '@epicfeed/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/database.js';
import { DrizzleProgressRepository } from '../src/progress-repository.js';
import { anna, bruno, setup } from './setup.js';

let pg: PGlite;
let db: Database;

beforeAll(async () => {
  ({ pg, db } = await setup());
});

afterAll(async () => {
  await pg.close();
});

const copy = (text: string) => ({
  kdf: 'pbkdf2-sha256-600000',
  salt: `${'A'.repeat(22)}==`,
  iv: 'B'.repeat(16),
  ciphertext: text.repeat(24),
});

describe('DrizzleProgressRepository', () => {
  const repo = () => new DrizzleProgressRepository(db);
  const a = anna as UserId;
  const b = bruno as UserId;

  it('crea la prima copia una volta sola', async () => {
    expect(await repo().get(a)).toBeNull();
    expect(await repo().put(a, copy('x'), null)).toBe(1);
    expect(await repo().put(a, copy('y'), null)).toBeNull();
    expect(await repo().get(a)).toEqual({ revision: 1, ...copy('x') });
  });

  it('aggiorna solo dalla versione corrente', async () => {
    expect(await repo().put(a, copy('z'), 1)).toBe(2);
    expect(await repo().put(a, copy('w'), 1)).toBeNull();
    expect((await repo().get(a))?.ciphertext).toBe('z'.repeat(24));
  });

  it('non mostra né tocca la copia di un altro studente', async () => {
    expect(await repo().get(b)).toBeNull();
    expect(await repo().put(b, copy('q'), 2)).toBeNull();
    expect((await repo().get(a))?.revision).toBe(2);
  });
});
