import type { ProgressPut } from '@epicfeed/contracts';
import { progressPutResponseSchema, progressResponseSchema } from '@epicfeed/contracts';
import type { ProgressSnapshot, ProgressVault, PushResult, RemoteProgress } from '@epicfeed/core';
import { decryptSnapshot, encryptSnapshot } from './crypto';

/** Errore di rete o del server: la sincronizzazione riproverà più tardi. */
export class SyncHttpError extends Error {
  /**
   * @param status - Codice HTTP (0 se la rete non risponde).
   */
  constructor(readonly status: number) {
    super(`Sincronizzazione non riuscita (${String(status)})`);
    this.name = 'SyncHttpError';
  }
}

/**
 * Copia cifrata sul server via `/api/progress` (porta `ProgressVault` del
 * core). Cifra e decifra nel browser: al server arrivano solo byte cifrati.
 */
export class HttpProgressVault implements ProgressVault {
  /**
   * @param passwordKey - Chiave della password (vedi `derivePasswordKey`).
   * @param fetcher - `fetch`, sostituibile nei test.
   */
  constructor(
    private readonly passwordKey: CryptoKey,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  /** @inheritdoc */
  async pull(): Promise<RemoteProgress | null> {
    const response = await this.request('/api/progress', { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new SyncHttpError(response.status);
    const parsed = progressResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SyncHttpError(response.status);
    const { revision, ...encrypted } = parsed.data;
    const snapshot = await decryptSnapshot(this.passwordKey, encrypted);
    return { revision, snapshot: snapshot ?? 'unreadable' };
  }

  /** @inheritdoc */
  async push(snapshot: ProgressSnapshot, baseRevision: number | null): Promise<PushResult> {
    const body: ProgressPut = {
      ...(await encryptSnapshot(this.passwordKey, snapshot)),
      baseRevision,
    };
    const response = await this.request('/api/progress', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 409) return { ok: false };
    if (!response.ok) throw new SyncHttpError(response.status);
    const parsed = progressPutResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SyncHttpError(response.status);
    return { ok: true, revision: parsed.data.revision };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, { credentials: 'same-origin', ...init });
    } catch {
      throw new SyncHttpError(0);
    }
  }
}
