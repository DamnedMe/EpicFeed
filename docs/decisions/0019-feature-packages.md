# ADR 0019: Un pacchetto per funzione e nomi in inglese

- Stato: accettata
- Data: 24/11/2026
- Completa: [ADR 0004](0004-clean-architecture-and-quality.md) (stesse regole di dipendenza, organizzate per funzione)

## Contesto
A fine MVP il codice rispetta la clean architecture (il core non dipende da framework, le dipendenze vanno verso l'interno e il lint lo controlla), ma è diviso **per livello**: `core`, `contracts`, `adapters`, `db`, `apps/web/src/server`, `apps/web/src/app/api`, `apps/web/src/features`. Una funzione attraversa tutti i livelli: l'Esame vive in 9 cartelle di 6 pacchetti. Le cartelle sono piatte (37 file in `core/src/domain`) e i nomi mescolano italiano e inglese (`/ripasso` nelle pagine, `review` nel codice). Il risultato è una repo difficile da navigare.

## Decisione

### Un pacchetto per funzione
Ogni funzione diventa un pacchetto `@epicfeed/<funzione>` con la stessa struttura:

```
packages/<funzione>/src/
  domain/          regole pure: importano solo @epicfeed/shared e il proprio dominio
  application/     casi d'uso e porte (ports.ts) della funzione
  contracts/       schemi zod dei dati che escono dalla funzione
  infrastructure/  adattatori (repository Drizzle), solo lato server
  index.ts         porta pubblica: domain, application, contracts
```

L'infrastruttura si importa da un percorso separato (`@epicfeed/<funzione>/infrastructure`), così Drizzle e Postgres non entrano mai nel codice del browser.

| Pacchetto | Contenuto | Dipende da |
| --- | --- | --- |
| `shared` | errori, id, testo | nessuno |
| `access` | token di estensione e Claude Desktop, limiti di frequenza | shared |
| `catalog` | catalogo, contenuti e versioni, impronte, permessi e prova di possesso, sottotitoli, Le mie lezioni | shared |
| `ingest` | import delle lezioni dall'estensione | catalog |
| `feed` | feed, allineamento ai minuti, storie a battute, sessioni, generazione delle schede, slide | catalog |
| `review` | ripasso FSRS, sincronizzazione cifrata dei progressi | shared |
| `exam` | pacchetti e banca d'esame, esercizi, correzioni, colloquio | feed |
| `db` | schema (un file per funzione) e migrazioni in un'unica sequenza | nessuno |

Il lint controlla tre regole: un pacchetto importa solo quelli elencati in "Dipende da"; da un altro pacchetto si importa solo la porta pubblica; dentro un pacchetto `domain` non importa `application` né `infrastructure`.

Nelle app ogni funzione ha una cartella con lo stesso nome: `apps/web/src/features/<funzione>/` (schermate, con gli handler delle API in `api/`; in `app/api/**/route.ts` restano solo le rotte) e `apps/mcp/src/<funzione>/` (strumenti e prompt). Gli indirizzi delle API non cambiano: estensione e server MCP già installati continuano a funzionare.

### Nomi in inglese
Cartelle e file della repo hanno nomi in inglese, comprese le pagine (il nome della cartella è l'indirizzo): `/login`, `/profile`, `/profile/saved`, `/review`, `/lessons`, `/extension`. I vecchi indirizzi (`/accedi`, `/io`, `/ripasso`, `/lezioni`, `/estensione`) reindirizzano in modo permanente ai nuovi, query compresa. Anche ADR, mockup e immagini del README passano all'inglese. Testi dell'interfaccia, commenti e documentazione restano in italiano.

### Ordine di lavoro
Otto PR che spostano file senza cambiare il comportamento, ognuna con la CI verde: nomi in inglese e guida di navigazione; pacchetti `@epicfeed/*`, `shared` e regole del lint; `catalog`, `access`, `ingest`; `feed`; `review`; `exam`; rimozione di `core`, `contracts`, `adapters` e divisione dei file lunghi; documentazione.

## Alternative scartate
- **Solo una mappa in docs/**: spiega la struttura ma lascia una funzione sparsa in 9 cartelle.
- **Sottocartelle per funzione dentro ogni livello**: meno pacchetti, ma una funzione resta divisa in 7 posti, anche se con lo stesso nome.

## Conseguenze
- Per lavorare su una funzione si aprono 3 posti: il suo pacchetto, `apps/web/src/features/<funzione>` e `apps/mcp/src/<funzione>`.
- Le dipendenze tra funzioni sono esplicite e controllate; aggiungerne una richiede di cambiare questo ADR.
- Più pacchetti da configurare (tsconfig, lint, test), con una configurazione comune in `packages/config`.
- Il ritorno del login usa `/login/callback`: l'indirizzo va consentito tra gli URL di redirect di Supabase Auth.
