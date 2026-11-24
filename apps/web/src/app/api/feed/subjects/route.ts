import { feedDeps } from '@/features/feed/api/feed-deps';
import { handleListSubjects } from '@/features/feed/api/feed-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/feed/subjects`: materie da studiare (sessione dello studente). */
export async function GET(): Promise<Response> {
  return handleListSubjects(feedDeps());
}
