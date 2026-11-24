import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { parseId } from '@epicfeed/core';
import { FEED_COPY_COOKIE } from '@/features/device-flags';
import { FeedApp } from '@/features/feed/feed-app';
import { requireUser } from '@/server/auth';
import { feedDeps } from '@/server/feed-deps';
import { loadFeedPreview } from '@/server/feed-preview';

export const metadata: Metadata = { title: 'Feed' };
export const dynamic = 'force-dynamic';

/**
 * Home: il feed di studio (M3, ADR 0015). La materia arriva dall'API del feed
 * e resta sul dispositivo; solo alla prima apertura su un dispositivo senza
 * copia la pagina arriva già con la prima lezione, disegnata sul server.
 */
export default async function FeedPage() {
  const user = await requireUser();
  const hasCopy = (await cookies()).has(FEED_COPY_COOKIE);
  const preview = hasCopy ? null : await loadFeedPreview(parseId(user.id, 'UserId'), feedDeps());
  return <FeedApp account={user.id} preview={preview} />;
}
