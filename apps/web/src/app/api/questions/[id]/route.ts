import { questionsDeps } from '@/features/assistant/api/questions-deps';
import { handleDeleteQuestion } from '@/features/assistant/api/questions-handler';

export const dynamic = 'force-dynamic';

/** `DELETE /api/questions/:id`: cancella una domanda (sessione). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleDeleteQuestion(request, id, questionsDeps());
}
