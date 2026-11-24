import { and, eq, sql } from 'drizzle-orm';
import type { EncryptedProgressRepository, StoredProgress } from '../application/progress-sync.js';
import type { UserId } from '@epicfeed/shared';
import { progressSnapshots } from '@epicfeed/db';
import type { Database } from '@epicfeed/db';
import { withUserRls } from '@epicfeed/db';

/**
 * Copie cifrate dei progressi su Postgres (porta `EncryptedProgressRepository`
 * del core, ADR 0018). Il server non conosce la chiave: qui passano solo
 * stringhe base64 già cifrate nel browser.
 *
 * La lettura passa dalla RLS dello studente; la scrittura usa la connessione
 * del server, sempre filtrata per l'utente autenticato, con concorrenza
 * ottimistica sul numero di versione.
 */
export class DrizzleProgressRepository implements EncryptedProgressRepository {
  /**
   * @param db - Database.
   */
  constructor(private readonly db: Database) {}

  /** @inheritdoc */
  async get(userId: UserId): Promise<StoredProgress | null> {
    const rows = await withUserRls(this.db, userId, (tx) =>
      tx
        .select({
          revision: progressSnapshots.revision,
          kdf: progressSnapshots.kdf,
          salt: progressSnapshots.salt,
          iv: progressSnapshots.iv,
          ciphertext: progressSnapshots.ciphertext,
        })
        .from(progressSnapshots)
        .where(eq(progressSnapshots.userId, userId)),
    );
    return rows[0] ?? null;
  }

  /** @inheritdoc */
  async put(
    userId: UserId,
    data: Omit<StoredProgress, 'revision'>,
    baseRevision: number | null,
  ): Promise<number | null> {
    const values = { kdf: data.kdf, salt: data.salt, iv: data.iv, ciphertext: data.ciphertext };
    if (baseRevision === null) {
      // Prima copia: se un altro dispositivo l'ha appena creata, nessuna riga.
      const created = await this.db
        .insert(progressSnapshots)
        .values({ userId, revision: 1, ...values })
        .onConflictDoNothing({ target: progressSnapshots.userId })
        .returning({ revision: progressSnapshots.revision });
      return created[0]?.revision ?? null;
    }
    const updated = await this.db
      .update(progressSnapshots)
      .set({ ...values, revision: sql`${progressSnapshots.revision} + 1`, updatedAt: sql`now()` })
      .where(
        and(eq(progressSnapshots.userId, userId), eq(progressSnapshots.revision, baseRevision)),
      )
      .returning({ revision: progressSnapshots.revision });
    return updated[0]?.revision ?? null;
  }
}
