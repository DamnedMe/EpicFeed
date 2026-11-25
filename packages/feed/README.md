# @epicfeed/feed

Feed di studio: schede a battute, domande, sessioni da 5 minuti, allineamento delle schede al minuto del video, generazione via MCP e slide ([ADR 0013](../../docs/decisions/0013-generation-m2-details.md), [ADR 0015](../../docs/decisions/0015-study-feed-m3.md)).

Dipende da `catalog` e `shared`. Lo usa `exam`. Dettagli: [technical/generation.md](../../docs/technical/generation.md), [technical/web.md](../../docs/technical/web.md).

## Struttura

```
src/
├─ domain/          feed, story (battute), study-session, alignment, slides
├─ application/     generation (feed da Claude Desktop), slides, study-feed (materia da studiare)
├─ contracts/       feed.ts (API del feed), generation.ts (API della generazione)
├─ infrastructure/  generation-repository, study-feed-repository
└─ index.ts
```

L'infrastruttura (Drizzle, solo lato server) si importa da `@epicfeed/feed/infrastructure`; tutto il resto da `@epicfeed/feed`. Le regole dei confini sono in [`packages/config/boundaries.js`](../config/boundaries.js), la mappa completa in [come orientarsi](../../docs/navigation.md).

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
