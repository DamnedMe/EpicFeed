import { handleReadLesson } from '@/features/feed/api/generation-handler';
import { feedGenerationDeps } from '@/features/feed/api/generation-deps';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/lessons/:id`: fonti di una lezione per Claude (token "genera"). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleReadLesson(request, (await params).id, feedGenerationDeps());
}
