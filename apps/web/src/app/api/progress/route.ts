import { progressDeps } from '@/features/review/api/progress-deps';
import { handleReadProgress, handleWriteProgress } from '@/features/review/api/progress-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/progress`: copia cifrata dei progressi (sessione dello studente). */
export async function GET(): Promise<Response> {
  return handleReadProgress(progressDeps());
}

/** `PUT /api/progress`: scrive la copia cifrata se la versione è ancora quella. */
export async function PUT(request: Request): Promise<Response> {
  return handleWriteProgress(request, progressDeps());
}
