# @epicfeed/core

Dominio e casi d'uso di Study Feed, in TypeScript puro: nessun framework, nessun I/O, gira uguale nel browser, in Node e nelle funzioni edge.

```
src/
├─ domain/        entità e regole (nessuna dipendenza)
└─ application/   casi d'uso e porte (dipende solo da domain)
```

La regola delle dipendenze è verificata da ESLint (`eslint.config.js`): il core non può importare altri pacchetti del monorepo, framework, ORM o moduli `node:*`.

Comandi: `pnpm test` (Vitest con soglie di copertura), `pnpm lint`, `pnpm typecheck`, `pnpm build`.

Dettagli in [docs/technical/core.md](../../docs/technical/core.md).
