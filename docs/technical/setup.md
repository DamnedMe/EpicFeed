# Setup e monorepo

Stato: milestone **M1 Import e catalogo** (15/11/2026).

## Requisiti
- Node.js ≥ 22.12 (la versione di riferimento è in `.nvmrc`).
- pnpm 10 (la versione esatta è in `package.json` → `packageManager`; con Corepack basta `corepack enable`).

## Primo avvio
```bash
pnpm install          # installa tutte le dipendenze del workspace
pnpm check            # formattazione + lint + typecheck + test + build, come in CI
```

## Comandi
| Comando | Cosa fa |
|---|---|
| `pnpm build` | Compila tutti i pacchetti (Turborepo, con cache) |
| `pnpm lint` | ESLint su tutti i pacchetti |
| `pnpm typecheck` | Controllo dei tipi senza emettere file |
| `pnpm test` | Test Vitest (core e ui con soglie di copertura; db e adapters su Postgres in memoria) |
| `pnpm format` / `pnpm format:check` | Prettier (i file `.md` sono esclusi: la prosa resta com'è scritta) |
| `pnpm --filter @study-feed/db db:generate` | Genera una nuova migrazione SQL dallo schema |
| `pnpm --filter @study-feed/db db:check` | Verifica che le migrazioni siano allineate allo schema |
| `pnpm --filter @study-feed/db db:migrate` | Applica le migrazioni al database di `DATABASE_URL` |
| `pnpm --filter @study-feed/web dev` | Web app in locale su `http://localhost:3000` (serve `apps/web/.env.local`) |
| `pnpm --filter @study-feed/extension dev` | Estensione in modalità sviluppo (Chrome con ricarica automatica) |
| `pnpm --filter @study-feed/extension build` | Estensione da caricare in Chrome (`apps/extension/.output/chrome-mv3`) |

## Struttura
```
study-feed/
├─ apps/
│  ├─ web/        Next.js: accesso, Le mie lezioni, API         → technical/web.md
│  └─ extension/  estensione Chrome (WXT) che importa le lezioni → technical/import.md
├─ packages/
│  ├─ config/     tsconfig ed ESLint condivisi
│  ├─ core/       dominio e casi d'uso, TypeScript puro       → technical/core.md
│  ├─ contracts/  schemi zod condivisi tra API ed estensione   → technical/import.md
│  ├─ adapters/   implementazioni Drizzle delle porte del core
│  ├─ ui/         token del design system (CSS + TypeScript)  → technical/design-tokens.md
│  └─ db/         schema Drizzle, migrazioni, RLS             → technical/database.md
├─ docs/
└─ .github/       CI e Dependabot
```
`apps/mcp` è il server MCP per Claude Desktop (M2): `pnpm --filter @study-feed/mcp run pack` crea il pacchetto `epicfeed.mcpb` ([generation.md](generation.md#server-mcp-appsmcp)).

Ogni pacchetto ha gli stessi script (`build`, `lint`, `typecheck`, `test`) e Turborepo li esegue nell'ordine delle dipendenze, con cache: se un pacchetto non cambia, il suo risultato viene riusato.

## Convenzioni
- **TypeScript strict** con `noUncheckedIndexedAccess` ed `exactOptionalPropertyTypes`; moduli ESM.
- **TSDoc obbligatoria** su funzioni, classi, metodi, interfacce e tipi esportati: la regola `jsdoc/require-jsdoc` fa fallire il lint se manca.
- Identificatori in inglese, commenti e documentazione in italiano. I commenti interni spiegano il *perché*, non il *cosa*.
- Regola delle dipendenze: `core` non importa altri pacchetti del monorepo, framework, ORM né moduli `node:*` (ESLint, `packages/core/eslint.config.js`).
- Versioni delle dipendenze fissate in modo esatto e nel lockfile; pnpm non installa versioni pubblicate da meno di 24 ore (`minimumReleaseAge`) e solo `esbuild` può eseguire script di installazione.

## Integrazione continua
`.github/workflows/ci.yml`, su ogni pull request e su ogni push in `main`:
1. installazione con lockfile bloccato;
2. formattazione (Prettier);
3. lint, typecheck, test e build di tutti i pacchetti;
4. controllo che le migrazioni corrispondano allo schema Drizzle;
5. `pnpm audit` (job separato): fallisce con vulnerabilità di livello moderato o superiore.

Il workflow `db-migrate.yml` (*Migrazioni database*) si avvia a mano da `main` e applica le migrazioni a Supabase ([database.md](database.md#collegare-supabase)).

Il workflow ha solo permessi di lettura. Dependabot (`.github/dependabot.yml`) propone ogni lunedì gli aggiornamenti di dipendenze e azioni, raggruppati.

### Protezione del branch `main`
Non disponibile sui repository privati senza GitHub Pro: finché non c'è, si unisce una PR solo con la CI verde. Se in futuro diventa disponibile, va attivata una volta dalle impostazioni del repository (Settings → Branches → Add rule, oppure Rules → Rulesets) con:
- *Require a pull request before merging*;
- *Require status checks to pass*: `Lint, typecheck, test e build` e `Audit delle dipendenze`;
- *Block force pushes*.

## Variabili d'ambiente
Nessuna serve per compilare e testare: i test del database usano un Postgres in memoria. La web app in esecuzione ne richiede alcune ([web.md](web.md#variabili-dambiente)); l'estensione legge `WXT_APP_ORIGIN` al build ([import.md](import.md#build-e-installazione)). `DATABASE_URL` serve solo per `db:migrate` verso Supabase (segreto del repository per il workflow, oppure `packages/db/.env` in locale) ([database.md](database.md#collegare-supabase)). Le variabili vanno in un file `.env` locale (ignorato da git) o nei segreti dei servizi, mai nella repo né in chat.
