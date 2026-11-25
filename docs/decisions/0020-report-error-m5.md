# ADR 0020: Segnala errore (M5)

- Stato: accettata
- Data: 25/11/2026
- Decisa da: Damian (scelte una alla volta sul prototipo)
- Completa: [ADR 0006](0006-subtitles-as-secondary-source.md) punto 3

## Contesto
Le schede e le domande nascono dai riassunti (ADR 0006), ma Claude può comunque sbagliare: una regola invertita, una traduzione, una riga di codice, la risposta giusta di una domanda. L'ADR 0006 fissa già che le correzioni sono personali, salvate in un'area privata del server e riapplicate alle nuove versioni della lezione. Restavano da scegliere l'interfaccia, chi sistema l'altra lingua, come trattare un termine ripetuto e dove applicare le correzioni.

Vincoli: il feed di una lezione è uno solo per tutti quelli che l'hanno importata (ADR 0007) e il telefono ne tiene una copia per studiare offline (ADR 0015, 0016).

## Decisione

### 1. Correggi la frase (scelta A)
Dal foglio azioni (*tieni premuto*) **Segnala errore** apre un foglio con la frase della battuta che si stava leggendo già pronta da modificare; con le frecce si sceglie un'altra frase della scheda. Un motivo rapido (contenuto, traduzione, codice, poco chiaro) e, se non si sa la correzione, **Rifalla da capo**: la scheda la riscrive Claude dai riassunti.

Le domande si segnalano allo stesso modo; in più si può indicare che **la risposta giusta è un'altra**. La risposta data prima non conta come errore nel ripasso.

### 2. L'altra lingua la sistema Claude (scelta A)
Lo studente corregge la lingua che vede. La correzione resta *in attesa di Claude*: alla prossima sessione su Claude Desktop, Claude la verifica con i riassunti e scrive la stessa correzione nell'altra lingua. Se la correzione non trova riscontro nei riassunti, Claude non la scarta: la segna *da ricontrollare* con una nota e il passaggio del riassunto, e la correzione resta applicata finché lo studente non la annulla. Il codice non si traduce e le risposte valgono per entrambe le lingue: lì Claude non serve.

### 3. Un termine si corregge ovunque, con conferma (scelta A)
Se la correzione riguarda un termine (es. «Big 0» al posto di «Big O»), l'app conta in quante schede della materia compare e propone di correggerle tutte insieme oppure solo quella. Il termine si sostituisce come parola intera, nelle due lingue, in schede, domande e concetti, mai dentro il codice. Le correzioni di termini entrano nel glossario personale della materia, che Claude Desktop riceve nelle generazioni successive (M5, PR 3).

### 4. Le correzioni si applicano sul dispositivo (scelta A)
Il server manda il feed com'è e, a parte, l'elenco delle correzioni dello studente (`GET /api/corrections`); la web app le applica mentre disegna le schede. Così:
- la copia del feed resta uguale per tutti e non va riscaricata dopo una correzione;
- si corregge anche senza rete: la correzione si vede subito e parte quando torna la connessione. L'id lo sceglie l'app (UUID), quindi un reinvio non crea doppioni.

L'applicazione è una funzione pura del dominio (`applyCorrections` di `@epicfeed/feed`):
- ogni intervento sostituisce un tratto di testo (`original` → `corrected`) in un campo e in una lingua; si cerca prima nello stesso elemento, poi negli elementi dello stesso tipo della lezione, così regge a una lezione rigenerata con id diversi;
- esito per correzione: `applied`, `already` (il feed dice già la cosa giusta) oppure `missing` (la frase non c'è più: *da ricontrollare*);
- le risposte giuste si ritrovano dal testo della domanda e dell'opzione.

### Server
- Tabella `feed_corrections` (migrazioni `0016` e `0017`, solo aggiunte): id scelto dall'app, studente, materia, lezione (`null` solo per i termini), tipo (`text`, `regenerate`, `answer`, `term`), correzione e lavoro di Claude in JSON (≤ 64 KB ciascuno), stato del lavoro di Claude (`pending`, `done`, `disputed`, `not_needed`). RLS: lo studente legge solo le proprie righe; scrive solo l'API, sempre filtrando per studente.
- API con la sessione: `GET /api/corrections`, `POST /api/corrections` (`201` se nuova, `200` se c'era già), `DELETE /api/corrections/:id`. `POST` e `DELETE` solo dalla stessa origine.
- API per Claude Desktop, con il token "genera": `GET /api/generation/corrections` (in attesa) e `POST /api/generation/corrections/:id/completion`. Vale il primo esito salvato.
- Limiti: 1.000 correzioni per studente, testi fino a 2.000 caratteri, 24 interventi per esito di Claude.
- Le correzioni non cambiano mai il feed condiviso né il glossario comune.

### Server MCP (PR 3)
Due strumenti nuovi, usati dal prompt di generazione: `segnalazioni_in_attesa` (le correzioni da completare, con l'elemento come lo vedeva lo studente) e `completa_segnalazione` (la correzione nell'altra lingua, la scheda rifatta, oppure la nota *da ricontrollare*). I nomi evitano `salva_correzione`, già usato dalla correzione degli esercizi d'esame. `segnala_errore`, per segnalare chiedendolo a Claude, arriva in M6 con l'assistente di studio.

## Alternative scartate
- **Evidenzia e riscrivi**: preciso, ma selezionare il testo si scontra con i gesti del feed (*tieni premuto* apre già le azioni).
- **Solo il motivo**: veloce, ma la scheda resta sbagliata finché non si apre Claude Desktop.
- **Solo la lingua che si vede** o **entrambe a mano**: l'errore resterebbe nella lingua dell'esame, oppure il doppio da scrivere sul telefono.
- **Feed già corretto dal server**: ogni correzione farebbe riscaricare la materia e, offline, non si vedrebbe subito.

## Conseguenze
- `@epicfeed/feed`: `domain/corrections.ts` (regole e applicazione), `application/corrections.ts` (`ReportError`, `ListCorrections`, `WithdrawCorrection`, `CompleteCorrection`), `contracts/corrections.ts`, `infrastructure/correction-repository.ts`.
- Web app: `features/feed/api/corrections-handler.ts` e `correction-generation-handler.ts`; interfaccia in PR 2 (foglio, correzioni applicate al feed, *Le mie segnalazioni* in Io).
- L'ADR 0006 prevedeva entità `Correction` e `Glossary` nel core: con l'ADR 0019 stanno nel pacchetto `feed`, e il glossario personale si ricava dalle correzioni di tipo `term` invece di una tabella a parte.
