import { defineConfig } from 'drizzle-kit';

/**
 * `pnpm db:generate` crea le migrazioni SQL dallo schema, senza connettersi.
 * `pnpm db:migrate` le applica al database indicato da `DATABASE_URL`
 * (stringa di connessione Supabase, solo in variabile d'ambiente, mai nella repo).
 */
/**
 * Supabase accetta solo connessioni cifrate verso l'esterno: se la stringa di
 * connessione non specifica `sslmode`, lo imponiamo (tranne che in locale).
 */
function withSsl(raw: string | undefined): string {
  if (!raw) return '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Stringa non analizzabile (es. caratteri speciali non codificati nella
    // password): la passiamo così com'è e sarà il driver a segnalare l'errore.
    return raw;
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!local && !url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  return url.toString();
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  schemaFilter: ['public'],
  // I ruoli di Supabase (anon, authenticated, service_role) esistono già:
  // drizzle-kit non deve crearli.
  entities: { roles: { provider: 'supabase' } },
  dbCredentials: { url: withSsl(process.env.DATABASE_URL) },
  strict: true,
  verbose: true,
});
