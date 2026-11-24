import { examDeps } from '@/server/exam-deps';
import { handleReadExamContent } from '@/server/exam-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/exam/subjects/:id`: contenuti d'esame della materia, con ETag (sessione dello studente). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleReadExamContent(request, id, examDeps());
}
