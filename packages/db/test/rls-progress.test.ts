import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDatabase } from '../src/testing.js';

// Progressi sincronizzati (M4, ADR 0018): ognuno legge solo la propria copia cifrata.
const anna = '0a0a0a0a-0000-4000-8000-00000000000a';
const bruno = '0b0b0b0b-0000-4000-8000-00000000000b';
const SALT = 'A'.repeat(22) + '==';
const IV = 'B'.repeat(16);
const CIPHER = 'C'.repeat(40);

let db: PGlite;

const insert = (user: string, salt = SALT, iv = IV, ciphertext = CIPHER, revision = 1) =>
  db.query(
    `insert into progress_snapshots (user_id, revision, kdf, salt, iv, ciphertext)
     values ($1, $2, 'pbkdf2-sha256-600000', $3, $4, $5)`,
    [user, revision, salt, iv, ciphertext],
  );

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users (id) values ('${anna}'), ('${bruno}')`);
  await insert(anna);
});

afterAll(async () => {
  await db.close();
});

describe('RLS dei progressi sincronizzati', () => {
  it('lo studente vede solo la propria copia', async () => {
    expect(await asUser(db, anna, (q) => q(`select * from progress_snapshots`))).toHaveLength(1);
    expect(await asUser(db, bruno, (q) => q(`select * from progress_snapshots`))).toEqual([]);
  });

  it('anon non ha privilegi', async () => {
    await expect(asUser(db, null, (q) => q(`select * from progress_snapshots`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each([
    `update progress_snapshots set revision = 99`,
    `delete from progress_snapshots`,
    `insert into progress_snapshots (user_id, revision, kdf, salt, iv, ciphertext) values ('${bruno}', 1, 'x', '${SALT}', '${IV}', '${CIPHER}')`,
  ])('scrittura negata dal client: %s', async (statement) => {
    await expect(asUser(db, anna, (q) => q(statement))).rejects.toThrow(/permission denied/);
  });
});

describe('Integrità dei progressi sincronizzati', () => {
  it('una sola copia per utente', async () => {
    await expect(insert(anna)).rejects.toThrow(/progress_snapshots_pkey/);
  });

  it('rifiuta sale, iv, testo cifrato e versione non validi', async () => {
    await expect(insert(bruno, 'short')).rejects.toThrow(/progress_snapshots_salt_check/);
    await expect(insert(bruno, SALT, 'x')).rejects.toThrow(/progress_snapshots_iv_check/);
    await expect(insert(bruno, SALT, IV, 'not base64!')).rejects.toThrow(
      /progress_snapshots_ciphertext_check/,
    );
    await expect(insert(bruno, SALT, IV, CIPHER, 0)).rejects.toThrow(
      /progress_snapshots_revision_check/,
    );
  });
});
