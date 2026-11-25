import { describe, expect, it } from 'vitest';
import type {
  ContentVersion,
  Entitlement,
  SlidesPartContent,
  CatalogRepository,
  CatalogTransaction,
  LessonPartInput,
} from '@epicfeed/catalog';
import type { ContentVersionId, LessonId, LessonPartId, UserId } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import { PossessionProofVerifier } from '@epicfeed/catalog';
import type { LessonSources } from './generation.js';
import { SLIDES_POSITION_BASE } from '../domain/slides.js';
import { ImportLessonSlides } from './slides.js';

const anna = '0a0a0a0a-0000-4000-8000-00000000000a' as UserId;
const lessonId = '10000000-0000-4000-8000-000000000001' as LessonId;
const now = new Date('2026-11-21T12:00:00Z');
const clock = { now: () => now };

/** Catalogo minimo in memoria: parti, versioni e permessi. */
class MemoryCatalog implements CatalogRepository {
  parts = new Map<string, { id: LessonPartId; input: LessonPartInput }>();
  versions: ContentVersion[] = [];
  entitlements: Entitlement[] = [];
  private seq = 0;

  private nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  }

  async transaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T> {
    const tx = {
      upsertLessonPart: (id: LessonId, input: LessonPartInput) => {
        const key = `${id}/${input.epicodeId}`;
        const partId = this.parts.get(key)?.id ?? (this.nextId() as LessonPartId);
        this.parts.set(key, { id: partId, input });
        return Promise.resolve(partId);
      },
      findOrCreateVersion: (input: {
        lessonPartId: LessonPartId;
        contentHash: ContentVersion['contentHash'];
        firstSeenAt: Date;
      }) => {
        const found = this.versions.find(
          (v) => v.lessonPartId === input.lessonPartId && v.contentHash === input.contentHash,
        );
        if (found) return Promise.resolve({ version: found, created: false });
        const version: ContentVersion = {
          id: this.nextId() as ContentVersionId,
          lessonPartId: input.lessonPartId,
          contentHash: input.contentHash,
          firstSeenAt: input.firstSeenAt,
          generationStatus: 'pending',
        };
        this.versions.push(version);
        return Promise.resolve({ version, created: true });
      },
      saveEntitlement: (entitlement: Entitlement) => {
        this.entitlements.push(entitlement);
        return Promise.resolve(true);
      },
    } as unknown as CatalogTransaction;
    return work(tx);
  }
}

function slides(text: string, fileName = 'AVL trees-1.pdf'): SlidesPartContent {
  return {
    kind: 'slides',
    fileName,
    pages: [
      { number: 2, text: '  Right rotation  ' },
      { number: 1, text },
    ],
  };
}

function setup(owned = true) {
  const catalog = new MemoryCatalog();
  const useCase = new ImportLessonSlides({
    catalog,
    generation: {
      loadLessonSources: () =>
        Promise.resolve(owned ? ({ lessonId } as unknown as LessonSources) : null),
    },
    verifier: new PossessionProofVerifier(clock),
    clock,
  });
  return { catalog, useCase };
}

describe('ImportLessonSlides', () => {
  it('crea una parte slides per presentazione, con versione e permesso', async () => {
    const { catalog, useCase } = setup();
    const result = await useCase.execute(anna, lessonId, [
      { number: 2, content: slides('Heaps', 'AVL trees-2.pdf') },
      { number: 1, content: slides('AVL trees') },
    ]);
    expect(result.map((r) => [r.number, r.newVersion, r.pages])).toEqual([
      [1, true, 2],
      [2, true, 2],
    ]);
    const part = catalog.parts.get(`${lessonId}/slides-1`);
    expect(part?.input).toMatchObject({
      kind: 'slides',
      title: 'Slide 1',
      position: SLIDES_POSITION_BASE + 1,
    });
    expect(catalog.entitlements).toHaveLength(2);
    expect(catalog.entitlements[0]?.userId).toBe(anna);
  });

  it('non duplica lo stesso testo e crea una versione se le slide cambiano', async () => {
    const { catalog, useCase } = setup();
    await useCase.execute(anna, lessonId, [{ number: 1, content: slides('AVL trees') }]);
    const again = await useCase.execute(anna, lessonId, [
      { number: 1, content: slides('AVL trees ') },
    ]);
    expect(again[0]?.newVersion).toBe(false);
    const changed = await useCase.execute(anna, lessonId, [
      { number: 1, content: slides('AVL trees, updated') },
    ]);
    expect(changed[0]?.newVersion).toBe(true);
    expect(catalog.versions).toHaveLength(2);
    expect(catalog.parts.size).toBe(1);
  });

  it('rifiuta una lezione non importata dallo studente', async () => {
    const { useCase } = setup(false);
    await expect(
      useCase.execute(anna, lessonId, [{ number: 1, content: slides('x') }]),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each([
    ['nessuna presentazione', []],
    ['numero ripetuto', [1, 1]],
    ['numero fuori intervallo', [0]],
    ['numero non intero', [1.5]],
  ])('rifiuta: %s', async (_label, numbers) => {
    const { useCase } = setup();
    const input = numbers.map((number) => ({ number, content: slides('x') }));
    await expect(useCase.execute(anna, lessonId, input)).rejects.toBeInstanceOf(DomainError);
  });
});
