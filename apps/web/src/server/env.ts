import 'server-only';
import { z } from 'zod';

/**
 * Variabili d'ambiente del server, validate alla prima lettura (non al build:
 * la CI compila senza segreti). Un valore mancante o malformato ferma la
 * richiesta con un errore chiaro invece di un comportamento strano più avanti.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** Stringa di connessione Postgres (pooler di Supabase, modalità transaction). */
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL non è una stringa Postgres'),
  /** Email ammesse, separate da virgole: l'app è privata finché non si apre ad altri. */
  ALLOWED_EMAILS: z
    .string()
    .min(3)
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
});

/** Variabili d'ambiente del server già validate. */
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Restituisce le variabili d'ambiente validate.
 *
 * @returns Le variabili del server.
 * @throws Error se una variabile manca o non è valida (il messaggio non contiene valori).
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Configurazione del server incompleta: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
