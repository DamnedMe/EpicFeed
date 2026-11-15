# Architettura

Stato: **approvata, nessun codice ancora scritto** (14/11/2026).
Le motivazioni delle singole scelte sono negli ADR in [decisions/](decisions/). Aggiornata il 14/11/2026 con la sezione Libri ([ADR 0005](decisions/0005-sezione-libri.md)) il 15/11/2026 con la gestione dei sottotitoli ([ADR 0006](decisions/0006-sottotitoli-come-fonte-secondaria.md)) e con generazione via MCP e login ([ADR 0007](decisions/0007-generazione-via-mcp-e-login.md)).

## 1. Panoramica

Study Feed trasforma le lezioni Epicode che lo studente sta già seguendo in un feed verticale di clip brevi, con quiz di fine capitolo e un ripasso mirato dei concetti sbagliati.

L'architettura è **ibrida** ([ADR 0001](decisions/0001-architettura-ibrida.md)):

```
 PC dello studente                       Cloud                              Telefono / browser
 ─────────────────                       ─────                              ──────────────────
 Portale Epicode (loggato)
        │ la pagina carica la lezione
        ▼
 Estensione browser ──── importa ────▶  API (Next.js)  ◀──── legge ────  PWA (feed, quiz, ripasso)
  · legge ciò che la pagina              · verifica prova di possesso        · risultati personali
    ha già caricato                      · deduplica per impronta              in IndexedDB
  · un clic, solo su azione              · versioni dei contenuti            · export/import backup
    dello studente                       · job di generazione (Claude API)
                                                │
                                         Postgres (Supabase)
                                          · catalogo condiviso dei contenuti
                                          · clip, quiz, concetti generati
                                          · permessi utente ↔ lezione

 Server MCP (locale, per Claude Desktop/Code) ── legge catalogo + export dei risultati
```

Vincoli che l'architettura rispetta sempre (vedi [portal-recon.md](portal-recon.md)):
- nessuna chiamata che marca contenuti come visti/completati;
- nessun login automatico, nessun aggiramento di Turnstile, nessuna credenziale Epicode salvata;
- traffico verso Epicode solo dal browser dello studente e solo su sua azione, mai dal cloud;
- i video non vengono scaricati né ritagliati;
- non si scrive mai sulle collezioni di progresso (`video_tracking`, `content_completions`, `/v2/content/checkmark-completion`);
- l'estensione chiede a Directus solo i campi necessari (mai `fields=*.*`, che espone dati di altri studenti).

## 2. Componenti

| Componente | Tecnologia | Responsabilità |
|---|---|---|
| `apps/web` | Next.js (App Router), TypeScript, Tailwind, Motion, PWA | Feed, quiz, ripasso, impostazioni tema/accento; API di import e lettura catalogo |
| `apps/extension` | Estensione Chrome (Manifest V3), TypeScript | Importa la lezione aperta dallo studente: trascrizione, riassunto, metadati di corso |
| `apps/mcp` | Server MCP in TypeScript (SDK ufficiale) | Strumenti per Claude: cerca lezione, concetti deboli, quiz al volo, grafici dei progressi, segnala errore; importazione e trasformazione dei libri (§7 bis) |
| `packages/core` | TypeScript puro | Dominio e casi d'uso (vedi §3). Nessuna dipendenza da framework |
| `packages/adapters` | TypeScript | Implementazioni delle porte: Supabase, Claude API, IndexedDB, crypto |
| `packages/ui` | React + Tailwind | Componenti condivisi e token del [design system](design-system.md) |

Monorepo con pnpm workspaces.

## 3. Clean architecture

Dipendenze solo verso l'interno ([ADR 0004](decisions/0004-clean-architecture-e-qualita.md)):

```
 apps (Next.js, estensione, MCP)  →  adapters  →  core/application  →  core/domain
```

- **domain**: entità e regole pure. Lezione Epicode e libro sono due tipi di `Source` con la stessa struttura `Source > Unit > FeedItem (Clip | Passage)`, così feed, quiz e ripasso sono unici. Entità: (`Source`, `Book`, `Course`, `Subject`, `Lesson`, `ContentVersion`, `Clip`, `QuizItem`, `Concept`, `ReviewCard`, `Entitlement`, `Glossary`, `Correction`). Ogni `Clip`/`Passage` conserva la provenienza del testo (`origin`: riassunto, capitolo o sottotitoli). Nessun I/O.
- **application**: casi d'uso (`ImportLesson`, `GenerateClipsForVersion`, `BuildGlossary`, `AlignClipsToSubtitles`, `ReportError`, `GetFeed`, `AnswerQuiz`, `ScheduleReview`, `GrantLessonAccess`). Dipendono solo da **porte** (interfacce) come `ContentRepository`, `EntitlementVerifier`, `ContentGenerator`, `GlossaryRepository`, `CorrectionRepository`, `ProgressStore`, `Clock`.
- **adapters**: implementano le porte (`SupabaseContentRepository`, `ClaudeContentGenerator`, `IndexedDbProgressStore`, `PossessionProofVerifier`).
- **apps**: solo composizione e presentazione. Nessuna regola di business nei componenti React o nelle route.

Conseguenza pratica: passare dalla verifica "prova di possesso" alla verifica ufficiale Epicode significa scrivere un nuovo `EntitlementVerifier`, senza toccare dominio e casi d'uso.

## 4. Modello dei contenuti

Catalogo **condiviso e deduplicato** ([ADR 0002](decisions/0002-contenuti-condivisi-con-prova-di-accesso.md)):

```
 StudyProgram (corso di studi, es. Full-Stack Web Development)
   └─ Edition (anno / edizione, es. 2026)
        └─ Subject (materia / modulo, es. JavaScript)
             └─ Chapter (capitolo)
                  └─ Lesson (lezione, con id Epicode di origine)
                       └─ LessonPart (parte video)
   Mappatura Directus: unit → Subject, module → Chapter, activity → Lesson,
   contenuti vimeo/googledocs/markdown/quiz → LessonPart
                            └─ ContentVersion (revisione)
                                 · contentHash (SHA-256 del contenuto normalizzato)
                                 · importedAt, firstSeenAt
                                 · transcript, summary
                                 └─ derivati: Clip[], QuizItem[], Concept[]
```

Regole:
- Una `ContentVersion` è identificata dal suo `contentHash`: lo stesso contenuto importato da più utenti viene salvato **una volta sola**.
- Se Epicode modifica una lezione, l'import produce un hash diverso e nasce una **nuova versione** con la sua data. Le versioni precedenti restano consultabili; clip e quiz vengono rigenerati solo per la nuova.
- I derivati (clip, quiz, concetti) appartengono a una versione e si generano **una volta per versione**, non per utente.

## 5. Modello di accesso

Fase 1, ora: **permesso per lezione con prova di possesso**.
- Uno studente vede una lezione solo dopo averla importata dal proprio account Epicode.
- L'import invia il contenuto normalizzato; il server ne calcola l'hash. Se coincide con una versione esistente, crea l'`Entitlement(user, lessonPart, version)` senza salvare un duplicato.
- Non si può ottenere una lezione dichiarando di averla: serve il suo contenuto.
- Le policy RLS di Postgres fanno valere lo stesso controllo anche a livello di database.

Fase 2, solo con un canale ufficiale Epicode (Student API, OAuth "Accedi con Epicode" o accordo):
- permessi **per corso/edizione**, verificati lato server, con data di scadenza e ricontrollo periodico;
- possibile condivisione per classe.

Esclusi: condivisione libera tra utenti (ridistribuzione di contenuti protetti) e verifica dei permessi basata su dati dichiarati dal client.

## 6. Dati personali sul dispositivo

[ADR 0003](decisions/0003-risultati-sul-dispositivo.md).
- Risposte ai quiz, errori, schede di ripasso (FSRS) e preferenze restano nel browser (IndexedDB). Il server non conosce i risultati.
- Export/import di un file di backup.
- In futuro, se servono più dispositivi o il server MCP: sincronizzazione **cifrata end-to-end** (il server conserva solo dati che non può leggere).
- Sul server restano solo account, permessi e catalogo condiviso.

## 7. Generazione dei contenuti

Gerarchia delle fonti ([ADR 0006](decisions/0006-sottotitoli-come-fonte-secondaria.md)): **riassunti > glossario > sottotitoli**. I sottotitoli Epicode sono spesso generati automaticamente e imprecisi, quindi non sono la base del testo.

- Ogni versione viene divisa in clip di un concetto a partire dai **riassunti** (della parte video e del capitolo): titolo, frase chiave, spiegazione, codice. Quiz e concetti si ricavano **solo dai riassunti**. Modello: Claude, da Claude Desktop tramite il server MCP.
- I **sottotitoli** servono per allineare ogni clip al suo intervallo nel video (inizio/fine in secondi) e per qualche dettaglio in più. L'allineamento usa concetti e parole chiave; se è incerto la clip punta all'inizio della parte video.
- Ogni passaggio preso dai sottotitoli viene corretto da Claude confrontandolo con i riassunti e con il **glossario dei termini tecnici** della materia (costruito dai riassunti e arricchito dalle correzioni dell'utente). Ciò che non trova riscontro viene scartato.
- Le **correzioni dell'utente** ("Segnala errore") sono salvate in un'area privata del server (RLS: solo l'autore), si applicano alla clip su tutti i suoi dispositivi e vengono passate alle generazioni successive. Non modificano il catalogo condiviso.
- Esecuzione: da Claude Desktop tramite il server MCP ([ADR 0007](decisions/0007-generazione-via-mcp-e-login.md)); la versione passa da `da_generare` a `pronta`, idempotente per `contentHash`, con i risultati salvati e rivalidati dall'API.
- Fonti testuali (dal file HAR, vedi [portal-recon.md](portal-recon.md) §5): per ogni parte video il riassunto markdown (`summary.it/en`), il riassunto di capitolo in markdown e i sottotitoli VTT con timestamp. Gli URL dei VTT sono firmati e scadono, quindi l'estensione li legge al momento dell'import.
- Riproduzione: i video Vimeo hanno `embed_permission: whitelist` e **non si possono incorporare** fuori dal dominio Epicode. Le clip sono quindi **schede testuali/animate** (titolo, frase chiave dai riassunti, codice, schema) con il pulsante "Guarda sul portale" che apre la lezione al minuto della clip.

## 7 bis. Libri personali

[ADR 0005](decisions/0005-sezione-libri.md).
- L'utente carica un PDF o un EPUB senza DRM e sceglie la modalità: *Studiare* (clip, quiz, ripasso) o *Solo leggere* (passaggi chiave). La modalità si può cambiare dopo.
- La trasformazione avviene via MCP da Claude Desktop sul PC: `importa_libro` legge il file in locale ed estrae capitoli e copertina, Claude genera il feed un capitolo alla volta, `salva_feed_capitolo` lo invia all'API e `stato_elaborazione` mostra l'avanzamento. Il file originale non lascia il PC.
- Il feed generato è salvato in un'area **privata** del server (RLS: solo il proprietario). Nessuna condivisione né deduplica.
- Copertina dai metadati EPUB o dalla prima pagina del PDF, altrimenti generata; sostituibile.
- Fuori dalla prima versione: OCR per PDF scansionati, caricamento direttamente dall'app.

## 8. Sicurezza

- Supabase Auth: codice via email al primo accesso, poi password, in seguito Accedi con Google ([ADR 0007](decisions/0007-generazione-via-mcp-e-login.md)). Il server MCP usa un token personale revocabile. Row Level Security su ogni tabella; il client non usa mai la service key.
- Validazione di ogni input con zod ai confini (API, estensione, MCP).
- Nessun segreto nel bundle client; segreti solo in variabili d'ambiente del server.
- Header di sicurezza (CSP restrittiva, HSTS, frame-ancestors) e permessi minimi nell'estensione (solo il dominio Epicode e la nostra API).
- Rate limit sulle API di import.
- `pnpm audit`, Dependabot e secret scanning in CI.

## 9. Performance

- Precaricamento delle clip successive e dei loro metadati; virtualizzazione del feed.
- Pagine statiche o in cache per il catalogo; risposte API con cache HTTP dove possibile.
- Budget misurati in CI (Lighthouse): LCP < 2,5 s su mobile, interazione dello swipe sotto i 100 ms.

## 10. Qualità e processo

- TypeScript `strict`, ESLint e Prettier.
- **TSDoc su ogni metodo pubblico** (cosa fa, parametri, valori restituiti, errori). Nel codice interno, commenti solo sul *perché*.
- Test: Vitest per dominio e casi d'uso (copertura alta sul core), Playwright per i flussi principali.
- CI su GitHub Actions: lint, typecheck, test, build, audit. Il merge è bloccato se un controllo fallisce.
- **Documentazione tecnica e funzionale aggiornata in ogni PR** (vedi [README della documentazione](README.md)).

## 11. Punti aperti

- Termini d'uso per studenti.
- Sincronizzazione cifrata e accesso del server MCP ai risultati personali.
- Condivisione verificata delle correzioni nel catalogo comune ([ADR 0006](decisions/0006-sottotitoli-come-fonte-secondaria.md)).
- Limiti pratici della trasformazione via MCP per libri lunghi (contesto, durata), da misurare su un libro di prova.
