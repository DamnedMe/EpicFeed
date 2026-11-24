import { handleSaveExamBank } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/exam/subjects/:id/bank`: salva la banca d'esame (token "genera"). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleSaveExamBank(request, (await params).id, generationDeps());
}
