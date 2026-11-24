import { describe, expect, it } from 'vitest';
import type { ContentHash } from './content-hash.js';
import type { ContentVersion, GenerationStatus } from './content-version.js';
import { canTransition, transitionGeneration } from './content-version.js';
import type { ContentVersionId, LessonPartId } from '@epicfeed/shared';

const version: ContentVersion = {
  id: '44444444-4444-4444-8444-444444444444' as ContentVersionId,
  lessonPartId: '33333333-3333-4333-8333-333333333333' as LessonPartId,
  contentHash: 'a'.repeat(64) as ContentHash,
  firstSeenAt: new Date('2026-11-15T10:00:00Z'),
  generationStatus: 'pending',
};

describe('stato di generazione', () => {
  it.each<[GenerationStatus, GenerationStatus, boolean]>([
    ['pending', 'generating', true],
    ['pending', 'ready', false],
    ['generating', 'ready', true],
    ['generating', 'failed', true],
    ['generating', 'pending', true],
    ['failed', 'generating', true],
    ['ready', 'generating', false],
    ['ready', 'pending', false],
  ])('%s → %s: %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  it('restituisce una nuova versione senza modificare la precedente', () => {
    const next = transitionGeneration(version, 'generating');
    expect(next.generationStatus).toBe('generating');
    expect(version.generationStatus).toBe('pending');
  });

  it('una versione pronta non si rigenera', () => {
    const ready = { ...version, generationStatus: 'ready' as const };
    expect(() => transitionGeneration(ready, 'generating')).toThrow(
      expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
    );
  });
});
