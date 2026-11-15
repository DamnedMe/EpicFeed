# ADR 0006: Sottotitoli come fonte secondaria e correzione dei testi

- Stato: accettata
- Data: 15/11/2026
- Decisa da: Damian

## Contesto
Le clip sono schede testuali animate, perché il player Vimeo non funziona fuori dal portale ([portal-recon.md](../portal-recon.md) §5). Per ogni parte video abbiamo tre fonti testuali:

| Fonte | Qualità | Cosa offre |
|---|---|---|
| Riassunto della parte video (`summary.it`, `summary.en`) | Testo scritto e curato, circa 2.000 caratteri | Concetti, definizioni, esempi |
| Riassunto di capitolo (`markdown`) | Testo curato, circa 10.000 caratteri, con esercizi e Q&A | Visione d'insieme, terminologia del corso |
| Sottotitoli VTT (IT ed EN) | Spesso **generati automaticamente** e imprecisi: termini tecnici storpiati (es. "use state" invece di `useState`), punteggiatura assente, frasi spezzate | **Tempi** al secondo, dettagli detti a voce che i riassunti non riportano |

Damian ha segnalato che i sottotitoli sono spesso sbagliati. Costruire le schede sui sottotitoli porterebbe errori nel feed, nei quiz e nel ripasso, cioè proprio nel materiale su cui si studia.

## Decisione

### 1. I riassunti sono la fonte principale
- Il testo delle schede (titolo, frase chiave, spiegazione, codice) nasce dai **riassunti della parte video** e dal **riassunto di capitolo**.
- **Quiz e concetti** si generano **solo dai riassunti**, mai dai sottotitoli: una domanda costruita su una frase trascritta male insegnerebbe una cosa sbagliata.
- I **sottotitoli** servono per:
  - i **tempi**: ogni scheda viene allineata al tratto di video in cui se ne parla, così "Guarda sul portale" apre la lezione al minuto giusto (es. 4:12);
  - qualche **dettaglio in più** detto a voce e assente nei riassunti (un esempio, un avvertimento), solo dopo la correzione del punto 2.
- L'allineamento scheda ↔ minuto usa il contenuto (concetti e parole chiave), non la frase esatta, quindi regge anche a sottotitoli imprecisi. Se l'allineamento è incerto, la scheda apre la parte video dall'inizio invece che a un minuto sbagliato.

### 2. Correzione dei passaggi presi dai sottotitoli
- Ogni passaggio tratto dai sottotitoli viene **corretto da Claude** (adapter `ContentGenerator`) confrontandolo con:
  - i riassunti della stessa parte video e del capitolo;
  - un **glossario dei termini tecnici** del corso.
- Il **glossario** si costruisce per materia (`Subject`) dai riassunti: nomi di API, funzioni, librerie e concetti scritti nella forma corretta (`useState`, `Array.prototype.map`, "albero binario di ricerca"). Si arricchisce con le correzioni accettate dall'utente (punto 3).
- Se Claude non riesce a confermare un dettaglio con i riassunti o il glossario, il dettaglio **viene scartato**. Meglio una scheda più corta che una scheda sbagliata.
- Ogni passaggio conserva la sua **provenienza** (`summary`, `chapter`, `subtitles`). I passaggi da sottotitoli sono riconoscibili nella scheda con un piccolo segno discreto.
- La correzione è un passo della generazione: avviene una volta per `ContentVersion`, insieme alle clip, ed è idempotente per `contentHash` come il resto ([architecture.md](../architecture.md) §7).

### 3. "Segnala errore" su ogni scheda
- Ogni scheda ha l'azione **Segnala errore**: l'utente evidenzia il testo sbagliato e scrive quello giusto, oppure segnala soltanto che qualcosa non torna.
- La correzione **vale anche le volte successive**:
  - sostituisce il testo della scheda per quell'utente, su tutti i suoi dispositivi;
  - se riguarda un termine tecnico, entra nel suo glossario per quella materia e viene usata nelle generazioni successive (nuove versioni della stessa lezione, lezioni nuove della stessa materia);
  - se Epicode aggiorna la lezione e nasce una nuova versione, la correzione viene riapplicata quando lo stesso passaggio è ancora presente.
- Una segnalazione senza testo corretto chiede a Claude di rigenerare la scheda dai soli riassunti.
- Le correzioni sono salvate in un'**area privata del server** (RLS: solo l'autore), come il feed dei libri ([ADR 0005](0005-sezione-libri.md)). Non stanno solo sul dispositivo come i risultati ([ADR 0003](0003-risultati-sul-dispositivo.md)), perché devono valere anche sul telefono e servire alla generazione, che gira sul server.
- In questa fase le correzioni **non modificano il catalogo condiviso**: valgono solo per chi le scrive.

## Alternative scartate
- **Sottotitoli come fonte principale**: tempi precisi, ma errori frequenti nel testo e quindi nei quiz.
- **Sottotitoli scartati del tutto**: niente errori, ma "Guarda sul portale" non saprebbe a che minuto aprire la lezione.
- **Ritrascrivere l'audio** con un modello di riconoscimento vocale: richiederebbe di scaricare l'audio dei video, escluso dai vincoli del progetto ([portal-recon.md](../portal-recon.md)).
- **Correzioni condivise subito tra utenti**: utili, ma un errore o un abuso finirebbe nel feed di tutti. Serve prima un meccanismo di verifica (punto aperto).

## Conseguenze
- Dominio: `Passage` e `Clip` hanno il campo `origin` (`summary | chapter | subtitles`) e un intervallo `startSec`/`endSec` opzionale. Nuove entità `Glossary` (per `Subject`, con `GlossaryTerm`) e `Correction` (utente, clip, versione, testo originale, testo corretto, data).
- Casi d'uso nuovi: `BuildGlossary`, `AlignClipsToSubtitles`, `ReportError`, `ApplyUserCorrections`. `GenerateClipsForVersion` riceve il glossario e le correzioni dell'utente.
- Porte nuove: `GlossaryRepository`, `CorrectionRepository`.
- Il prompt di generazione dichiara in modo esplicito la gerarchia delle fonti (riassunti > glossario > sottotitoli) e chiede di scartare ciò che non trova riscontro.
- Interfaccia: azione **Segnala errore** nel menu della scheda; segno di provenienza per i passaggi da sottotitoli.
- Strumento MCP nuovo `segnala_errore`, così la correzione si può fare anche chiedendo all'assistente di studio.

## Punti aperti
- Condividere le correzioni più segnalate nel catalogo comune, con una verifica (es. conferma da più utenti o controllo con i riassunti).
- Misurare su un capitolo reale quanto spesso l'allineamento ai minuti è incerto.
