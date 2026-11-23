# Documentazione

| Documento | Contenuto |
|---|---|
| [development-plan.md](development-plan.md) | Piano di sviluppo: perimetro dell'MVP, milestone, struttura della repo, stack e scelte aperte |
| [architecture.md](architecture.md) | Architettura tecnica: componenti, clean architecture, modello dati e accessi, sicurezza, performance, qualità |
| [decisions/](decisions/) | Architecture Decision Records: una decisione per file, con contesto e alternative |
| [functional/overview.md](functional/overview.md) | Documentazione funzionale: cosa fa l'app per lo studente |
| [functional/feed.md](functional/feed.md) | Feed di studio: schede a battute, gesti, domande, punti, sessioni, Io |
| [design-system.md](design-system.md) | Colori, temi, accenti, tipografia e mockup |
| [technical/setup.md](technical/setup.md) | Setup, comandi, struttura del monorepo, convenzioni e CI |
| [technical/core.md](technical/core.md) | Dominio: entità, forma canonica e impronta del contenuto, sottotitoli, prova di possesso, ImportLesson |
| [technical/database.md](technical/database.md) | Schema Postgres, RLS, migrazioni e collegamento a Supabase |
| [technical/generation.md](technical/generation.md) | Generazione di schede e quiz via MCP: feed bilingue, controlli, allineamento al minuto (versione 2 da M3) |
| [technical/import.md](technical/import.md) | Import delle lezioni: estensione, corrispondenza portale → catalogo, token, API |
| [technical/web.md](technical/web.md) | Web app: pagine, accesso, sicurezza, feed di studio, variabili d'ambiente, messa online |
| [technical/design-tokens.md](technical/design-tokens.md) | Token del design system: CSS, Tailwind, temi e accenti, test di contrasto |
| [portal-recon.md](portal-recon.md) | Ricognizione del portale Epicode e vincoli d'uso |

## Regola per ogni sviluppo
Ogni pull request che cambia il comportamento o la struttura aggiorna, nello stesso PR:
1. la **documentazione tecnica** (architecture.md, setup, API, schema);
2. la **documentazione funzionale** (functional/);
3. un **nuovo ADR** in decisions/ se prende una decisione rilevante.
