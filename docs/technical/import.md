# Import delle lezioni (M1)

Come una lezione passa dal portale Epicode al catalogo di EpicFeed: estensione, collegamento con la web app, API di import e caso d'uso del core. Si importa una lezione, un capitolo o un corso intero. Le scelte sono motivate in [ADR 0009](../decisions/0009-whole-lesson-import-and-subtitles.md) e [ADR 0010](../decisions/0010-chapter-and-course-import.md).

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
- L'estensione agisce **solo** su `https://learn.epicode.edu.mt/course/{courseId}/curriculum/{contentId}` e solo quando lo studente preme uno dei pulsanti di import.
- **Indice del corso senza richieste in più**: a ogni pagina il portale scarica già l'albero del corso per la barra laterale. Lo script nel mondo principale ne conserva una copia ridotta (`pruneTree`: solo id, titolo, tipo, `embed_type`, ordine e visibilità, fino alle parti) e la passa all'estensione (`parseOutline` in `lib/outline.ts`). Da lì l'estensione ricava capitoli, lezioni e parti.
- Al CMS del portale chiede quindi solo il **dettaglio delle parti utili** (video Vimeo e testi), una GET per parte, più il corso una volta per pagina. Se l'indice manca (pagina aperta prima di installare l'estensione) legge come il portale: attività, modulo, unità e parti (circa 6–9 GET per lezione). Sempre una richiesta alla volta e con l'elenco esplicito dei campi: mai `fields=*.*` ([portal-usage.md](../portal-usage.md)).
- Solo contenuti **visibili adesso**: nascosti, non ancora aperti (`opens_at` futuro) o chiusi (`closes_at` passato) restano fuori, come nel portale.
- **Sessione del portale**: lo script `portal-main.content.ts` gira nella pagina del portale e, per conto dell'estensione, esegue solo le letture di un elenco chiuso (`lib/cms-bridge.ts`: una voce per id, campi ammessi, niente jolly né filtri), con la sessione che lo studente ha già aperto. Le credenziali del portale restano nella pagina: non arrivano al content script, al service worker né al nostro server. Se la pagina era aperta prima di installare l'estensione, basta ricaricarla.
- **Mai scritture** sul portale, in particolare sulle collezioni di progresso: nessun video risulta visto per effetto dell'estensione.
- Per i sottotitoli monta nella pagina del portale un iframe del player Vimeo nascosto, senza autoplay e muto (`?autoplay=0&muted=1&dnt=1#sf-import`), **uno alla volta** e con una pausa tra un video e l'altro (1,5 s per una lezione, 2,5–5,5 s casuali per capitolo e corso), poi lo rimuove. Il player funziona solo dentro i domini Epicode, quindi non c'è alternativa senza scaricare i video.
- Non apre le lezioni nella scheda: aprirle registrerebbe un accesso, invierebbe analytics e potrebbe segnare contenuti come visti.
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
| `embed` Google Docs, `quiz`, `nps`, `article`, elementi nascosti | esclusi | non sono materiale testuale dell'attività o non servono al feed; le slide (`googledocs`) arriveranno in M2 dallo zip ufficiale del corso, letto da Claude Desktop ([ADR 0012](../decisions/0012-slides-from-official-zip.md)) |

Una parte video senza riassunti e senza sottotitoli viene scartata (l'anteprima lo dice).

## Estensione (`apps/extension`)
WXT 0.21 (Manifest V3), TypeScript, nessuna dipendenza nel content script del player (4 KB).

| File | Ruolo |
|---|---|
| `entrypoints/portal.content.ts` | Sul portale: legge la lezione aperta e l'indice del corso (`lib/directus.ts`, `lib/outline.ts`, `lib/lesson.ts`), legge le lezioni di un lotto con le pause, monta e smonta il player nascosto |
| `entrypoints/portal-main.content.ts` | Nel mondo principale della pagina: ponte verso il CMS con la sessione del portale e copia ridotta dell'albero del corso (`lib/cms-bridge.ts`) |
| `entrypoints/vimeo.content.ts` | Nel player, solo con `#sf-import`: legge `window.playerConfig.request.text_tracks` (`lib/player-config.ts`) |
| `entrypoints/background.ts` | Riceve il collegamento dalla web app, esegue l'import di una lezione (`lib/import-job.ts`) o di un lotto (`lib/batch-job.ts`), scarica i VTT (`lib/vtt.ts`), ricorda le lezioni importate (`lib/imported.ts`) |
| `entrypoints/popup/` | Anteprima della lezione, pulsanti lezione/capitolo/corso con la stima dei tempi (`lib/pacing.ts`), avanzamento, *Interrompi* ed esito |
| `lib/connection.ts` | Accetta il token solo se il mittente è l'origine della web app e coincide con `apiBaseUrl` |

Permessi del manifest: `storage`; host: portale, CMS, player e sottotitoli Vimeo, origine della web app. `externally_connectable` ammette solo l'origine della web app.

L'ID dell'estensione è fisso (`bchcghaegcogobjapblaanbpnkpkihdd`) grazie alla chiave pubblica nel manifest, così la web app sa a chi inviare il token anche con l'estensione caricata a mano. La chiave privata non è conservata: serve solo per pubblicare sul Chrome Web Store, che ne genera una propria.

### Build e installazione
```bash
WXT_APP_ORIGIN=https://<indirizzo-della-web-app> pnpm --filter @study-feed/extension build
```
Poi in Chrome: `chrome://extensions` → *Modalità sviluppatore* → *Carica estensione non pacchettizzata* → cartella `apps/extension/.output/chrome-mv3`. Senza `WXT_APP_ORIGIN` l'origine predefinita è `https://study-feed.vercel.app`; `http://localhost:3000` è ammessa solo con `wxt` in modalità sviluppo.

## Import di capitolo e corso
Dal popup, oltre a *Importa la lezione*: **Importa il capitolo** (le lezioni del capitolo della lezione aperta) e **Importa tutto il corso**. Ogni pulsante mostra quante lezioni importerà e una stima della durata (`estimateMinutes`). Si propongono solo le lezioni con almeno un video o un testo; quelle già importate da questo browser si saltano, a meno di spuntare *Reimporta anche quelle già importate*.

```
 popup ── piano (lezioni in ordine) ──▶ service worker: runBatchJob
                                          per ogni lezione:
                                            pausa casuale (più lunga al cambio di capitolo)
                                            sf/read-activity ──▶ script del portale
                                                                  indice + GET delle parti, con pause
                                            player nascosti uno alla volta, VTT
                                            POST /api/import
                                            ricorda la lezione (storage.local)
```

Ritmo (`BATCH_PACING` in `lib/pacing.ts`), sempre una richiesta alla volta e con durate casuali nell'intervallo:

| Passo | Pausa |
|---|---|
| Tra una parte e l'altra della stessa lezione (GET del dettaglio) | 1,5–4 s |
| Tra un player video e il successivo | 2,5–5,5 s |
| Tra due lezioni dello stesso capitolo | 6–15 s |
| Al cambio di capitolo | 20–40 s |

Per il corso di Data Structures and Algorithms (30 lezioni con contenuti, 91 video, 30 riassunti) la stima è di circa 22 minuti e circa 120 GET al CMS: meno delle richieste che il portale fa aprendo una decina di pagine.

Comportamento:
- **Avanzamento**: lo stato (`reading`, `pause`, `subtitles`, `sending` con l'avanzamento del lotto, poi `batch-done`) va in `storage.session`. Il popup si può chiudere; riaperto chiede al service worker se c'è un import in corso (`sf/import-state`) e ne mostra l'avanzamento.
- **Interrompi** (`sf/stop-import`): le pause finiscono subito e il job si ferma prima della lezione successiva.
- **Errori**: ogni lezione è un import a sé. Una lezione rifiutata dal portale o vuota non ferma le altre. Il job si ferma se la scheda del portale non risponde, se la sessione del portale non c'è più, se il collegamento con EpicFeed non vale più (`UNAUTHORIZED`), dopo 3 errori di fila o su richiesta. L'esito elenca le lezioni non importate.
- **Ripresa**: le lezioni importate si ricordano in `storage.local` (`importedLessons`, al massimo 3.000); rilanciando lo stesso import si riparte da quelle mancanti.
- **Limite orario di EpicFeed**: su `RATE_LIMITED` il job attende `Retry-After` (al massimo 30 minuti, mostrato nel popup) e ritenta solo l'invio, senza rileggere portale e video.
- **Service worker sempre attivo**: durante il job una chiamata `runtime.getPlatformInfo()` ogni 20 s evita che Chrome lo chiuda per inattività (30 s) durante le pause.

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
- I sottotitoli auto-generati (`en-x-autogen`) sono salvati con `autoGenerated = true` e trattati come fonte secondaria ([ADR 0006](../decisions/0006-subtitles-as-secondary-source.md)).
- Se un sottotitolo non si scarica (URL firmato scaduto, errore di rete) l'import continua senza quella traccia e l'esito lo segnala.

## Come è testato
- `packages/core`: normalizzazione, impronte, prova di possesso, `ImportLesson` con un catalogo in memoria (stesso contenuto, contenuto cambiato, contenuto altrui senza possesso, tracce duplicate).
- `packages/adapters`: repository, token, limite di frequenza e "Le mie lezioni" su PGlite con RLS attiva.
- `packages/db`: `test/rls-import.test.ts`, un utente non vede tracce, token né cronologia di un altro.
- `apps/web`: `handleImport` con servizi finti (ogni riga della tabella degli errori).
- `apps/extension`: parsing di URL, VTT, `playerConfig`, costruzione della richiesta, collegamento (mittente falso rifiutato), job di import (anche limite orario), ponte (richieste ammesse, riconoscimento e riduzione dell'albero del corso), indice del corso (ordine, visibilità, programmati), lettura con l'indice (solo GET delle parti, pause), job a lotti (pause, vuote, errori gravi e non, interruzione, limite orario), stima dei tempi, memoria delle lezioni importate.
- Prova sul portale reale (21/11/2026): lo script del ponte compilato, iniettato nella pagina del corso, ha riconosciuto la richiesta dell'albero e restituito l'indice ridotto (3 unità, 42 lezioni, 91 video, 30 riassunti, 46 KB) senza nessuna richiesta in più al CMS. Popup verificato con dati simulati (anteprima, avanzamento, esito).
- Prova end-to-end in locale (15/11/2026): Postgres in memoria, `next start`, estensione compilata in Chromium con portale, CMS e Vimeo simulati. Esito: collegamento accettato, collegamento da un'origine falsa rifiutato, 3 GET al CMS, 2 video con sottotitoli `it` ed `en-x-autogen`, iframe rimossi, secondo import senza nuove versioni, permessi o tracce.
