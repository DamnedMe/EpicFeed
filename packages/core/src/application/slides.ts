import type {
  ContentVersionId,
  LessonId,
  LessonPartId,
  Sha256,
  SlidesPartContent,
  UserId,
} from '../domain/index.js';
import {
  DomainError,
  computeContentHash,
  normalizeContent,
  webCryptoSha256,
} from '../domain/index.js';
import type { GenerationRepository } from './generation.js';
import type { CatalogRepository, Clock, EntitlementVerifier } from './ports.js';

/** Massimo di presentazioni per lezione in un import (nel corso DSA: 1–4). */
export const MAX_PRESENTATIONS_PER_LESSON = 20;

/**
 * Le parti `slides` seguono quelle del portale: posizione = base + numero della
 * presentazione, così restano in fondo alla lezione e in ordine.
 */
export const SLIDES_POSITION_BASE = 10_000;

/** Una presentazione da importare: numero nel nome del file (`…-2.pdf` → 2) e testo. */
export interface SlidesPresentationInput {
  readonly number: number;
  readonly content: SlidesPartContent;
}

/** Esito di una presentazione importata. */
export interface ImportedSlidesResult {
  readonly number: number;
  readonly lessonPartId: LessonPartId;
  readonly contentVersionId: ContentVersionId;
  /** `true` se il testo è nuovo (prima importazione o slide cambiate). */
  readonly newVersion: boolean;
  readonly pages: number;
}

/** Dipendenze di {@link ImportLessonSlides}. */
export interface ImportLessonSlidesDeps {
  readonly catalog: CatalogRepository;
  /** Serve a verificare che lo studente abbia già importato la lezione. */
  readonly generation: Pick<GenerationRepository, 'loadLessonSources'>;
  readonly verifier: EntitlementVerifier;
  readonly clock: Clock;
  readonly sha256?: Sha256;
}

/**
 * Caso d'uso: aggiunge a una lezione già importata le sue presentazioni di
 * slide, lette sul PC dallo zip ufficiale (ADR 0012).
 *
 * Ogni presentazione diventa una parte `slides` della lezione (id stabile
 * `slides-{n}`) con una versione identificata dall'impronta del testo: lo
 * stesso zip importato due volte non crea doppioni, slide cambiate creano una
 * nuova versione e quindi una lezione da rigenerare. Il permesso dello
 * studente nasce come per l'estensione, dalla prova di possesso del contenuto
 * presentato.
 */
export class ImportLessonSlides {
  private readonly sha256: Sha256;

  /**
   * @param deps - Repository, verificatore dei permessi e orologio.
   */
  constructor(private readonly deps: ImportLessonSlidesDeps) {
    this.sha256 = deps.sha256 ?? webCryptoSha256;
  }

  /**
   * @param userId - Studente che importa.
   * @param lessonId - Lezione a cui appartengono le slide.
   * @param presentations - Presentazioni della lezione.
   * @returns L'esito di ogni presentazione, in ordine di numero.
   * @throws {@link DomainError} `NOT_FOUND` se lo studente non ha importato la
   *   lezione; `INVALID_CONTENT` se le presentazioni non sono valide.
   */
  async execute(
    userId: UserId,
    lessonId: LessonId,
    presentations: readonly SlidesPresentationInput[],
  ): Promise<ImportedSlidesResult[]> {
    if (presentations.length === 0 || presentations.length > MAX_PRESENTATIONS_PER_LESSON) {
      throw new DomainError('INVALID_CONTENT', 'Numero di presentazioni non valido');
    }
    const numbers = new Set<number>();
    for (const { number } of presentations) {
      if (!Number.isInteger(number) || number < 1 || number > 99 || numbers.has(number)) {
        throw new DomainError('INVALID_CONTENT', 'Numero di presentazione non valido');
      }
      numbers.add(number);
    }

    // Lavoro pesante (normalizzazione, impronte) prima di toccare il database.
    const prepared = await Promise.all(
      [...presentations]
        .sort((a, b) => a.number - b.number)
        .map(async ({ number, content }) => {
          const canonical = normalizeContent(content);
          return { number, canonical, hash: await computeContentHash(canonical, this.sha256) };
        }),
    );

    // La lezione deve essere tra quelle importate dallo studente (lettura con RLS).
    const lesson = await this.deps.generation.loadLessonSources(userId, lessonId);
    if (!lesson) {
      throw new DomainError('NOT_FOUND', 'Lezione non trovata tra quelle importate');
    }

    const now = this.deps.clock.now();
    return this.deps.catalog.transaction(async (tx) => {
      const results: ImportedSlidesResult[] = [];
      for (const { number, canonical, hash } of prepared) {
        const lessonPartId = await tx.upsertLessonPart(lesson.lessonId, {
          epicodeId: `slides-${String(number)}`,
          kind: 'slides',
          title: `Slide ${String(number)}`,
          position: SLIDES_POSITION_BASE + number,
        });
        const { version, created } = await tx.findOrCreateVersion({
          lessonPartId,
          contentHash: hash,
          content: canonical,
          firstSeenAt: now,
        });
        await tx.saveEntitlement(await this.deps.verifier.verify(userId, version, canonical));
        results.push({
          number,
          lessonPartId,
          contentVersionId: version.id,
          newVersion: created,
          pages: canonical.kind === 'slides' ? canonical.pages.length : 0,
        });
      }
      return results;
    });
  }
}
