import { examDeps } from '@/features/exam/api/exam-deps';
import { handleDeleteSubmission } from '@/features/exam/api/exam-handler';

export const dynamic = 'force-dynamic';

/** `DELETE /api/exam/submissions/:id`: dimentica un invio dopo averne conservato la correzione. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleDeleteSubmission(request, id, examDeps());
}
