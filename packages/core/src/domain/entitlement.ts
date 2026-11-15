import type { ContentHash } from './content-hash.js';
import type { ContentVersion } from './content-version.js';
import type { ContentVersionId, LessonPartId, UserId } from './ids.js';
import { DomainError } from './errors.js';

/**
 * Su che base è stato concesso il permesso. Oggi solo la prova di possesso;
 * con un canale ufficiale Epicode si aggiungerà una verifica per corso
 * (ADR 0002, fase 2) senza cambiare il resto del dominio.
 */
export type EntitlementBasis = 'possession-proof';

/**
 * Permesso di uno studente su una versione di una parte di lezione.
 * Senza permesso lo studente non vede né il contenuto né i suoi derivati.
 */
export interface Entitlement {
  readonly userId: UserId;
  readonly lessonPartId: LessonPartId;
  readonly contentVersionId: ContentVersionId;
  readonly basis: EntitlementBasis;
  readonly grantedAt: Date;
}

/**
 * Concede il permesso su una versione a chi ne ha presentato il contenuto.
 *
 * La regola: non basta dichiarare di avere una lezione, bisogna inviarne il
 * contenuto. L'impronta va calcolata **dal server** sul contenuto ricevuto
 * (mai presa dal client) e deve coincidere con quella della versione.
 *
 * @param userId - Studente che ha importato il contenuto.
 * @param version - Versione esistente o appena creata con quel contenuto.
 * @param presentedHash - Impronta calcolata dal server sul contenuto ricevuto.
 * @param now - Istante della concessione (dalla porta `Clock`).
 * @returns Il nuovo permesso.
 * @throws {@link DomainError} `ENTITLEMENT_MISMATCH` se le impronte non coincidono.
 */
export function grantByPossessionProof(
  userId: UserId,
  version: ContentVersion,
  presentedHash: ContentHash,
  now: Date,
): Entitlement {
  if (version.contentHash !== presentedHash) {
    throw new DomainError(
      'ENTITLEMENT_MISMATCH',
      'Il contenuto presentato non corrisponde alla versione',
    );
  }
  return Object.freeze({
    userId,
    lessonPartId: version.lessonPartId,
    contentVersionId: version.id,
    basis: 'possession-proof',
    grantedAt: now,
  });
}
