import { handleReadLessonForExam, handleSaveExamPack } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** `GET /api/generation/lessons/:id/exam`: feed della lezione per il pacchetto d'esame. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  return handleReadLessonForExam(request, (await params).id, generationDeps());
}

/** `POST /api/generation/lessons/:id/exam`: salva il pacchetto d'esame (token "genera"). */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handleSaveExamPack(request, (await params).id, generationDeps());
}
