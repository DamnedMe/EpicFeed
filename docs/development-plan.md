# Piano di sviluppo

Stato: **approvato da Damian** (15/11/2026). Le scelte del §4 sono registrate nell'[ADR 0007](decisions/0007-generazione-via-mcp-e-login.md).

Base: [architettura](architecture.md), ADR [0001](decisions/0001-architettura-ibrida.md)–[0006](decisions/0006-sottotitoli-come-fonte-secondaria.md), [design system](design-system.md), [ricognizione del portale](portal-recon.md).

## 1. Obiettivo dell'MVP

Damian importa un capitolo Epicode con un clic, e dal telefono lo studia come feed di schede, fa il quiz di fine capitolo e ripassa i concetti sbagliati nei giorni successivi.

Un solo utente reale (Damian). Il modello multi-utente (catalogo deduplicato, prova di possesso, RLS) è costruito da subito, perché rifarlo dopo costerebbe molto, ma l'app non si apre ad altri studenti finché non leggiamo i termini d'uso studenti ([portal-recon.md](portal-recon.md) §1).

### Dentro l'MVP
- Import di una lezione dall'estensione (riassunti delle parti video, riassunto di capitolo, sottotitoli per i tempi, metadati del corso).
- Catalogo deduplicato per `contentHash`, permesso per lezione con prova di possesso, versioni datate.
- Generazione di schede, quiz e concetti **dai soli riassunti**, con il glossario della materia, fatta da Claude Desktop tramite il server MCP (ADR 0007).
- **Slide delle lezioni** dallo zip ufficiale del portale, lette sul PC dal server MCP, diagrammi compresi ([ADR 0012](decisions/0012-slide-dallo-zip-ufficiale.md)).
- **Studio in italiano e in inglese**, perché l'esame è in inglese: ogni scheda, quiz e concetto in tutte e due le lingue, con un pulsante IT/EN ([ADR 0011](decisions/0011-studio-bilingue-it-en.md)).
- Allineamento delle schede al minuto del video ("Guarda sul portale"); se incerto, apre la parte video dall'inizio.
- Feed verticale (PWA installabile), temi chiaro/scuro/auto, 5 accenti.
- Quiz di fine capitolo, ripasso FSRS, risultati in IndexedDB, export/import del backup.
- Login, sicurezza di base (RLS, validazione, CSP), CI completa, documentazione.

### Dopo l'MVP (nell'ordine proposto)
1. **Segnala errore** e correzioni persistenti (ADR 0006 §3).
2. **Strumenti di studio nel server MCP** (cerca lezione, concetti deboli, quiz al volo). Gli strumenti di generazione invece entrano già nell'MVP.
3. **Libri** (ADR 0005), che usa il server MCP.
4. Dettagli dai sottotitoli corretti da Claude (ADR 0006 §2): nell'MVP le schede usano solo i riassunti, che è già la scelta più sicura.
5. Sincronizzazione cifrata tra dispositivi, apertura ad altri studenti.

## 2. Milestone

Ogni milestone finisce con una PR (o poche) che include codice, test e documentazione tecnica e funzionale aggiornata. Le durate sono indicative, misurate in sessioni di lavoro, non in giorni di calendario.

| # | Milestone | Cosa si vede alla fine | Dimensione |
|---|---|---|---|
| M0 | **Fondamenta** | Monorepo, CI verde, token del design system, scheletro di `core` con i primi test, progetto Supabase EU con migrazioni | S |
| M1 | **Import e catalogo** | L'estensione importa la lezione aperta; nell'app compare in "Le mie lezioni"; un secondo import uguale non crea duplicati | M |
| M2 | **Generazione via MCP** | Da Claude Desktop: "genera le lezioni nuove" crea schede, quiz, concetti e glossario per le versioni importate, con l'intervallo di video di ogni scheda | M |
| M3 | **Feed** | Feed verticale sul telefono, swipe fluido, "Guarda sul portale" al minuto giusto, temi e accenti | M |
| M4 | **Quiz, ripasso ed esame** | Quiz di fine capitolo, ripasso giornaliero FSRS, backup esportabile; sezione Esame con esercizi aperti in inglese, timer, simulazione scritta del colloquio di 20 minuti, quiz di modulo da 50 domande, correzione di Claude e codice eseguibile ([ADR 0014](decisions/0014-preparazione-esame.md)). **Fine MVP** | L |
| M5 | Segnala errore | Correzioni salvate nell'area privata e riapplicate alle nuove versioni | S |
| M6 | Assistente di studio MCP | Strumenti di studio per Claude Desktop: cerca lezione, concetti deboli, quiz al volo, segnala errore | M |
| M7 | Libri | Libreria, import PDF/EPUB via MCP, modalità Studiare/Solo leggere | L |
| M8 | Rifinitura | Accedi con Google, budget Lighthouse, audit di sicurezza, termini d'uso, prova con un altro studente | M |

### Dettaglio M0–M4

**M0 Fondamenta**: realizzata il 15/11/2026, con il progetto Supabase EpicFeed creato; le migrazioni si applicano con il workflow *Migrazioni database* ([database.md](technical/database.md#collegare-supabase)) e la protezione del branch (da attivare nelle impostazioni del repository, vedi [setup.md](technical/setup.md#protezione-del-branch-main)).
- Monorepo pnpm + Turborepo, TypeScript strict, ESLint + Prettier, Vitest.
- GitHub Actions: lint, typecheck, test, build, `pnpm audit`; protezione del branch `main` (merge solo con CI verde).
- `packages/core`: entità `Source`, `Lesson`, `LessonPart`, `ContentVersion`, `Entitlement` e la normalizzazione + hash del contenuto, con test.
- `packages/ui`: token CSS dei colori, temi e accenti dal [design system](design-system.md); font self-hosted.
- Supabase (regione UE): schema iniziale con Drizzle, RLS attiva su ogni tabella dal primo giorno.

**M1 Import e catalogo**: realizzata il 15/11/2026 ([import.md](technical/import.md), [web.md](technical/web.md), [ADR 0009](decisions/0009-import-lezione-intera-e-sottotitoli.md)). Su scelta di Damian l'estensione importa la lezione intera con un clic, compresi i sottotitoli di tutte le parti video, salvati come tracce separate dalle versioni. App online su Vercel dal 15/11/2026 ([web.md](technical/web.md#messa-online-vercel)); resta la prima prova di import sul portale reale. Il 21/11/2026, su richiesta di Damian, si aggiungono l'import di un capitolo o del corso intero a ritmo prudente ([ADR 0010](decisions/0010-import-capitolo-e-corso.md)); primo import reale riuscito lo stesso giorno (corso intero, 31 lezioni in circa 20 minuti). Le slide non passano dall'estensione: arrivano in M2 dallo zip ufficiale ([ADR 0012](decisions/0012-slide-dallo-zip-ufficiale.md)).
- Estensione: si attiva solo su `learn.epicode.edu.mt`, legge ciò che la pagina della lezione ha già caricato, chiede a Directus solo i campi necessari, mostra un'anteprima e invia con un clic. Mai scritture sulle collezioni di progresso.
- Login nella web app (ADR 0007): primo accesso con codice via email, poi l'utente imposta una password; da lì entra con email e password.
- Accesso dell'estensione: l'utente fa login nella web app, che passa all'estensione un token di sessione a scadenza breve (niente password nell'estensione).
- API `POST /api/import`: validazione zod, calcolo dell'hash lato server, deduplica, `Entitlement`, rate limit.
- Caso d'uso `ImportLesson` e adapter `PossessionProofVerifier`, con test sui casi limite (stesso contenuto, contenuto cambiato, contenuto altrui senza possesso).

**M2 Generazione via MCP**: avviata il 21/11/2026; scelte di dettaglio approvate da Damian nell'[ADR 0013](decisions/0013-generazione-m2-dettagli.md) (pacchetto `.mcpb`, feed per lezione, quattro tipi di scheda, pdf.js, token "genera" di 90 giorni). Prima PR: contratti bilingui, regole del feed e allineamento al minuto ([generation.md](technical/generation.md)). Seconda PR: tabelle `lesson_feeds` e `glossary_terms`, casi d'uso, API di generazione e pagina Claude Desktop per il token "genera". Terza PR: server MCP `apps/mcp` con quattro strumenti e il prompt `genera_lezioni`, pacchetto `.mcpb` per Claude Desktop ([generation.md](technical/generation.md#server-mcp-appsmcp)). Quarta PR: strumento `importa_slide` (testo delle slide dallo zip ufficiale, PDF sul PC) e figure delle slide passate a Claude come immagini durante la generazione ([generation.md](technical/generation.md#slide-dallo-zip-importa_slide-adr-0012)).
- Ogni `ContentVersion` ha uno stato di generazione (`da_generare`, `in_corso`, `pronta`, `errore`). Nessuna coda di job sul server nell'MVP: il lavoro lo fa Claude Desktop.
- **Contratti bilingui per primi** ([ADR 0011](decisions/0011-studio-bilingue-it-en.md)): ogni testo di schede, quiz e concetti è una coppia `{ it, en }` generata nella stessa passata; la validazione richiede entrambe le lingue e la stessa risposta corretta.
- Server MCP locale (`apps/mcp`, stdio) con gli strumenti `lezioni_da_generare`, `leggi_lezione` (riassunti e sottotitoli in entrambe le lingue, slide, glossario della materia), `salva_feed_lezione`, `stato_generazione` e `importa_slide`. Le istruzioni di generazione stanno in un prompt MCP versionato nella repo, con la gerarchia delle fonti riassunti e slide > glossario > sottotitoli.
- **Slide** ([ADR 0012](decisions/0012-slide-dallo-zip-ufficiale.md)): `importa_slide` legge sul PC lo zip scaricato con *Download all PDFs*, abbina ogni PDF alla lezione per nome e invia solo il testo come parte `slides` (migrazione non distruttiva); `leggi_lezione` aggiunge le immagini delle pagine con figure, prodotte al momento. I PDF restano sul PC.
- Glossario della materia bilingue: termine inglese del corso e traduzione italiana.
- `salva_feed_lezione` valida il risultato con gli schemi zod di `packages/contracts` prima di inviarlo all'API; l'API lo rivalida e lo accetta una volta sola per `contentHash` (il primo che genera una versione la rende pronta per tutti quelli che la possiedono).
- L'allineamento al minuto (`AlignClipsToSubtitles`) è codice deterministico nel `core` (parole chiave e soglia di confidenza), non una chiamata a Claude: più veloce, ripetibile e testabile.
- Accesso del server MCP all'API con un **token personale** creato dalla sezione Io: limitato agli strumenti di generazione, revocabile, conservato solo sul PC.
- Set di valutazione: 2–3 capitoli reali già importati, con controllo manuale di Damian su schede e quiz prima di considerare chiusa la milestone.

**M3 Feed**: avviata il 23/11/2026; scelte di Damian nell'[ADR 0015](decisions/0015-feed-di-studio-m3.md) (schede come storie a battute, parola da indovinare, domande nel feed, punti e sessioni da 5 minuti, azioni con i gesti, materia intera offline, minuti anche per le schede dalle slide). Prima PR (#26, unita): allineamento versione 2, API del feed della materia e riallineamento automatico dei feed salvati ([web.md](technical/web.md#feed-di-studio-m3)). Seconda PR: schermata del feed a battute con gesti, domande, punti e sessioni, sezione *Io* e barra in basso ([feed.md](functional/feed.md)). Terza PR: PWA offline e test Playwright sui telefoni.
- Feed con scroll-snap, battute a tocco, virtualizzazione, precarico delle 2 schede successive.
- Azioni con i gesti: doppio tocco Salva, tieni premuto per Ascolta, lingua, Fonte e *Guarda sul portale*, Chiedi (disattivata fino a M6, poi collegata).
- Lingua di studio in *Io* e pulsante IT/EN su ogni scheda, con cambio locale senza nuove richieste ([ADR 0011](decisions/0011-studio-bilingue-it-en.md)).
- PWA installabile, funziona offline per le schede già scaricate.
- Test Playwright del flusso import → feed su viewport mobile.

**M4 Quiz e ripasso**
- `AnswerQuiz`, `ScheduleReview` con `ts-fsrs`; `IndexedDbProgressStore`.
- Schermate Quiz e Ripasso, sezione Io (tema, accento, lingua dei quiz, export/import backup).
- Quiz nella lingua scelta (proposta: inglese, per l'esame); il ripasso è unico per concetto, qualunque sia la lingua; i risultati ricordano la lingua usata ([ADR 0011](decisions/0011-studio-bilingue-it-en.md)).
- **Preparazione all'esame** ([ADR 0014](decisions/0014-preparazione-esame.md)), tutto in inglese:
  - materiale d'esame del corso dallo zip (es. *Exam Prep*) e strumento MCP `genera_esercizi_esame`: esercizi ufficiali + varianti, con soluzione modello, griglia, concetti e test;
  - sezione Esame con esercitazione e timer facoltativo, suggerimenti attivabili con lingua a scelta (IT/EN);
  - autovalutazione con griglia e correzione di Claude via MCP (`risposte_da_correggere`, `salva_correzione`), punteggio collegato al ripasso FSRS;
  - test del codice Python nel browser con Pyodide in un Web Worker;
  - simulazione scritta del colloquio finale (20 minuti, domande una alla volta, correzione a fine sessione) e quiz di modulo da 50 domande come l'autovalutazione ufficiale;
  - 1–2 domande aperte stile esame nel feed di ogni lezione (campo facoltativo `examQuestions`, dopo la chiusura di M2).
- Budget Lighthouse in CI (LCP < 2,5 s mobile).

## 3. Struttura della repo

```
study-feed/
├─ apps/
│  ├─ web/               Next.js: PWA (feed, quiz, ripasso, libri) + route API
│  ├─ extension/         Estensione Chrome MV3 (import dal portale)
│  └─ mcp/               Server MCP locale per Claude Desktop/Code (generazione da M2, studio da M6)
├─ packages/
│  ├─ core/
│  │  ├─ domain/         Entità e regole pure, nessun I/O
│  │  └─ application/    Casi d'uso e porte (interfacce)
│  ├─ adapters/          Supabase, IndexedDB, crypto, client API per l'MCP
│  ├─ db/                Schema Drizzle, migrazioni, policy RLS
│  ├─ contracts/         Schemi zod condivisi (payload di import, API, MCP)
│  ├─ ui/                Componenti React e token del design system
│  └─ config/            tsconfig, ESLint, Prettier condivisi
├─ docs/                 Documentazione tecnica e funzionale, ADR
├─ .github/workflows/    CI
├─ turbo.json  pnpm-workspace.yaml  package.json
```

Regola delle dipendenze controllata in CI (ESLint `import/no-restricted-paths` o dependency-cruiser): `core` non importa nulla da `adapters`, `db`, `apps` né da framework.

Rispetto all'[architettura](architecture.md) §2 si aggiungono `packages/db` (schema e migrazioni separati dagli adapter, così RLS e migrazioni si rivedono in un posto solo), `packages/contracts` (gli stessi schemi zod li usano estensione, API e MCP) e `packages/config`.

## 4. Stack

### Già deciso (ADR 0001–0006)
TypeScript strict in monorepo pnpm · Next.js (App Router) + Tailwind + Motion, PWA · Supabase (Postgres + Auth) con Drizzle · estensione Chrome MV3 · server MCP con SDK ufficiale · Claude API per la generazione · `ts-fsrs` · IndexedDB per i risultati · zod ai confini · Vitest + Playwright · GitHub Actions.

### Dettagli di stack (approvati con il piano)

| Tema | Proposta | Perché |
|---|---|---|
| Versioni | Ultime stabili al momento dello scaffolding (Next.js 16, Tailwind 4, zod 4), fissate nel lockfile | Evitare migrazioni a breve |
| Build monorepo | Turborepo | Cache dei task, CI più veloce |
| Componenti UI | Primitive Radix + componenti nostri | Accessibilità pronta, aspetto tutto nostro (il design è già definito) |
| IndexedDB | Dexie | Query e migrazioni dello schema locale, molto usato |
| PWA / service worker | Serwist | Successore mantenuto di next-pwa |
| Regione dati | Supabase UE (Francoforte) | GDPR e latenza dall'Italia |
| Font | Self-hosted con `next/font` | Nessuna richiesta a Google Fonts, CSP più stretta |

### Scelte prese con Damian

**A. Chi esegue la generazione delle lezioni Epicode (e chi la paga)**: DECISO, A2 via MCP da Claude Desktop ([ADR 0007](decisions/0007-generazione-via-mcp-e-login.md))

| Opzione | Come funziona | Costo | Pro / contro |
|---|---|---|---|
| **A1. Claude API sul server** (consigliata) | Dopo l'import parte un job che chiama la Claude API con una chiave dell'app | Pochi centesimi per capitolo (stima: 20–30 mila token in ingresso e 10 mila in uscita a capitolo, circa 0,20–0,30 $ con Opus 5.5; metà con la Batch API se si accetta un'attesa). Limite di spesa mensile impostato sulla console | Automatico, funziona anche dal telefono, generato una volta per versione e quindi condiviso. Serve una chiave API a pagamento |
| A2. Via MCP da Claude Desktop | Come per i libri: Damian chiede a Claude Desktop di trasformare le lezioni importate | Incluso nel piano Claude di Damian | Zero costi API, ma ogni capitolo richiede un'azione manuale sul PC e non scala ad altri utenti |
| A3. A2 ora, A1 dopo | MVP con MCP, poi passaggio al server | Zero all'inizio | Il server MCP (M6) va anticipato prima del feed; l'adapter `ContentGenerator` rende il passaggio indolore, ma si fa due volte la parte di orchestrazione |

**B. Dove girano i job di generazione**: non serve nell'MVP, perché con A2 genera Claude Desktop. Si riapre solo se in futuro si passa alla Claude API sul server

| Opzione | Pro | Contro |
|---|---|---|
| **B1. Supabase Queues (pgmq) + worker in una route Next.js** (consigliata) | Tutto nel database che abbiamo già, transazionale con l'import, nessun fornitore in più | Il worker va richiamato (pg_cron ogni minuto o subito dopo l'import); job lunghi da spezzare per capitolo |
| B2. Inngest | Retry, step e osservabilità pronti, integrazione Next.js semplice | Un servizio esterno in più (piano gratuito sufficiente per ora) |
| B3. Supabase Edge Functions | Vicine al database | Runtime Deno: il nostro `core` TypeScript va adattato, più attrito |

**C. Hosting della web app**: DECISO, C1 Vercel

| Opzione | Pro | Contro |
|---|---|---|
| **C1. Vercel** (consigliata per l'MVP) | Il più semplice con Next.js, anteprima per ogni PR | Il piano Hobby gratuito è solo per uso non commerciale: va bene per un progetto personale, da rivedere se diventa un servizio |
| C2. Cloudflare Workers (OpenNext) | Generoso nel gratuito, rete veloce | Alcune funzioni di Next.js richiedono adattamenti |
| C3. Netlify | Simile a Vercel | Supporto Next.js un passo indietro |

**D. Login**: DECISO, codice via email al primo accesso, poi password, poi Accedi con Google ([ADR 0007](decisions/0007-generazione-via-mcp-e-login.md))

| Opzione | Pro | Contro |
|---|---|---|
| **D1. Email con codice monouso (OTP)** (consigliata) | Niente password da gestire, funziona bene anche nella PWA installata | Serve un invio email affidabile (quello di Supabase basta per pochi utenti) |
| D2. Accedi con Google | Un clic | Configurazione OAuth, dipendenza da un account Google |
| D3. Passkey | Il più sicuro e veloce dopo il primo accesso | Supporto Supabase ancora da verificare, recupero account più delicato |

Le opzioni si possono combinare (es. D1 subito, D3 in M8).

**E. Framework dell'estensione**: DECISO, E1 WXT

| Opzione | Pro | Contro |
|---|---|---|
| **E1. WXT** (consigliata) | Basato su Vite, MV3, TypeScript, ricarica a caldo, attivamente mantenuto | Un livello di astrazione in più |
| E2. Plasmo | Comodo con React | Manutenzione rallentata negli ultimi tempi |
| E3. Vite + manifest scritto a mano | Massimo controllo, zero dipendenze | Più configurazione da scrivere e mantenere |

## 5. Definizione di "fatto" per ogni PR
- CI verde (lint, typecheck, test, build, audit).
- TSDoc su ogni metodo pubblico; commenti interni solo sul perché.
- Test dei casi d'uso toccati; per ogni nuova tabella, policy RLS e un test che verifica che un altro utente non la legga.
- Documentazione tecnica e funzionale aggiornata; nuovo ADR se la PR prende una decisione.
- Nessun segreto nel codice o nel bundle client.

## 6. Cosa serve da Damian prima di M0
- Un account Supabase e uno Vercel (o l'alternativa scelta). Nessuna chiave Claude API: la generazione usa il piano Claude di Damian.
- Per Accedi con Google (M8): un progetto Google Cloud con schermata di consenso OAuth e un client OAuth web; lo configuriamo insieme quando ci arriviamo. Le chiavi vanno nelle variabili d'ambiente dei servizi, mai in chat o nella repo.
- Prima di M1: i termini d'uso studenti, se reperibili (onboarding o contratto di iscrizione).
