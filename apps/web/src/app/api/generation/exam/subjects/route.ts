import { handleListExamSubjects } from '@/features/exam/api/generation-handler';
import { examGenerationDeps } from '@/features/exam/api/generation-deps';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/exam/subjects`: materie e concetti per la banca d'esame (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleListExamSubjects(request, examGenerationDeps());
}
