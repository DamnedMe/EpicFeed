# @epicfeed/catalog

Catalogo condiviso e deduplicato: corsi, materie, capitoli, lezioni e parti, versioni dei contenuti con impronta SHA-256, permessi con prova di possesso, sottotitoli ([ADR 0002](../../docs/decisions/0002-shared-content-with-proof-of-access.md), [ADR 0006](../../docs/decisions/0006-subtitles-as-secondary-source.md)).

Dipende da `shared`. Lo usano `ingest`, `feed` ed `exam`. Dettagli: [technical/core.md](../../docs/technical/core.md).

## Struttura

```
src/
├─ domain/          catalog, content, content-hash, content-version, entitlement, subtitles
├─ application/     ports.ts (CatalogRepository, EntitlementVerifier), possession-proof-verifier
├─ contracts/       content.ts: id Epicode, titoli, posizioni, contenuto di una parte
├─ infrastructure/  catalog-repository, my-lessons ("Le mie lezioni")
└─ index.ts
```

L'infrastruttura (Drizzle, solo lato server) si importa da `@epicfeed/catalog/infrastructure`; tutto il resto da `@epicfeed/catalog`. Le regole dei confini sono in [`packages/config/boundaries.js`](../config/boundaries.js), la mappa completa in [come orientarsi](../../docs/navigation.md).

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
