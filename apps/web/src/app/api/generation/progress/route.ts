import { progressGenerationDeps } from '@/features/review/api/progress-generation-deps';
import { handleReadProgressForClaude } from '@/features/review/api/progress-generation-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/progress`: copia cifrata dei progressi, da decifrare sul PC (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleReadProgressForClaude(request, progressGenerationDeps());
}
