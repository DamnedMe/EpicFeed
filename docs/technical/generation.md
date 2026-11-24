# Generazione di schede e quiz (M2)

Stato: in sviluppo. Decisioni: [ADR 0007](../decisions/0007-generation-via-mcp-and-login.md), [ADR 0011](../decisions/0011-bilingual-study-it-en.md), [ADR 0012](../decisions/0012-slides-from-official-zip.md), [ADR 0013](../decisions/0013-generation-m2-details.md).

## Flusso
```
Claude Desktop ──stdio──▶ server MCP (PC) ──HTTPS + token "genera"──▶ API EpicFeed ──▶ Postgres
   │  lezioni_da_generare      │ legge le fonti della lezione (riassunti IT+EN, testi, sottotitoli, slide)
   │  leggi_lezione            │
   │  (Claude genera il feed)  │
   └─ salva_feed_lezione ──────┘ valida (zod + checkLessonFeed) → API rivalida, allinea ai video, salva
```

Unità di generazione: la **lezione**. Un feed è legato all'**impronta delle fonti** (`computeLessonSourcesHash`) letta da Claude: se la lezione cambia nel frattempo, l'API rifiuta il salvataggio.

## Il feed di una lezione
Ogni testo per lo studente è una coppia `{ it, en }` (ADR 0011). Schemi in `packages/contracts/src/generation.ts`, tipi e regole in `packages/core/src/domain/feed.ts`.

| Elemento | Campi principali | Obiettivo per lezione | Limiti accettati |
|---|---|---|---|
| Scheda (`concept`, `steps`, `comparison`, `code`) | titolo (≤ 120), frase chiave (obiettivo 140, max 220), spiegazione (obiettivo 500, max 900), passi / confronto / codice secondo il tipo, termini, concetti, parte di provenienza, origine | 8–12 | 3–20 |
| Domanda (`multiple_choice`, `true_false`) | domanda, 3–5 opzioni nello stesso ordine nelle due lingue o risposta vero/falso, spiegazione, concetto, difficoltà 1–3 | 6–8 | 2–12 |
| Concetto | chiave stabile in kebab-case, nome, descrizione | 3–6 | 1–10 |
| Voce di glossario | termine inglese del corso, traduzione italiana, definizione | secondo la lezione | 0–40 |

### Controlli
1. **Forma** (zod, oggetti `strict`): campi ammessi, tipi, lunghezze, testi su una riga dove serve, id in kebab-case, UUID delle parti.
2. **Regole** (`checkLessonFeed`, restituisce tutti i problemi con il percorso, es. `quiz[2].correctIndex`):
   - quantità nei limiti;
   - id di schede e domande e chiavi dei concetti univoci; termini del glossario univoci senza distinzione di maiuscole;
   - ogni concetto citato esiste, ogni concetto compare in almeno una scheda;
   - la parte di provenienza appartiene alla lezione;
   - passi e opzioni in numero uguale nelle due lingue, risposta corretta tra le opzioni, opzioni non ripetute;
   - passi solo nelle schede `steps`, confronto solo in `comparison`, codice obbligatorio in `code`;
   - un testo lungo identico nelle due lingue è segnalato come traduzione mancante.

Il server MCP esegue entrambi i controlli prima di inviare e restituisce a Claude l'elenco dei problemi da correggere; l'API li ripete, perché non si fida del client.

## Allineamento al minuto
`alignCard(scheda, tracce)` in `packages/core/src/domain/alignment.ts`, eseguito dall'API al salvataggio. Da M3 ([ADR 0015](../decisions/0015-study-feed-m3.md)) lo chiama `alignCardToLesson(scheda, video della lezione)` (regole **versione 2**, `ALIGNMENT_VERSION`):
- una scheda tratta da un video cerca solo in quel video, come in M2;
- una scheda tratta da slide o lettura cerca in tutti i video della lezione e tiene il tratto più sicuro (a parità, il video che viene prima);
- il tratto salvato riporta la parte video in `partId` (nei feed di M2 manca e vale la parte di provenienza);
- il documento salvato riporta `alignmentVersion`; i feed con una versione più vecchia si riallineano quando lo studente apre la materia (`RealignLessonFeeds`, vedi [web.md](web.md#feed-di-studio-m3)).

1. Le parole di scheda e sottotitoli si riducono a una radice grezza: minuscolo, senza accenti, senza parole frequenti italiane e inglesi, senza la `s` finale, primi 5 caratteri (`trees` → `tree`, `alberi` → `alber`).
2. La traccia si divide in finestre di 30 secondi, una per ogni riga di partenza.
3. Punteggio di una finestra: somma dei pesi delle parole della scheda presenti, diviso il totale delle parole della scheda presenti nella traccia. Peso = `log(1 + righe / righe che contengono la parola)`, doppio per i termini del glossario.
4. Si accetta la finestra migliore solo se: confidenza ≥ 0,3, almeno 3 parole in comune, almeno il 20% meglio della miglior finestra che non si sovrappone. Altrimenti `null`: "Guarda sul portale" apre la parte dall'inizio.
5. Il tratto parte 1,5 secondi prima della finestra. Si prova ogni traccia con i testi della scheda nella sua lingua e si tiene il risultato più sicuro; a parità vince la traccia non automatica.

I parametri (`DEFAULT_ALIGNMENT_OPTIONS`) si tarano sul set di valutazione di M2.

## Casi d'uso (`packages/core/src/application/generation.ts`)
| Caso d'uso | Cosa fa |
|---|---|
| `ListLessonsToGenerate` | Lezioni dello studente senza un feed per le fonti attuali: calcola l'impronta di ogni lezione con la stessa funzione del salvataggio e la confronta con i feed visibili. Restituisce anche i totali (lezioni, pronte, da generare) |
| `ReadLessonForGeneration` | Fonti di una lezione posseduta (versione più recente di ogni parte, sottotitoli accessibili, glossario della materia) con la loro impronta; segna le versioni `generating` |
| `ListOwnedLessons` | Tutte le lezioni importate, con il numero di presentazioni di slide già presenti: serve a `importa_slide` per abbinare lo zip |
| `ImportLessonSlides` (`slides.ts`) | Aggiunge a una lezione posseduta le sue presentazioni: una parte `slides` per presentazione (id stabile `slides-{n}`, posizione 10.000 + n, dopo le parti del portale), versione per impronta del testo, permesso per prova di possesso come per l'estensione. Stesso testo, nessun doppione; testo cambiato, nuova versione e lezione di nuovo da generare. `NOT_FOUND` se lo studente non ha importato la lezione |
| `SaveLessonFeed` | Ricarica le fonti con i permessi dello studente, rifiuta se l'impronta è cambiata (`SOURCES_CHANGED`), applica `checkLessonFeed` (`FeedValidationError` con tutti i problemi), allinea le schede tratte da parti video, salva feed, glossario e stato `ready` in una transazione. Il primo feed per le stesse fonti vince: un secondo salvataggio non sovrascrive |

La porta `GenerationRepository` è implementata da `DrizzleGenerationRepository` (`packages/adapters`): le letture passano dalla RLS dello studente (`withUserRls`), le scritture usano la connessione del server dopo i controlli del caso d'uso.

Stato delle versioni: `pending`/`failed` → `generating` alla lettura, `generating` → `ready` al salvataggio, sempre secondo le transizioni ammesse dal dominio (`canTransition`). "Le mie lezioni" mostra quindi "in generazione" e poi "pronte".

## API
Chiamata dal server MCP con `Authorization: Bearer sfg_…` (token "genera"). Nessun header CORS. Ogni chiamata, riuscita o no, entra nel registro `generation_events` e conta nel limite di **120 all'ora** (`429` con `Retry-After: 600`).

| Metodo e percorso | Corpo / risposta | Errori |
|---|---|---|
| `GET /api/generation/lessons?limit=20` | `lessonsToGenerateResponseSchema`: lezioni da generare (max 100) e totali | `401`, `429` |
| `GET /api/generation/lessons/{id}` | `lessonSourcesResponseSchema`: titoli, `sourcesHash`, parti con il contenuto (riassunti IT/EN, markdown o testo delle slide per pagina) e `hasSubtitles`, glossario della materia | `400` id non valido, `404` lezione non posseduta |
| `GET /api/generation/catalog` | `ownedLessonsResponseSchema`: tutte le lezioni importate con il numero di slide | `401`, `429` |
| `POST /api/generation/lessons/{id}/slides` | corpo `importSlidesRequestSchema` (max 1 MB: fino a 20 presentazioni, ognuna con numero, nome del file e testo per pagina); risposta `importSlidesResponseSchema` | `413`, `400` forma non valida (con `issues`), `404` lezione non posseduta |
| `POST /api/generation/lessons/{id}/feed` | corpo `saveLessonFeedRequestSchema` (max 512 KB); risposta `saveLessonFeedResponseSchema`, `201` se creato, `200` se esisteva già | `413`, `400` JSON non valido o lezione diversa dal percorso, `422 INVALID_FEED` con `issues` (forma o regole), `409 CONFLICT` fonti cambiate, `404` |

**I sottotitoli non vanno a Claude**: nell'MVP schede e quiz nascono solo da riassunti, testi e slide (ADR 0006, piano §1); i sottotitoli restano sul server e servono solo all'allineamento. Questo riduce anche il testo da leggere per ogni lezione.

Gli errori `INVALID_FEED` portano l'elenco completo dei problemi (`issues: [{ path, message }]`), così il server MCP li passa a Claude in una volta.

## Token "genera"
Pagina **Claude Desktop** della web app (`/claude-desktop`): *Crea token* mostra il token una sola volta, con il pulsante Copia; l'elenco dei token attivi evidenzia quelli che scadono entro una settimana e permette di revocarli. Implementazione: `GenerateTokenService` (`packages/adapters/src/import-tokens.ts`), stessa logica del token dell'estensione (`PersonalTokenService`: 256 bit casuali, solo SHA-256 nel database) con ambito `generate`, prefisso `sfg_` e durata di 90 giorni. Un token di import non vale per la generazione e viceversa, anche per elenco e revoca.

## Server MCP (`apps/mcp`)
Gira sul PC dello studente dentro Claude Desktop, come estensione `.mcpb`. Parla con EpicFeed **solo** attraverso l'API sopra (ESLint vieta di importare adapter, database o Supabase) e usa da `@study-feed/core` solo le regole pure del feed, per controllarlo prima di inviarlo.

| File | Ruolo |
|---|---|
| `src/prompt.ts` | Istruzioni di generazione versionate (`PROMPT_VERSION`, formato `AAAA-MM-GG.n`): gerarchia delle fonti, tipi di scheda, quiz, concetti, glossario. Ogni feed salvato porta la versione: se le istruzioni cambiano si sa quali lezioni rigenerare. Cambiare il testo significa aumentare la versione. |
| `src/api-client.ts` | `EpicFeedApi`: token solo nell'header `Authorization`, solo HTTPS (HTTP solo verso localhost), `redirect: 'error'`, timeout di 30 s, risposte validate con gli schemi di `@study-feed/contracts`. Errori come `ApiRequestError(status, code, message, issues)`. |
| `src/server.ts` | `createEpicFeedServer(api)`: strumenti e prompt (sotto). Ricorda in memoria solo le parti delle lezioni lette, per il controllo locale. |
| `src/exam-bank-tools.ts` | Strumenti della banca degli esercizi (`registerExamBankTools`): legge il materiale d'esame dallo zip sul PC e ricorda i concetti della materia per il controllo locale. |
| `src/exam-prompt.ts`, `src/exam-tools.ts` | Istruzioni versionate (`EXAM_PROMPT_VERSION`) e strumenti dei pacchetti d'esame (`registerExamTools`). Ricorda in memoria concetti e domande del feed letto, per il controllo locale. |
| `src/tool-results.ts` | Risultati comuni: testo, elenco dei problemi da correggere, errori dell'API spiegati a Claude. |
| `src/config.ts` | Legge `EPICFEED_TOKEN` e `EPICFEED_API_URL` (dalle impostazioni dell'estensione). Senza token valido il server parte lo stesso e ogni strumento risponde come crearne uno. |
| `src/main.ts` | Avvio su stdio; i log vanno solo su stderr (stdout è il canale MCP). |

Strumenti (nomi in italiano, perché Claude li mostra allo studente):

| Strumento | Cosa fa |
|---|---|
| `lezioni_da_generare { limite? }` | Lezioni senza feed, in ordine di studio, con i totali. |
| `leggi_lezione { lessonId }` | Fonti in testo leggibile (ogni parte con `sourcePartId`, riassunti it/en o testo di lettura, glossario della materia), `sourcesHash` e le istruzioni complete. Segna le versioni come "in generazione". |
| `salva_feed_lezione { lessonId, sourcesHash, feed }` | Controlla il feed in locale con `checkLessonFeed` (stesse regole dell'API, nessuna chiamata sprecata), poi lo invia con `PROMPT_VERSION`. I problemi, locali o dell'API, tornano a Claude come elenco da correggere. |
| `stato_generazione` | Totali: importate, pronte, da generare. |
| `importa_slide { percorso, materia?, aggiorna? }` | Slide dallo zip "Download all PDFs" o dalla cartella estratta (sezione sotto). |
| `lezioni_per_esame { limite? }` | Lezioni con il feed ma senza pacchetto d'esame, con i totali (sezione *Pacchetti d'esame*). |
| `leggi_lezione_esame { lessonId }` | Feed corrente della lezione in inglese, `feedId` e istruzioni del pacchetto. |
| `salva_domande_esame { lessonId, feedId, pack }` | Controlla il pacchetto con `checkExamPack` e lo invia con `EXAM_PROMPT_VERSION`. |
| `leggi_materiale_esame { percorso, materia? }` | Legge sul PC i PDF *Exam Prep* dello zip: testo e immagini delle pagine, materia con i concetti e istruzioni della banca (sezione *Banca degli esercizi*). |
| `salva_esercizi_esame { subjectId, bank }` | Controlla la banca con `checkExamBank` e la invia con `EXAM_BANK_PROMPT_VERSION`. |
| `risposte_da_correggere` | Invii in attesa di correzione (fino a 5 per volta): consegna, risposta con le righe numerate, test, approfondimento, soluzione modello e griglia, più le istruzioni (sezione *Correzione delle risposte*). |
| `salva_correzione { id, correction }` | Controlla la correzione con `checkCorrection` e la invia. |

Il prompt MCP `genera_lezioni` avvia la generazione di tutte le lezioni nuove; `genera_domande_esame` quella dei pacchetti d'esame; `correggi_risposte` la correzione delle risposte inviate dall'app. Le istruzioni del server (`SERVER_INSTRUCTIONS`) dicono a Claude l'ordine degli strumenti e di non chiedere conferma lezione per lezione. Un `409 CONFLICT` suggerisce di rileggere la lezione; un `401` di creare un nuovo token. Gli errori inattesi non mostrano dettagli.

### Slide dallo zip (`importa_slide`, ADR 0012)
Tutto avviene sul PC; a EpicFeed arriva solo il testo.

1. **Elenco dei PDF** (`src/slides/archive.ts`): legge l'indice dello zip con `yauzl` (o la cartella, anche nelle sottocartelle), ignora le voci `__MACOSX` e tutto ciò che non è `.pdf`. Ogni PDF si legge in memoria solo quando serve, con un tetto di 60 MB (controllato anche sui byte davvero letti, non solo sulla dimensione dichiarata dallo zip). Nulla viene scritto su disco.
2. **Abbinamento** (`src/slides/match.ts`): dal nome `{titolo lezione}-{n}.pdf` si ricavano titolo e numero; i titoli si confrontano senza maiuscole, accenti e punteggiatura (i nomi dei file perdono caratteri come `&`, `/`, `?`). Un file senza lezione o con un numero ripetuto resta fuori e viene elencato con il motivo.
   - **Titoli uguali nello stesso corso** (nel corso DSA due "Introduction" e due "Examples"): lo zip del portale elenca i PDF nell'ordine del corso, le presentazioni di una lezione sono file consecutivi ("blocco") e la numerazione prosegue da una lezione omonima all'altra (`Examples-1…3` nel capitolo 2, `Examples-4…6` nel capitolo 4). Per prima cosa, tra omonime di materie diverse si tengono quelle della materia dello zip, cioè quella della maggior parte dei file con una lezione certa (titolo unico e un solo blocco). Poi, se i blocchi sono tanti quante le lezioni candidate, si abbinano in ordine di corso: il catalogo `/api/generation/catalog` arriva già in quell'ordine. Altrimenti, per esempio con il catalogo incompleto, ogni blocco va alla candidata che sta nello stesso capitolo della lezione certa del file subito prima (e dopo di lei nel corso) o del file subito dopo (e prima di lei). Le presentazioni di queste lezioni si rinumerano da 1. Se non si può scegliere con certezza, il blocco resta fuori: meglio un PDF non abbinato che uno nella lezione sbagliata. Con la cartella estratta l'ordine dello zip è perso, quindi i titoli ripetuti restano fuori con l'invito a usare lo zip. `materia` resta come forzatura manuale.
   - Le lezioni fatte solo di slide (es. "Exam Prep" nel corso DSA) l'estensione non le importa, quindi i loro PDF restano fuori con "nessuna lezione importata con questo titolo".
3. **Testo** (`src/slides/pdf.ts`): pdf.js (build `legacy` per Node, font standard e decodificatori dal pacchetto) estrae il testo di ogni pagina; le pagine senza testo restano, perché possono contenere solo un diagramma.
   - **Dentro Claude Desktop**: il server gira in un *utility process* di Electron (`process.versions.electron` presente, `process.type === 'utility'`, di sola lettura). pdf.js decide l'ambiente una volta sola, al caricamento, e lo scambierebbe per una pagina web (errori `No "GlobalWorkerOptions.workerSrc" specified` o `document is not defined`). Durante l'import, `presentAsMainProcess` sostituisce `globalThis.process` con una vista (Proxy su un oggetto vuoto) che risponde `type: 'browser'` e inoltra tutto il resto al processo vero, con le funzioni legate a lui; subito dopo rimette il descrittore originale. Il worker di pdf.js si carica prima nello stesso processo (`globalThis.pdfjsWorker`), così non serve `workerSrc`. Un caricamento fallito non resta in memoria. `pdf-electron.test.ts` simula l'ambiente (proprietà di sola lettura) in un processo di test a sé (Vitest con `pool: 'forks'`). La correzione è stata provata anche in un vero utility process di Electron, con lo zip DSA.
   - **Percorsi su Windows**: pdf.js vuole le cartelle delle risorse (`cMapUrl`, `standardFontDataUrl`, `wasmUrl`, `iccUrl`) come stringhe che finiscono con `/`, e in Node le legge con `fs.readFile(cartella + nome)`. `toFactoryUrl` trasforma il percorso di Windows (`C:\…\cmaps`) in `C:/…/cmaps/`, che `fs` accetta; un URL `file:///` non funzionerebbe, perché arriva a `readFile` come semplice stringa.
4. **Invio**: una chiamata `POST …/slides` per lezione. Si saltano le lezioni che hanno già tante presentazioni quanti i PDF abbinati, salvo `aggiorna: true` (zip scaricato di nuovo). Una chiamata lavora al massimo 40 secondi e poi dice quante lezioni restano: Claude la richiama con lo stesso percorso e riprende. Le lezioni importate negli ultimi 10 minuti si saltano, anche con `aggiorna`. Una lezione fallita non conta come fatta: si riprova alla chiamata successiva, dopo le altre. Durante il lavoro il server manda a Claude Desktop l'avanzamento (`notifications/progress`). Un token non valido ferma tutto; gli altri errori riguardano una lezione sola e finiscono nel riepilogo.
5. **Indice locale** (`src/slides/store.ts`): per ogni lezione, dove sono i suoi PDF (zip e voce), in `%APPDATA%\EpicFeed\slides.json` su Windows (`~/Library/Application Support/EpicFeed` su macOS). Solo id e percorsi, scritto in modo atomico.

**Figure durante la generazione**: `leggi_lezione` cerca nell'indice i PDF delle presentazioni della lezione, sceglie le pagine con figure e le disegna in PNG larghi 1.280 pixel con `@napi-rs/canvas`, al massimo 8 per lezione, le più ricche prima e poi in ordine di lettura. Ogni immagine arriva a Claude come contenuto `image`, preceduta da "Figura: Slide n, pagina p". Pagina con figura: punteggio ≥ 6, dove il punteggio conta i tracciati vettoriali oltre il minimo comune a tutte le pagine (sfondi, barre del modello) più 6 per ogni immagine che non compare con le stesse dimensioni in più di metà delle pagine (loghi del modello). Soglia e tetto sono da tarare sulle slide reali del corso DSA. Se i PDF non si trovano più (zip spostato), `leggi_lezione` lo dice e la generazione continua con il solo testo.

### Pacchetto `.mcpb`
`pnpm --filter @study-feed/mcp build` compila e crea con esbuild `bundle/server/index.js`, un unico file con tutte le dipendenze JavaScript, più `manifest.json` (versione presa da `package.json`) e `icon.png`. Restano fuori dal file solo pdf.js e `@napi-rs/canvas` (worker, font, WebAssembly e libreria nativa), copiati in `bundle/server/node_modules` con il binario del sistema su cui si compila. `pnpm --filter @study-feed/mcp run pack` aggiunge i binari di `@napi-rs/canvas` per Windows x64 e macOS (scaricati da npm con la stessa versione), toglie quelli degli altri sistemi e produce `apps/mcp/epicfeed.mcpb` (circa 45 MB) con lo strumento ufficiale `@anthropic-ai/mcpb`. pdf.js si carica solo quando servono le slide: se la libreria nativa non partisse, il resto della generazione funziona lo stesso. Il manifest (versione 0.3) chiede due impostazioni: il token (campo `sensitive`, quindi salvato da Claude Desktop nel portachiavi del sistema) e l'indirizzo di EpicFeed (predefinito quello di produzione). Piattaforme: Windows e macOS; Node è quello incluso in Claude Desktop.

**Prova in Electron** (`scripts/smoke/`, workflow `mcp-windows.yml`): il pacchetto si prova come lo usa Claude Desktop. `run.mjs` estrae il `.mcpb` in una cartella con spazi nel nome (come `Claude Extensions` sotto il profilo utente), copia accanto a `server/index.js` la prova `server-smoke.mjs` (unita da `build.mjs`, usa gli stessi pdf.js e @napi-rs/canvas del pacchetto) e la avvia in un *utility process* di Electron (`electron-main.mjs`) con la stessa versione di Electron di Claude Desktop (45.3.3, Node 24). La prova importa le slide dello zip di prova con un'API finta, controlla il testo e disegna le figure come `leggi_lezione`. Il workflow crea il pacchetto su Linux, come quello consegnato, e lo prova su `windows-latest`; parte solo quando cambiano `apps/mcp`, `core`, `contracts` o il lockfile. In locale: `pnpm --filter @study-feed/mcp build`, `node apps/mcp/scripts/smoke/build.mjs`, poi `node apps/mcp/smoke-kit/run.mjs apps/mcp/bundle <cartella con node_modules/electron>` (su Linux si prova la cartella `bundle/`, perché il `.mcpb` contiene solo i binari di Windows e macOS). Ogni nuovo pacchetto si consegna solo dopo che questa prova passa su Windows.

Installazione (una volta): in EpicFeed, pagina **Claude**, *Crea token*; in Claude Desktop, Impostazioni › Estensioni, trascinare `epicfeed.mcpb`, incollare il token. Poi in una chat: "genera le lezioni nuove di EpicFeed". Per aggiornare il server basta installare il nuovo `.mcpb`.

Test: `apps/mcp/src/*.test.ts` con un `fetch` finto (client) e il trasporto in memoria dell'SDK (server e strumenti); le slide con PDF e zip veri in `apps/mcp/test/fixtures` (testo, diagramma, logo del modello) e con un toolkit in memoria per gli strumenti.

## Pacchetti d'esame (M4)
Decisioni: [ADR 0014](../decisions/0014-exam-preparation.md) (§6 e §8) e [ADR 0017](../decisions/0017-review-and-exam-m4.md) (scelta 3). Ogni lezione con un feed riceve un **pacchetto d'esame** separato dal feed, così schede e domande già studiate non cambiano:

- **10 domande a scelta multipla** in più (limiti accettati 8–12), 4 opzioni, spiegazione, concetto e difficoltà: con le 6–8 del feed fanno circa 90 domande per modulo, da cui il quiz di modulo ne pesca 50;
- **1–2 domande aperte** "stile esame": `code` (firma della funzione e 2–8 test `{ call, expected }` da eseguire nel browser), `explain` o `analyze` (con il codice da analizzare); suggerimenti progressivi `{ it, en }` (1–3), soluzione modello, griglia di 3–5 criteri con punti interi 1–5, 1–3 concetti, domanda di approfondimento per il colloquio.

Tutto in inglese tranne i suggerimenti. Tipi e regole in `packages/core/src/domain/exam.ts`, schemi in `packages/contracts/src/exam.ts`.

```
Claude Desktop ──▶ server MCP ──▶ API EpicFeed ──▶ Postgres
   │  lezioni_per_esame       GET  /api/generation/exam
   │  leggi_lezione_esame     GET  /api/generation/lessons/:id/exam   (feed corrente in inglese + feedId)
   │  (Claude scrive il pacchetto)
   └─ salva_domande_esame     POST /api/generation/lessons/:id/exam   checkExamPack → salva
```

- **Feed corrente**: il più recente tra quelli visibili allo studente (RLS). Il pacchetto si lega a quel feed (`lesson_exam_packs.lesson_feed_id`, uno per feed): se la lezione ha poi un feed nuovo, torna tra quelle da completare. Al salvataggio l'API rilegge il feed corrente: se il `feedId` letto da Claude non è più quello, risponde `409` (i concetti potrebbero essere cambiati).
- **Materiale per Claude**: solo la parte inglese del feed (concetti, schede con passi e codice, domande già presenti), meno testo e la lingua dell'esame. Le fonti originali non servono: il pacchetto non deve insegnare nulla che il feed non insegni.
- **Controlli** (`checkExamPack`, tutti i problemi con il percorso): quantità; id in kebab-case e unici tra domande chiuse e aperte; 4 opzioni non ripetute e risposta tra le opzioni; concetti esistenti nel feed; domanda non già presente nel feed né ripetuta (confronto senza maiuscole e punteggiatura); firma e test solo per `code`, codice per `analyze`; suggerimenti, criteri e punti nei limiti. Il server MCP li applica prima di inviare, l'API li ripete.
- **Come per i feed**: vale il primo pacchetto di un feed (un secondo salvataggio risponde `200` senza cambiare nulla); letture e salvataggi contano nel limite di 120 chiamate all'ora; corpo ≤ 256 KB; il pacchetto salvato (`storedExamPackSchema`) porta `lessonId`, `feedId`, `promptVersion` e `generatedAt`.

Uso: in Claude Desktop, "genera le domande d'esame di EpicFeed" (o il prompt `genera_domande_esame`). La sezione *Esame* dell'app che le usa arriva con la PR successiva di M4.

## Banca degli esercizi (M4)
Decisioni: [ADR 0014](../decisions/0014-exam-preparation.md) §2 e [ADR 0017](../decisions/0017-review-and-exam-m4.md) (scelta 8). Dal materiale d'esame del corso (i PDF *Exam Prep* dello zip delle slide, 14 esercizi nel corso DSA) Claude Desktop scrive la **banca degli esercizi** della materia:

- un esercizio **ufficiale** per ogni esercizio del materiale, con il testo fedele all'originale e gli esempi trascritti dalle immagini, e la pagina del PDF;
- **2 varianti** per ogni ufficiale (`variantOf`), stesso argomento con dati o richiesta diversi;
- per ognuno gli stessi campi delle domande aperte dei pacchetti (tipo, firma e test per il codice, suggerimenti `{ it, en }`, soluzione modello, griglia, concetti, domanda di approfondimento), più titolo, origine e pagina.

```
Claude Desktop ──▶ server MCP (legge lo zip sul PC) ──▶ API EpicFeed ──▶ Postgres
   │  leggi_materiale_esame   GET  /api/generation/exam/subjects        (materie e concetti)
   │  (Claude scrive la banca dal testo e dalle immagini delle pagine)
   └─ salva_esercizi_esame    POST /api/generation/exam/subjects/:id/bank   checkExamBank → salva
```

- **Il materiale resta sul PC**: a Claude arrivano testo e immagini delle pagine (al massimo 24), a EpicFeed solo la banca. `importa_slide` riconosce i PDF con "Exam Prep" nel nome, non li segnala più come non abbinati e indica `leggi_materiale_esame`.
- **Materia**: quella indicata, altrimenti quella delle lezioni a cui si abbinano le altre slide dello stesso zip, altrimenti l'unica materia con feed.
- **Banca privata** (`subject_exam_banks`, una per studente e materia): EpicFeed non riceve il materiale, quindi non c'è una prova di possesso da condividere con altri studenti; la RLS mostra a ciascuno solo la propria. Vale la prima banca salvata.
- **Controlli** (`checkExamBank`): 1–30 ufficiali e al massimo 90 esercizi; esattamente 2 varianti per ufficiale, riferite a un ufficiale esistente; id unici; pagina 1–200; regole delle domande aperte; concetti esistenti nei feed della materia. Corpo ≤ 1 MB.

Uso: in Claude Desktop, "crea la banca degli esercizi d'esame di EpicFeed dallo zip delle slide" indicando lo zip.

## Correzione delle risposte (M4)
Decisioni: [ADR 0014](../decisions/0014-exam-preparation.md) §4 e [ADR 0017](../decisions/0017-review-and-exam-m4.md#correzione-del-codice-come-si-mostra-pr-5). Dalla sezione Esame lo studente invia un esercizio o un colloquio simulato con *Fai correggere a Claude*; Claude Desktop lo corregge in inglese.

```
App ── POST /api/exam/submissions (sessione) ──▶ exam_submissions
Claude Desktop ──▶ server MCP ──▶ API EpicFeed
   │  risposte_da_correggere   GET  /api/generation/exam/submissions
   └─ salva_correzione         POST /api/generation/exam/submissions/:id/correction   checkCorrection → salva
App ── GET /api/exam/submissions ──▶ conserva la correzione ──▶ DELETE /api/exam/submissions/:id
```

- **Correzione**: per ogni domanda i punti di ogni criterio della griglia, un commento e fino a 8 **suggerimenti di revisione** (`fromLine`–`toLine` della risposta, testo sostitutivo, titolo all'imperativo e spiegazione); in più un riepilogo. L'app li mostra come un diff (`suggestionDiff` del core).
- **Controlli** (`checkCorrection`, nel server MCP e nell'API): una correzione per ogni domanda, punti interi entro quelli del criterio, righe esistenti, nessuna sovrapposizione, nessuna sostituzione identica. Una correzione già salvata non si sovrascrive (`409`).
- **Privacy** (eccezione limitata all'[ADR 0003](../decisions/0003-results-on-device.md)): sul server resta solo l'invio, finché l'app non scarica la correzione e lo cancella; al massimo 30 giorni. Al massimo 20 invii in attesa per studente. Punteggi e storico restano sul dispositivo.

Uso: in Claude Desktop, "correggi le mie risposte di EpicFeed" (o il prompt `correggi_risposte`).

## Prossimi passi
- Prova su 2–3 lezioni DSA reali, valutata da Damian; taratura di soglia e tetto delle figure.
- Verificare che i nomi dentro lo zip reale coincidano con quelli della pagina Course downloads (punto aperto dell'ADR 0012).
