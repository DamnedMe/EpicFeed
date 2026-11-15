import { defineConfig } from 'drizzle-kit';

/**
 * `pnpm db:generate` crea le migrazioni SQL dallo schema, senza connettersi.
 * `pnpm db:migrate` le applica al database indicato da `DATABASE_URL`
 * (stringa di connessione Supabase, solo in variabile d'ambiente, mai nella repo).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['public'],
  // I ruoli di Supabase (anon, authenticated, service_role) esistono già:
  // drizzle-kit non deve crearli.
  entities: { roles: { provider: 'supabase' } },
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
