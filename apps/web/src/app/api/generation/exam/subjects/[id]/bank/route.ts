import { handleSaveExamBank } from '@/features/exam/api/generation-handler';
import { examGenerationDeps } from '@/features/exam/api/generation-deps';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/exam/subjects/:id/bank`: salva la banca d'esame (token "genera"). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleSaveExamBank(request, (await params).id, examGenerationDeps());
}
