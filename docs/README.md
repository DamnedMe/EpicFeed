# Documentazione

| Documento | Contenuto |
|---|---|
| [architecture.md](architecture.md) | Architettura tecnica: componenti, clean architecture, modello dati e accessi, sicurezza, performance, qualità |
| [decisions/](decisions/) | Architecture Decision Records: una decisione per file, con contesto e alternative |
| [functional/overview.md](functional/overview.md) | Documentazione funzionale: cosa fa l'app per lo studente |
| [design-system.md](design-system.md) | Colori, temi, accenti, tipografia e mockup |
| [portal-recon.md](portal-recon.md) | Ricognizione del portale Epicode e vincoli d'uso |

## Regola per ogni sviluppo
Ogni pull request che cambia il comportamento o la struttura aggiorna, nello stesso PR:
1. la **documentazione tecnica** (architecture.md, setup, API, schema);
2. la **documentazione funzionale** (functional/);
3. un **nuovo ADR** in decisions/ se prende una decisione rilevante.
