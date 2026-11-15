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

Vincoli `CHECK` replicano nel database le regole del core (titoli 1–300 caratteri, posizioni ≥ 0, id Epicode con soli caratteri sicuri), così un dato non valido non entra nemmeno per errore. Un indice parziale su `content_versions` (`pending`, `failed`) rende veloce la ricerca delle versioni da generare; gli indici su `entitlements` servono alle policy RLS.

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
Da fare una volta, quando il progetto Supabase esiste:
1. Su [supabase.com](https://supabase.com) crea il progetto nella regione **Central EU (Frankfurt)**, con una password del database lunga e casuale (salvala nel tuo gestore di password).
2. Copia la stringa di connessione da *Connect → Direct connection* (oppure *Session pooler* se la tua rete non supporta IPv6).
3. In locale crea `packages/db/.env` (ignorato da git) con `DATABASE_URL=<stringa>` e lancia `pnpm --filter @study-feed/db db:migrate`.
4. In *Authentication → Providers* lascia attivo solo Email (codice monouso e password, [ADR 0007](../decisions/0007-generazione-via-mcp-e-login.md)).

URL del progetto e chiave `anon` (pubblica) serviranno alla web app in M1 come variabili d'ambiente su Vercel; la chiave `service_role` e la password del database restano solo nei segreti del server. Nessuna di queste va scritta in chat o nella repo.
