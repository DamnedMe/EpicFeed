# Ripasso ed Esame (M4)

Il tab **Ripasso** della barra in basso riporta i concetti che stai dimenticando, prima che li dimentichi. In alto ha due sezioni: **Ripasso** ed **Esame**. Decisioni e motivi nell'[ADR 0017](../decisions/0017-ripasso-ed-esame-m4.md); come funziona dentro in [web.md](../technical/web.md#ripasso-m4).

## Come si riempie
Ogni risposta alle domande del **feed** entra nel ripasso del suo **concetto** (per esempio *Stack*, *Queue operations*). Lo stesso concetto può comparire in più lezioni: il ripasso è uno solo. Conta anche la lingua in cui rispondi solo per lo storico: il ripasso è lo stesso in italiano e in inglese.

- Risposta **sbagliata**: il concetto torna presto (dopo pochi minuti, poi di nuovo in giornata finché non lo sai).
- Risposta **giusta**: il concetto torna sempre più tardi (un giorno, alcuni giorni, settimane), come prevede l'algoritmo FSRS.

## La home del Ripasso
- Il numero grande: **concetti da ripassare oggi** e il pulsante **Inizia il ripasso** (circa 5 minuti, al massimo 10 concetti).
- Se oggi non scade niente: **Ripassa in anticipo**, con i concetti già visti che ricordi meno.
- La **serie di giorni**: quanti giorni di fila hai completato un ripasso. Si interrompe se salti un giorno.
- **Concetti deboli**: quelli che hai sbagliato almeno una volta e non sono ancora stabili, con il numero di errori.
- **Per modulo**: una barra per capitolo del corso. La parte piena sono i concetti **stabili** (li ricordi da almeno una settimana), la parte chiara quelli visti almeno una volta.

Prima di aver risposto a qualche domanda del feed il Ripasso è vuoto e lo dice: il ripasso non anticipa lo studio, quindi un concetto che non hai ancora incontrato non entra.

## La sessione a battute
Per ogni concetto ci sono due battute, come nelle storie del feed:
1. **Richiamo**: nome e descrizione del concetto, con una parola coperta. Prova a ricordarla e toccala per scoprirla (+2 punti); un altro tocco porta alla domanda.
2. **Domanda** sul concetto, presa tra quelle delle sue lezioni (ogni volta una diversa): vero/falso con lo swipe o scelta multipla. Spiegazione subito, poi **Avanti**.

In alto: la **×** per uscire (le risposte già date restano), quanti concetti mancano, i punti, la serie di risposte giuste e il pulsante **IT/EN**. Il richiamo parte nella lingua di studio, la domanda nella lingua delle domande (inglese di base), come nel feed. Punti e serie sono gli stessi del feed e si sommano ai totali di *Io*.

Alla fine compare il riepilogo: concetti ripassati, risposte giuste, punti e la serie di giorni aggiornata.

## Esame
La sezione **Esame** (stesso tab, oppure `/ripasso#esame`) è tutta in inglese, come all'esame ([ADR 0014](../decisions/0014-preparazione-esame.md)); l'interfaccia resta in italiano. Ogni risposta entra nel ripasso dei suoi concetti, come quelle del feed. In alto un avviso dice per quante lezioni ci sono già le domande d'esame e come prepararle per le altre.

### Quiz di modulo
Come l'autovalutazione ufficiale di fine modulo: **50 domande a scelta multipla**, estratte a caso ogni volta tra quelle del feed delle lezioni del modulo e le domande d'esame in più (circa 90 per modulo). Se un modulo ne ha meno di 50 il quiz le usa tutte e lo dice. Dopo ogni risposta si vede la spiegazione; alla fine il punteggio, le risposte giuste e i concetti da rivedere, che nel ripasso tornano prima.

### Esercizi d'esame
L'elenco mostra prima la **banca degli esercizi** (ogni esercizio ufficiale con le sue 2 varianti), poi le **domande aperte delle lezioni**; accanto a quelli già fatti c'è l'ultimo punteggio. Aprendo un esercizio:
- **Timer** facoltativo: si sceglie 10, 15, 20 o 30 minuti; a fine tempo avvisa e si può continuare.
- **Suggerimenti** uno alla volta, nascosti finché non li chiedi, in italiano o in inglese (pulsante IT/EN, indipendente dalla lingua di studio).
- **Risposta**: per il codice un editor Python con i numeri di riga e l'indentazione automatica, che parte dalla firma della funzione; per le spiegazioni un'area di testo. La bozza resta sul dispositivo: si può uscire e riprendere.
- **Esegui i test** (esercizi di codice): Python gira nel browser e mostra quali esempi passano, con il risultato atteso e quello ottenuto e l'eventuale `print`. La prima volta scarica circa 10 MB, poi funziona anche offline. Un test che dura più di 5 secondi (per esempio un ciclo infinito) si ferma. I test controllano gli esempi, non la qualità della soluzione.
- **Mostra soluzione e griglia**: la soluzione modello e i criteri di correzione; per ogni criterio si segnano i punti presi e si salva il punteggio. Sotto il 50% il concetto torna presto nel ripasso, tra il 50% e l'80% è "difficile", sopra è "bene". Dopo il salvataggio compare la domanda di approfondimento, come al colloquio.

La correzione di Claude e la simulazione del colloquio di 20 minuti in chat arrivano con la prossima versione.

### Preparare le domande d'esame
Le domande della sezione si preparano con Claude Desktop, come il feed: dopo aver generato le lezioni si chiede **"genera le domande d'esame di EpicFeed"**. Per ogni lezione Claude aggiunge, in inglese, **10 domande a scelta multipla** nuove (non ripete quelle del feed) e **1 o 2 domande aperte** come al colloquio: scrivere una funzione Python con i suoi test, spiegare un concetto o analizzare un codice, ognuna con suggerimenti in italiano e in inglese, soluzione modello, griglia di correzione e una domanda di approfondimento. Le schede e le domande del feed restano come sono. Se una lezione viene rigenerata, le sue domande d'esame vanno rifatte.

### Banca degli esercizi
Gli esercizi d'esame del corso (il materiale *Exam Prep* che sta nello zip delle slide, 14 esercizi nel corso DSA) diventano la **banca degli esercizi**: si chiede a Claude Desktop di crearla indicando lo zip. Claude trascrive ogni esercizio ufficiale con i suoi esempi e ne scrive **2 varianti** sullo stesso argomento, ognuno con suggerimenti, soluzione modello e griglia. Il PDF resta sul PC e la banca è **personale**: la vede solo chi l'ha creata.

## Dove restano i dati
I progressi del ripasso (stato di ogni concetto, storico delle risposte, giorni di ripasso) stanno sul dispositivo, in IndexedDB. In navigazione privata alcuni browser non permettono di salvarli: la schermata lo dice e il ripasso non viene ricordato. Anche le bozze delle risposte agli esercizi, gli ultimi punteggi e la lingua dei suggerimenti restano sul dispositivo; le domande d'esame se ne tiene una copia per usarle offline.

## Telefono e PC
I progressi si **sincronizzano** tra i dispositivi in forma **cifrata sul dispositivo** ([ADR 0018](../decisions/0018-sincronizzazione-cifrata-progressi.md)): la chiave nasce dalla password nel browser e il server ne conserva una copia che non può leggere.

- Si sincronizza da solo: all'apertura del feed e del Ripasso, poco dopo le risposte, alla fine di un ripasso e quando l'app va in secondo piano. In fondo alla home del Ripasso una riga dice *Progressi sincronizzati*, *in attesa della rete* o *non riuscita: riprovo più tardi*.
- Le risposte date su due dispositivi, anche offline, si sommano: nessuna si perde, e il ripasso di ogni concetto si ricalcola da tutte.
- All'accesso con la password la chiave si prepara da sola. Se manca (per esempio dopo l'accesso con il codice via email), il Ripasso mostra **Sincronizza telefono e PC**: si scrive la password e si tocca **Sblocca**.
- Se la password cambia su un dispositivo, sugli altri compare **La password è cambiata**: si scrive quella nuova e i progressi si uniscono. Il dispositivo su cui si è cambiata la password rifà la copia sul server con i suoi progressi.
- Con un altro account sullo stesso browser i progressi del primo spariscono dal dispositivo, invece di mescolarsi.
- Punti, salvati, posizione nel feed e preferenze restano sul dispositivo, come prima.
