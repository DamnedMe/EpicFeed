# Come orientarsi nel codice

Mappa "funzione → file". La repo sta passando a un pacchetto per funzione ([ADR 0019](decisions/0019-feature-packages.md)): ogni PR della riorganizzazione aggiorna questa pagina. La colonna **Dopo** indica dove finirà ogni parte.

## Le funzioni

| Funzione | Cosa fa | Pagina | Dopo |
| --- | --- | --- | --- |
| `catalog` | corsi, materie, capitoli, lezioni, versioni dei contenuti, permessi | `/lessons` | `packages/catalog` |
| `ingest` | import delle lezioni dall'estensione | `/extension` | `packages/ingest` |
| `access` | token di estensione e Claude Desktop, limiti di frequenza | `/extension`, `/claude-desktop` | `packages/access` |
| `feed` | schede a battute, domande, generazione via MCP, slide | `/` | `packages/feed` |
| `review` | ripasso FSRS e sincronizzazione cifrata | `/review` | `packages/review` |
| `exam` | quiz di modulo, esercizi, correzione di Claude, colloquio | `/review#esame` | `packages/exam` |

Pagine fuori dalle funzioni: `/login` (accesso), `/profile` e `/profile/saved` (preferenze e schede salvate).

## Dove sono i file oggi

Le regole di ogni funzione stanno nel core, divise per livello. Per una funzione si cercano i file con il suo nome in queste cartelle:

| Livello | Cartella | Esempio per `exam` |
| --- | --- | --- |
| Dominio (regole pure) | `packages/core/src/domain/` | `exam.ts`, `exam-practice.ts`, `exam-correction.ts` |
| Casi d'uso | `packages/core/src/application/` | `exam-study.ts`, `exam-generation.ts`, `exam-correction.ts` |
| Porte (interfacce) | `packages/core/src/application/ports.ts` | un unico file per tutte le funzioni |
| Contratti (zod) | `packages/contracts/src/` | `exam.ts`, `exam-correction.ts` |
| Tabelle | `packages/db/src/schema.ts`, `packages/db/migrations/` | `0010_exam_packs.sql` … `0015_…` |
| Adattatori (Drizzle) | `packages/adapters/src/` | `exam-repository.ts`, `exam-submission-repository.ts` |
| Montaggio | `apps/web/src/server/container.ts` | crea repository e casi d'uso |
| Handler delle API | `apps/web/src/server/` | `exam-handler.ts`, `exam-deps.ts`, parte di `generation-handler.ts` |
| Rotte delle API | `apps/web/src/app/api/` | `exam/**`, `generation/exam/**` |
| Schermate | `apps/web/src/features/` | `exam/` |
| Strumenti MCP | `apps/mcp/src/` | `exam-tools.ts`, `exam-bank-tools.ts`, `correction-tools.ts` |

Corrispondenze tra nomi in uso:

| Nome nell'interfaccia | Nome nel codice |
| --- | --- |
| Ripasso | `review` |
| Esame | `exam` |
| Io | `profile` |
| Le mie lezioni | `lessons` (catalogo: `catalog`) |
| Salvati | `saved` |
| Accedi | `login` |
| Generazione | `generation` (diventerà parte di `feed` ed `exam`) |
| Import | `import` (diventerà `ingest`) |

## Le app

| App | Cartella | Punto d'ingresso |
| --- | --- | --- |
| Web app e API | `apps/web` | `src/app/` (pagine e rotte), `src/proxy.ts` (sicurezza e sessione) |
| Estensione Chrome | `apps/extension` | `src/entrypoints/` (popup e script del portale), `src/lib/` (logica) |
| Server MCP | `apps/mcp` | `src/main.ts`, `src/server.ts` (registra gli strumenti) |
