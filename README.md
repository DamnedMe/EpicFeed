# study-feed

Web app personale per studiare il materiale del corso Epicode in modo più leggero.

**Idea**
- Prende lezioni e riassunti dal portale Epicode (solo il materiale a cui lo studente ha già accesso, per uso personale).
- Li trasforma in un feed verticale stile TikTok di clip brevi, un concetto per clip.
- Quiz a fine capitolo e ripasso mirato dei soli concetti sbagliati.
- Un server MCP che espone materiale e risultati dei quiz a un assistente di studio Claude.

**Paletti**
- Nessuna marcatura automatica di video o contenuti come "visti/completati".
- Traffico minimo, come un utente normale: niente crawling massivo, niente aggiramento di protezioni (es. Cloudflare Turnstile).
- Nessuna credenziale salvata in chiaro o committata.

**Stato**: ricognizione. Architettura, stack e design si decidono insieme prima di scrivere codice.
Vedi [docs/portal-recon.md](docs/portal-recon.md).
