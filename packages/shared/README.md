# @epicfeed/shared

Nucleo condiviso da tutti i pacchetti di funzione ([ADR 0019](../../docs/decisions/0019-feature-packages.md)): errori di dominio (`DomainError`), id tipizzati (`LessonId`, `UserId`…) e regole sul testo (`normalizeText`, `requireTitle`, `requirePosition`).

Non dipende da nessun pacchetto e non contiene logica di una funzione specifica: se una regola serve a una sola funzione, sta nel suo pacchetto.

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
