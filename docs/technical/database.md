# Database: schema, RLS e migrazioni

Pacchetto `packages/db`. Postgres su Supabase (regione UE, Francoforte), schema definito con Drizzle in `src/schema.ts`, migrazioni SQL in `migrations/`.

## Tabelle
```
study_programs ─< editions ─< subjects ─< chapters ─< lessons ─< lesson_parts ─< content_versions
                                                                       │                │
auth.users ─────────────────────────────────────────────────< entitlements >────────────┘
```

| Tabella | Contenuto | Chiavi e vincoli principali |
|---|---|---|
| `study_programs` | Corso di studi | `epicode_id` univoco |
| `editions` | Anno o edizione | (`study_program_id`, `label`) univoci |
| `subjects` | Materia (Directus `unit`) | (`edition_id`, `epicode_id`) univoci |
| `chapters` | Capitolo (Directus `module`) | (`subject_id`, `epicode_id`) univoci |
| `lessons` | Lezione (Directus `activity`) | (`chapter_id`, `epicode_id`) univoci |
| `lesson_parts` | Parte video o testo | (`lesson_id`, `epicode_id`) univoci, `kind` enum |
| `content_versions` | Contenuto canonico (JSON) e impronta | (`lesson_part_id`, `content_hash`) univoci, hash di 64 caratteri esadecimali, ≤ 2 MB, `generation_status` |
| `entitlements` | Permesso utente ↔ versione | PK (`user_id`, `content_version_id`); FK composta (versione, parte) per coerenza; cancellazione a cascata con l'utente |

Vincoli `CHECK` replicano nel database le regole del core (titoli 1–300 caratteri, posizioni ≥ 0, id Epicode con soli caratteri sicuri), così un dato non valido non entra nemmeno per errore. Un indice parziale su `content_versions` (`pending`, `failed`) rende veloce la ricerca delle versioni da generare; gli indici su `entitlements` servono alle policy RLS e coprono la chiave esterna composta (versione, parte).

## Sicurezza: RLS e permessi
- **RLS attiva su ogni tabella.**
- Gli studenti (`authenticated`) possono solo **leggere**, e solo ciò che hanno importato:
  - `entitlements`: solo i propri permessi;
  - `content_versions` e `lesson_parts`: solo se esiste un proprio permesso su quella versione o parte;
  - `lessons` → `chapters` → `subjects` → `editions` → `study_programs`: visibili se è visibile almeno un elemento del livello sotto. Ogni policy guarda un solo livello e si appoggia alla RLS di quel livello, così la regola resta semplice da leggere e la visibilità risale da `entitlements` fino al corso.
- Nessuna policy di scrittura, e in più la migrazione `0001_harden_grants` toglie a `authenticated` i privilegi di insert/update/delete e ad `anon` ogni privilegio. Le scritture (import, generazione) le fa solo l'API sul server, dopo validazione e prova di possesso.
- Le policy usano `(select auth.uid())`, che Postgres valuta una volta per query invece che per riga (raccomandazione di Supabase per la latenza).

### Come è testato
`test/rls.test.ts` avvia un **Postgres reale in memoria** (PGlite, WebAssembly), simula lo strato di Supabase (`test/supabase-shim.sql`: ruoli, `auth.users`, `auth.uid()` e i privilegi predefiniti di Supabase), applica le migrazioni e verifica, impersonando due studenti:
- chi ha importato vede la propria versione, la parte e la gerarchia fino al corso, ma non le altre parti né le altre versioni;
- chi non ha importato non vede nulla in nessuna tabella;
- `anon` non ha alcun privilegio;
- nessuna scrittura è possibile dal client (nemmeno concedersi un permesso);
- deduplica, formato dell'impronta, coerenza versione/parte e cancellazione a cascata.

Ogni nuova tabella deve aggiungere qui la sua policy e un test che verifica che un altro utente non la legga ([piano di sviluppo](../development-plan.md) §5).

## Migrazioni
- `pnpm --filter @study-feed/db db:generate` dopo ogni modifica a `src/schema.ts`; per SQL scritto a mano (permessi, funzioni) `pnpm exec drizzle-kit generate --custom --name <nome>`.
- La CI esegue `db:check`: se lo schema cambia senza la migrazione corrispondente, fallisce.
- Le migrazioni non si modificano dopo essere state applicate: si aggiunge una migrazione nuova.

## Collegare Supabase
Progetto: **EpicFeed** (`https://nxuysaeevxcncchqjtep.supabase.co`), creato il 15/11/2026. L'URL del progetto è pubblico; password del database, chiave `service_role` e stringa di connessione sono segreti.

### Stato
- 15/11/2026: migrazioni `0000_init` e `0001_harden_grants` applicate tramite il connettore Supabase di Claude, e registrate in `drizzle.__drizzle_migrations` con lo stesso hash e la stessa data che usa drizzle, così il workflow e lo script restano allineati e non le riapplicano.
- Verifica dopo l'applicazione: RLS attiva e una policy su tutte le 8 tabelle, `anon` senza privilegi, `authenticated` con il solo `SELECT`, advisor di sicurezza di Supabase senza segnalazioni. L'advisor di performance ha segnalato la chiave esterna composta di `entitlements` senza indice, corretta con `0002_entitlements_fk_index`.

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
Crea `packages/db/.env` (ignorato da git) con `DATABASE_URL=<stringa>` e lancia `pnpm --filter @study-feed/db db:migrate`.

### Altre impostazioni
- *Authentication → Providers*: lascia attivo solo Email (codice monouso e password, [ADR 0007](../decisions/0007-generazione-via-mcp-e-login.md)).
- URL del progetto e chiave `anon` (pubblica) serviranno alla web app in M1 come variabili d'ambiente su Vercel; la chiave `service_role` resta solo nei segreti del server. Nessun segreto va scritto in chat o nella repo.

### Verifica del flusso
Lo script è stato provato su un Postgres locale con lo strato Supabase simulato (prima esecuzione applicata, seconda senza modifiche) e con stringhe sbagliate (password mancante, caratteri speciali, host inesistente), verificando che la password non compaia mai nell'output.
