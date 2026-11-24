# Web app (`apps/web`)

Next.js 16 (App Router, `src/proxy.ts` al posto del middleware), React 19, Tailwind 4 con i token di `packages/ui`. Stato: milestone **M4** in corso (accesso, Le mie lezioni, collegamento dell'estensione e di Claude Desktop, API di import e di generazione, feed di studio con *Io*, ripasso dei concetti, sincronizzazione cifrata dei progressi e sezione Esame).

## Pagine e API
| Percorso | Cosa fa | Accesso |
|---|---|---|
| `/login` | Codice via email al primo accesso, poi email e password | pubblico |
| `/login/callback` | Ritorno dal link dell'email di accesso (scambia il codice PKCE con la sessione) | pubblico |
| `/login/password` | Imposta la password (almeno 12 caratteri) dopo il primo accesso | sessione |
| `/` | **Feed di studio** a battute ([feed.md](../functional/feed.md)); la materia arriva da `GET /api/feed/subjects/{id}` | sessione |
| `/profile` | **Io**: aspetto, preferenze di studio, totali, collegamenti | sessione |
| `/profile/saved` | Schede salvate sul dispositivo | sessione |
| `/review` | **Ripasso** dei concetti a battute e sezione **Esame** (`#esame`) ([review.md](../functional/review.md)) | sessione |
| `GET /api/progress` | Copia cifrata dei progressi (`404` se non c'è) ([sincronizzazione](#sincronizzazione-dei-progressi-m4)) | sessione |
| `PUT /api/progress` | Scrive la copia cifrata se `baseRevision` è ancora quella (`409` altrimenti) | sessione, stessa origine |
| `/lessons` | **Le mie lezioni**: lezioni importate raggruppate per materia e capitolo, con numero di parti, sottotitoli e stato di generazione | sessione |
| `/extension` | Collega l'estensione, elenca e revoca i collegamenti | sessione |
| `/claude-desktop` | Crea il token "genera" per Claude Desktop (mostrato una volta), elenca e revoca i token | sessione |
| `GET /api/generation/lessons` | Lezioni da generare e totali ([generation.md](generation.md#api)) | token "genera" |
| `GET /api/generation/lessons/{id}` | Fonti di una lezione per Claude | token "genera" |
| `POST /api/generation/lessons/{id}/feed` | Salva il feed generato | token "genera" |
| `POST /api/generation/token` | Crea un token "genera" (90 giorni) | sessione, stessa origine |
| `DELETE /api/generation/token/{id}` | Revoca un token "genera" | sessione, stessa origine |
| `GET /api/feed/subjects` | Materie con lezioni importate e quante hanno un feed ([feed di studio](#feed-di-studio-m3)) | sessione |
| `GET /api/feed/subjects/{id}` | Feed di tutta la materia, con ETag (`304` se invariato) | sessione |
| `POST /api/exam/submissions`, `GET /api/exam/submissions`, `DELETE /api/exam/submissions/{id}` | Invio per la correzione di Claude, elenco con le correzioni arrivate, cancellazione dopo averle conservate ([esame](#esame-m4)); `POST` e `DELETE` solo dalla stessa origine | sessione |
| `GET /api/exam/subjects/{id}` | Contenuti d'esame della materia: pacchetti dei feed correnti e banca dello studente, con ETag ([esame](#esame-m4)) | sessione |
| `POST /api/import` | Import di una lezione ([import.md](import.md#api-post-apiimport)) | token di import |
| `POST /api/extension/token` | Crea un token di import | sessione, stessa origine |
| `DELETE /api/extension/token/{id}` | Revoca un token | sessione, stessa origine |

I vecchi indirizzi italiani (`/accedi`, `/io`, `/io/salvati`, `/ripasso`, `/lezioni`, `/estensione`) reindirizzano in modo permanente a quelli nuovi (`next.config.ts`, [ADR 0019](../decisions/0019-feature-packages.md)).

Tutte le pagine sono dinamiche (`force-dynamic`): dipendono dalla sessione e non vanno mai in cache.

## Struttura
```
apps/web/src/
├─ proxy.ts             CSP con nonce, rinnovo della sessione, redirect a /login
├─ app/                 pagine e route (solo composizione e presentazione)
├─ components/          guscio delle pagine di servizio, barra in basso
├─ features/feed/       feed di studio (client): modello, gesti, dati sul dispositivo, schermate
└─ server/              solo lato server ('server-only')
   ├─ env.ts            variabili d'ambiente validate con zod alla prima lettura
   ├─ supabase.ts       client Supabase con i cookie della richiesta
   ├─ auth.ts           utente corrente, allowlist delle email, password impostata
   ├─ container.ts      composizione: connessione Postgres, repository, casi d'uso
   ├─ http.ts           risposte di errore uniformi, controllo dell'origine, bearer
   ├─ import-handler.ts POST /api/import, testabile senza Next.js
   ├─ feed-handler.ts   GET /api/feed/subjects[/{id}], testabile senza Next.js
   ├─ appearance.ts     tema e accento dai cookie, per il primo render
   └─ feed-deps.ts      collega gli handler del feed ai servizi e al riallineamento con `after`
```
Le route chiamano `getServices()` di `container.ts`, che crea una sola volta la connessione (`postgres`, `prepare: false` per il pooler di Supabase, TLS obbligatorio tranne che su `localhost`) e collega le implementazioni di `@epicfeed/<funzione>/infrastructure` ai casi d'uso dei pacchetti di funzione.

## Accesso
Supabase Auth con email ([ADR 0007](../decisions/0007-generation-via-mcp-and-login.md)):
1. lo studente inserisce l'email; se è in `ALLOWED_EMAILS` riceve un'email di accesso (`signInWithOtp`); altrimenti il messaggio è lo stesso, per non rivelare quali email sono ammesse;
2. l'email contiene un **link** che torna a `/login/callback` (flusso PKCE: funziona nel browser da cui è stato chiesto). Il **codice a 6 cifre** compare solo con un modello email personalizzato, che Supabase permette di modificare solo con un server SMTP proprio; l'app accetta entrambi;
3. entrato, al primo accesso imposta una password (salvata da Supabase; `user_metadata.password_set` ricorda che l'ha fatto);
4. dalle volte successive entra con email e password.

Ogni pagina protetta richiama `requireUser()`, che ricontrolla l'allowlist. La sessione non è solo letta dal cookie: `getClaims` verifica in locale firma (ES256, chiave pubblica del progetto tenuta in memoria) e scadenza del token, senza una chiamata al server di autenticazione per pagina. Le pagine e azioni di accesso, il ritorno dal link e la creazione o revoca dei token chiedono invece conferma al server (`getCurrentUser({ verifyWithServer: true })`, cioè `getUser`), come pure il caso in cui il token dica che la password non è ancora impostata. Motivi e compromesso nell'[ADR 0016](../decisions/0016-app-responsiveness.md).

Le letture del catalogo passano da `withUserRls`: la query gira con il ruolo `authenticated` e l'id dell'utente nei claim, quindi la RLS del database decide cosa si vede anche se il server usa una connessione privilegiata.

## Sicurezza
- **CSP per richiesta** (`proxy.ts`): script e stili solo con nonce, `frame-ancestors 'none'`, `connect-src` solo verso l'app e Supabase, `worker-src` e `manifest-src` solo dall'app (service worker e manifest della PWA), `upgrade-insecure-requests` in HTTPS.
- Header fissi (`next.config.ts`): HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- Le API che usano la sessione accettano solo richieste della stessa origine (`isSameOrigin`), contro il CSRF.
- Nessuna chiave privilegiata nel client: il browser riceve solo URL e chiave pubblicabile di Supabase.
- Errori verso il client con codici stabili (`packages/shared/src/contracts/api-error.ts`) e messaggi in italiano, senza dettagli interni.

## Feed di studio (M3)
Decisioni in [ADR 0015](../decisions/0015-study-feed-m3.md).

- `GET /api/feed/subjects` → `{ subjects: [{ subjectId, title, editionLabel, lessons, lessonsWithFeed }] }` (`ListStudySubjects`).
- `GET /api/feed/subjects/{id}` → la materia intera (`subjectFeedResponseSchema` in `packages/feed/src/contracts/feed.ts`): capitoli in ordine, lezioni con link alla pagina del portale, parti con il loro link (per *Guarda sul portale*; le slide importate dallo zip non hanno una pagina sul portale e rimandano alla lezione) e feed salvato (`null` se la lezione non è ancora generata). Gli id del portale restano sul server: l'app riceve solo i link, costruiti e validati da `portalContentUrl` del core.
- **Cache**: `Cache-Control: private, no-cache` ed `ETag` = impronta di feed e versioni di allineamento (`ReadSubjectFeed`); con `If-None-Match` uguale la risposta è `304` senza corpo. Il DSA intero pesa circa 700 KB (150 KB compressi).
- **Permessi**: sessione verificata con Supabase (`getCurrentUser`, password già impostata); letture con `withUserRls` (`DrizzleStudyFeedRepository`): materie, lezioni, parti e feed visibili solo se importati. Per ogni lezione vale il feed più recente tra quelli visibili.
- **Riallineamento**: se la materia contiene feed allineati con regole vecchie, la risposta parte subito e `after()` di Next.js esegue `RealignLessonFeeds` (una lezione alla volta, fonti lette con i permessi dello studente, impronta delle fonti ricontrollata). La scrittura usa la connessione del server ed è condizionata alla versione letta, così due richieste contemporanee non scrivono due volte. Alla visita successiva l'ETag è cambiato e l'app scarica i minuti nuovi.

### Schermata del feed (`src/features/feed`)
Le regole pure stanno in `@epicfeed/feed` ([core.md](core.md#feed-di-studio)): `storyOf` (battute, parola da indovinare, abbinamento frasi–codice), `buildStudySequence` (ordine e domande), `answerPoints`. La web app aggiunge:

| File | Ruolo |
|---|---|
| `model.ts` | Dalla risposta dell'API agli elementi da scorrere (`buildEntries`), indice dei capitoli, posizione da cui riprendere, minuto leggibile |
| `feed-client.ts` | `readCachedFeed`: copia sul dispositivo, validata una volta e poi tenuta in memoria; `loadFeed`: materia scelta (ultima aperta con lezioni pronte), `If-None-Match` con la versione salvata, `304` → copia; senza rete la copia, con l'avviso *offline*. `FeedApp` mostra subito la copia e poi applica l'esito di `loadFeed`: se la materia è cambiata la sostituisce restando sulla scheda della posizione salvata |
| `storage.ts`, `local-state.ts` | `localStorage` con prefisso `ef:`, ogni lettura validata con zod e ogni errore assorbito; valori condivisi tra i componenti con `useSyncExternalStore` (sul server e al primo render valgono i predefiniti, quindi niente differenze di idratazione) |
| `gestures.ts` | `GestureRecognizer` senza DOM, con timer sostituibili: tocco (destra/sinistra, quota sinistra 30%), doppio tocco entro 230 ms, pressione di 500 ms, tolleranza di 12 px oltre la quale è uno scroll; `swipeAnswer` per il vero/falso (80 px, soprattutto orizzontale) |
| `feed-app.tsx` | Composizione: scroll verticale nativo con `scroll-snap`, solo le schede entro ±2 da quella visibile sono disegnate (le altre sono segnaposto vuoti alti uno schermo), le schede non visibili sono `inert`; sessione, punti, toast, sintesi vocale, tastiera, avanzamento automatico |
| `card-slide.tsx`, `quiz-slide.tsx`, `sheets.tsx`, `overlays.tsx` | Scheda a battute, domande, fogli delle azioni e dei capitoli, spiegazione dei gesti e riepilogo della sessione |
| `feed.css` | Stili del feed con i token `--sf-*`: tema e accento cambiano senza ricaricare; `data-motion='off'` e `prefers-reduced-motion` spengono animazioni e transizioni |

**CSP e stili**: la CSP non permette attributi `style` nell'HTML del server. I pochi valori dinamici (durata della battuta in avanzamento automatico, anello dei 5 minuti, trascinamento del vero/falso) sono variabili CSS impostate dal client con `style.setProperty` dopo il montaggio; il feed stesso si disegna solo nel browser, dopo il caricamento della materia.

**Aspetto**: `/profile` salva tema e accento con la server action `saveAppearance` in due cookie `httpOnly` (`ef-theme`, `ef-accent`, un anno, valori validati con `isThemePreference`/`isAccentName`); il layout li legge con `readAppearance` e li mette su `<html>`, così la pagina nasce nei colori scelti. Nel frattempo il client cambia subito gli attributi di `<html>`.

**Font**: Space Grotesk, Inter e JetBrains Mono con `next/font/google`, scaricati alla build e serviti dall'app (`font-src 'self'`); la classe `ef-fonts` su `<html>` li collega ai token `--sf-font-*`.

### Navigazione
- `src/app/loading.tsx`: schermata di attesa con la barra in basso, mostrata appena si tocca un collegamento (Next.js la scarica in anticipo con il prefetch dei link) mentre il server prepara la pagina.
- Pulsanti, voci della barra e righe di *Io* reagiscono subito alla pressione (`:active`), senza l'evidenziazione dei browser mobili.
- La barra in basso è in vetro su un fondo quasi pieno (90% del colore di fondo) con sfocatura. In CSS si scrive solo `backdrop-filter`: con anche la forma `-webkit-` Lightning CSS teneva solo quella, e Chrome restava senza sfocatura.

## Ripasso (M4)
Decisioni in [ADR 0017](../decisions/0017-review-and-exam-m4.md); regole pure in `@epicfeed/review` ([core.md](core.md#ripasso)). Il tab `/review` contiene anche la sezione [Esame](#esame-m4) (`#esame`).

| File (`src/features/review`) | Ruolo |
|---|---|
| `progress-store.ts` | `IndexedDbProgressStore`, adapter delle porte `ProgressStore` e `SyncableProgressStore`: database `epicfeed-progress` con `reviews` (stato FSRS per concetto, chiave `conceptId`), `answers` (storico, chiave automatica) e `meta` (serie di giorni e giorni di ripasso). `loadSnapshot` esporta lo storico per la sincronizzazione; `mergeSnapshot` unisce una copia remota e ricalcola gli stati in una sola transazione, così le risposte date nel frattempo restano. Stato e risposta nella stessa transazione; ogni record letto passa da uno schema zod e quelli non validi si ignorano. `progressStore()` apre il database una volta sola e restituisce `null` se IndexedDB non c'è; `onProgress`/`notifyProgress` avvisano le schermate aperte |
| `record.ts` | `recordStudyAnswer`: porta una risposta nel ripasso con `recordAnswer` di `@epicfeed/review`; non lancia mai (lo studio non si ferma se IndexedDB fallisce). La usano il feed (`onAnswer` in `feed-app.tsx`, fonte `feed`) e la sessione di ripasso (fonte `review`) |
| `catalog.ts` | `buildReviewCatalog`: dalla materia scaricata ai concetti (uno per chiave, testi dalla prima lezione, termini da tutte le schede sul concetto) e alle domande, con l'id dell'elemento del feed (`lezione:quiz:id`, unico nella materia); `recallBlank` sceglie la parola da coprire con `pickBlank` del core o, in mancanza, il nome del concetto |
| `use-review-data.ts` | Materia (prima la copia sul dispositivo, poi `loadFeed` come il feed) e progressi, ricaricati a ogni risposta |
| `review-app.tsx` | Tab Ripasso: sezioni *Ripasso*/*Esame*, home (scaduti, serie, concetti deboli, barre per modulo), riepilogo di fine sessione; passa materia, catalogo e nonce della CSP alla sezione Esame |
| `review-session.tsx` | Sessione a battute a tutto schermo: richiamo con la parola da indovinare, poi la domanda con `QuizSlide` del feed (prop `continueHint={null}` e pulsante *Avanti*) |
| `review.css` | Stili del ripasso con i token `--sf-*`; le larghezze delle barre sono variabili CSS impostate dal client (CSP) |

### Esame (M4)
Decisioni in [ADR 0014](../decisions/0014-exam-preparation.md) e [ADR 0017](../decisions/0017-review-and-exam-m4.md); regole pure in `@epicfeed/exam` (`domain/practice.ts`: estrazione delle 50 domande, punteggio della griglia, esito dei test). Contenuti generati da Claude Desktop ([generation.md](generation.md#pacchetti-desame-m4)).

| File (`src/features/exam`) | Ruolo |
|---|---|
| `exam-client.ts` | `loadExamContent`: `GET /api/exam/subjects/{id}` con `If-None-Match` dalla copia in `localStorage` (`ef:exam:{materia}`), validata con `examContentResponseSchema`; senza rete usa la copia |
| `catalog.ts` | `buildExamCatalog`: per ogni modulo le domande del feed in inglese (il vero/falso come due opzioni) più quelle del pacchetto; esercizi della banca (ogni ufficiale seguito dalle sue varianti, in ordine di pagina) e domande aperte delle lezioni, con chiavi stabili (`bank:id`, `lezione:open:id`, `lezione:exam:id`) |
| `use-exam-data.ts` | Copia sul dispositivo, poi aggiornamento dal server; catalogo ricalcolato solo se cambia la versione |
| `exam-section.tsx` | Home della sezione (quiz per modulo, banca, domande aperte delle lezioni, avvisi su cosa manca) e passaggio alle schermate |
| `module-quiz.tsx` | Quiz di modulo: 50 domande estratte a caso (`drawRandom`), spiegazione dopo ogni risposta, riepilogo con i concetti da rivedere; ogni risposta va nel ripasso (fonte `quiz`) |
| `exercise-view.tsx` | Esercizio: timer facoltativo, suggerimenti uno alla volta (lingua IT/EN propria, `ef:exam-prefs`), bozza salvata (`ef:exam-draft:{chiave}`), editor, test, soluzione modello e autovalutazione con la griglia; il punteggio aggiorna il ripasso di ogni concetto collegato (fonte `exercise`, soglie dell'ADR 0014) e resta in `ef:exam-scores` |
| `code-editor.tsx`, `codemirror-setup.ts` | CodeMirror 6 (Python, colori dai token `--sf-*`) caricato con `import()` al primo esercizio di codice: è in un file JS a parte, fuori dalle altre pagine. Gli stili di CodeMirror usano il nonce della CSP (`EditorView.cspNonce`), che la pagina legge da `x-nonce`. Finché non è pronto c'è un'area di testo con lo stesso contenuto |
| `python-runner.ts` | `PythonRunner`: un Web Worker riusato, avviato al primo test; tempo massimo 5 secondi per test, poi il worker si termina e il successivo riparte; 90 secondi per il primo caricamento |
| `exercise-timer.tsx` | Timer facoltativo (10, 15, 20 o 30 minuti), a fine tempo avvisa e continua in negativo |
| `corrections.ts` | Correzione di Claude: `submitForCorrection` (invio e copia in attesa in `ef:exam-corrections`), `syncCorrections` all'apertura della sezione (unisce gli invii del server, porta i punti nel ripasso una sola volta, fonte `exercise` o `interview`, aggiorna `ef:exam-scores`, poi cancella gli invii corretti dal server); al massimo 40 invii conservati |
| `correction-view.tsx` | Correzione come una revisione del codice: punti per criterio, schede dei suggerimenti con il diff (righe tolte in rosso con `−`, nuove in verde con `+`, numeri di riga, contesto), commento e riepilogo |
| `interview.tsx`, `interview-plan.ts` | Colloquio in chat: 4 domande in 20 minuti (concetti diversi, al massimo un esercizio di codice), approfondimento dopo ogni risposta, niente suggerimenti; a tempo scaduto si chiude con quanto scritto. Alla fine soluzioni, autovalutazione (fonte `interview`) e invio a Claude |

**Python nel browser (Pyodide 0.29.5, MPL 2.0)**:
- `scripts/copy-pyodide.mjs`, eseguito da `pnpm dev` e `pnpm build`, copia dal pacchetto npm in `public/pyodide/<versione>/` solo i file che servono (circa 12 MB: runtime WebAssembly e libreria standard); la cartella non va in git ed è tra gli output di Turborepo. Un test verifica che `PYODIDE_VERSION` coincida con il pacchetto installato.
- `public/python-worker.js` (scritto a mano): carica Pyodide, poi toglie dal worker `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` e `importScripts` e blocca i moduli Python `js`, `pyodide_js` e `pyodide.http`. Esegue il codice in un namespace nuovo, poi ogni chiamata dei test, e restituisce `repr()` o l'ultima riga dell'errore; `print` è catturato e troncato a 4.000 caratteri.
- `next.config.ts`: `/pyodide/*` con cache di un anno (la versione è nel percorso); `/python-worker.js` con `no-cache` e una CSP propria (`script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`): WebAssembly è permesso solo nel worker, le pagine restano con la CSP di sempre. `proxy.ts` esclude entrambi.
- Il service worker tiene i file di Pyodide (prima la cache, solo la versione in uso) e il worker (prima la rete): dopo il primo uso i test girano anche offline.

Lato server: `src/server/exam-handler.ts` (handler puri), `exam-deps.ts`, `src/app/api/exam/subjects/[id]/route.ts`, `src/app/api/exam/submissions/`; per Claude Desktop `src/app/api/generation/exam/submissions/` con il token "genera"; caso d'uso `ReadExamContent` nel core e `loadExamContent` di `DrizzleExamPackRepository` (una lettura con la RLS dello studente: materia visibile, pacchetto del feed corrente di ogni lezione, banca propria). L'ETag è l'impronta degli id di pacchetti e banca, che non cambiano mai: un feed nuovo ha un pacchetto nuovo.

### Budget Lighthouse
`apps/web/perf/lighthouse.mjs` (`pnpm --filter @epicfeed/web perf`, dopo `pnpm build`; nella CI dopo i test Playwright). Lighthouse 13 con la configurazione mobile (telefono emulato, 4G lenta, CPU rallentata 4 volte) applicata davvero al browser (`throttlingMethod: 'devtools'`): la stima simulata conta nel LCP anche gli script che non lo bloccano e su queste pagine lo gonfia di circa un secondo. Ogni pagina si misura 3 volte e vale la mediana; il riepilogo va in `perf/.results/summary.json`.

| Pagina | Come si serve | LCP | Misura del 24/11/2026 |
|---|---|---|---|
| *Accedi* | `next start` (configurazione finta, nessuna rete) | ≤ 2,5 s | 1,6 s |
| Feed e Ripasso, prima apertura | banco di prova, Chrome nuovo (niente cache, dati né cookie) | ≤ 2,5 s | Feed 1,7 s, Ripasso 1,6 s |
| Feed e Ripasso, visita di ritorno | banco di prova, cache e dati del dispositivo già presenti | ≤ 2,5 s | Feed 1,6 s, Ripasso 0,7 s |

Per tutte: TBT ≤ 300 ms e CLS ≤ 0,1. Le pagine protette si misurano sul banco di prova di Playwright (stesso codice e CSS della build, dati di prova; script in moduli ES con preload di font e script come fa Next, serviti compressi e con cache come su Vercel). Il banco **disegna le pagine in Node** come il server (`e2e/harness/prerender.tsx`, `renderToString`) e il browser le idrata (`mount.tsx`); il server di prova sceglie la variante dai cookie come la pagina vera (`index.html` con l'anteprima o `index-copy.html`, `ripasso.html` con la richiesta della password o `ripasso-key.html`). Lighthouse non cancella i cookie tra una misura e l'altra: ogni prima apertura usa quindi un Chrome nuovo.

#### Prima schermata dal server
Su 4G lenta gli script (circa 150 KB compressi) arrivano dopo 2,5 s: alla prima apertura la schermata principale deve essere già nell'HTML.

- **Feed**: senza il cookie `ef-feed-copy` la pagina (`src/app/page.tsx`) legge l'anteprima con `loadFeedPreview` (`src/server/feed-preview.ts`): tutti i capitoli e i titoli, ma il feed solo della prima lezione pronta (`feedPreview` in `model.ts`, versione con il prefisso `anteprima:`). `FeedApp` parte da lì (`preview`), poi la materia intera la sostituisce restando sulla scheda. Con la copia sul dispositivo il server non legge il feed.
- **Ripasso**: senza il cookie `ef-sync-key` la richiesta della password è già nella pagina, in cima (il ripasso che arriva dopo non la sposta). Con la chiave lo stato della sincronizzazione resta in fondo.
- I cookie (`src/features/device-flags.ts`) contengono solo `1`, durano un anno e non portano dati di studio: `ef-feed-copy` si accende quando la materia è salvata sul dispositivo, `ef-sync-key` segue la chiave a ogni sincronizzazione (si spegne se manca). Se un cookie sbaglia (cancellato a mano) la pagina si corregge appena gli script leggono il dispositivo.
- **zod** si importa come `import * as z from 'zod'`: con `import { z }` esbuild includeva tutta la libreria (443 KB invece di 97 KB minificati).

### Sincronizzazione dei progressi (M4)
Decisioni in [ADR 0018](../decisions/0018-encrypted-progress-sync.md); unione e ricalcolo puri in `@epicfeed/review` ([core.md](core.md#sincronizzazione-dei-progressi)).

| File (`src/features/sync`) | Ruolo |
|---|---|
| `crypto.ts` | WebCrypto: `derivePasswordKey` (PBKDF2-SHA256 600.000 iterazioni, sale dall'email → chiave HKDF non estraibile), `encryptSnapshot`/`decryptSnapshot` (HKDF con sale casuale → AES-GCM 256, iv casuale, gzip, dati associati con il `kdf`); la copia decifrata passa da uno schema zod |
| `key-store.ts` | Database `epicfeed-sync`: la chiave (`CryptoKey` non estraibile, email, account, `trusted`) e il proprietario dei progressi del dispositivo |
| `vault.ts` | `HttpProgressVault`, adapter della porta `ProgressVault`: `GET`/`PUT /api/progress`, `409` → `{ ok: false }`, errori di rete → `SyncHttpError` |
| `engine.ts` | `syncNow` (una alla volta, con coda), `useProgressSync` (apertura, 20 s dopo l'ultima risposta, secondo piano, ritorno della rete), `useSyncStatus`, `rememberPasswordKey`/`forgetPasswordKey`; controllo del proprietario dei progressi |
| `actions.ts` | Server action `confirmPassword`: verifica la password dell'utente collegato per lo sblocco |
| `sync-panel.tsx` | Stato in fondo alla home del Ripasso e richiesta della password (*Sincronizza telefono e PC*, *La password è cambiata*); senza chiave (`keyExpected={false}`) la richiesta sta in cima e si mostra subito |

- La chiave si prepara nel form di accesso (`login-form.tsx`) e in quello della password (`password-form.tsx`) **prima** di mandare il form: è l'unico momento in cui il browser ha la password. Se l'accesso o il salvataggio non riescono, la chiave si cancella.
- Lato server: `src/server/progress-handler.ts` (handler puri, testati senza Next.js), `progress-deps.ts`, `src/app/api/progress/route.ts`; `DrizzleProgressRepository` in `packages/review/src/infrastructure` (lettura con la RLS dello studente, scrittura con `revision = base` e incremento atomico).
- Nel banco di prova Playwright `confirmPassword` è una funzione vuota e non c'è chiave: la home del Ripasso mostra la richiesta della password, il resto non cambia.

### PWA e uso senza rete
- **Manifest** (`src/app/manifest.ts`, servito come `/manifest.webmanifest`): nome *EpicFeed*, apertura su `/`, schermo intero verticale, colori ossidiana; icone in `public/icon.svg` e `public/icons/` (192, 512, 512 *maskable*, 180 per iOS). Il layout aggiunge l'icona per la schermata Home di iOS e `appleWebApp`.
- **Immagini del README** (`public/readme/`): plancia dello stato e schermate, pubbliche ed escluse dal controllo di accesso in `src/proxy.ts`, così si vedono anche nell'app GitHub per smartphone (vedi [docs/README.md](../README.md#stato-dello-sviluppo)).
- **Service worker** (`public/sw.js`, scritto a mano, nessuna dipendenza), registrato da `ServiceWorkerRegistration` solo nella build di produzione:
  - `/_next/static/` (JS, CSS e font con l'impronta nel nome): prima la cache, poi la rete; al massimo 120 file, i più vecchi si scartano;
  - navigazione su `/` e `/review`: prima la rete; la copia in cache serve solo se la rete manca. Si conserva solo una risposta 200 della pagina stessa: un rimando ad `/login`, un 401 o un 403 cancellano la copia, così dopo l'uscita il feed non si riapre offline;
  - `/pyodide/` (M4): prima la cache, nella cache `epicfeed-pyodide` con la sola versione in uso; `/python-worker.js`: prima la rete, con la copia come riserva;
  - API, altre pagine e altri siti: non li tocca. La materia non passa dal service worker: la tiene `feed-client.ts` in `localStorage` e la rivaluta con l'ETag.
  - Le cache hanno la versione nel nome (`epicfeed-shell-v1`, `epicfeed-static-v1`): cambiare `VERSION` le svuota all'attivazione; `skipWaiting` e `clients.claim` fanno valere subito la versione nuova.
- `next.config.ts` serve `/sw.js` con `Cache-Control: no-cache`, perché il browser controlli sempre se è cambiato; `proxy.ts` esclude `sw.js`, il manifest e le icone (niente sessione né CSP da rinnovare per file statici).
- Senza rete, quindi, l'app installata si apre sul feed con l'ultima materia scaricata e l'avviso *offline*; punti, salvati e posizione restano sul dispositivo come sempre.

## Variabili d'ambiente
Esempio commentato in `apps/web/.env.example`. In locale vanno in `apps/web/.env.local` (ignorato da git), su Vercel in *Settings → Environment Variables*.

| Variabile | Segreta | Cosa è |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | URL del progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | chiave pubblicabile (`sb_publishable_…`) |
| `DATABASE_URL` | **sì** | *Transaction pooler* di Supabase (porta 6543) con la password del database |
| `ALLOWED_EMAILS` | no, ma privata | email ammesse, separate da virgole |
| `NEXT_PUBLIC_EXTENSION_ID` | no | `bchcghaegcogobjapblaanbpnkpkihdd` |

La build in CI non ha bisogno di nessuna variabile: vengono lette e validate solo quando arriva una richiesta.

## Messa online (Vercel)
Le funzioni girano a **Dublino** (`apps/web/vercel.json`, `regions: ["dub1"]`), accanto a database e autenticazione di Supabase (`eu-west-1`, Irlanda): con la regione predefinita di Vercel (Virginia) ogni query attraversava l'Atlantico ([ADR 0016](../decisions/0016-app-responsiveness.md)).

Una volta sola:
1. Vercel → *Add New → Project* → importa `DamnedMe/study-feed`; *Root Directory* `apps/web` (Vercel riconosce pnpm e Turborepo).
2. Aggiungi le variabili della tabella. Per `DATABASE_URL`: in Supabase *Connect → Transaction pooler*; la password, se non la conosci, si reimposta da *Database → Settings → Reset database password* (meglio solo lettere e numeri).
3. In Supabase *Authentication → URL Configuration*: *Site URL* = indirizzo Vercel, e tra i *Redirect URLs* `https://<indirizzo>/**`.
4. (Facoltativo) Per ricevere il codice invece del link: configurare un SMTP proprio in *Authentication → Emails → SMTP Settings* e mettere `{{ .Token }}` nei modelli *Magic link or OTP* e *Confirm sign up*.
5. Dopo aver creato il tuo account, *Authentication → Sign In / Providers*: disattiva *Allow new users to sign up*, così nessun altro può registrarsi anche conoscendo l'indirizzo.
6. Ricompila l'estensione con `WXT_APP_ORIGIN` = indirizzo Vercel ([import.md](import.md#build-e-installazione)).

## Sviluppo in locale
```bash
cp apps/web/.env.example apps/web/.env.local   # e compila i valori
pnpm --filter @epicfeed/web dev              # http://localhost:3000
```

## Test
`src/server/*.test.ts` (Vitest): `handleImport` con servizi finti (ogni caso di errore), controllo dell'origine e lettura del bearer. I flussi con il database sono coperti dai test delle cartelle `infrastructure` dei pacchetti e dalla prova end-to-end descritta in [import.md](import.md#come-è-testato). `src/features/feed/*.test.ts`: modello del feed, salvataggi sul dispositivo, gesti e caricamento della materia. `src/features/exam/*.test.ts`: catalogo d'esame, caricamento con ETag e copia, esecutore Python con worker e timer finti.

**Feed sul telefono (Playwright, `apps/web/e2e`)**: `pnpm --filter @epicfeed/web test:e2e`, dopo la build. Un banco di prova (`e2e/harness/build.mjs`) impacchetta con esbuild il vero `FeedApp` con una materia di prova (`fixture.ts`, validata dallo stesso schema dell'API) e un `fetch` finto, al posto di `next/link` e `next/navigation` mette due sostituti minimi, e prende i CSS e i font dalla build di Next (`.next/static`). I test servono i file con `page.route` (nessun server, nessun database) e con una CSP come quella di produzione per gli stili, quindi un attributo `style` nell'HTML o un errore in console fanno fallire il test. Chromium con le viste di **iPhone 13** e **Pixel 7** (tocco attivo): spiegazione dei gesti al primo avvio, battute avanti e indietro, parola da indovinare, doppio tocco, tieni premuto con il minuto sul portale, scorrimento con domanda in inglese e codice, vero/falso con lo swipe, foglio dei capitoli, tastiera, ripresa dall'ultima scheda; apertura dalla copia con la rete lenta (`?rete=lenta`) o assente (`?rete=assente`); andata e ritorno da *Io* con posizione e punti conservati; sessione da 5 minuti contata alla fine (orologio simulato). Sezione Esame (`review-entry.tsx` con i contenuti d'esame di `fixture.ts`): quiz di modulo con domande del feed e del pacchetto, esercizio di codice con suggerimento, editor CodeMirror, test eseguiti davvero con Pyodide nel worker (stessa CSP del worker di produzione) e griglia, ciclo infinito interrotto dopo 5 secondi per test, correzione di Claude con le schede dei suggerimenti (invii simulati in `sessionStorage`), colloquio in chat con approfondimento. Il banco usa un nonce fisso per gli stili dell'editor, come la CSP di produzione. Il banco ha anche la pagina *Io* (`io-entry.tsx`, server action sostituita da una funzione vuota): righe allineate sui telefoni stretti, nessuno scorrimento orizzontale, barra in basso sfocata e coprente.
