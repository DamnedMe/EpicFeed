# ADR 0007: Generazione via MCP da Claude Desktop e login a più passi

- Stato: accettata
- Data: 15/11/2026
- Decisa da: Damian

## Contesto
Il [piano di sviluppo](../development-plan.md) §4 lasciava aperte, tra le altre, due scelte: chi genera schede, quiz e concetti delle lezioni Epicode (e chi ne paga il costo), e come si accede all'app.

## Decisione

### Generazione delle lezioni via MCP
- La generazione la fa **Claude Desktop sul PC di Damian**, tramite il server MCP (`apps/mcp`), usando il suo piano Claude. Nessuna chiave Claude API sul server, nessun costo per capitolo.
- Flusso: l'estensione importa la lezione → la versione entra nello stato `da_generare` → da Claude Desktop Damian chiede di generare le lezioni nuove → il server MCP fornisce riassunti, sottotitoli e glossario (`lezioni_da_generare`, `leggi_lezione`) → Claude genera → `salva_feed_lezione` valida e invia il risultato all'API.
- Le regole dell'[ADR 0006](0006-sottotitoli-come-fonte-secondaria.md) restano: schede, quiz e concetti dai soli riassunti; le istruzioni di generazione sono un prompt MCP versionato nella repo.
- L'allineamento delle schede al minuto del video è codice deterministico nel `core`, non una richiesta a Claude.
- Il server MCP si autentica all'API con un token personale, limitato agli strumenti di generazione e revocabile dalla sezione Io.
- È lo stesso modello già scelto per i libri ([ADR 0005](0005-sezione-libri.md)).

### Login
1. **Primo accesso** con codice monouso via email (Supabase Auth).
2. Subito dopo, l'utente **imposta una password**; da lì entra con email e password (il codice via email resta per il recupero).
3. **Accedi con Google** (OAuth 2.0, gratuito) in un secondo momento: richiede un progetto Google Cloud con schermata di consenso e client OAuth, da creare con un account dedicato. Previsto in M8.

## Alternative scartate
- **Claude API sul server**: automatica e utilizzabile anche dal telefono, ma con un costo per capitolo e una chiave a pagamento da custodire.
- **MCP ora, API dopo**: resta possibile in futuro senza toccare il dominio, perché la generazione passa da un contratto (`packages/contracts`) e da un caso d'uso indipendenti da chi la esegue.
- Solo codice via email, senza password: più semplice, ma Damian preferisce la password per gli accessi quotidiani.

## Conseguenze
- Nell'MVP non serve una coda di job sul server (scelta B del piano). Il server MCP per la generazione entra già in M2, prima del feed.
- Una lezione importata diventa studiabile solo dopo che qualcuno l'ha generata da Claude Desktop. L'app mostra le lezioni in attesa, con l'indicazione di avviare la generazione dal PC.
- Per altri studenti, in futuro, serve Claude Desktop oppure il passaggio alla Claude API sul server: da decidere con un nuovo ADR prima di aprire l'app.
- Una versione generata da un utente vale per tutti quelli che la possiedono: l'API la accetta una volta sola per `contentHash` e la rivalida con gli stessi schemi.
