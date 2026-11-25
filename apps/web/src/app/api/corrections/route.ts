import { correctionsDeps } from '@/features/feed/api/corrections-deps';
import { handleListCorrections, handleReportError } from '@/features/feed/api/corrections-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/corrections`: correzioni dello studente da applicare al feed (sessione). */
export async function GET(): Promise<Response> {
  return handleListCorrections(correctionsDeps());
}

/** `POST /api/corrections`: Segnala errore su una scheda o una domanda (sessione). */
export async function POST(request: Request): Promise<Response> {
  return handleReportError(request, correctionsDeps());
}
