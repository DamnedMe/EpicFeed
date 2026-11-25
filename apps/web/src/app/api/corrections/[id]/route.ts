import { correctionsDeps } from '@/features/feed/api/corrections-deps';
import { handleWithdrawCorrection } from '@/features/feed/api/corrections-handler';

export const dynamic = 'force-dynamic';

/** `DELETE /api/corrections/:id`: annulla una correzione (sessione). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleWithdrawCorrection(request, id, correctionsDeps());
}
