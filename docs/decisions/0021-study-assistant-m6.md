# ADR 0021: Assistente di studio (M6)

- Stato: accettata
- Data: 28/11/2026
- Decisa da: Damian (scelte una alla volta sul prototipo, 25–28/11)
- Completa: [ADR 0007](0007-generation-via-mcp-and-login.md) (Claude Desktop via MCP), [ADR 0018](0018-encrypted-progress-sync.md) (progressi cifrati), [ADR 0020](0020-report-error-m5.md) (Segnala errore)

## Contesto
Fino a M5 Claude Desktop serve a generare: legge le lezioni importate e scrive il feed. M6 lo trasforma in un compagno di studio che conosce le lezioni dello studente, sa su cosa sbaglia, lo interroga e corregge le schede quando glielo chiede. Dal feed, il gesto *Chiedi a Claude* (presente e disattivato da M3) deve portare una domanda su una scheda.

Vincoli:
- il server MCP gira solo sul PC; sul telefono non c'è;
- i progressi del ripasso stanno sul dispositivo e sul server solo cifrati con una chiave nata dalla password (ADR 0018): il server non li legge;
- le correzioni sono personali e si applicano sul dispositivo (ADR 0020).

## Decisione

### Già fissato con la proposta
- **Cerca lezione**: Claude cerca nelle lezioni dello studente e risponde con lezione, scheda, minuto del video e link al portale.
- **Un solo token**: il token "genera" di Claude Desktop vale anche per gli strumenti di studio. Legge solo le lezioni che lo studente possiede.
- **Stesso pacchetto**: gli strumenti si aggiungono a `epicfeed.mcpb`.
- Claude risponde nella lingua in cui si scrive; in inglese, la lingua dell'esame, quando lo si chiede.

### 0. L'assistente risponde nell'app con una chiave propria, e in Claude Desktop (scelta B)
Proposta di Damian (27/11): non dipendere solo da Claude Desktop. Lo studente può inserire in *Io › Assistente* una propria chiave API di **Google Gemini**, **Anthropic Claude** od **OpenAI**, con accanto il link *Crea una chiave* alla pagina giusta del fornitore (per Gemini Google AI Studio, con l'account Google). Con la chiave l'assistente risponde subito nell'app, anche sul telefono; senza, tutto funziona come con Claude Desktop soltanto. La generazione delle lezioni resta su Claude Desktop.

- **Dove sta la chiave**: solo sul dispositivo (IndexedDB). Le richieste partono dal browser direttamente verso il fornitore: il server di EpicFeed non la riceve e non la salva. Per non riscriverla su ogni dispositivo può viaggiare nella copia cifrata dei progressi, che il server non legge.
- **Rischi**: chi ha il telefono sbloccato, o uno script estraneo nella pagina, potrebbe leggerla. Si mitiga con una CSP stretta e nessuno script di terzi, il pulsante *Rimuovi chiave* e il consiglio di impostare un tetto di spesa sul sito del fornitore.
- **Cosa riceve il fornitore**: la domanda, la scheda e il riassunto della parte, i concetti deboli quando servono. Mai email, password o token di EpicFeed.
- **Costi**: Gemini ha un livello gratuito con limiti al minuto e al giorno, di solito sufficiente per una persona; sul gratuito Google può usare le richieste per migliorare i suoi modelli, e l'app lo dice. Claude e OpenAI si pagano a consumo, una frazione di centesimo a domanda con i modelli veloci. L'app mostra quante richieste si sono fatte nel giorno.

### 1. Senza chiave, la domanda va in coda per Claude Desktop (scelta A)
*Chiedi a Claude* senza chiave salva la domanda, con la scheda e la frase, in una coda privata sul server. Su Claude Desktop si chiede «rispondi alle mie domande di EpicFeed»: Claude risponde con le fonti della lezione e la risposta torna nell'app, in *Io › Le mie domande*, dove può diventare una scheda personale.

### 2. Claude Desktop decifra i progressi sul PC (scelta A)
Per conoscere i concetti deboli, il server MCP scarica la copia cifrata dei progressi e la apre sul PC con la stessa chiave del browser (PBKDF2 sulla password con il sale dall'email, poi HKDF → AES-GCM). Lo studente scrive una volta email e password di EpicFeed nelle impostazioni dell'estensione in Claude Desktop: la password è un campo protetto, nel portachiavi del sistema, e non viene mai inviata. Il server di EpicFeed continua a non poter leggere i progressi. Se la password cambia nell'app, va aggiornata anche lì: lo strumento lo dice.

Scartate: un riepilogo dei concetti deboli in chiaro sul server (rompe la promessa dell'ADR 0018) e il copia e incolla dall'app (un passaggio a mano ogni volta, e i quiz in chat non potrebbero tornare nel ripasso).

### 3. Quiz al volo come scheda interattiva in chat (scelta C)
«Interrogami sui miei concetti deboli»: Claude usa le domande del feed e d'esame che esistono già e, se servono, ne scrive di nuove sulla lezione. Le domande compaiono in chat come una scheda da toccare con i colori di EpicFeed (un'app MCP, una risorsa `ui://` che Claude Desktop mostra nella conversazione); dove l'interfaccia non c'è, il quiz continua a testo. Le risposte **contano nel ripasso**: entrano nello storico cifrato con la stessa chiave della scelta 2 e spostano le date come quelle dell'app.

### 4. Segnala errore: Claude mostra la correzione, poi salva (scelta A)
Lo studente dice in chat che una scheda è sbagliata. Claude la trova con *cerca lezione*, la verifica e prepara la correzione nelle due lingue; lo strumento `segnala_errore` con `confirmed: false` restituisce l'anteprima, che Claude mostra. Solo dopo il sì dello studente lo stesso strumento con `confirmed: true` la salva. È una correzione dello studente come quelle di M5: si vede nel feed, compare in *Le mie segnalazioni* e si annulla da lì. Se la correzione dello studente contraddice quello che Claude sa della materia, Claude lo dice prima di proporla.

## Come si realizza (4 PR)
1. **Ricerca, concetti deboli, segnala errore** in Claude Desktop: API con il token "genera" per materie e feed (`GET /api/generation/study/subjects`, `/:id`), copia cifrata dei progressi (`GET /api/generation/progress`) e correzioni chieste a Claude (`POST /api/generation/corrections`); cifratura dei progressi spostata in `@epicfeed/review/crypto` per usarla sia nel browser sia nel server MCP; strumenti `cerca_lezione`, `concetti_deboli`, `segnala_errore` e prompt `studia_con_epicfeed` ([generation.md](../technical/generation.md#assistente-di-studio-m6)).
2. **Quiz al volo** interattivo e scrittura delle risposte nello storico cifrato: `PUT /api/generation/progress` con il token "genera", strumenti `quiz_al_volo` (app MCP con la risorsa `ui://epicfeed/quiz.html`) e `registra_risposte`. Le risposte entrano con `source: 'quiz'`, già noto alle app esistenti.
3. **Assistente nell'app** con la chiave dello studente: *Io › Assistente*, *Chiedi a Claude* dal feed. Nuovo pacchetto `@epicfeed/assistant` (fornitori, contesto, richieste HTTP, nessuna chiamata); il modello si sceglie tra quelli che la chiave elenca, non è scritto nel codice. La sincronizzazione della chiave nella copia cifrata resta per dopo.
4. **Domande in coda** senza chiave, *Le mie domande* e chiusura di M6.

## Conseguenze
- Il server MCP tiene in memoria, oltre al token, email e password se lo studente le imposta; i progressi in chiaro esistono solo nel processo sul PC.
- La ricerca gira sul PC sul feed della materia, scaricato una volta e tenuto in memoria qualche minuto: nessun indice di ricerca sul server.
- Le correzioni da Claude non hanno bisogno di completamento: arrivano già nelle due lingue.
- La chiave API dello studente non passa mai dal server di EpicFeed: i costi e i limiti sono quelli del suo account presso il fornitore.
