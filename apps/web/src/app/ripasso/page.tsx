import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { SYNC_KEY_COOKIE } from '@/features/device-flags';
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
  // Il nonce della CSP serve all'editor del codice della sezione Esame (stili di CodeMirror).
  const nonce = (await headers()).get('x-nonce');
  const syncKey = (await cookies()).has(SYNC_KEY_COOKIE);
  return <ReviewApp account={user.id} nonce={nonce} syncKey={syncKey} />;
}
