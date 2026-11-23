# Documentazione

| Documento | Contenuto |
|---|---|
| [status.json](status.json) | Stato dello sviluppo: unica fonte della plancia e del riquadro in cima al README |
| [development-plan.md](development-plan.md) | Piano di sviluppo: perimetro dell'MVP, milestone, struttura della repo, stack e scelte aperte |
| [architecture.md](architecture.md) | Architettura tecnica: componenti, clean architecture, modello dati e accessi, sicurezza, performance, qualità |
| [decisions/](decisions/) | Architecture Decision Records: una decisione per file, con contesto e alternative |
| [functional/overview.md](functional/overview.md) | Documentazione funzionale: cosa fa l'app per lo studente |
| [functional/feed.md](functional/feed.md) | Feed di studio: schede a battute, gesti, domande, punti, sessioni, Io |
| [functional/review.md](functional/review.md) | Ripasso dei concetti e sezione Esame |
| [design-system.md](design-system.md) | Colori, temi, accenti, tipografia e mockup |
| [technical/setup.md](technical/setup.md) | Setup, comandi, struttura del monorepo, convenzioni e CI |
| [technical/core.md](technical/core.md) | Dominio: entità, forma canonica e impronta del contenuto, sottotitoli, prova di possesso, ImportLesson |
| [technical/database.md](technical/database.md) | Schema Postgres, RLS, migrazioni e collegamento a Supabase |
| [technical/generation.md](technical/generation.md) | Generazione di schede e quiz via MCP: feed bilingue, controlli, allineamento al minuto (versione 2 da M3) |
| [technical/import.md](technical/import.md) | Import delle lezioni: estensione, corrispondenza portale → catalogo, token, API |
| [technical/web.md](technical/web.md) | Web app: pagine, accesso, sicurezza, feed di studio, ripasso, variabili d'ambiente, messa online |
| [technical/design-tokens.md](technical/design-tokens.md) | Token del design system: CSS, Tailwind, temi e accenti, test di contrasto |
| [portal-recon.md](portal-recon.md) | Ricognizione del portale Epicode e vincoli d'uso |

## Stato dello sviluppo
La plancia in cima al [README](../README.md) (versioni per tema scuro e chiaro in `assets/`) e il riquadro "Ultimo traguardo" sono generati da [status.json](status.json) con uno script senza dipendenze ([scripts/docs-status.mjs](../scripts/docs-status.mjs)).

Quando una milestone avanza o si chiude:
1. aggiorna `status.json`: `stato` (`fatta`, `in-corso`, `da-fare`), `data` per le milestone fatte, `avanzamento` (da 0 a 1) e `nota` per quella in corso, `ultimoTraguardo`, `inCorso` e `aggiornato`;
2. esegui `pnpm docs:status`, che rigenera i due SVG e il blocco del README tra `<!-- stato:inizio -->` e `<!-- stato:fine -->`;
3. committa i file nello stesso PR della milestone.

La CI esegue `pnpm docs:status:check` e fallisce se i file generati non corrispondono a `status.json`. La percentuale dell'MVP è la media dell'avanzamento delle milestone da M0 a `mvpFinoA`.

## Regola per ogni sviluppo
Ogni pull request che cambia il comportamento o la struttura aggiorna, nello stesso PR:
1. la **documentazione tecnica** (architecture.md, setup, API, schema);
2. la **documentazione funzionale** (functional/);
3. un **nuovo ADR** in decisions/ se prende una decisione rilevante;
4. lo **stato dello sviluppo** (status.json + `pnpm docs:status`) se una milestone avanza o si chiude.
