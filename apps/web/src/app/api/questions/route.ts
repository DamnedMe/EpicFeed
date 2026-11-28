import { questionsDeps } from '@/features/assistant/api/questions-deps';
import { handleAskQuestion, handleListQuestions } from '@/features/assistant/api/questions-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/questions`: domande dello studente con le risposte (sessione). */
export async function GET(): Promise<Response> {
  return handleListQuestions(questionsDeps());
}

/** `POST /api/questions`: mette in coda una domanda per Claude Desktop (sessione). */
export async function POST(request: Request): Promise<Response> {
  return handleAskQuestion(request, questionsDeps());
}
