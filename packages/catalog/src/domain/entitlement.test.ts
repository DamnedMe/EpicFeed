import { describe, expect, it } from 'vitest';
import type { LessonPartContent } from './content.js';
import { computeContentHash } from './content-hash.js';
import type { ContentVersion } from './content-version.js';
import { grantByPossessionProof } from './entitlement.js';
import type { ContentVersionId, LessonPartId, UserId } from '@epicfeed/shared';

const content: LessonPartContent = { kind: 'reading', markdown: '# Riassunto del capitolo' };
const userId = '55555555-5555-4555-8555-555555555555' as UserId;
const now = new Date('2026-11-15T12:00:00Z');

async function versionOf(source: LessonPartContent): Promise<ContentVersion> {
  return {
    id: '44444444-4444-4444-8444-444444444444' as ContentVersionId,
    lessonPartId: '33333333-3333-4333-8333-333333333333' as LessonPartId,
    contentHash: await computeContentHash(source),
    firstSeenAt: new Date('2026-11-01T00:00:00Z'),
    generationStatus: 'ready',
  };
}

describe('grantByPossessionProof', () => {
  it('concede il permesso a chi presenta lo stesso contenuto', async () => {
    const version = await versionOf(content);
    const presented = await computeContentHash({
      kind: 'reading',
      markdown: '# Riassunto del capitolo\r\n',
    });
    expect(grantByPossessionProof(userId, version, presented, now)).toEqual({
      userId,
      lessonPartId: version.lessonPartId,
      contentVersionId: version.id,
      basis: 'possession-proof',
      grantedAt: now,
    });
  });

  it('nega il permesso se il contenuto è diverso', async () => {
    const version = await versionOf(content);
    const presented = await computeContentHash({ kind: 'reading', markdown: 'altro' });
    expect(() => grantByPossessionProof(userId, version, presented, now)).toThrow(
      expect.objectContaining({ code: 'ENTITLEMENT_MISMATCH' }),
    );
  });
});
