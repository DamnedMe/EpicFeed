# Documentazione funzionale: panoramica

Il nome dell'app, nella web app e nell'estensione, è **EpicFeed** (la repository e i pacchetti restano `study-feed`).

Cosa fa l'app dal punto di vista dello studente. Ogni funzione nuova aggiunge o aggiorna una sezione qui.

## Accedere
L'app è privata: entra solo chi ha un indirizzo email abilitato. La prima volta si inserisce l'email e si riceve un **codice** da scrivere nell'app, poi si sceglie una **password** (almeno 12 caratteri). Dalle volte successive si entra con email e password. Se si dimentica la password, si richiede di nuovo il codice.

## Collegare l'estensione
Una volta sola, sul PC: si installa l'estensione EpicFeed in Chrome (nel profilo in cui si usa Epicode), si apre la pagina **Estensione** dell'app e si preme **Collega**. L'estensione riceve un permesso che vale 30 giorni e serve solo a importare lezioni; dalla stessa pagina si vedono i collegamenti attivi e si possono **revocare**. La password di Epicode non viene mai chiesta né salvata.

## Importare una lezione
Lo studente apre una lezione nel portale Epicode come sempre e preme **Importa** nell'estensione. L'estensione mostra un'anteprima (titolo, capitolo, quante parti video e di testo verranno importate) e, con un clic, importa la **lezione intera**: i riassunti di ogni video, il riassunto del capitolo e i **sottotitoli di tutti i video**. Per leggere i sottotitoli apre per un attimo, nascosto, il player di ogni video senza avviarlo, uno dopo l'altro: per una lezione con 5 video servono una decina di secondi, e l'avanzamento si vede nell'estensione. Nessun video risulta guardato per effetto dell'import e sul portale non viene modificato nulla.

Alla fine l'estensione dice com'è andata: quante parti sono nuove per lo studente, oppure "Era già tutto importato: nessun duplicato", ed eventualmente per quanti video non ha trovato i sottotitoli; un link apre Le mie lezioni. Gli elementi senza testo da studiare (slide, quiz, questionari) non vengono importati, e l'anteprima dice quanti sono; le slide arrivano a parte, dallo zip ufficiale del corso (vedi *Slide delle lezioni*). Se un altro studente l'aveva già importata, non viene duplicata. Ognuno vede solo le lezioni che ha importato dal proprio account: anche corsi, materie e capitoli compaiono solo se contengono almeno una parte importata. Se Epicode aggiorna una lezione, il nuovo import crea una nuova versione datata e quella vecchia resta consultabile. Importare di nuovo la stessa lezione non crea doppioni.

### Importare un capitolo o il corso intero
Sotto l'anteprima l'estensione propone anche **Importa il capitolo** (tutte le lezioni del capitolo della lezione aperta) e **Importa tutto il corso**, con il numero di lezioni e la durata stimata: un capitolo richiede 3–4 minuti, un corso di 30 lezioni circa 20 minuti. Le lezioni vengono importate una alla volta, con pause casuali tra una lettura e l'altra, per restare su un ritmo simile a quello di uno studente che consulta il portale: niente raffiche di richieste, nessun video riprodotto, nessuna lezione aperta o segnata come vista.

Durante l'import basta tenere aperta la scheda del portale; il riquadro dell'estensione si può chiudere e, riaperto, mostra a che lezione è arrivato, le pause in corso e il pulsante **Interrompi**. Alla fine dice quante lezioni ha importato, quante erano nuove, quali non è riuscito a importare e perché. Le lezioni già importate da quel browser vengono saltate, così un import interrotto riprende da dove si era fermato; si possono reimportare tutte con l'apposita casella. Le lezioni senza nulla da studiare (solo quiz o slide) e i contenuti non ancora aperti dal portale non vengono toccati.

## Slide delle lezioni
Disponibile dalla generazione con Claude Desktop (M2). Una volta per corso, nella pagina **Course downloads** del portale si preme **Download all PDFs** e si salva lo zip sul PC. Poi si chiede a Claude Desktop di importare le slide indicando lo zip: Claude abbina ogni presentazione alla sua lezione (che va importata prima con l'estensione) e dice quali file non è riuscito ad abbinare. I PDF restano sul PC: a EpicFeed arriva solo il testo delle slide. Durante la generazione Claude guarda anche i diagrammi e li usa per spiegare i concetti nelle schede. Se il corso aggiunge lezioni, si riscarica lo zip e si ripete: le slide già importate non si duplicano, e le lezioni con slide nuove o cambiate tornano tra quelle da generare. Per un corso intero l'import richiede qualche minuto e Claude lo fa a blocchi da circa 40 secondi, mostrando l'avanzamento. Conviene lasciare lo zip dove si trova: durante la generazione Claude rilegge da lì i diagrammi (al massimo 8 per lezione); se lo zip è stato spostato, genera dal solo testo e lo segnala.

## Le mie lezioni
Nell'app, **Le mie lezioni** elenca le lezioni importate raggruppate per materia e capitolo, con il numero di parti, quante hanno i sottotitoli e lo stato delle schede (da generare, in generazione, pronte). Le schede le genera Claude Desktop dalla milestone successiva.

## Generare schede e quiz (in arrivo con M2)
Dal PC, in Claude Desktop, si chiede per esempio "genera le lezioni nuove". Claude legge ogni lezione importata (riassunti in italiano e in inglese, testi, slide), crea schede, quiz e concetti nelle due lingue e li salva in EpicFeed; da quel momento la lezione è studiabile anche dal telefono. Per ogni lezione ci sono di solito 8–12 schede di quattro tipi (concetto, passaggi, confronto, codice), 6–8 domande a scelta multipla o vero/falso e 3–6 concetti per il ripasso. Prima di salvare, EpicFeed controlla che ogni scheda e domanda sia completa nelle due lingue e coerente; se qualcosa non va, Claude lo corregge da solo. Per collegare Claude Desktop, nella pagina **Claude** dell'app si crea un token (valido 90 giorni, si vede una volta sola) e lo si incolla nelle impostazioni dell'estensione EpicFeed di Claude Desktop (si installa una volta trascinando il file `epicfeed.mcpb` in Impostazioni › Estensioni); la stessa pagina mostra i token attivi, avvisa quando uno sta per scadere e permette di revocarli. Il minuto del video di ogni scheda lo calcola l'app dai sottotitoli; se non è sicuro, "Guarda sul portale" apre la parte dall'inizio ([ADR 0013](../decisions/0013-generazione-m2-dettagli.md)).

## Feed
Nella barra in basso: Feed, Libri, Ripasso, Io.

Clip verticali di un concetto ciascuna, ordinate per capitolo o in modalità "Per te". Su ogni clip ci sono quattro azioni: **Salva**, **Chiedi** (domanda all'assistente), **Quiz** rapido e **Fonte** ("Guarda sul portale": apre la lezione al minuto della clip). Le clip sono schede testuali animate, perché i video Epicode non si possono riprodurre fuori dal portale. Una barra in alto mostra l'avanzamento nel capitolo.

### Da dove viene il testo delle schede
Il testo nasce dai riassunti scritti di ogni parte video e del capitolo. I sottotitoli del portale, spesso generati in automatico e imprecisi, servono soprattutto a sapere a che minuto aprire la lezione con "Guarda sul portale". Quando una scheda riporta un dettaglio preso dai sottotitoli, Claude lo ha prima corretto con i riassunti e con un glossario dei termini tecnici del corso, e la scheda lo indica con un piccolo segno.

### Italiano e inglese
L'esame è in inglese, quindi ogni scheda, quiz e concetto esiste in italiano e in inglese. In *Io* si sceglie la lingua di studio (predefinita: italiano) e quella dei quiz (proposta: inglese, per allenarsi all'esame); su ogni scheda un pulsante **IT/EN** cambia lingua al volo, anche senza connessione. I termini tecnici restano sempre nella forma inglese del corso e il glossario della materia ne dà la traduzione. Il ripasso è unico: un concetto ripassato in inglese o in italiano è lo stesso. Le fonti (riassunti dei video e sottotitoli) vengono già importate in entrambe le lingue ([ADR 0011](../decisions/0011-studio-bilingue-it-en.md)).

### Segnala errore
Dal menu di ogni scheda, **Segnala errore** permette di evidenziare il testo sbagliato e scrivere quello giusto, oppure solo di segnalare che qualcosa non torna (in questo caso la scheda viene rigenerata dai riassunti). La correzione resta: vale sul telefono e sul PC, viene riapplicata se Epicode aggiorna la lezione e, se riguarda un termine tecnico, viene usata anche per le lezioni successive della stessa materia. Le correzioni sono visibili solo a chi le scrive. Si può segnalare un errore anche chiedendolo all'assistente di studio.

## Quiz di fine capitolo
Domande generate dai riassunti del capitolo (mai dai sottotitoli), con la spiegazione dopo ogni risposta. Le risposte sbagliate aggiungono il concetto al ripasso.

## Ripasso
Ogni giorno l'app propone i concetti da rivedere, secondo un algoritmo di ripetizione spaziata (FSRS). Lo studente valuta quanto se lo ricordava (Di nuovo, Difficile, Bene, Facile) e l'app pianifica il ripasso successivo.

## Libri
Sezione dedicata con la libreria personale: copertine, filtro Tutti/Studio/Lettura e un riquadro "Continua" per l'ultimo libro aperto. Con **+** si carica un PDF o un EPUB (senza DRM) e si sceglie:
- **Studiare**: clip per concetto, quiz a fine capitolo e ripasso degli errori, come per le lezioni Epicode;
- **Solo leggere**: un feed di passaggi chiave e idee del capitolo, con Salva, Chiedi, Pagina (il punto del libro) e Studia (passa alla modalità studio).

Si possono anche scegliere i capitoli da includere e la lunghezza delle clip. La trasformazione si avvia da Claude Desktop sul PC; durante l'elaborazione la libreria mostra il capitolo a cui è arrivata. Il file resta sul PC e il libro è visibile solo a chi l'ha caricato.

## Aspetto
Tema scuro, chiaro o automatico, e cinque colori di accento: racing red (predefinito), electric violet, blu oltremare, turchese e verde lime. Al primo avvio l'app è in tema scuro con racing red; in automatico segue il tema chiaro o scuro del telefono o del computer. Il cambio è immediato, senza ricaricare. Tutte le combinazioni rispettano il contrasto minimo per una lettura comoda (WCAG AA). Vedi [design-system.md](../design-system.md).

## Privacy
I risultati (risposte, errori, ripasso) restano sul dispositivo dello studente. Si possono esportare e reimportare con un file di backup.
