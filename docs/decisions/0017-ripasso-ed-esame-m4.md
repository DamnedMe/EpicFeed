# ADR 0017: Ripasso dei concetti ed Esame nel tab Ripasso (M4): scelte di Damian e dettagli tecnici

- Stato: accettata
- Data: 23/11/2026
- Decisa da: Damian, una scelta alla volta il 23/11/2026 sera, sul documento *EpicFeed M4: ripasso e preparazione esame* e sul prototipo da telefono; Claude per i dettagli tecnici
- Completa: [ADR 0014](0014-preparazione-esame.md) (cosa contiene la preparazione all'esame). Modifica: [ADR 0003](0003-risultati-sul-dispositivo.md) (punto 6)

## Contesto
M4 chiude l'MVP: ripasso giornaliero dei concetti deboli e sezione Esame in inglese. Il *cosa* dell'esame era già deciso nell'ADR 0014; restavano da scegliere il *come* e il ripasso. Dati misurati il 23/11/2026 sul corso DSA: 40 domande per modulo (8 per lezione × 5 lezioni), 139 concetti nei 6 moduli più 4 dell'onboarding, 14 esercizi in *Exam Prep-1.pdf* (9 di codice, 5 di spiegazione o analisi). Le domande del feed fino a M3 non lasciavano traccia.

## Decisione

### Le scelte di Damian
| # | Scelta | Decisa |
|---|---|---|
| 1 | Dove sta l'Esame | **Dentro il tab Ripasso**, con le sezioni *Ripasso* ed *Esame* in alto; la barra in basso resta Feed · Ripasso · Libri · Io |
| 2 | Formato del ripasso | **Richiamo + domanda**: per ogni concetto una battuta con la parola da indovinare, poi una domanda sul concetto; serie di giorni consecutivi |
| 3 | Quiz di modulo da 50 | **10 domande in più per lezione** con lo strumento MCP `genera_domande_esame`, insieme alle domande aperte del punto E dell'ADR 0014, salvate in un pacchetto separato dal feed; il quiz pesca 50 domande su 90 |
| 4 | Editor del codice | **CodeMirror 6**, caricato solo al primo esercizio di codice |
| 5 | Pyodide | **Servito dal nostro dominio** (copiato al build dal pacchetto npm), niente CDN |
| 6 | Progressi tra telefono e PC | **Sincronizzazione già in M4**, cifrata sul dispositivo con una chiave ricavata dalla password: il server non può leggere i progressi |
| 7 | Simulazione del colloquio | **In chat**: domande e risposte una sotto l'altra |
| 8 | Varianti degli esercizi | **2 per esercizio ufficiale** (42 esercizi in tutto) |

### Ripasso: dettagli tecnici (PR 1)
- **Un ripasso per concetto, non per domanda.** L'unità è il concetto della materia (`materia:chiave`): la stessa chiave in più lezioni (per esempio `queue-operations` compare in 3) è lo stesso concetto, con un solo ripasso. Ogni risposta (feed, ripasso, e più avanti quiz di modulo, esercizi e colloquio) aggiorna il concetto, in qualunque lingua; lo storico ricorda la lingua usata ([ADR 0011](0011-studio-bilingue-it-en.md)).
- **FSRS con `ts-fsrs` 5.4.2** (MIT, nessuna dipendenza) nel core, con i parametri predefiniti e **senza variazione casuale delle scadenze**: lo stesso storico dà le stesse date su ogni dispositivo, cosa che serve alla sincronizzazione. La versione 6 è scartata per ora: appena uscita e con una dipendenza nuova.
- **Valutazioni**: sbagliata = *di nuovo*, giusta = *bene*, giusta con un suggerimento = *difficile*; per gli esercizi con la griglia le soglie dell'ADR 0014 (sotto 50% *di nuovo*, fino all'80% *difficile*, sopra *bene*). La parola scoperta nella battuta di richiamo **non** conta come aiuto: nel ripasso si scopre sempre, è il richiamo stesso.
- **Sessione**: fino a 10 concetti (circa 5 minuti), prima gli scaduti dal più in ritardo; se non scade niente si propone *Ripassa in anticipo* con i concetti già visti che si ricordano meno (probabilità di ricordo FSRS). Un concetto mai incontrato nel feed non entra: il ripasso non anticipa lo studio. Per ogni concetto la domanda è la successiva all'ultima fatta, a giro, tra tutte quelle della materia su quel concetto.
- **Stabile** = in fase di ripasso con stabilità di almeno 7 giorni: riempie le barre per modulo. **Debole** = almeno un errore e non ancora stabile.
- **Dove stanno i dati**: IndexedDB del dispositivo (`epicfeed-progress`: stati dei concetti, storico delle risposte, serie di giorni), dietro la porta `ProgressStore` del core. Stato e risposta si scrivono nella stessa transazione. Se IndexedDB non c'è (navigazione privata su alcuni browser) lo studio continua e la schermata lo dice.
- Una risposta appena sbagliata torna dopo i passi di apprendimento FSRS (1 e 10 minuti), non subito.

### Sincronizzazione (PR 2)
I progressi escono dal dispositivo solo cifrati: la chiave si ricava dalla password al momento dell'accesso e resta sul dispositivo; il server conserva dati che non può leggere, con permessi per utente. Se la password cambia, la copia sul server si rifà dal primo dispositivo che si apre (i dati locali restano). Dettagli e protocollo nell'[ADR 0018](0018-sincronizzazione-cifrata-progressi.md).

### Pacchetti d'esame: dettagli tecnici (PR 3)
- Il pacchetto **non cambia il contratto del feed** (diversamente dal §6 dell'ADR 0014, che prevedeva un campo `examQuestions` nel feed): sta nella tabella `lesson_exam_packs`, uno per feed, con domande a scelta multipla e domande aperte insieme. Così i 31 feed già generati restano come sono e il pacchetto si aggiunge con un passaggio separato.
- Claude scrive il pacchetto dal **feed corrente** della lezione in inglese, non dalle fonti: le domande restano su ciò che le schede insegnano e usano le stesse chiavi dei concetti, quindi ogni risposta aggiorna lo stesso ripasso.
- Strumenti MCP `lezioni_per_esame`, `leggi_lezione_esame`, `salva_domande_esame` e prompt `genera_domande_esame`; regole nel core (`checkExamPack`), ripetute dal server MCP e dall'API. Dettagli in [generation.md](../technical/generation.md#pacchetti-desame-m4).
- La **banca degli esercizi** dal materiale *Exam Prep* (§2 dell'ADR 0014, 2 varianti per esercizio) è in una PR a parte, con una semplificazione: il materiale non viene agganciato al corso sul server. `leggi_materiale_esame` lo legge dallo zip sul PC e a EpicFeed arriva solo la banca scritta da Claude, **privata** di chi la genera (tabella `subject_exam_banks`), perché senza il materiale sul server non c'è una prova di possesso da condividere. Dettagli in [generation.md](../technical/generation.md#banca-degli-esercizi-m4).

## Alternative scartate
- **Esame come quinta voce della barra o dentro *Io***: proposte, Damian ha preferito tenerlo dentro Ripasso.
- **Ripasso solo con domande o elenco stile quiz**: più veloce ma senza il richiamo del concetto.
- **Quiz con le sole 40 domande** già viste nel feed, o **rigenerare i 31 feed** (cambierebbe schede già viste e salvate).
- **Campo di testo semplice** per il codice; **Pyodide da CDN** (servizio esterno e CSP più larga).
- **Backup a file** al posto della sincronizzazione (proposto da Claude per non toccare l'ADR 0003 in M4): Damian vuole la sincronizzazione subito. **Cifratura solo di Supabase**: più semplice, ma chi amministra il database potrebbe leggere i progressi.
- **Colloquio a una domanda per schermata**: Damian preferisce la chat, con le risposte date visibili.
- **4 varianti per esercizio**: generazione circa doppia; si possono aggiungere dopo.

## Conseguenze
- M4 passa a sei PR: 1 ripasso; 2 sincronizzazione cifrata; 3 contenuti d'esame e strumenti MCP; 4 sezione Esame con CodeMirror e Pyodide; 5 correzione di Claude e colloquio in chat; 6 budget Lighthouse e chiusura dell'MVP.
- L'ADR 0003 cambia per i progressi di studio: restano sul dispositivo e una **copia cifrata end-to-end** va nell'area privata del server. Le altre regole dell'ADR 0003 restano.
- Con *Accedi con Google* (M8) non c'è una password da cui ricavare la chiave: andrà deciso allora come derivarla (per esempio una frase di recupero).
