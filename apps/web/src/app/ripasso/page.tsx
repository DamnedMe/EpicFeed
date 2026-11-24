import type { Metadata } from 'next';
import { ReviewApp } from '@/features/review/review-app';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Ripasso' };
export const dynamic = 'force-dynamic';

/**
 * Tab *Ripasso* (M4, ADR 0017): ripasso giornaliero dei concetti e sezione
 * Esame. La pagina verifica solo la sessione; materia e progressi sono sul
 * dispositivo, con una copia cifrata nel browser sul server (ADR 0018).
 */
export default async function ReviewPage() {
  const user = await requireUser();
  return <ReviewApp account={user.id} />;
}
