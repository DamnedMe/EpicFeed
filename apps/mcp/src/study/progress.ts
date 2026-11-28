import type { AnswerRecord, ProgressSnapshot } from '@epicfeed/review';
import { EMPTY_SNAPSHOT, mergeSnapshots } from '@epicfeed/review';
import { decryptSnapshot, derivePasswordKey, encryptSnapshot } from '@epicfeed/review/crypto';
import type { EpicFeedApi } from '../api-client.js';

/** Operazioni dell'API usate per i progressi (sostituibili nei test). */
export type ProgressApi = Pick<EpicFeedApi, 'readProgress' | 'writeProgress'>;

/** Tentativi di scrittura quando un altro dispositivo scrive nello stesso momento. */
const WRITE_ATTEMPTS = 3;

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

/** Esito della scrittura delle risposte di un quiz. */
export type ProgressWriting =
  | { readonly status: 'ok'; readonly added: number }
  | { readonly status: 'no_credentials' }
  | { readonly status: 'wrong_password' }
  | { readonly status: 'busy' };

/**
 * Progressi dello studente decifrati sul PC (M6, ADR 0021).
 *
 * Il server MCP scarica la copia cifrata (ADR 0018) e la apre con la stessa
 * chiave del browser: PBKDF2 sulla password con il sale dall'email, poi
 * HKDF → AES-GCM. EpicFeed riceve solo il token; la password e i progressi
 * in chiaro restano in questo processo. La chiave si ricava una volta per
 * avvio (il passo lento, circa mezzo secondo).
 *
 * Le risposte dei quiz in chat si aggiungono come farebbe un dispositivo
 * (ADR 0018): si rilegge la copia, si uniscono le risposte, si cifra di
 * nuovo e si scrive solo se nessuno ha scritto nel frattempo, altrimenti si
 * riprova.
 */
export class StudentProgress {
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
    const snapshot = await decryptSnapshot(await this.passwordKey(this.credentials), remote);
    return snapshot ? { status: 'ok', snapshot } : { status: 'wrong_password' };
  }

  /**
   * Aggiunge allo storico cifrato le risposte di un quiz.
   *
   * @param answers - Risposte da aggiungere.
   * @returns Quante sono state aggiunte, oppure il motivo per cui non si scrive.
   */
  async append(answers: readonly AnswerRecord[]): Promise<ProgressWriting> {
    if (!this.credentials) return { status: 'no_credentials' };
    const key = await this.passwordKey(this.credentials);
    const added: ProgressSnapshot = { ...EMPTY_SNAPSHOT, answers };
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const remote = await this.api.readProgress();
      let base: ProgressSnapshot = EMPTY_SNAPSHOT;
      if (remote) {
        const opened = await decryptSnapshot(key, remote);
        // Una copia che non si apre non si sovrascrive mai (ADR 0018).
        if (!opened) return { status: 'wrong_password' };
        base = opened;
      }
      const merged = mergeSnapshots(base, added);
      const written = await this.api.writeProgress({
        ...(await encryptSnapshot(key, merged)),
        baseRevision: remote?.revision ?? null,
      });
      if (written !== null)
        return { status: 'ok', added: merged.answers.length - base.answers.length };
    }
    return { status: 'busy' };
  }

  private passwordKey(credentials: ProgressCredentials): Promise<CryptoKey> {
    this.key ??= derivePasswordKey(credentials.email, credentials.password);
    return this.key;
  }
}

/**
 * Messaggio per Claude quando i progressi non si leggono.
 *
 * @param status - Motivo.
 * @returns Il testo da mostrare allo studente.
 */
export function progressProblem(
  status: Exclude<ProgressReading['status'] | ProgressWriting['status'], 'ok'>,
): string {
  switch (status) {
    case 'busy':
      return 'I progressi stanno cambiando su un altro dispositivo proprio adesso: riprova tra qualche secondo.';
    case 'no_credentials':
      return 'Per conoscere i tuoi progressi, scrivi email e password di EpicFeed nelle impostazioni dell’estensione EpicFeed in Claude Desktop (Impostazioni › Estensioni › EpicFeed › Configura). La password resta sul PC: serve solo ad aprire la copia cifrata dei progressi.';
    case 'no_copy':
      return 'Sul server non c’è ancora una copia dei progressi: apri il Ripasso nell’app con la password, così i progressi si sincronizzano, poi riprova.';
    case 'wrong_password':
      return 'La copia dei progressi non si apre con email e password delle impostazioni dell’estensione: forse la password è cambiata. Aggiornala in Claude Desktop (Impostazioni › Estensioni › EpicFeed › Configura).';
  }
}
