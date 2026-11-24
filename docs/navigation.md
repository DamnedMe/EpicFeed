# Come orientarsi nel codice

Mappa "funzione → file". La repo è organizzata in un pacchetto per funzione ([ADR 0019](decisions/0019-feature-packages.md)): ogni PR della riorganizzazione aggiorna questa pagina.

## Le funzioni

| Funzione | Cosa fa | Pagina | Dove sta |
| --- | --- | --- | --- |
| `shared` | errori di dominio, id, testo, orologio, formato degli errori API | | `packages/shared` |
| `catalog` | corsi, materie, capitoli, lezioni, versioni dei contenuti, permessi, sottotitoli | `/lessons` | `packages/catalog` |
| `ingest` | import delle lezioni dall'estensione | `/extension` | `packages/ingest` |
| `access` | token di estensione e Claude Desktop, limiti di frequenza | `/extension`, `/claude-desktop` | `packages/access` |
| `feed` | schede a battute, domande, generazione via MCP, slide | `/` | `packages/feed` |
| `review` | ripasso FSRS e sincronizzazione cifrata | `/review` | `packages/review` (gli archivi del browser in `apps/web/src/features/review` e `sync`) |
| `exam` | quiz di modulo, esercizi, correzione di Claude, colloquio | `/review#esame` | `packages/exam` |

Pagine fuori dalle funzioni: `/login` (accesso), `/profile` e `/profile/saved` (preferenze e schede salvate).

## Dentro un pacchetto di funzione

```
packages/<funzione>/src/
  domain/          regole pure
  application/     casi d'uso e porte (ports.ts)
  contracts/       schemi zod dei dati che escono dalla funzione
  infrastructure/  repository Drizzle, solo lato server
  index.ts         porta pubblica: @epicfeed/<funzione>
```

L'infrastruttura si importa da `@epicfeed/<funzione>/infrastructure`. I test stanno accanto al file che provano; quelli che usano il database finiscono in `.db.test.ts` o nella cartella `infrastructure/`. Le regole dei confini sono in `packages/config/boundaries.js`.

## Database

Schema in `packages/db/src/schema.ts`, migrazioni in `packages/db/migrations/` (una sola sequenza per tutto il database). Il tipo `Database`, `withUserRls` e gli strumenti di test (`@epicfeed/db/testing`: `setupTestDatabase`, `TEST_USERS`) stanno nello stesso pacchetto.

## Le app

| App | Cartella | Cosa guardare |
| --- | --- | --- |
| Web app e API | `apps/web` | `src/app/` pagine e rotte; `src/server/` handler delle API e `container.ts` (montaggio); `src/features/<funzione>/` schermate; `src/proxy.ts` sicurezza e sessione |
| Estensione Chrome | `apps/extension` | `src/entrypoints/` popup e script del portale, `src/lib/` logica |
| Server MCP | `apps/mcp` | `src/main.ts`, `src/server.ts` (registra gli strumenti) |

## Nomi nell'interfaccia e nel codice

| Nell'interfaccia | Nel codice |
| --- | --- |
| Ripasso | `review` |
| Esame | `exam` |
| Io | `profile` |
| Le mie lezioni | `lessons` (catalogo: `catalog`) |
| Salvati | `saved` |
| Accedi | `login` |
| Import | `ingest` |
| Generazione | `generation` (diventerà parte di `feed` ed `exam`) |
