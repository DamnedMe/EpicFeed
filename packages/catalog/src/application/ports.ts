/**
 * Porte (interfacce) del catalogo: le usano i casi d'uso di questo pacchetto e
 * delle funzioni che scrivono nel catalogo (import, slide). Le implementazioni
 * stanno in `infrastructure/`; i test usano dei doppi.
 */
import type { CatalogNodeInput, CatalogPath } from '../domain/catalog.js';
import type { LessonId, LessonPartId, UserId } from '@epicfeed/shared';
import type { ContentHash } from '../domain/content-hash.js';
import type { ContentVersion } from '../domain/content-version.js';
import type { Entitlement } from '../domain/entitlement.js';
import type { LessonPartContent } from '../domain/content.js';
import type { LessonPartKind } from '../domain/catalog.js';
import type { StoredSubtitleTrack, SubtitleAccess, SubtitleTrack } from '../domain/subtitles.js';

/** Metadati di una parte da registrare nel catalogo. */
export interface LessonPartInput extends CatalogNodeInput {
  readonly kind: LessonPartKind;
  readonly videoId?: string | undefined;
}

/** Dati per creare una nuova versione del contenuto. */
export interface NewContentVersion {
  readonly lessonPartId: LessonPartId;
  readonly contentHash: ContentHash;
  /** Contenuto già in forma canonica (`normalizeContent`). */
  readonly content: LessonPartContent;
  readonly firstSeenAt: Date;
}

/** Dati per salvare una traccia di sottotitoli. */
export interface NewSubtitleTrack {
  readonly lessonPartId: LessonPartId;
  /** Traccia già in forma canonica (`normalizeSubtitleTrack`). */
  readonly track: SubtitleTrack;
  readonly contentHash: ContentHash;
  readonly firstSeenAt: Date;
}

/**
 * Operazioni sul catalogo condiviso dentro una transazione: o vanno a buon
 * fine tutte, o nessuna (una lezione non resta mai importata a metà).
 */
export interface CatalogTransaction {
  /**
   * Crea o aggiorna i nodi del percorso (corso di studi → lezione). Titoli e
   * posizioni si aggiornano con l'ultimo import, così un cambio di nome sul
   * portale arriva anche nell'app.
   *
   * @param path - Percorso già normalizzato.
   * @returns L'id interno della lezione.
   */
  upsertLessonPath(path: CatalogPath): Promise<LessonId>;

  /**
   * Crea o aggiorna una parte della lezione.
   *
   * @param lessonId - Lezione a cui appartiene.
   * @param part - Metadati già normalizzati.
   * @returns L'id interno della parte.
   */
  upsertLessonPart(lessonId: LessonId, part: LessonPartInput): Promise<LessonPartId>;

  /**
   * Trova la versione con questa impronta o la crea, in modo sicuro anche se
   * due studenti importano lo stesso contenuto nello stesso istante.
   *
   * @param input - Dati della versione.
   * @returns La versione e se è stata appena creata.
   */
  findOrCreateVersion(
    input: NewContentVersion,
  ): Promise<{ readonly version: ContentVersion; readonly created: boolean }>;

  /**
   * Trova la traccia con questa impronta o la crea (sicuro anche con import
   * simultanei).
   *
   * @param input - Parte, traccia in forma canonica, impronta e data.
   * @returns La traccia salvata e se è stata appena creata.
   */
  findOrCreateSubtitleTrack(
    input: NewSubtitleTrack,
  ): Promise<{ readonly track: StoredSubtitleTrack; readonly created: boolean }>;

  /**
   * Salva il permesso su una traccia; se c'era già, non cambia nulla.
   *
   * @param access - Permesso da salvare.
   * @returns `true` se il permesso è nuovo.
   */
  saveSubtitleAccess(access: SubtitleAccess): Promise<boolean>;

  /**
   * Salva un permesso; se lo studente lo aveva già, non cambia nulla.
   *
   * @param entitlement - Permesso da salvare.
   * @returns `true` se il permesso è nuovo.
   */
  saveEntitlement(entitlement: Entitlement): Promise<boolean>;
}

/** Accesso transazionale al catalogo condiviso (scritture lato server). */
export interface CatalogRepository {
  /**
   * Esegue `work` in una transazione; se `work` lancia un errore, annulla tutto.
   *
   * @param work - Operazioni da eseguire.
   * @returns Il valore restituito da `work`.
   */
  transaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T>;
}

/**
 * Decide se uno studente ha diritto a una versione (ADR 0002). Oggi la prova
 * di possesso; con un canale ufficiale Epicode, una verifica per corso.
 */
export interface EntitlementVerifier {
  /**
   * Verifica il diritto e restituisce il permesso da salvare.
   *
   * @param userId - Studente.
   * @param version - Versione richiesta.
   * @param presented - Contenuto inviato dallo studente.
   * @returns Il permesso.
   * @throws `DomainError` `ENTITLEMENT_MISMATCH` se il diritto non è dimostrato.
   */
  verify(
    userId: UserId,
    version: ContentVersion,
    presented: LessonPartContent,
  ): Promise<Entitlement>;
}
