# @epicfeed/access

Accesso delle app esterne: token personali dell'estensione (`sfi_`) e di Claude Desktop (`sfg_`), salvati solo come impronta, e limiti di frequenza.

Solo infrastruttura: dipende da `db`. Lo usa la web app lato server. Dettagli: [technical/import.md](../../docs/technical/import.md).

## Struttura

```
src/
└─ infrastructure/  import-tokens (token con ambito, scadenza e revoca), rate-limiter
```

Si importa da `@epicfeed/access/infrastructure`, solo lato server. Le regole dei confini sono in [`packages/config/boundaries.js`](../config/boundaries.js), la mappa completa in [come orientarsi](../../docs/navigation.md).

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
