import { handleImport } from '@/server/import-handler';
import { getServices } from '@/server/container';

// Ogni import scrive nel database: mai in cache, sempre sul runtime Node.
export const dynamic = 'force-dynamic';

/**
 * `POST /api/import`: riceve una lezione dall'estensione (vedi
 * `importLessonRequestSchema`). Autenticazione con token di import (Bearer).
 * Le estensioni con permesso sull'host non sono soggette a CORS, quindi la
 * route non espone header CORS: un sito qualsiasi non può chiamarla dal browser.
 */
export async function POST(request: Request): Promise<Response> {
  const services = getServices();
  return handleImport(request, {
    verifyToken: (token) => services.tokens.verify(token),
    isAllowed: (userId) => services.rateLimiter.isAllowed(userId),
    importLesson: (userId, input) => services.importLesson.execute(userId, input),
    record: (userId, lessonId, partCount) =>
      services.rateLimiter.record(userId, lessonId, partCount),
    logError: (error) => {
      // Solo il tipo e il messaggio: mai il corpo della richiesta (contenuti Epicode).
      console.error('Import fallito', error instanceof Error ? error.message : typeof error);
    },
  });
}
