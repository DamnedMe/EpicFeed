import { handleImportSlides } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/lessons/:id/slides`: slide della lezione dallo zip (token "genera"). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleImportSlides(request, (await params).id, generationDeps());
}
