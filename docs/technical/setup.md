# Setup e monorepo

Stato: milestone **M0 Fondamenta** (15/11/2026).

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
| `pnpm test` | Test Vitest (core e ui con soglie di copertura, db su Postgres in memoria) |
| `pnpm format` / `pnpm format:check` | Prettier (i file `.md` sono esclusi: la prosa resta com'è scritta) |
| `pnpm --filter @study-feed/db db:generate` | Genera una nuova migrazione SQL dallo schema |
| `pnpm --filter @study-feed/db db:check` | Verifica che le migrazioni siano allineate allo schema |
| `pnpm --filter @study-feed/db db:migrate` | Applica le migrazioni al database di `DATABASE_URL` |

## Struttura
```
study-feed/
├─ packages/
│  ├─ config/   tsconfig ed ESLint condivisi
│  ├─ core/     dominio e casi d'uso, TypeScript puro       → technical/core.md
│  ├─ ui/       token del design system (CSS + TypeScript)  → technical/design-tokens.md
│  └─ db/       schema Drizzle, migrazioni, RLS             → technical/database.md
├─ docs/
└─ .github/     CI e Dependabot
```
Le cartelle `apps/web`, `apps/extension`, `apps/mcp` e i pacchetti `adapters` e `contracts` arrivano con le milestone M1–M3 ([piano di sviluppo](../development-plan.md) §3).

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

Il workflow ha solo permessi di lettura. Dependabot (`.github/dependabot.yml`) propone ogni lunedì gli aggiornamenti di dipendenze e azioni, raggruppati.

### Protezione del branch `main`
Va attivata una volta dalle impostazioni del repository (Settings → Branches → Add rule, oppure Rules → Rulesets) con:
- *Require a pull request before merging*;
- *Require status checks to pass*: `Lint, typecheck, test e build` e `Audit delle dipendenze`;
- *Block force pushes*.

## Variabili d'ambiente
Nessuna serve per sviluppare e testare: i test del database usano un Postgres in memoria. `DATABASE_URL` serve solo per `db:migrate` verso Supabase ([database.md](database.md#collegare-supabase)). Le variabili vanno in un file `.env` locale (ignorato da git) o nei segreti dei servizi, mai nella repo né in chat.
