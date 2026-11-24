<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://study-feed-steel.vercel.app/readme/app-chiaro.png?v=2026-11-24">
    <img src="https://study-feed-steel.vercel.app/readme/app-scuro.png?v=2026-11-24" alt="Le schermate di EpicFeed: feed a battute, domande, Ripasso e Io" width="100%">
  </picture>
</p>

<h1 align="center">EpicFeed</h1>

<p align="center">
  <b>Studia il corso Epicode come scorri un feed.</b><br>
  Una frase per schermata, quiz con lo swipe, ripasso di ciò che hai sbagliato. In italiano e in inglese.
</p>

<p align="center">
  <a href="https://study-feed-steel.vercel.app">🚀 Apri l'app</a> ·
  <a href="docs/development-plan.md">🗺️ Piano di sviluppo</a> ·
  <a href="docs/decisions/">🧭 Decisioni</a> ·
  <a href="docs/README.md">📚 Documentazione</a>
</p>

<!-- stato:inizio -->
<!-- Blocco generato da scripts/docs-status.mjs a partire da docs/status.json: non modificarlo a mano. -->
<picture>
  <source media="(prefers-color-scheme: light)" srcset="https://study-feed-steel.vercel.app/readme/stato-chiaro.svg?v=2026-11-23">
  <img src="https://study-feed-steel.vercel.app/readme/stato-scuro.svg?v=2026-11-23" alt="Stato dello sviluppo di EpicFeed: milestone da M0 a M9" width="100%">
</picture>

> [!TIP]
> 🏁 Ultimo traguardo: **M3 Feed di studio** unita il 23/11: feed a battute con gesti, domande a gruppi di 3, punti e sessioni da 5 minuti, PWA installabile.
>
> 🛠️ Ora: **M4 Ripasso ed esame**: ripasso dei concetti e sincronizzazione cifrata uniti (PR 1 e 2 di 6); in revisione le domande d'esame per lezione generate da Claude Desktop.

<!-- stato:fine -->

## ✨ Cosa fa

| 📥 Importa | ✨ Genera | 📱 Studia | 🔁 Ripassa |
|---|---|---|---|
| L'estensione Chrome porta nell'app lezione, capitolo o corso intero, a ritmo prudente. | Claude Desktop, via MCP, crea schede, domande e concetti in italiano e in inglese. | Feed a battute con gesti, parole da indovinare, punti, serie e sessioni da 5 minuti. | Ripasso FSRS dei concetti sbagliati e simulazione dell'esame in inglese *(M4)*. |

Per lo studente: [documentazione funzionale](docs/functional/overview.md) e [feed di studio](docs/functional/feed.md).

## 🧩 Come funziona

```
Portale Epicode ──▶ Estensione (sul PC) ──▶ Catalogo su Supabase ──▶ Claude Desktop (MCP) ──▶ Feed PWA sul telefono
                    importa solo ciò che     lezioni deduplicate,     genera schede e quiz       studio, quiz e ripasso;
                    lo studente già vede     prova di possesso        bilingui                   risultati sul dispositivo
```

Dettagli in [architettura](docs/architecture.md): clean architecture (dominio puro + adattatori), RLS su ogni tabella, funzioni Vercel a Dublino accanto al database.

## 🛡️ Paletti

- Nessuna marcatura automatica di video o contenuti come "visti" o "completati".
- Traffico minimo, come un utente normale: niente crawling massivo, niente aggiramento di protezioni.
- Solo il materiale a cui lo studente ha già accesso, per uso personale. Nessuna credenziale salvata in chiaro o committata.

## 🧰 Stack

Next.js su Vercel · Supabase (Postgres EU, RLS) · estensione WXT · server MCP per Claude Desktop · monorepo pnpm + Turborepo · TypeScript · Vitest e Playwright.

## 💻 Sviluppo

```bash
corepack enable && pnpm install
pnpm check   # formattazione, lint, typecheck, test e build, come in CI
```

Requisiti e comandi in [docs/technical/setup.md](docs/technical/setup.md).

## 📚 Documentazione

| | |
|---|---|
| [Piano di sviluppo](docs/development-plan.md) | Perimetro dell'MVP, milestone, stack |
| [Architettura](docs/architecture.md) | Componenti, modello dati, sicurezza, performance |
| [Decisioni (ADR)](docs/decisions/) | Una decisione per file, con contesto e alternative |
| [Funzionale](docs/functional/overview.md) | Cosa fa l'app per lo studente |
| [Design system](docs/design-system.md) | Colori, temi, accenti, tipografia |
| [Tecnica](docs/README.md) | Import, generazione, database, web, token di design |
| [Uso del portale](docs/portal-usage.md) | Vincoli d'uso del portale Epicode |

<sub>Lo stato in cima si aggiorna da [docs/status.json](docs/status.json) con `pnpm docs:status` (vedi [docs/README.md](docs/README.md#stato-dello-sviluppo)).</sub>

## 📄 Licenza

[MIT](LICENSE). Il materiale del corso Epicode non fa parte della repo e resta di Epicode.
