import type {
  ContentHash,
  GenerationStatus,
  Sha256,
  CatalogRepository,
  EntitlementVerifier,
} from '@epicfeed/catalog';
import type {
  ContentVersionId,
  LessonId,
  LessonPartId,
  SubtitleTrackId,
  UserId,
  Clock,
} from '@epicfeed/shared';
import { computeContentHash, computeSubtitleTrackHash, webCryptoSha256 } from '@epicfeed/catalog';
import type { LessonImport } from '../domain/import.js';
import { normalizeLessonImport } from '../domain/import.js';

/** Esito dell'import di una singola parte. */
export interface ImportedPartResult {
  readonly epicodeId: string;
  readonly lessonPartId: LessonPartId;
  readonly contentVersionId: ContentVersionId;
  readonly contentHash: ContentHash;
  /** `true` se questo contenuto non era mai stato importato da nessuno. */
  readonly newVersion: boolean;
  /** `true` se lo studente non aveva ancora questa versione. */
  readonly newEntitlement: boolean;
  readonly generationStatus: GenerationStatus;
  /** Tracce di sottotitoli salvate per la parte. */
  readonly subtitles: readonly ImportedSubtitleResult[];
}

/** Esito dell'import di una traccia di sottotitoli. */
export interface ImportedSubtitleResult {
  readonly language: string;
  readonly subtitleTrackId: SubtitleTrackId;
  readonly newTrack: boolean;
}

/** Esito dell'import di una lezione. */
export interface ImportLessonResult {
  readonly lessonId: LessonId;
  readonly parts: readonly ImportedPartResult[];
}

/** Dipendenze del caso d'uso {@link ImportLesson}. */
export interface ImportLessonDeps {
  readonly catalog: CatalogRepository;
  readonly verifier: EntitlementVerifier;
  readonly clock: Clock;
  readonly sha256?: Sha256;
}

/**
 * Caso d'uso **ImportLesson**: registra nel catalogo condiviso una lezione
 * importata dall'estensione e concede allo studente il permesso sulle versioni
 * che ha presentato.
 *
 * Regole:
 * - l'impronta di ogni parte si calcola qui, dal contenuto ricevuto;
 * - lo stesso contenuto si salva una volta sola (deduplica per impronta), un
 *   contenuto cambiato crea una nuova versione datata (ADR 0002);
 * - il permesso passa sempre dall'{@link EntitlementVerifier} (prova di possesso);
 * - le tracce di sottotitoli sono separate dalla versione (ADR 0006): si
 *   deduplicano per impronta e il permesso su una traccia si ottiene solo
 *   presentandola, con l'impronta calcolata qui;
 * - tutto avviene in una transazione: o la lezione entra intera, o niente.
 *
 * Il caso d'uso non conosce HTTP, database né framework: li fornisce chi lo compone.
 */
export class ImportLesson {
  private readonly sha256: Sha256;

  /**
   * @param deps - Repository del catalogo, verificatore dei permessi e orologio.
   */
  constructor(private readonly deps: ImportLessonDeps) {
    this.sha256 = deps.sha256 ?? webCryptoSha256;
  }

  /**
   * Importa una lezione per conto di uno studente.
   *
   * @param userId - Studente autenticato che ha inviato la lezione.
   * @param input - Lezione con percorso nel catalogo e parti.
   * @returns L'id della lezione e l'esito di ogni parte.
   * @throws `DomainError` se i dati non sono validi; nessuna scrittura avviene.
   */
  async execute(userId: UserId, input: LessonImport): Promise<ImportLessonResult> {
    const lesson = normalizeLessonImport(input);

    // Normalizzazione e impronte prima della transazione: è il lavoro più
    // pesante e, se un contenuto non è valido, si esce senza toccare il database.
    // Contenuti e tracce sono già in forma canonica (`normalizeLessonImport`).
    const prepared = await Promise.all(
      lesson.parts.map(async (part) => ({
        part,
        hash: await computeContentHash(part.content, this.sha256),
        tracks: await Promise.all(
          (part.subtitles ?? []).map(async (track) => ({
            track,
            hash: await computeSubtitleTrackHash(track, this.sha256),
          })),
        ),
      })),
    );

    const now = this.deps.clock.now();
    return this.deps.catalog.transaction(async (tx) => {
      const lessonId = await tx.upsertLessonPath(lesson.path);
      const parts: ImportedPartResult[] = [];
      // In sequenza: una transazione Postgres esegue comunque una query alla volta.
      for (const { part, hash, tracks } of prepared) {
        const lessonPartId = await tx.upsertLessonPart(lessonId, {
          epicodeId: part.epicodeId,
          kind: part.kind,
          title: part.title,
          position: part.position,
          videoId: part.videoId,
        });
        const { version, created } = await tx.findOrCreateVersion({
          lessonPartId,
          contentHash: hash,
          content: part.content,
          firstSeenAt: now,
        });
        const entitlement = await this.deps.verifier.verify(userId, version, part.content);
        const newEntitlement = await tx.saveEntitlement(entitlement);

        const subtitles: ImportedSubtitleResult[] = [];
        for (const { track, hash: trackHash } of tracks) {
          const saved = await tx.findOrCreateSubtitleTrack({
            lessonPartId,
            track,
            contentHash: trackHash,
            firstSeenAt: now,
          });
          // La traccia è stata trovata o creata con l'impronta calcolata qui dal
          // contenuto presentato: il possesso è dimostrato per costruzione.
          await tx.saveSubtitleAccess({
            userId,
            subtitleTrackId: saved.track.id,
            grantedAt: now,
          });
          subtitles.push({
            language: track.language,
            subtitleTrackId: saved.track.id,
            newTrack: saved.created,
          });
        }
        parts.push({
          epicodeId: part.epicodeId,
          lessonPartId,
          contentVersionId: version.id,
          contentHash: version.contentHash,
          newVersion: created,
          newEntitlement,
          generationStatus: version.generationStatus,
          subtitles,
        });
      }
      return { lessonId, parts };
    });
  }
}
