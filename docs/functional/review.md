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
La sezione **Esame** (stesso tab, oppure `/ripasso#esame`) arriva con le prossime versioni di M4, tutta in inglese come all'esame ([ADR 0014](../decisions/0014-preparazione-esame.md)): quiz di modulo da 50 domande, esercizi d'esame con timer, editor e test del codice, correzione di Claude e simulazione scritta del colloquio di 20 minuti in forma di chat.

## Dove restano i dati
I progressi del ripasso (stato di ogni concetto, storico delle risposte, giorni di ripasso) stanno sul dispositivo, in IndexedDB. In navigazione privata alcuni browser non permettono di salvarli: la schermata lo dice e il ripasso non viene ricordato.

## Telefono e PC
I progressi si **sincronizzano** tra i dispositivi in forma **cifrata sul dispositivo** ([ADR 0018](../decisions/0018-sincronizzazione-cifrata-progressi.md)): la chiave nasce dalla password nel browser e il server ne conserva una copia che non può leggere.

- Si sincronizza da solo: all'apertura del feed e del Ripasso, poco dopo le risposte, alla fine di un ripasso e quando l'app va in secondo piano. In fondo alla home del Ripasso una riga dice *Progressi sincronizzati*, *in attesa della rete* o *non riuscita: riprovo più tardi*.
- Le risposte date su due dispositivi, anche offline, si sommano: nessuna si perde, e il ripasso di ogni concetto si ricalcola da tutte.
- All'accesso con la password la chiave si prepara da sola. Se manca (per esempio dopo l'accesso con il codice via email), il Ripasso mostra **Sincronizza telefono e PC**: si scrive la password e si tocca **Sblocca**.
- Se la password cambia su un dispositivo, sugli altri compare **La password è cambiata**: si scrive quella nuova e i progressi si uniscono. Il dispositivo su cui si è cambiata la password rifà la copia sul server con i suoi progressi.
- Con un altro account sullo stesso browser i progressi del primo spariscono dal dispositivo, invece di mescolarsi.
- Punti, salvati, posizione nel feed e preferenze restano sul dispositivo, come prima.
