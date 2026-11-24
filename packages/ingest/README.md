# @epicfeed/ingest

Import delle lezioni dall'estensione Chrome: forma della richiesta `POST /api/import`, regole della lezione importata e caso d'uso `ImportLesson`.

Dipende da `catalog` e `shared`. Dettagli: [technical/import.md](../../docs/technical/import.md).

## Struttura

```
src/
├─ domain/import.ts               lezione importata: parti, limiti, validazione
├─ application/import-lesson.ts   caso d'uso ImportLesson
├─ contracts/                     import.ts (POST /api/import), extension.ts (collegamento)
├─ import-lesson.db.test.ts       prova con il database (PGlite)
└─ index.ts
```

L'infrastruttura (Drizzle, solo lato server) si importa da `@epicfeed/ingest/infrastructure`; tutto il resto da `@epicfeed/ingest`. Le regole dei confini sono in [`packages/config/boundaries.js`](../config/boundaries.js), la mappa completa in [come orientarsi](../../docs/navigation.md).

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
