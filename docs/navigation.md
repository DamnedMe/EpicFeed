# Come orientarsi nel codice

Mappa "funzione → file". La repo è organizzata in un pacchetto per funzione ([ADR 0019](decisions/0019-feature-packages.md)): ogni PR della riorganizzazione aggiorna questa pagina.

## Le funzioni

| Funzione | Cosa fa | Pagina | Dove sta |
| --- | --- | --- | --- |
| `shared` | errori di dominio, id, testo, orologio, formato degli errori API | | `packages/shared` |
| `catalog` | corsi, materie, capitoli, lezioni, versioni dei contenuti, permessi, sottotitoli | `/lessons` | `packages/catalog` |
| `ingest` | import delle lezioni dall'estensione | `/extension` | `packages/ingest` |
| `access` | token di estensione e Claude Desktop, limiti di frequenza | `/extension`, `/claude-desktop` | `packages/access` |
| `feed` | schede a battute, domande, generazione via MCP, slide, correzioni personali (Segnala errore) | `/` | `packages/feed` |
| `review` | ripasso FSRS e sincronizzazione cifrata | `/review` | `packages/review` (la cifratura della copia in `src/crypto`, `@epicfeed/review/crypto`; gli archivi del browser in `apps/web/src/features/review` e `sync`) |
| `exam` | quiz di modulo, esercizi, correzione di Claude, colloquio | `/review#esame` | `packages/exam` |
| `assistant` | assistente nell'app con la chiave API dello studente: fornitori, contesto della scheda, richieste | `/profile/assistant`, *Chiedi a Claude* nel feed | `packages/assistant` (solo `domain` e `contracts`; il browser in `apps/web/src/features/assistant`) |

Pagine fuori dalle funzioni: `/login` (accesso), `/profile` e `/profile/saved` (preferenze e schede salvate); `/profile/assistant` usa `features/assistant`.

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

Schema in `packages/db/src/schema/`, un file per funzione, migrazioni in `packages/db/migrations/` (una sola sequenza per tutto il database). Il tipo `Database`, `withUserRls` e gli strumenti di test (`@epicfeed/db/testing`: `setupTestDatabase`, `TEST_USERS`) stanno nello stesso pacchetto.

## Le app

| App | Cartella | Cosa guardare |
| --- | --- | --- |
| Web app e API | `apps/web` | `src/app/` pagine e rotte (solo composizione); `src/features/<funzione>/` schermate e, in `api/`, gli handler delle API; `src/server/` parti comuni lato server e `container.ts` (montaggio); `src/proxy.ts` sicurezza e sessione |
| Estensione Chrome | `apps/extension` | `src/entrypoints/` popup e script del portale, `src/lib/` logica |
| Server MCP | `apps/mcp` | `src/main.ts`, `src/server.ts` (monta gli strumenti); `src/feed/` strumenti del feed e import delle slide; `src/exam/` pacchetti, banca degli esercizi e correzioni; `src/study/` assistente di studio (cerca lezione, concetti deboli, quiz al volo, segnala errore in chat); `view/quiz/` la scheda del quiz in chat |

## Nomi nell'interfaccia e nel codice

| Nell'interfaccia | Nel codice |
| --- | --- |
| Ripasso | `review` |
| Esame | `exam` |
| Io | `profile` |
| Le mie lezioni | `lessons` (catalogo: `catalog`) |
| Salvati | `saved` |
| Assistente, Chiedi a Claude | `assistant` |
| Accedi | `login` |
| Import | `ingest` |
| Generazione | `generation` (in `feed` ed `exam`: `features/<funzione>/api/generation-handler.ts`) |

## Dove cercare, per funzione

| Funzione | Regole e casi d'uso | Database | API (web app) | Schermate | Server MCP |
| --- | --- | --- | --- | --- | --- |
| `catalog` | `packages/catalog` | `db/src/schema/catalog.ts` | | `app/lessons` | |
| `ingest` | `packages/ingest` | | `features/ingest/api` | `app/extension` | |
| `access` | `packages/access` | `db/src/schema/access.ts` | `server/generation-api.ts` | `app/extension`, `app/claude-desktop` | |
| `feed` | `packages/feed` | `db/src/schema/feed.ts` | `features/feed/api` | `features/feed` | `src/feed`, `src/study` |
| `review` | `packages/review` | `db/src/schema/review.ts` | `features/review/api` | `features/review` | `src/study` (progressi) |
| `exam` | `packages/exam` | `db/src/schema/exam.ts` | `features/exam/api` | `features/exam` | `src/exam` |
| `assistant` | `packages/assistant` | | | `features/assistant` | |
