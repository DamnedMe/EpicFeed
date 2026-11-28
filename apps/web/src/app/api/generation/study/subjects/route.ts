import { studyGenerationDeps } from '@/features/feed/api/study-generation-deps';
import { handleListStudySubjects } from '@/features/feed/api/study-generation-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/study/subjects`: materie importate, per l'assistente (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleListStudySubjects(request, studyGenerationDeps());
}
