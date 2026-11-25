# Database: schema, RLS e migrazioni

Pacchetto `packages/db`. Postgres su Supabase (regione UE, Francoforte), schema definito con Drizzle in `src/schema/`, un file per funzione (`catalog.ts`, `access.ts`, `feed.ts`, `exam.ts`, `review.ts`, colonne comuni in `columns.ts`), migrazioni SQL in `migrations/`.

## Tabelle
```
study_programs ─< editions ─< subjects ─< chapters ─< lessons ─< lesson_parts ─< content_versions
                                                                       │    │           │
                                                                       │    └─< subtitle_tracks
                                                                       │               │
auth.users ─────────────────────────────────────────────────< entitlements >────────────┘
     │ ├──── progress_snapshots (una riga per utente)
     │ ├──< subtitle_access >── subtitle_tracks
     │ ├──< api_tokens
     │ ├──< import_events
     │ └──< generation_events
lessons ─< lesson_feeds (source_version_ids → content_versions) ─ lesson_exam_packs (uno per feed)
subjects ─< glossary_terms
```

| Tabella | Contenuto | Chiavi e vincoli principali |
|---|---|---|
| `study_programs` | Corso di studi | `epicode_id` univoco |
| `editions` | Anno o edizione | (`study_program_id`, `label`) univoci |
| `subjects` | Materia (corso Epicode, Directus `courses`) | (`edition_id`, `epicode_id`) univoci |
| `chapters` | Capitolo (Directus `module`) | (`subject_id`, `epicode_id`) univoci |
| `lessons` | Lezione (Directus `activity`) | (`chapter_id`, `epicode_id`) univoci |
| `lesson_parts` | Parte video, testo o slide | (`lesson_id`, `epicode_id`) univoci, `kind` enum, `video_id` (Vimeo, solo per i video) |
| `content_versions` | Contenuto canonico (JSON) e impronta | (`lesson_part_id`, `content_hash`) univoci, hash di 64 caratteri esadecimali, ≤ 2 MB, `generation_status` |
| `entitlements` | Permesso utente ↔ versione | PK (`user_id`, `content_version_id`); FK composta (versione, parte) per coerenza; cancellazione a cascata con l'utente |
| `subtitle_tracks` | Traccia di sottotitoli di una parte (righe in JSON) | (`lesson_part_id`, `content_hash`) univoci, lingua in formato BCP 47 semplificato, `auto_generated`, ≤ 2 MB |
| `subtitle_access` | Accesso utente ↔ traccia | PK (`user_id`, `subtitle_track_id`), concesso per prova di possesso |
| `api_tokens` | Token di import dell'estensione | solo lo SHA-256 del token (64 esadecimali), `scope` enum (`import`), scadenza, revoca |
| `lesson_feeds` | Feed di una lezione (schede, quiz, concetti IT+EN) generato da Claude Desktop | (`lesson_id`, `sources_hash`) univoci, `source_version_ids` (1–40 versioni da cui è nato), `prompt_version` datata, ≤ 1 MB |
| `subject_exam_banks` | Banca degli esercizi d'esame di una materia, privata di chi l'ha generata (M4) | (`subject_id`, `generated_by`) univoci, `prompt_version` datata, ≤ 1 MB |
| `lesson_exam_packs` | Pacchetto d'esame di un feed (domande a scelta multipla e aperte in inglese, M4) | `lesson_feed_id` univoco con cancellazione a cascata, `prompt_version` datata, ≤ 512 KB |
| `exam_submissions` | Risposte inviate con *Fai correggere a Claude* (esercizio o colloquio) e correzione di Claude ([ADR 0014](../decisions/0014-exam-preparation.md) §4, M4) | `kind` (`exercise`, `interview`), `submission` e `correction` JSON ≤ 128 KB ciascuno, `expires_at` = creazione + 30 giorni; l'app la cancella appena scarica la correzione |
| `feed_corrections` | Correzioni personali di *Segnala errore* ([ADR 0020](../decisions/0020-report-error-m5.md), M5) | id scelto dall'app; `kind` (`text`, `regenerate`, `answer`, `term`), `lesson_id` `null` solo per i termini; `correction` e `completion` JSON ≤ 64 KB ciascuno; `claude_status` (`pending`, `done`, `disputed`, `not_needed`) |
| `glossary_terms` | Glossario bilingue della materia | (`subject_id`, `term_key`) univoci; termine inglese, traduzione, definizione `{ it, en }` |
| `generation_events` | Registro delle chiamate del server MCP | utente, azione (`read`, `save`, `slides`), lezione, data: serve al limite di frequenza (120/ora) |
| `progress_snapshots` | Copia **cifrata nel browser** dei progressi di studio ([ADR 0018](../decisions/0018-encrypted-progress-sync.md)) | PK `user_id`; `revision` ≥ 1 per la concorrenza ottimistica; `kdf`, `salt` (16 byte) e `iv` (12 byte) in base64; `ciphertext` base64 ≤ 4 milioni di caratteri. Il server non ha la chiave |
| `import_events` | Registro degli import | utente, lezione, numero di parti, data: serve al limite di frequenza (60/ora) |

Vincoli `CHECK` replicano nel database le regole del dominio (titoli 1–300 caratteri, posizioni ≥ 0, id Epicode con soli caratteri sicuri), così un dato non valido non entra nemmeno per errore. Un indice parziale su `content_versions` (`pending`, `failed`) rende veloce la ricerca delle versioni da generare; gli indici su `entitlements` servono alle policy RLS e coprono la chiave esterna composta (versione, parte).

## Sicurezza: RLS e permessi
- **RLS attiva su ogni tabella.**
- Gli studenti (`authenticated`) possono solo **leggere**, e solo ciò che hanno importato:
  - `entitlements`: solo i propri permessi;
  - `content_versions` e `lesson_parts`: solo se esiste un proprio permesso su quella versione o parte;
  - `subtitle_tracks`: solo se esiste un proprio `subtitle_access`; `subtitle_access`, `api_tokens` e `import_events`: solo le proprie righe;
  - `exam_submissions`: solo i propri invii (`user_id = auth.uid()`); scrittura, correzione e cancellazione solo dall'API, sempre filtrate per utente;
  - `feed_corrections`: solo le proprie correzioni (`user_id = auth.uid()`); scrittura, lavoro di Claude e annullamento solo dall'API, sempre filtrati per utente;
  - `subject_exam_banks`: solo la propria banca (`generated_by = auth.uid()`) e per una materia che lo studente vede;
  - `lesson_exam_packs`: solo se lo studente vede il feed a cui appartiene (la sottoquery su `lesson_feeds` passa dalla sua RLS);
  - `lesson_feeds`: solo se lo studente possiede **tutte** le versioni elencate in `source_version_ids`. Le versioni stanno nella riga e non in una tabella collegata, perché la policy deve vederle tutte: una tabella con la sua RLS mostrerebbe alla policy solo quelle dello studente, e il controllo passerebbe sempre;
  - `glossary_terms`: se lo studente vede la materia; `generation_events` e `progress_snapshots`: solo le proprie righe;
  - `lessons` → `chapters` → `subjects` → `editions` → `study_programs`: visibili se è visibile almeno un elemento del livello sotto. Ogni policy guarda un solo livello e si appoggia alla RLS di quel livello, così la regola resta semplice da leggere e la visibilità risale da `entitlements` fino al corso.
- Nessuna policy di scrittura, e in più le migrazioni `0001_harden_grants`, `0004_harden_grants_import`, `0006_harden_grants_generation`, `0009_harden_grants_progress`, `0011_harden_grants_exam`, `0013_harden_grants_exam_banks` `0015_harden_grants_exam_submissions` e `0017_harden_grants_feed_corrections` tolgono a `authenticated` i privilegi di insert/update/delete e ad `anon` ogni privilegio. Le scritture (import, generazione) le fa solo l'API sul server, dopo validazione e prova di possesso.
- Le policy usano `(select auth.uid())`, che Postgres valuta una volta per query invece che per riga (raccomandazione di Supabase per la latenza).

### Come è testato
`test/rls.test.ts` avvia un **Postgres reale in memoria** (PGlite, WebAssembly), simula lo strato di Supabase (`test/supabase-shim.sql`: ruoli, `auth.users`, `auth.uid()` e i privilegi predefiniti di Supabase), applica le migrazioni e verifica, impersonando due studenti:
- chi ha importato vede la propria versione, la parte e la gerarchia fino al corso, ma non le altre parti né le altre versioni;
- chi non ha importato non vede nulla in nessuna tabella;
- `anon` non ha alcun privilegio;
- nessuna scrittura è possibile dal client (nemmeno concedersi un permesso);
- deduplica, formato dell'impronta, coerenza versione/parte e cancellazione a cascata.

`test/rls-import.test.ts` fa lo stesso per le tabelle di M1: tracce visibili solo con il proprio accesso, token e registro degli import solo i propri, nessuna scrittura dal client, vincoli su lingua, hash e `video_id`.

L'ambiente di test (PGlite + shim) è esportato come `@epicfeed/db/testing` e lo usano anche i test delle cartelle `infrastructure` dei pacchetti di funzione.

`test/rls-generation.test.ts` copre le tabelle di M2: il feed è visibile a chi possiede tutte le fonti e nascosto a chi ne possiede solo una parte, glossario visibile a chi vede la materia, nessuna scrittura dal client, unicità di feed e termini, nuovo ambito di token `generate`.

Ogni nuova tabella deve aggiungere qui la sua policy e un test che verifica che un altro utente non la legga ([piano di sviluppo](../development-plan.md) §5).

## Migrazioni
- `pnpm --filter @epicfeed/db db:generate` dopo ogni modifica a `src/schema/`; per SQL scritto a mano (permessi, funzioni) `pnpm exec drizzle-kit generate --custom --name <nome>`.
- La CI esegue `db:check`: se lo schema cambia senza la migrazione corrispondente, fallisce.
- Le migrazioni non si modificano dopo essere state applicate: si aggiunge una migrazione nuova.

## Collegare Supabase
Progetto: **EpicFeed** (`https://nxuysaeevxcncchqjtep.supabase.co`), creato il 15/11/2026. L'URL del progetto è pubblico; password del database, chiave `service_role` e stringa di connessione sono segreti.

### Stato
- 15/11/2026: migrazioni `0000_init` e `0001_harden_grants` applicate tramite il connettore Supabase di Claude, e registrate in `drizzle.__drizzle_migrations` con lo stesso hash e la stessa data che usa drizzle, così il workflow e lo script restano allineati e non le riapplicano.
- Verifica dopo l'applicazione: RLS attiva e una policy su tutte le 8 tabelle, `anon` senza privilegi, `authenticated` con il solo `SELECT`, advisor di sicurezza di Supabase senza segnalazioni. L'advisor di performance ha segnalato la chiave esterna composta di `entitlements` senza indice, corretta con `0002_entitlements_fk_index`.

- 15/11/2026 (M1): migrazioni `0003_import_subtitles_tokens` (tabelle nuove e `video_id`) e `0004_harden_grants_import` (permessi), solo aggiunte, applicate con il connettore e registrate nel log di drizzle. Verifica: RLS e una policy su tutte le 12 tabelle, `anon` senza `SELECT`, `authenticated` senza `INSERT`, advisor di sicurezza senza segnalazioni (quello di performance segnala solo indici non ancora usati, normale con il database vuoto).

- M2 (PR 2 della generazione): migrazioni `0005_generation_feeds` (tabelle `lesson_feeds`, `glossary_terms`, `generation_events`, valore `generate` di `api_token_scope`) e `0006_harden_grants_generation` (permessi), solo aggiunte e quindi non distruttive: da applicare con il connettore dopo il merge.
- M2 (PR 4, slide): migrazione `0007_slides_part_kind`, che aggiunge il valore `slides` a `lesson_part_kind` e a `generation_action`. Non distruttiva.
- M4 (PR 2, sincronizzazione): migrazioni `0008_progress_snapshots` (tabella `progress_snapshots`) e `0009_harden_grants_progress` (permessi), solo aggiunte; applicate il 24/11/2026.
- M4 (PR 3, pacchetti d'esame): migrazioni `0010_exam_packs` (tabella `lesson_exam_packs`) e `0011_harden_grants_exam` (permessi), solo aggiunte; applicate il 24/11/2026.
- M4 (PR 3, banca degli esercizi): migrazioni `0012_exam_banks` (tabella `subject_exam_banks`) e `0013_harden_grants_exam_banks` (permessi), solo aggiunte; applicate il 24/11/2026.
- M4 (PR 5, correzione di Claude): migrazioni `0014_exam_submissions` (tabella `exam_submissions`) e `0015_harden_grants_exam_submissions` (permessi), solo aggiunte: da applicare con il connettore dopo il merge.
- M5 (PR 1, Segnala errore): migrazioni `0016_feed_corrections` (tabella `feed_corrections`) e `0017_harden_grants_feed_corrections` (permessi), solo aggiunte: da applicare con il connettore dopo il merge.

### Applicare le migrazioni con Claude (connettore Supabase)
Con il connettore Supabase collegato, Claude può applicare le migrazioni nuove con `apply_migration`, aggiungendo nella stessa migrazione la riga in `drizzle.__drizzle_migrations` (hash SHA-256 del file `.sql` e campo `when` del journal). Non serve la password del database.

### Applicare le migrazioni (da GitHub)
Il workflow `.github/workflows/db-migrate.yml` applica le migrazioni senza installare nulla sul PC.

Una volta sola:
1. In Supabase: *Connect* (in alto) → *Connection string* → **Session pooler** (funziona anche dai server di GitHub, che non usano IPv6). Copia la stringa e sostituisci `[YOUR-PASSWORD]` con la password del database. Se la password contiene caratteri speciali (`@`, `#`, `/`, `:`…), conviene reimpostarla con lettere e numeri (*Database → Settings → Reset database password*).
2. In GitHub: *Settings → Secrets and variables → Actions → New repository secret*, nome `DATABASE_URL`, valore la stringa del punto 1.

Ogni volta che una PR aggiunge migrazioni, dopo il merge: *Actions → Migrazioni database → Run workflow* (branch `main`). Lo script `packages/db/scripts/migrate.js` applica solo le migrazioni nuove e registra quelle applicate in `drizzle.__drizzle_migrations` (come drizzle-kit), quindi rilanciarlo non fa danni.

Se qualcosa va storto, l'errore nel log del workflow dice il motivo e cosa fare (password mancante o errata, caratteri speciali nella password, host sbagliato, connessione diretta IPv6 al posto del pooler). Il log mostra solo utente, host e porta, mai la password. Lo script sostituisce `drizzle-kit migrate`, che in caso di errore non mostrava il motivo.

Il workflow gira solo su `main`, mai due volte in parallelo, e la stringa di connessione non compare nei log. La connessione verso Supabase è sempre cifrata (`ssl: require`).

### Applicare le migrazioni dal PC (alternativa)
Crea `packages/db/.env` (ignorato da git) con `DATABASE_URL=<stringa>` e lancia `pnpm --filter @epicfeed/db db:migrate`.

### Altre impostazioni
- *Authentication → Providers*: lascia attivo solo Email (codice monouso e password, [ADR 0007](../decisions/0007-generation-via-mcp-and-login.md)).
- URL del progetto e chiave pubblicabile sono variabili d'ambiente della web app su Vercel ([web.md](web.md#variabili-dambiente)); la web app non usa la chiave `service_role`: scrive con `DATABASE_URL` dal server. Nessun segreto va scritto in chat o nella repo.

### Verifica del flusso
Lo script è stato provato su un Postgres locale con lo strato Supabase simulato (prima esecuzione applicata, seconda senza modifiche) e con stringhe sbagliate (password mancante, caratteri speciali, host inesistente), verificando che la password non compaia mai nell'output.
