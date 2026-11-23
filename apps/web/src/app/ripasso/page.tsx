import type { Metadata } from 'next';
import { ReviewApp } from '@/features/review/review-app';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Ripasso' };
export const dynamic = 'force-dynamic';

/**
 * Tab *Ripasso* (M4, ADR 0017): ripasso giornaliero dei concetti e sezione
 * Esame. La pagina verifica solo la sessione; materia e progressi sono sul
 * dispositivo.
 */
export default async function ReviewPage() {
  await requireUser();
  return <ReviewApp />;
}
