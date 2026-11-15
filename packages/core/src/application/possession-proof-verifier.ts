import type {
  ContentVersion,
  Entitlement,
  LessonPartContent,
  Sha256,
  UserId,
} from '../domain/index.js';
import { computeContentHash, grantByPossessionProof, webCryptoSha256 } from '../domain/index.js';
import type { Clock, EntitlementVerifier } from './ports.js';

/**
 * Verifica per **prova di possesso** (ADR 0002, fase 1): lo studente ha
 * diritto a una versione se ne presenta il contenuto. L'impronta è ricalcolata
 * qui, sul server, a partire dal contenuto ricevuto: quella eventualmente
 * dichiarata dal client non viene mai usata.
 *
 * È TypeScript puro (il digest è iniettato), quindi vive nel core e si usa
 * uguale nell'API e nei test.
 */
export class PossessionProofVerifier implements EntitlementVerifier {
  /**
   * @param clock - Sorgente del tempo per la data del permesso.
   * @param sha256 - Implementazione SHA-256; di default la Web Crypto API.
   */
  constructor(
    private readonly clock: Clock,
    private readonly sha256: Sha256 = webCryptoSha256,
  ) {}

  /**
   * Concede il permesso se l'impronta del contenuto presentato coincide con
   * quella della versione.
   *
   * @param userId - Studente che ha presentato il contenuto.
   * @param version - Versione richiesta.
   * @param presented - Contenuto ricevuto dallo studente.
   * @returns Il permesso da salvare.
   * @throws `DomainError` `ENTITLEMENT_MISMATCH` se il contenuto è diverso,
   *   `INVALID_CONTENT` se non è valido.
   */
  async verify(
    userId: UserId,
    version: ContentVersion,
    presented: LessonPartContent,
  ): Promise<Entitlement> {
    const hash = await computeContentHash(presented, this.sha256);
    return grantByPossessionProof(userId, version, hash, this.clock.now());
  }
}
