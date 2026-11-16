# Import delle lezioni (M1)

Come una lezione passa dal portale Epicode al catalogo di EpicFeed: estensione, collegamento con la web app, API di import e caso d'uso del core. Le scelte sono motivate in [ADR 0009](../decisions/0009-import-lezione-intera-e-sottotitoli.md).

```
 Portale Epicode (pagina della lezione, loggato)
   │  content script: legge la lezione dal CMS con le credenziali della pagina
   │  player Vimeo nascosto (uno alla volta, mai avviato): elenco sottotitoli
   ▼
 Estensione (service worker)
   │  scarica i VTT, costruisce la richiesta, POST con token di import
   ▼
 Web app  POST /api/import
   │  token → limite di frequenza → limite di dimensione → zod
   ▼
 core: ImportLesson  →  normalizza, calcola le impronte, deduplica, prova di possesso
   ▼
 Postgres (Supabase): catalogo, versioni, tracce di sottotitoli, permessi
```

## Regole di comportamento verso il portale
- L'estensione agisce **solo** su `https://learn.epicode.edu.mt/course/{courseId}/curriculum/{contentId}` e solo quando lo studente preme **Importa**.
- Al CMS Directus (`cms.epicode.edu.mt`) fa le stesse letture che il portale fa aprendo una lezione: attività con l'elenco delle parti, modulo, unità, dettaglio delle sole parti utili (video e testi) e corso, una richiesta alla volta (circa 6–9 GET per lezione), sempre con l'elenco esplicito dei campi: mai `fields=*.*`, che restituisce anche le iscrizioni di altri studenti ([portal-recon.md](../portal-recon.md)).
- **Sessione del portale** (verificata il 16/11/2026 sul portale rinnovato): il token di accesso al CMS sta solo nella memoria della pagina e viaggia come `Authorization: Bearer …`; storage e cookie non bastano. Lo script `portal-main.content.ts` gira nel mondo principale della pagina, ricorda l'header che il portale stesso usa verso il CMS ed esegue per l'estensione solo le GET di un elenco chiuso (`lib/cms-bridge.ts`: una voce di `content` o `courses` per id, campi ammessi, niente jolly né filtri). Il token resta in quella closure: non arriva al content script, al service worker né al nostro server. Se la pagina era aperta prima di installare l'estensione, basta ricaricarla.
- **Mai scritture** sul portale, in particolare sulle collezioni di progresso: nessun video risulta visto per effetto dell'estensione.
- Per i sottotitoli monta nella pagina del portale un iframe del player Vimeo nascosto, senza autoplay e muto (`?autoplay=0&muted=1&dnt=1#sf-import`), **uno alla volta** e con una pausa di 1,5 s tra un video e l'altro, poi lo rimuove. Il player funziona solo dentro i domini Epicode, quindi non c'è alternativa senza scaricare i video.
- Le password Epicode non passano mai dall'estensione.

## Corrispondenza portale → catalogo
| Portale (Directus) | EpicFeed | Note |
|---|---|---|
| tenant del corso (es. EIT) | `study_programs` | se manca: `epicode` / "Epicode" |
| anno accademico da `courses.starts_at` | `editions` | settembre–agosto, es. `2025/26` |
| `courses` (es. Data Structures and Algorithms) | `subjects` | titolo del corso |
| `module` (dentro una `unit`) | `chapters` | posizione = `unit.sort × 1000 + module.sort`, così l'ordine del portale resta |
| `activity` | `lessons` | |
| `embed` Vimeo | `lesson_parts` `video` | riassunti `summary.it` / `summary.en`, id del video, sottotitoli |
| `markdown` (es. "- Summary") | `lesson_parts` `reading` | testo markdown |
| `embed` Google Docs, `quiz`, `nps`, `article`, elementi nascosti | esclusi | non sono materiale testuale dell'attività o non servono al feed |

Una parte video senza riassunti e senza sottotitoli viene scartata (l'anteprima lo dice).

## Estensione (`apps/extension`)
WXT 0.21 (Manifest V3), TypeScript, nessuna dipendenza nel content script del player (4 KB).

| File | Ruolo |
|---|---|
| `entrypoints/portal.content.ts` | Sul portale: legge la lezione (`lib/directus.ts`, `lib/lesson.ts`), monta e smonta il player nascosto |
| `entrypoints/portal-main.content.ts` | Nel mondo principale della pagina: ponte verso il CMS con la sessione del portale (`lib/cms-bridge.ts`) |
| `entrypoints/vimeo.content.ts` | Nel player, solo con `#sf-import`: legge `window.playerConfig.request.text_tracks` (`lib/player-config.ts`) |
| `entrypoints/background.ts` | Riceve il collegamento dalla web app, esegue l'import (`lib/import-job.ts`), scarica i VTT (`lib/vtt.ts`) |
| `entrypoints/popup/` | Anteprima della lezione, pulsante Importa, avanzamento ed esito |
| `lib/connection.ts` | Accetta il token solo se il mittente è l'origine della web app e coincide con `apiBaseUrl` |

Permessi del manifest: `storage`; host: portale, CMS, player e sottotitoli Vimeo, origine della web app. `externally_connectable` ammette solo l'origine della web app.

L'ID dell'estensione è fisso (`bchcghaegcogobjapblaanbpnkpkihdd`) grazie alla chiave pubblica nel manifest, così la web app sa a chi inviare il token anche con l'estensione caricata a mano. La chiave privata non è conservata: serve solo per pubblicare sul Chrome Web Store, che ne genera una propria.

### Build e installazione
```bash
WXT_APP_ORIGIN=https://<indirizzo-della-web-app> pnpm --filter @study-feed/extension build
```
Poi in Chrome: `chrome://extensions` → *Modalità sviluppatore* → *Carica estensione non pacchettizzata* → cartella `apps/extension/.output/chrome-mv3`. Senza `WXT_APP_ORIGIN` l'origine predefinita è `https://study-feed.vercel.app`; `http://localhost:3000` è ammessa solo con `wxt` in modalità sviluppo.

## Collegamento estensione ↔ web app
1. Lo studente, loggato nella web app, apre **Estensione** e preme *Collega*.
2. `POST /api/extension/token` (stessa origine, sessione valida) crea un **token di import**: `sfi_` + 43 caratteri casuali (256 bit), validità 30 giorni, scope `import`. Nel database va solo il suo SHA-256 (`api_tokens`).
3. La pagina lo consegna all'estensione con `chrome.runtime.sendMessage(ID, …)`; l'estensione lo salva in `chrome.storage.local`.
4. La pagina elenca i collegamenti attivi; *Revoca* (`DELETE /api/extension/token/{id}`) li disattiva subito.

Il token apre solo `POST /api/import`: non dà accesso alla sessione, al catalogo o ad altre API.

## API `POST /api/import`
Autenticazione `Authorization: Bearer sfi_…`. Corpo: `importLessonRequestSchema` di `packages/contracts` (percorso nel catalogo + parti con contenuto e tracce). Ordine dei controlli, dal più economico:

| Controllo | Errore | HTTP |
|---|---|---|
| Token valido, non scaduto, non revocato | `UNAUTHORIZED` | 401 |
| Al massimo 60 import all'ora per utente (`import_events`) | `RATE_LIMITED` + `Retry-After` | 429 |
| Corpo ≤ 4 MB (anche se `Content-Length` manca o mente: lettura a flusso) | `PAYLOAD_TOO_LARGE` | 413 |
| JSON valido e conforme allo schema zod (oggetti `strict`) | `INVALID_REQUEST` | 400 |
| Regole del dominio (`normalizeLessonImport`) | `INVALID_CONTENT` | 422 |
| Impronta coerente con la versione | `ENTITLEMENT_MISMATCH` | 403 |
| Errore inatteso (registrato senza dati personali) | `INTERNAL` | 500 |

Risposta 200: id della lezione e, per ogni parte, id di parte e versione, `newVersion`, `newEntitlement`, stato di generazione e le tracce di sottotitoli (`newTrack`). Tutte le risposte hanno `Cache-Control: no-store`.

## Caso d'uso `ImportLesson`
In `packages/core/src/application/import-lesson.ts` ([core.md](core.md#import-di-una-lezione)):
1. normalizza la lezione (titoli, posizioni, contenuti e tracce in forma canonica);
2. calcola **sul server** le impronte di ogni contenuto e di ogni traccia, prima di aprire la transazione (meno tempo con i lock);
3. in una transazione: crea o aggiorna il percorso del catalogo e la parte, trova o crea la versione con quell'impronta, verifica la prova di possesso (`PossessionProofVerifier`) e salva il permesso; per le tracce, trova o crea la traccia e salva l'accesso.

Un secondo import identico non crea né versioni né permessi né tracce (`newVersion`, `newEntitlement` e `newTrack` tornano `false`). Se Epicode cambia il testo, nasce una nuova versione e la precedente resta.

## Limiti noti
- **Metadati condivisi**: titoli e posizioni di corso, materia, capitolo e lezione sono condivisi tra chi importa e vince l'ultimo import. Finché l'app ha un solo utente non conta; prima di aprirla ad altri (M8) andrà deciso come validarli, perché oggi un utente potrebbe rinominare un nodo del catalogo condiviso (non il contenuto, che è protetto dall'impronta).
- I sottotitoli auto-generati (`en-x-autogen`) sono salvati con `autoGenerated = true` e trattati come fonte secondaria ([ADR 0006](../decisions/0006-sottotitoli-come-fonte-secondaria.md)).
- Se un sottotitolo non si scarica (URL firmato scaduto, errore di rete) l'import continua senza quella traccia e l'esito lo segnala.

## Come è testato
- `packages/core`: normalizzazione, impronte, prova di possesso, `ImportLesson` con un catalogo in memoria (stesso contenuto, contenuto cambiato, contenuto altrui senza possesso, tracce duplicate).
- `packages/adapters`: repository, token, limite di frequenza e "Le mie lezioni" su PGlite con RLS attiva.
- `packages/db`: `test/rls-import.test.ts`, un utente non vede tracce, token né cronologia di un altro.
- `apps/web`: `handleImport` con servizi finti (ogni riga della tabella degli errori).
- `apps/extension`: parsing di URL, VTT, `playerConfig`, costruzione della richiesta, collegamento (mittente falso rifiutato), job di import.
- Prova end-to-end in locale (15/11/2026): Postgres in memoria, `next start`, estensione compilata in Chromium con portale, CMS e Vimeo simulati. Esito: collegamento accettato, collegamento da un'origine falsa rifiutato, 3 GET al CMS, 2 video con sottotitoli `it` ed `en-x-autogen`, iframe rimossi, secondo import senza nuove versioni, permessi o tracce.
