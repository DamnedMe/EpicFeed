import type { Metadata } from 'next';
import { FeedApp } from '@/features/feed/feed-app';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Feed' };
export const dynamic = 'force-dynamic';

/**
 * Home: il feed di studio (M3, ADR 0015). La pagina verifica solo la sessione;
 * la materia arriva dall'API del feed e resta sul dispositivo.
 */
export default async function FeedPage() {
  const user = await requireUser();
  return <FeedApp account={user.id} />;
}
