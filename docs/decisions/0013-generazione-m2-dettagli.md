# ADR 0013: Generazione di schede e quiz (M2): installazione, unità, forma del feed, slide e token

- Stato: accettata
- Data: 21/11/2026
- Decisa da: Damian ("ok" alle cinque raccomandazioni del documento *EpicFeed M2: scelte tecniche da decidere*, 21/11/2026); Claude per i dettagli tecnici

## Contesto
M2 era già in gran parte definita: genera Claude Desktop con il piano di Damian ([ADR 0007](0007-generazione-via-mcp-e-login.md)), in italiano e in inglese nella stessa passata ([ADR 0011](0011-studio-bilingue-it-en.md)), dai riassunti e dalle slide, con i sottotitoli solo per i tempi ([ADR 0006](0006-sottotitoli-come-fonte-secondaria.md), [ADR 0012](0012-slide-dallo-zip-ufficiale.md)). Restavano cinque scelte che cambiano come si usa la generazione.

Dati di partenza (database, 21/11/2026): corso *Data Structures and Algorithms* con 7 capitoli, 31 lezioni, in media 4 parti e circa 21.700 caratteri di fonti (IT+EN) per lezione; tutte le versioni nello stato `pending`.

## Decisione

### 1. Installazione: pacchetto per Claude Desktop (.mcpb)
Il server MCP (`apps/mcp`) si distribuisce come file `epicfeed.mcpb`, messo nella cartella EpicFeed del PC e aperto con un doppio clic. Usa il Node interno di Claude Desktop (niente Node da installare); il token si inserisce in una finestra di impostazioni ed è conservato come segreto nel portachiavi di Windows. Le librerie native (disegno delle pagine PDF) sono incluse nel pacchetto per Windows. Il server comunica solo con Claude Desktop (stdio, nessuna porta aperta) e con l'API di EpicFeed.

### 2. Unità di generazione: la lezione, salvata come documento unico
- Si genera **una lezione alla volta**: sta comoda in una richiesta di Claude Desktop e permette quiz e concetti che collegano più video.
- Il feed (schede, quiz, concetti) si salva come **un documento JSON validato** nella tabella `lesson_feeds`, una riga per lezione e per **impronta delle fonti** (`computeLessonSourcesHash`: hash delle versioni delle parti, indipendente dall'ordine). Se Epicode cambia una parte, l'impronta cambia, la lezione torna da generare e chi ha la versione vecchia continua a vedere il feed vecchio.
- Il quiz di fine capitolo si compone dalle domande delle lezioni del capitolo, senza una generazione a parte.
- Il glossario sta in una tabella `glossary_terms` per materia, arricchita lezione dopo lezione.
- Ogni concetto ha una **chiave stabile** in kebab-case (es. `avl-tree`): il ripasso FSRS continua anche quando la lezione viene rigenerata.

### 3. Forma di schede, quiz e concetti
- **Quattro tipi di scheda**, una idea per scheda (20–40 secondi di lettura): `concept` (definizione e perché conta), `steps` (procedura in passi), `comparison` (due idee a confronto, righe per aspetto), `code` (frammento con spiegazione).
- Campi di ogni scheda: titolo, frase chiave, spiegazione, termini del glossario, concetti, parte di provenienza e origine (`summary`, `reading`, `slides`); passi, confronto o codice secondo il tipo. Ogni testo è una coppia `{ it, en }`; codice e nomi tecnici non si traducono.
- **Quiz**: scelta multipla (3–5 opzioni, stesso ordine e stessa risposta corretta nelle due lingue) e vero/falso, con spiegazione, concetto verificato e difficoltà 1–3. Le domande "completa il codice" sono rimandate a M4.
- **Quantità obiettivo per lezione**: 8–12 schede, 6–8 domande, 3–6 concetti (circa 300 schede e 200 domande sul corso DSA). I limiti di validazione sono più larghi (3–20 schede, 2–12 domande, 1–10 concetti) per non rifiutare lezioni corte o molto dense.
- L'**intervallo di video** di ogni scheda non lo scrive Claude: lo calcola l'API al salvataggio con `alignCard` del core (vedi sotto).

### 4. Slide: pdf.js con disegno in PNG
`importa_slide` e `leggi_lezione` usano **pdf.js** (Mozilla, Apache 2.0) per il testo e per riconoscere le pagine con figure, e **@napi-rs/canvas** (MIT) per disegnarle in PNG al momento, sul PC. Regola iniziale per le immagini, da tarare sul set di valutazione: solo pagine con figure o con meno di 200 caratteri di testo, al massimo 8 per lezione, larghe 1.280 pixel.

### 5. Token del server MCP
Token personale con permesso **"genera"** (nuovo valore dell'enum `api_token_scope`, migrazione non distruttiva), creato con un pulsante nella sezione Io, mostrato una sola volta, valido **90 giorni**, revocabile; sul server resta solo l'impronta SHA-256, come per il token dell'estensione. Permette solo di leggere le lezioni possedute e di salvarne il feed; l'app avvisa una settimana prima della scadenza. L'API limita a 120 chiamate l'ora.

## Dettagli tecnici di questa PR
- **Contratti** (`packages/contracts/src/generation.ts`): `lessonFeedDraftSchema` (feed come lo produce Claude), `saveLessonFeedRequestSchema` (con `sourcesHash` e `promptVersion`), `storedLessonFeedSchema` (feed salvato, con il tratto di video di ogni scheda). Gli schemi controllano la forma; una verifica a tempo di compilazione garantisce che corrispondano ai tipi del core.
- **Regole del feed** (`packages/core/src/domain/feed.ts`): `checkLessonFeed` restituisce tutti i problemi in una volta (quantità, id e chiavi univoci, concetti esistenti e usati, parti della lezione, stesso numero di passi e opzioni nelle due lingue, campi propri di ogni tipo, testi lunghi identici nelle due lingue), così il server MCP può farli correggere a Claude prima di salvare.
- **Allineamento al minuto** (`packages/core/src/domain/alignment.ts`): finestre di sottotitoli di 30 secondi, parole significative ridotte alla radice, peso maggiore alle parole rare nella traccia e ai termini del glossario. Si accetta un tratto solo con confidenza ≥ 0,3, almeno 3 parole in comune e un vantaggio di almeno il 20% sul miglior tratto lontano; altrimenti `null` e la scheda apre la parte dall'inizio. Ogni scheda si prova con la traccia della stessa lingua (testo italiano con traccia `it`, inglese con `en-x-autogen`), preferendo a parità la traccia non automatica. I parametri si tarano sul set di valutazione.

## Alternative scartate
- **Installazione**: Node + configurazione a mano (serve Node, token in chiaro nel file di configurazione); `npx` da GitHub (serve Node e un token GitHub per la repo privata).
- **Salvataggio**: tabelle separate per schede, quiz e concetti (più tabelle e policy, feed da ricomporre a ogni apertura); generazione per parte video (quiz e concetti spezzati, circa il quadruplo delle richieste).
- **Slide**: MuPDF (ottimo, ma licenza AGPL); solo testo (perde i diagrammi, motivo dell'ADR 0012).
- **Token**: lo stesso dell'estensione (30 giorni e permesso di import in più); email e password nel server MCP (password sul PC).

## Conseguenze
- Lo stato di generazione di una lezione si ricava dalla presenza di un feed per la sua impronta delle fonti corrente; lo stato delle singole versioni (`generation_status`) resta allineato quando un feed le include.
- M2 si sviluppa in quattro PR: contratti e dominio (questa), database e API, server MCP e pacchetto `.mcpb`, slide.
- La milestone si chiude dopo la prova su 2–3 lezioni reali del DSA, controllate da Damian.
