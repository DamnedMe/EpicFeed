import { describe, expect, it } from 'vitest';
import type { ContentVersion } from '../domain/content-version.js';
import type { ContentVersionId, LessonPartId, UserId } from '@epicfeed/shared';
import type { LessonPartContent } from '../domain/content.js';
import { computeContentHash } from '../domain/content-hash.js';
import { PossessionProofVerifier } from './possession-proof-verifier.js';

const now = new Date('2026-11-15T12:00:00Z');
const clock = { now: () => now };
const userId = '55555555-5555-4555-8555-555555555555' as UserId;
const content: LessonPartContent = { kind: 'reading', markdown: '# Heap' };

async function version(): Promise<ContentVersion> {
  return {
    id: '44444444-4444-4444-8444-444444444444' as ContentVersionId,
    lessonPartId: '33333333-3333-4333-8333-333333333333' as LessonPartId,
    contentHash: await computeContentHash(content),
    firstSeenAt: now,
    generationStatus: 'pending',
  };
}

describe('PossessionProofVerifier', () => {
  it('concede il permesso a chi presenta lo stesso contenuto (anche con spazi diversi)', async () => {
    const verifier = new PossessionProofVerifier(clock);
    const entitlement = await verifier.verify(userId, await version(), {
      kind: 'reading',
      markdown: '# Heap  \r\n',
    });
    expect(entitlement).toMatchObject({ userId, basis: 'possession-proof', grantedAt: now });
  });

  it('nega il permesso se il contenuto è diverso', async () => {
    const verifier = new PossessionProofVerifier(clock);
    await expect(
      verifier.verify(userId, await version(), { kind: 'reading', markdown: '# Altro' }),
    ).rejects.toMatchObject({ code: 'ENTITLEMENT_MISMATCH' });
  });
});
