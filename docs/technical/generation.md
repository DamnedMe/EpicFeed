# Generazione di schede e quiz (M2)

Stato: in sviluppo. Decisioni: [ADR 0007](../decisions/0007-generazione-via-mcp-e-login.md), [ADR 0011](../decisions/0011-studio-bilingue-it-en.md), [ADR 0012](../decisions/0012-slide-dallo-zip-ufficiale.md), [ADR 0013](../decisions/0013-generazione-m2-dettagli.md).

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
`alignCard(scheda, tracce)` in `packages/core/src/domain/alignment.ts`, eseguito dall'API al salvataggio per le schede tratte da una parte video.

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
| `SaveLessonFeed` | Ricarica le fonti con i permessi dello studente, rifiuta se l'impronta è cambiata (`SOURCES_CHANGED`), applica `checkLessonFeed` (`FeedValidationError` con tutti i problemi), allinea le schede tratte da parti video, salva feed, glossario e stato `ready` in una transazione. Il primo feed per le stesse fonti vince: un secondo salvataggio non sovrascrive |

La porta `GenerationRepository` è implementata da `DrizzleGenerationRepository` (`packages/adapters`): le letture passano dalla RLS dello studente (`withUserRls`), le scritture usano la connessione del server dopo i controlli del caso d'uso.

Stato delle versioni: `pending`/`failed` → `generating` alla lettura, `generating` → `ready` al salvataggio, sempre secondo le transizioni ammesse dal dominio (`canTransition`). "Le mie lezioni" mostra quindi "in generazione" e poi "pronte".

## API
Chiamata dal server MCP con `Authorization: Bearer sfg_…` (token "genera"). Nessun header CORS. Ogni chiamata, riuscita o no, entra nel registro `generation_events` e conta nel limite di **120 all'ora** (`429` con `Retry-After: 600`).

| Metodo e percorso | Corpo / risposta | Errori |
|---|---|---|
| `GET /api/generation/lessons?limit=20` | `lessonsToGenerateResponseSchema`: lezioni da generare (max 100) e totali | `401`, `429` |
| `GET /api/generation/lessons/{id}` | `lessonSourcesResponseSchema`: titoli, `sourcesHash`, parti con il contenuto (riassunti IT/EN o markdown) e `hasSubtitles`, glossario della materia | `400` id non valido, `404` lezione non posseduta |
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
| `src/config.ts` | Legge `EPICFEED_TOKEN` e `EPICFEED_API_URL` (dalle impostazioni dell'estensione). Senza token valido il server parte lo stesso e ogni strumento risponde come crearne uno. |
| `src/main.ts` | Avvio su stdio; i log vanno solo su stderr (stdout è il canale MCP). |

Strumenti (nomi in italiano, perché Claude li mostra allo studente):

| Strumento | Cosa fa |
|---|---|
| `lezioni_da_generare { limite? }` | Lezioni senza feed, in ordine di studio, con i totali. |
| `leggi_lezione { lessonId }` | Fonti in testo leggibile (ogni parte con `sourcePartId`, riassunti it/en o testo di lettura, glossario della materia), `sourcesHash` e le istruzioni complete. Segna le versioni come "in generazione". |
| `salva_feed_lezione { lessonId, sourcesHash, feed }` | Controlla il feed in locale con `checkLessonFeed` (stesse regole dell'API, nessuna chiamata sprecata), poi lo invia con `PROMPT_VERSION`. I problemi, locali o dell'API, tornano a Claude come elenco da correggere. |
| `stato_generazione` | Totali: importate, pronte, da generare. |

Il prompt MCP `genera_lezioni` avvia la generazione di tutte le lezioni nuove. Le istruzioni del server (`SERVER_INSTRUCTIONS`) dicono a Claude l'ordine degli strumenti e di non chiedere conferma lezione per lezione. Un `409 CONFLICT` suggerisce di rileggere la lezione; un `401` di creare un nuovo token. Gli errori inattesi non mostrano dettagli.

### Pacchetto `.mcpb`
`pnpm --filter @study-feed/mcp build` compila e crea con esbuild un unico file `bundle/server/index.js` (dipendenze incluse, niente `node_modules` da installare), più `manifest.json` (versione presa da `package.json`) e `icon.png`. `pnpm --filter @study-feed/mcp run pack` produce `apps/mcp/epicfeed.mcpb` con lo strumento ufficiale `@anthropic-ai/mcpb`. Il manifest (versione 0.3) chiede due impostazioni: il token (campo `sensitive`, quindi salvato da Claude Desktop nel portachiavi del sistema) e l'indirizzo di EpicFeed (predefinito quello di produzione). Piattaforme: Windows e macOS; Node è quello incluso in Claude Desktop.

Installazione (una volta): in EpicFeed, pagina **Claude**, *Crea token*; in Claude Desktop, Impostazioni › Estensioni, trascinare `epicfeed.mcpb`, incollare il token. Poi in una chat: "genera le lezioni nuove di EpicFeed". Per aggiornare il server basta installare il nuovo `.mcpb`.

Test: `apps/mcp/src/*.test.ts` con un `fetch` finto (client) e il trasporto in memoria dell'SDK (server e strumenti).

## Prossimi passi (PR successive di M2)
- Slide dallo zip (`importa_slide`).
