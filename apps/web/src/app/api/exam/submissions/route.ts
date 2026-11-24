import { examDeps } from '@/features/exam/api/exam-deps';
import {
  handleListMySubmissions,
  handleSubmitForCorrection,
} from '@/features/exam/api/exam-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/exam/submissions`: invii dello studente con le correzioni arrivate (sessione). */
export async function GET(): Promise<Response> {
  return handleListMySubmissions(examDeps());
}

/** `POST /api/exam/submissions`: invia risposte a Claude per la correzione (sessione). */
export async function POST(request: Request): Promise<Response> {
  return handleSubmitForCorrection(request, examDeps());
}
