# Assistente di studio (M6)

Claude diventa un compagno di studio che conosce le tue lezioni. Decisioni: [ADR 0021](../decisions/0021-study-assistant-m6.md).

## In Claude Desktop
Serve l'estensione EpicFeed con il token della pagina **Claude** dell'app (la stessa della generazione). Si chiede in parole semplici, in italiano o in inglese:

- **Cerca lezione**: «dove si parla di AVL nelle mie lezioni?». Claude risponde dalle tue schede, con la lezione, la scheda e, se c'è, il minuto del video e il link per aprirlo sul portale. Se l'argomento non è tra le tue lezioni, lo dice.
- **Concetti deboli**: «su cosa vado peggio in DSA?». Claude elenca i concetti su cui sbagli di più e che non hai ancora consolidato, con gli errori, quanto è probabile che te li ricordi e se sono da ripassare oggi. Sono gli stessi del Ripasso dell'app.
- **Segnala errore**: «la scheda sugli heap dice che il sift-down è O(n), è sbagliato». Claude trova la scheda, ti mostra la frase prima e dopo in italiano e in inglese e la corregge solo dopo il tuo sì. Se pensa che la correzione sia sbagliata te lo dice. La correzione vale solo per te, si vede nel feed e la ritrovi in *Io › Le mie segnalazioni*, dove puoi annullarla. Funziona anche per la risposta giusta di una domanda e per un termine scritto male in tutta la materia.
- **Quiz al volo**: «interrogami sui miei concetti deboli» o «fammi 5 domande sugli AVL in inglese». Nella chat compare una scheda con i colori di EpicFeed: una domanda alla volta, tocchi la risposta e vedi subito se è giusta e perché. In alto passi da italiano a inglese. Alla fine vedi il punteggio e i concetti da ripassare, e con un tocco chiedi a Claude di spiegarteli. Le risposte **contano nel ripasso** come quelle dell'app: le ritrovi alla prossima sincronizzazione. Se la scheda non compare, Claude ti fa le domande a testo.
- Il prompt **Studia con EpicFeed** riparte dai concetti deboli e propone un argomento da ripassare insieme.

### Email e password, facoltative
Per i concetti deboli e per portare nel ripasso le risposte dei quiz Claude deve leggere i tuoi progressi, che sul server sono cifrati con una chiave nata dalla password. In Claude Desktop, *Impostazioni › Estensioni › EpicFeed › Configura*, scrivi email e password di EpicFeed: la password sta nel portachiavi del sistema, non viene mai inviata e serve solo ad aprire la copia dei progressi sul PC. EpicFeed continua a non poterli leggere. Se cambi la password nell'app, aggiornala anche lì. Senza, la ricerca, il quiz e le correzioni funzionano lo stesso, ma le risposte del quiz non entrano nel ripasso.

I progressi arrivano dall'ultima sincronizzazione: apri il Ripasso nell'app con la password se Claude dice che non ci sono.

## Nell'app, con una tua chiave API
In *Io › Assistente* scegli il fornitore e incolla una tua chiave:

- **Google Gemini**: gratuita, con limiti al minuto e al giorno che di solito bastano per studiare. Il link *Crea una chiave gratuita su Google AI Studio* apre la pagina giusta: accedi con l'account Google, tocca *Create API key* e copia la chiave. Sul livello gratuito Google può usare le richieste per migliorare i suoi modelli, quindi non scrivere dati personali nelle domande.
- **Anthropic Claude** e **OpenAI**: a consumo, con un credito caricato sul loro sito; una domanda costa una frazione di centesimo. Conviene impostare un tetto di spesa.

*Prova e salva* controlla la chiave e sceglie il modello più veloce ed economico, che puoi cambiare. La chiave resta solo su questo dispositivo e va direttamente al fornitore: EpicFeed non la vede. *Rimuovi chiave* la cancella. La pagina mostra quante richieste hai fatto oggi.

Poi, nel feed, tieni premuto su una scheda o una domanda e scegli **Chiedi a Claude**: scrivi la domanda o tocca *Spiegamelo più semplice*, *Fammi un esempio*, *In inglese* o *Fammi una domanda*. La risposta arriva subito e parte dalla scheda e dai concetti della lezione. Al fornitore vanno solo la domanda, la scheda e i concetti, mai email o password. La conversazione resta nel foglio e si chiude con lui.

## Senza chiave: le domande per Claude Desktop
Senza una chiave, *Chiedi a Claude* mette la domanda in coda, con la scheda su cui l'hai fatta. Sul PC, in Claude Desktop, chiedi «rispondi alle mie domande di EpicFeed» (o usa il prompt **Rispondi alle domande**): Claude risponde partendo dalle tue lezioni, nella lingua della domanda. Le risposte arrivano in **Io › Le mie domande**, dove vedi le domande in attesa e quelle con risposta e le cancelli quando non servono più. Puoi avere fino a 30 domande in attesa.
