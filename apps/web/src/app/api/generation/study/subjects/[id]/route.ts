import { studyGenerationDeps } from '@/features/feed/api/study-generation-deps';
import { handleReadStudySubject } from '@/features/feed/api/study-generation-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/study/subjects/:id`: feed della materia, per l'assistente (token "genera"). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleReadStudySubject(request, id, studyGenerationDeps());
}
