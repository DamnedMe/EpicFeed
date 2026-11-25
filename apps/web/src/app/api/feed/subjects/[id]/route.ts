import { feedDeps } from '@/features/feed/api/feed-deps';
import { handleReadSubjectFeed } from '@/features/feed/api/feed-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/feed/subjects/:id`: feed di tutta la materia, con ETag (sessione dello studente). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleReadSubjectFeed(request, id, feedDeps());
}
