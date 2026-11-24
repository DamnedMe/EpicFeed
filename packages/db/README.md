# @epicfeed/db

Schema Postgres (Drizzle), migrazioni e policy RLS di EpicFeed su Supabase. Lo schema è diviso per funzione, le migrazioni sono una sola sequenza per tutto il database.

```
src/
├─ schema/       catalog, access, feed, exam, review; columns.ts (colonne comuni); index.ts
├─ database.ts   tipo Database e withUserRls (letture con la RLS dello studente)
├─ testing.ts    @epicfeed/db/testing: setupTestDatabase (PGlite), TEST_USERS
└─ index.ts
migrations/      SQL generato da drizzle-kit e SQL scritto a mano (permessi, funzioni)
```

Dopo una modifica allo schema: `pnpm db:generate`; `pnpm db:check` controlla che migrazioni e schema coincidano. Dettagli in [technical/database.md](../../docs/technical/database.md).
