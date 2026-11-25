import { handleListSubmissionsToCorrect } from '@/features/exam/api/generation-handler';
import { examGenerationDeps } from '@/features/exam/api/generation-deps';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/exam/submissions`: risposte in attesa della correzione di Claude (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleListSubmissionsToCorrect(request, examGenerationDeps());
}
