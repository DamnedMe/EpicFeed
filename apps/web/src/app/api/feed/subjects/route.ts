import { feedDeps } from '@/server/feed-deps';
import { handleListSubjects } from '@/server/feed-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/feed/subjects`: materie da studiare (sessione dello studente). */
export async function GET(): Promise<Response> {
  return handleListSubjects(feedDeps());
}
