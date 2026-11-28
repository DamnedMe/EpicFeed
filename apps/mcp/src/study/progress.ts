import type { ProgressSnapshot } from '@epicfeed/review';
import { decryptSnapshot, derivePasswordKey } from '@epicfeed/review/crypto';
import type { EpicFeedApi } from '../api-client.js';

/** Operazioni dell'API usate per i progressi (sostituibili nei test). */
export type ProgressApi = Pick<EpicFeedApi, 'readProgress'>;

/**
 * Email e password dell'account EpicFeed, dalle impostazioni dell'estensione
 * in Claude Desktop (la password sta nel portachiavi del sistema). Servono
 * solo a ricavare sul PC la chiave dei progressi: non vengono mai inviate.
 */
export interface ProgressCredentials {
  readonly email: string;
  readonly password: string;
}

/** Esito della lettura dei progressi. */
export type ProgressReading =
  | { readonly status: 'ok'; readonly snapshot: ProgressSnapshot }
  | { readonly status: 'no_credentials' }
  | { readonly status: 'no_copy' }
  | { readonly status: 'wrong_password' };

/**
 * Progressi dello studente decifrati sul PC (M6, ADR 0021).
 *
 * Il server MCP scarica la copia cifrata (ADR 0018) e la apre con la stessa
 * chiave del browser: PBKDF2 sulla password con il sale dall'email, poi
 * HKDF → AES-GCM. EpicFeed riceve solo il token; la password e i progressi
 * in chiaro restano in questo processo. La chiave si ricava una volta per
 * avvio (il passo lento, circa mezzo secondo).
 */
export class ProgressReader {
  private key: Promise<CryptoKey> | null = null;

  /**
   * @param api - Client dell'API.
   * @param credentials - Email e password, oppure `null` se non impostate.
   */
  constructor(
    private readonly api: ProgressApi,
    private readonly credentials: ProgressCredentials | null,
  ) {}

  /**
   * Legge e decifra i progressi.
   *
   * @returns I progressi, oppure il motivo per cui non ci sono.
   */
  async read(): Promise<ProgressReading> {
    if (!this.credentials) return { status: 'no_credentials' };
    const remote = await this.api.readProgress();
    if (!remote) return { status: 'no_copy' };
    const { email, password } = this.credentials;
    this.key ??= derivePasswordKey(email, password);
    const snapshot = await decryptSnapshot(await this.key, remote);
    return snapshot ? { status: 'ok', snapshot } : { status: 'wrong_password' };
  }
}

/**
 * Messaggio per Claude quando i progressi non si leggono.
 *
 * @param status - Motivo.
 * @returns Il testo da mostrare allo studente.
 */
export function progressProblem(status: Exclude<ProgressReading['status'], 'ok'>): string {
  switch (status) {
    case 'no_credentials':
      return 'Per conoscere i tuoi progressi, scrivi email e password di EpicFeed nelle impostazioni dell’estensione EpicFeed in Claude Desktop (Impostazioni › Estensioni › EpicFeed › Configura). La password resta sul PC: serve solo ad aprire la copia cifrata dei progressi.';
    case 'no_copy':
      return 'Sul server non c’è ancora una copia dei progressi: apri il Ripasso nell’app con la password, così i progressi si sincronizzano, poi riprova.';
    case 'wrong_password':
      return 'La copia dei progressi non si apre con email e password delle impostazioni dell’estensione: forse la password è cambiata. Aggiornala in Claude Desktop (Impostazioni › Estensioni › EpicFeed › Configura).';
  }
}
