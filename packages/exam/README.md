# @epicfeed/exam

Preparazione all'esame: pacchetti d'esame per lezione, banca degli esercizi per materia, quiz di modulo, esercizi con griglia, correzione di Claude e colloquio ([ADR 0014](../../docs/decisions/0014-exam-preparation.md), [ADR 0017](../../docs/decisions/0017-review-and-exam-m4.md)).

Dipende da `feed`, `catalog` e `shared`. Dettagli: [technical/generation.md](../../docs/technical/generation.md#pacchetti-desame-m4), [technical/web.md](../../docs/technical/web.md#esame-m4).

## Struttura

```
src/
├─ domain/          exam (pacchetti e banca), practice (quiz e griglia), correction
├─ application/     study (contenuti d'esame), generation (salvataggio da Claude Desktop), correction
├─ contracts/       exam.ts, correction.ts
├─ infrastructure/  exam-repository, submission-repository
└─ index.ts
```

L'infrastruttura (Drizzle, solo lato server) si importa da `@epicfeed/exam/infrastructure`; tutto il resto da `@epicfeed/exam`. Le regole dei confini sono in [`packages/config/boundaries.js`](../config/boundaries.js), la mappa completa in [come orientarsi](../../docs/navigation.md).

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
