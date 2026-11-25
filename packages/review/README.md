# @epicfeed/review

Ripasso dei concetti con FSRS, sessioni di ripasso, riepilogo per modulo e sincronizzazione cifrata dei progressi ([ADR 0017](../../docs/decisions/0017-review-and-exam-m4.md), [ADR 0018](../../docs/decisions/0018-encrypted-progress-sync.md)). Cifratura e archivi del browser stanno nella web app (`apps/web/src/features/review`).

Dipende da `shared`. Dettagli: [technical/core.md](../../docs/technical/core.md#ripasso).

## Struttura

```
src/
├─ domain/review.ts            stato FSRS di un concetto, serie di giorni
├─ application/                review (risposte, piano e riepilogo), progress-sync (unione delle copie)
├─ contracts/progress.ts       API dei progressi cifrati
├─ infrastructure/             progress-repository
└─ index.ts
```

L'infrastruttura (Drizzle, solo lato server) si importa da `@epicfeed/review/infrastructure`; tutto il resto da `@epicfeed/review`. Le regole dei confini sono in [`packages/config/boundaries.js`](../config/boundaries.js), la mappa completa in [come orientarsi](../../docs/navigation.md).

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
