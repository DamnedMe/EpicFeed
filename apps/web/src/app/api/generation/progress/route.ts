import { progressGenerationDeps } from '@/features/review/api/progress-generation-deps';
import {
  handleReadProgressForClaude,
  handleWriteProgressForClaude,
} from '@/features/review/api/progress-generation-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/progress`: copia cifrata dei progressi, da decifrare sul PC (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleReadProgressForClaude(request, progressGenerationDeps());
}

/** `PUT /api/generation/progress`: copia cifrata sul PC con le risposte dei quiz in chat (token "genera"). */
export async function PUT(request: Request): Promise<Response> {
  return handleWriteProgressForClaude(request, progressGenerationDeps());
}
