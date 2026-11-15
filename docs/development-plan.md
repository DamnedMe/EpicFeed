# Piano di sviluppo

Stato: **proposta, in attesa delle scelte di Damian** (15/11/2026).
Nessun codice applicativo prima che le scelte aperte del §4 siano confermate. Quando lo saranno, diventano l'[ADR 0007](decisions/) e questo piano passa a "approvato".

Base: [architettura](architecture.md), ADR [0001](decisions/0001-architettura-ibrida.md)–[0006](decisions/0006-sottotitoli-come-fonte-secondaria.md), [design system](design-system.md), [ricognizione del portale](portal-recon.md).

## 1. Obiettivo dell'MVP

Damian importa un capitolo Epicode con un clic, e dal telefono lo studia come feed di schede, fa il quiz di fine capitolo e ripassa i concetti sbagliati nei giorni successivi.

Un solo utente reale (Damian). Il modello multi-utente (catalogo deduplicato, prova di possesso, RLS) è costruito da subito, perché rifarlo dopo costerebbe molto, ma l'app non si apre ad altri studenti finché non leggiamo i termini d'uso studenti ([portal-recon.md](portal-recon.md) §1).

### Dentro l'MVP
- Import di una lezione dall'estensione (riassunti delle parti video, riassunto di capitolo, sottotitoli per i tempi, metadati del corso).
- Catalogo deduplicato per `contentHash`, permesso per lezione con prova di possesso, versioni datate.
- Generazione di schede, quiz e concetti **dai soli riassunti**, con il glossario della materia.
- Allineamento delle schede al minuto del video ("Guarda sul portale"); se incerto, apre la parte video dall'inizio.
- Feed verticale (PWA installabile), temi chiaro/scuro/auto, 5 accenti.
- Quiz di fine capitolo, ripasso FSRS, risultati in IndexedDB, export/import del backup.
- Login, sicurezza di base (RLS, validazione, CSP), CI completa, documentazione.

### Dopo l'MVP (nell'ordine proposto)
1. **Segnala errore** e correzioni persistenti (ADR 0006 §3).
2. **Server MCP** per l'assistente di studio.
3. **Libri** (ADR 0005), che usa il server MCP.
4. Dettagli dai sottotitoli corretti da Claude (ADR 0006 §2): nell'MVP le schede usano solo i riassunti, che è già la scelta più sicura.
5. Sincronizzazione cifrata tra dispositivi, apertura ad altri studenti.

## 2. Milestone

Ogni milestone finisce con una PR (o poche) che include codice, test e documentazione tecnica e funzionale aggiornata. Le durate sono indicative, misurate in sessioni di lavoro, non in giorni di calendario.

| # | Milestone | Cosa si vede alla fine | Dimensione |
|---|---|---|---|
| M0 | **Fondamenta** | Monorepo, CI verde, token del design system, scheletro di `core` con i primi test, progetto Supabase EU con migrazioni | S |
| M1 | **Import e catalogo** | L'estensione importa la lezione aperta; nell'app compare in "Le mie lezioni"; un secondo import uguale non crea duplicati | M |
| M2 | **Generazione** | Per ogni versione importata vengono create schede, quiz, concetti e glossario, con l'intervallo di video di ogni scheda | M |
| M3 | **Feed** | Feed verticale sul telefono, swipe fluido, "Guarda sul portale" al minuto giusto, temi e accenti | M |
| M4 | **Quiz e ripasso** | Quiz di fine capitolo, ripasso giornaliero FSRS, backup esportabile. **Fine MVP** | M |
| M5 | Segnala errore | Correzioni salvate nell'area privata e riapplicate alle nuove versioni | S |
| M6 | Server MCP | Strumenti per Claude Desktop: cerca lezione, concetti deboli, quiz al volo, segnala errore | M |
| M7 | Libri | Libreria, import PDF/EPUB via MCP, modalità Studiare/Solo leggere | L |
| M8 | Rifinitura | Budget Lighthouse, audit di sicurezza, termini d'uso, prova con un altro studente | M |

### Dettaglio M0–M4

**M0 Fondamenta**
- Monorepo pnpm + Turborepo, TypeScript strict, ESLint + Prettier, Vitest.
- GitHub Actions: lint, typecheck, test, build, `pnpm audit`; protezione del branch `main` (merge solo con CI verde).
- `packages/core`: entità `Source`, `Lesson`, `LessonPart`, `ContentVersion`, `Entitlement` e la normalizzazione + hash del contenuto, con test.
- `packages/ui`: token CSS dei colori, temi e accenti dal [design system](design-system.md); font self-hosted.
- Supabase (regione UE): schema iniziale con Drizzle, RLS attiva su ogni tabella dal primo giorno.

**M1 Import e catalogo**
- Estensione: si attiva solo su `learn.epicode.edu.mt`, legge ciò che la pagina della lezione ha già caricato, chiede a Directus solo i campi necessari, mostra un'anteprima e invia con un clic. Mai scritture sulle collezioni di progresso.
- Accesso dell'estensione: l'utente fa login nella web app, che passa all'estensione un token di sessione a scadenza breve (niente password nell'estensione).
- API `POST /api/import`: validazione zod, calcolo dell'hash lato server, deduplica, `Entitlement`, rate limit.
- Caso d'uso `ImportLesson` e adapter `PossessionProofVerifier`, con test sui casi limite (stesso contenuto, contenuto cambiato, contenuto altrui senza possesso).

**M2 Generazione**
- Coda di job idempotente per `contentHash` (vedi scelta B).
- `ClaudeContentGenerator`: output strutturato validato con schema (schede, quiz, concetti), prompt con la gerarchia delle fonti riassunti > glossario > sottotitoli.
- `BuildGlossary` per materia e `AlignClipsToSubtitles` (allineamento per parole chiave, soglia di confidenza).
- Set di valutazione: 2–3 capitoli reali già importati, con controllo manuale di Damian su schede e quiz prima di considerare chiusa la milestone.

**M3 Feed**
- Feed con scroll-snap + Motion, virtualizzazione, precarico delle 2 schede successive.
- Azioni: Salva, Chiedi (disattivata fino a M6, poi collegata), Quiz, Fonte.
- PWA installabile, funziona offline per le schede già scaricate.
- Test Playwright del flusso import → feed su viewport mobile.

**M4 Quiz e ripasso**
- `AnswerQuiz`, `ScheduleReview` con `ts-fsrs`; `IndexedDbProgressStore`.
- Schermate Quiz e Ripasso, sezione Io (tema, accento, export/import backup).
- Budget Lighthouse in CI (LCP < 2,5 s mobile).

## 3. Struttura della repo

```
study-feed/
├─ apps/
│  ├─ web/               Next.js: PWA (feed, quiz, ripasso, libri) + route API
│  ├─ extension/         Estensione Chrome MV3 (import dal portale)
│  └─ mcp/               Server MCP locale per Claude Desktop/Code (da M6)
├─ packages/
│  ├─ core/
│  │  ├─ domain/         Entità e regole pure, nessun I/O
│  │  └─ application/    Casi d'uso e porte (interfacce)
│  ├─ adapters/          Supabase, Claude API, IndexedDB, crypto, coda
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

### Proposte di dettaglio (scelgo io se non ci sono obiezioni)

| Tema | Proposta | Perché |
|---|---|---|
| Versioni | Ultime stabili al momento dello scaffolding (Next.js 16, Tailwind 4, zod 4), fissate nel lockfile | Evitare migrazioni a breve |
| Build monorepo | Turborepo | Cache dei task, CI più veloce |
| Componenti UI | Primitive Radix + componenti nostri | Accessibilità pronta, aspetto tutto nostro (il design è già definito) |
| IndexedDB | Dexie | Query e migrazioni dello schema locale, molto usato |
| PWA / service worker | Serwist | Successore mantenuto di next-pwa |
| Modello Claude | `claude-opus-5-5` per schede e quiz | Qualità dei contenuti di studio, che è il punto dell'app. Rivalutabile dopo M2 con il set di valutazione |
| Regione dati | Supabase UE (Francoforte) | GDPR e latenza dall'Italia |
| Font | Self-hosted con `next/font` | Nessuna richiesta a Google Fonts, CSP più stretta |

### Scelte aperte (da decidere con Damian)

**A. Chi esegue la generazione delle lezioni Epicode (e chi la paga)**

| Opzione | Come funziona | Costo | Pro / contro |
|---|---|---|---|
| **A1. Claude API sul server** (consigliata) | Dopo l'import parte un job che chiama la Claude API con una chiave dell'app | Pochi centesimi per capitolo (stima: 20–30 mila token in ingresso e 10 mila in uscita a capitolo, circa 0,20–0,30 $ con Opus 5.5; metà con la Batch API se si accetta un'attesa). Limite di spesa mensile impostato sulla console | Automatico, funziona anche dal telefono, generato una volta per versione e quindi condiviso. Serve una chiave API a pagamento |
| A2. Via MCP da Claude Desktop | Come per i libri: Damian chiede a Claude Desktop di trasformare le lezioni importate | Incluso nel piano Claude di Damian | Zero costi API, ma ogni capitolo richiede un'azione manuale sul PC e non scala ad altri utenti |
| A3. A2 ora, A1 dopo | MVP con MCP, poi passaggio al server | Zero all'inizio | Il server MCP (M6) va anticipato prima del feed; l'adapter `ContentGenerator` rende il passaggio indolore, ma si fa due volte la parte di orchestrazione |

**B. Dove girano i job di generazione**

| Opzione | Pro | Contro |
|---|---|---|
| **B1. Supabase Queues (pgmq) + worker in una route Next.js** (consigliata) | Tutto nel database che abbiamo già, transazionale con l'import, nessun fornitore in più | Il worker va richiamato (pg_cron ogni minuto o subito dopo l'import); job lunghi da spezzare per capitolo |
| B2. Inngest | Retry, step e osservabilità pronti, integrazione Next.js semplice | Un servizio esterno in più (piano gratuito sufficiente per ora) |
| B3. Supabase Edge Functions | Vicine al database | Runtime Deno: il nostro `core` TypeScript va adattato, più attrito |

**C. Hosting della web app**

| Opzione | Pro | Contro |
|---|---|---|
| **C1. Vercel** (consigliata per l'MVP) | Il più semplice con Next.js, anteprima per ogni PR | Il piano Hobby gratuito è solo per uso non commerciale: va bene per un progetto personale, da rivedere se diventa un servizio |
| C2. Cloudflare Workers (OpenNext) | Generoso nel gratuito, rete veloce | Alcune funzioni di Next.js richiedono adattamenti |
| C3. Netlify | Simile a Vercel | Supporto Next.js un passo indietro |

**D. Login**

| Opzione | Pro | Contro |
|---|---|---|
| **D1. Email con codice monouso (OTP)** (consigliata) | Niente password da gestire, funziona bene anche nella PWA installata | Serve un invio email affidabile (quello di Supabase basta per pochi utenti) |
| D2. Accedi con Google | Un clic | Configurazione OAuth, dipendenza da un account Google |
| D3. Passkey | Il più sicuro e veloce dopo il primo accesso | Supporto Supabase ancora da verificare, recupero account più delicato |

Le opzioni si possono combinare (es. D1 subito, D3 in M8).

**E. Framework dell'estensione**

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
- Le scelte A–E (o un "ok alle consigliate").
- Un account Supabase e uno Vercel (o l'alternativa scelta), e una chiave Claude API se si sceglie A1. Le chiavi vanno nelle variabili d'ambiente dei servizi, mai in chat o nella repo.
- Prima di M1: i termini d'uso studenti, se reperibili (onboarding o contratto di iscrizione).
