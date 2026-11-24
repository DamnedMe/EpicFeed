import type { ContentHash } from './content-hash.js';
import type { ContentVersionId, LessonPartId } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';

/**
 * Stato di generazione di una versione (ADR 0007). Le schede le genera Claude
 * Desktop tramite il server MCP, quindi la versione attende finché qualcuno
 * non avvia la generazione dal PC.
 *
 * - `pending`: da generare;
 * - `generating`: generazione in corso;
 * - `ready`: schede, quiz e concetti pronti;
 * - `failed`: l'ultimo tentativo è fallito, si può riprovare.
 */
export type GenerationStatus = 'pending' | 'generating' | 'ready' | 'failed';

/**
 * Revisione datata del contenuto di una parte di lezione, identificata dalla
 * sua impronta. Il contenuto è condiviso tra tutti gli studenti che lo
 * possiedono, e i derivati (schede, quiz) si generano una volta per versione.
 */
export interface ContentVersion {
  readonly id: ContentVersionId;
  readonly lessonPartId: LessonPartId;
  readonly contentHash: ContentHash;
  /** Primo import di questo contenuto da parte di un qualsiasi studente. */
  readonly firstSeenAt: Date;
  readonly generationStatus: GenerationStatus;
}

// Transizioni ammesse. `ready` è finale: l'API accetta il risultato una volta
// sola per versione, e una correzione passa da una nuova versione o da
// "Segnala errore" (ADR 0006), mai sovrascrivendo ciò che altri già studiano.
const TRANSITIONS: Readonly<Record<GenerationStatus, readonly GenerationStatus[]>> = {
  pending: ['generating'],
  generating: ['ready', 'failed', 'pending'],
  failed: ['generating'],
  ready: [],
};

/**
 * Dice se una versione può passare da uno stato di generazione a un altro.
 *
 * @param from - Stato attuale.
 * @param to - Stato desiderato.
 * @returns `true` se la transizione è ammessa.
 */
export function canTransition(from: GenerationStatus, to: GenerationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Restituisce la versione con il nuovo stato di generazione.
 *
 * @param version - Versione attuale (non viene modificata).
 * @param to - Stato desiderato.
 * @returns Una nuova versione con lo stato aggiornato.
 * @throws {@link DomainError} `INVALID_STATUS_TRANSITION` se la transizione non è ammessa.
 */
export function transitionGeneration(
  version: ContentVersion,
  to: GenerationStatus,
): ContentVersion {
  if (!canTransition(version.generationStatus, to)) {
    throw new DomainError(
      'INVALID_STATUS_TRANSITION',
      `Transizione non ammessa: ${version.generationStatus} → ${to}`,
    );
  }
  return Object.freeze({ ...version, generationStatus: to });
}
