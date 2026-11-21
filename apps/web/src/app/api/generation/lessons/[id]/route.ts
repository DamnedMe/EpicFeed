import { handleReadLesson } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/lessons/:id`: fonti di una lezione per Claude (token "genera"). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleReadLesson(request, (await params).id, generationDeps());
}
