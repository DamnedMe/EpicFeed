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

## In arrivo con le prossime parti di M6
- **Assistente nell'app** con una tua chiave API (Google Gemini, con un livello gratuito, Anthropic Claude od OpenAI): *Chiedi a Claude* dal feed risponde subito, anche sul telefono. La chiave resta sul dispositivo.
- Senza chiave, *Chiedi a Claude* mette la domanda in coda per Claude Desktop e la risposta torna in *Io › Le mie domande*.
