# ADR 0014: Preparazione all'esame (M4): esercizi aperti, timer, correzione di Claude, codice eseguibile

- Stato: accettata (con due punti da confermare, vedi in fondo)
- Data: 22/11/2026
- Decisa da: Damian ("A (+ timer) + C + D + E, tutto in inglese, suggerimenti attivabili con lingua a scelta, in M4", 22/11/2026, sul documento *EpicFeed: preparazione all'esame*); Claude per i dettagli tecnici

## Contesto
Lo zip ufficiale delle slide del corso DSA contiene `Exam Prep-1.pdf`, che Epicode presenta come aiuto per l'esame finale. Sono **14 esercizi aperti in inglese, senza soluzioni**: 9 chiedono di scrivere codice Python (es. parentesi bilanciate con uno stack, Dijkstra con una coda di priorità, stack simulato con due code), 5 di spiegare, confrontare o analizzare la complessità (es. stabilità degli algoritmi di ordinamento, Big-O di un codice dato). Gli esempi di input/output e il codice da analizzare sono immagini. Oggi la lezione resta fuori: è fatta solo di slide, l'estensione non la importa e `importa_slide` non trova una lezione a cui abbinarla ([ADR 0012](0012-slide-dallo-zip-ufficiale.md)).

I quiz generati in M2 sono solo a scelta multipla e vero/falso ([ADR 0013](0013-generazione-m2-dettagli.md)): allenano a riconoscere la risposta, mentre l'esame chiede di produrla, in inglese. Serve un formato nuovo.

Delle cinque alternative proposte (A banca esercizi, B simulazione completa, C correzione di Claude, D esecuzione del codice, E domande aperte nei feed) Damian ha scelto **A con un timer, C, D ed E**, tutto in M4.

## Decisione

### 1. Lingua: tutto in inglese, suggerimenti esclusi
Testo degli esercizi, risposte, soluzioni modello, griglie e commenti della correzione sono **solo in inglese**, come all'esame. È un'eccezione voluta allo studio bilingue dell'[ADR 0011](0011-studio-bilingue-it-en.md), che resta valido per schede e quiz. Unica parte bilingue: i **suggerimenti**, che si **attivano o disattivano** (interruttore in *Io* e su ogni esercizio) e hanno una **lingua propria** (IT o EN), indipendente da quella di studio e da quella dei quiz. L'interfaccia dell'app resta in italiano.

### 2. Materiale d'esame del corso (A)
- `importa_slide` riconosce i PDF d'esame dello zip (titolo che contiene "Exam Prep", proposta da verificare sugli altri corsi) e li aggancia al **corso** come *materiale d'esame*, invece di segnalarli come non abbinati. Come per le slide, a EpicFeed arriva solo il testo; i PDF restano sul PC.
- Un nuovo strumento MCP, `genera_esercizi_esame`, fa leggere a Claude Desktop il materiale (testo e pagine in immagine, come per i diagrammi delle slide) e salva una **banca di esercizi** del corso:
  - gli esercizi **ufficiali**, fedeli al testo originale, con gli esempi trascritti dalle immagini;
  - **varianti** generate per ciascuno (proposta: 2), sullo stesso argomento ma con dati o richiesta diversi.
- Ogni esercizio ha: tipo (`code`, `explain`, `analyze`), testo, esempi, eventuale firma della funzione e test (per D), suggerimenti progressivi `{ it, en }`, **soluzione modello**, **griglia di correzione** (3–5 criteri con punti), concetti del corso collegati (stesse chiavi stabili delle schede), origine (`official` / `variant`) e pagina del PDF.
- La banca si salva come documento JSON validato per corso e impronta del materiale, come `lesson_feeds`; i controlli stanno nel core (`checkExamBank`), così Claude corregge da solo prima di salvare.

### 3. Esercitazione con timer (A + timer)
Dalla sezione **Esame** del corso si sceglie uno o più esercizi (per argomento, ufficiali o varianti, non ancora fatti) e si avvia la sessione, con un **timer facoltativo** (durata a scelta, avviso a fine tempo, si può continuare). Si scrive la risposta in un editor di testo o di codice; poi si aprono la soluzione modello e la griglia. Non è una simulazione completa (niente estrazione a caso né voto finale stimato): si potrà aggiungere sopra la banca senza cambiarla.

### 4. Correzione (autovalutazione e Claude, C)
- **Autovalutazione**: si segna ogni criterio della griglia; il punteggio è sempre disponibile.
- **Correzione di Claude**: il pulsante *Fai correggere a Claude* mette la risposta in coda; in Claude Desktop "correggi le mie risposte" usa due strumenti MCP (`risposte_da_correggere`, `salva_correzione`) che restituiscono punteggio per criterio e commento, in inglese. Niente Claude API, come per la generazione ([ADR 0007](0007-generazione-via-mcp-e-login.md)).
- Il punteggio (di Claude se c'è, altrimenti l'autovalutazione) aggiorna il **ripasso FSRS** dei concetti collegati: sotto il 50% equivale a "di nuovo", 50–80% a "difficile", sopra a "bene".

### 5. Codice eseguibile nel browser (D)
- Gli esercizi `code` con test si eseguono con **Pyodide** (Python in WebAssembly, licenza MPL 2.0) dentro un **Web Worker**, senza accesso alla pagina; il pulsante *Esegui i test* mostra quali esempi passano.
- Pyodide si scarica solo al primo uso (circa 10 MB), poi resta nella cache del service worker e funziona offline.
- Sicurezza: worker senza DOM, nessuna rete dal codice dell'utente (CSP `connect-src` invariata, nessun `pyodide.http`), tempo massimo 5 secondi per test con interruzione del worker, output troncato.
- I test non sostituiscono la correzione: verificano gli esempi, la griglia valuta anche complessità e spiegazione.

### 6. Domande aperte nei feed delle lezioni (E)
- Il feed di ogni lezione aggiunge **1–2 domande aperte "stile esame"**, in inglese, con soluzione modello, griglia, concetti e, se di codice, test eseguibili: stesso formato degli esercizi del §2, stessa correzione del §4.
- Il contratto del feed cambia in modo **additivo**: campo facoltativo `examQuestions` in `lessonFeedDraftSchema`, nuova `promptVersion`. I feed già salvati restano validi; rigenerarli per avere le domande aperte è facoltativo.
- Per non toccare la generazione M2 mentre è in prova, questa modifica si fa dopo la chiusura di M2.

## Alternative scartate
- **Solo autovalutazione**: più semplice, ma senza un giudizio esterno sulle risposte aperte, che sono la parte più difficile da valutare da soli.
- **Claude API per la correzione**: immediata nell'app, ma costi a consumo e chiave sul server, contro l'ADR 0007.
- **Esecuzione del codice sul server**: richiede una sandbox e un servizio sempre attivo; Pyodide gira sul telefono e offline.
- **Esercizi bilingui**: allontanano dal formato dell'esame; restano bilingui solo i suggerimenti, a scelta.

## Conseguenze
- M4 cresce da M a L: quiz e ripasso come previsto, più sezione Esame, strumenti MCP d'esame, Pyodide e domande aperte nei feed.
- Nuovi strumenti nel pacchetto `.mcpb` (con la prova Windows verde prima di ogni consegna).
- Nuove tabelle additive (banca esercizi per corso, coda delle risposte da correggere) con RLS: ognuno vede solo le proprie.

## Da confermare con Damian
1. **Dove stanno le risposte da correggere.** I risultati restano sul dispositivo ([ADR 0003](0003-risultati-sul-dispositivo.md)), ma Claude Desktop può leggere solo dal server. Proposta: va sul server, nell'area privata, **solo** la risposta inviata con *Fai correggere a Claude*; l'app scarica la correzione e la copia sul server si cancella subito dopo (o al massimo dopo 30 giorni). Alternativa senza server: l'app copia testo, risposta e griglia negli appunti da incollare in Claude Desktop.
2. **Formato dell'esame vero** (al PC o su carta, durata, numero di esercizi, codice eseguibile o no), per tarare timer, varianti e griglie.
