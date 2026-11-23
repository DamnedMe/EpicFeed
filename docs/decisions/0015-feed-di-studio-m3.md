# ADR 0015: Feed di studio (M3): storie a battute, gesti, minuti dalle slide e materia offline

- Stato: accettata
- Data: 23/11/2026
- Decisa da: Damian (prototipi interattivi e documento *EpicFeed M3: scelte del feed da decidere*, 23/11/2026: "mi piace" al prototipo 2, scelta "D" per i pulsanti con la spiegazione dei gesti all'inizio, "Sì, ok a tutte e quattro" per ordine, minuti, offline e navigazione); Claude per i dettagli tecnici

## Contesto
A fine M2 il corso *Data Structures and Algorithms* ha 31 lezioni generate: 335 schede, 247 domande, 143 concetti. M3 deve portarle sul telefono in un feed verticale. Dati misurati il 23/11/2026 sui feed salvati:

- **263 schede su 335 (79%) vengono dalle slide**, 63 dai riassunti dei video, 9 dalle letture;
- solo **44 schede** hanno un minuto di video: in M2 l'allineamento provava solo le schede tratte da un video (44 su 63);
- un feed pesa circa 23 KB, tutta la materia circa 700 KB (sui 150 KB compressi);
- la spiegazione di una scheda è lunga in media 260 caratteri, al massimo 447; il codice arriva a 28 righe.

Il primo prototipo (scheda intera, azioni in colonna) a Damian è sembrato poco accattivante: ha chiesto un feed che catturi l'attenzione anche di chi ha l'ADHD e che faccia imparare in modo semplice, rapido e chiaro.

## Decisione

### 1. Schede come storie a battute
Ogni scheda si legge una **battuta** alla volta, con una frase grande per schermata; le frasi già lette restano sopra, attenuate. Una barra in alto mostra le battute della scheda, come le storie dei social.
- *concept*: titolo, frase chiave, poi una frase della spiegazione per battuta;
- *steps*: titolo, frase chiave, poi un passo per battuta con il numero grande;
- *comparison*: un duello *A VS B*, poi una riga del confronto per battuta;
- *code*: il codice con un blocco illuminato per battuta e la frase che lo spiega sotto.

Le battute si ricavano dalle schede già generate: nessuna rigenerazione in Claude Desktop.

### 2. Ingredienti per l'attenzione
- **Parola da indovinare**: nella frase chiave un termine del glossario della scheda è coperto; lo studente prova a ricordarlo e tocca per scoprirlo.
- **Domande nel feed**: una domanda della stessa lezione ogni 3–4 schede (dal 23/11/2026, su richiesta di Damian, **un gruppo di fino a 3 domande** ogni 3 schede: vedi il punto 8); vero/falso con uno swipe, scelta multipla con un tocco, risposta e spiegazione subito. In M3 il risultato non si salva; da M4 entra nel ripasso FSRS.
- **Punti e serie**: punti per parole indovinate e risposte giuste, bonus per le risposte giuste di fila.
- **Sessioni da 5 minuti** con anello del tempo e riepilogo finale.
- **Ascolta**: lettura ad alta voce con la sintesi vocale del dispositivo, nella lingua della scheda.
- **Avanzamento automatico** facoltativo, alla velocità di lettura.
- Punti, vibrazione e animazioni si possono spegnere in *Io*; con *riduci animazioni* del sistema le animazioni si spengono da sole. Punti, serie, schede salvate, posizione e preferenze stanno solo sul dispositivo ([ADR 0003](0003-risultati-sul-dispositivo.md)).

### 3. Azioni con i gesti (disposizione D)
Delle cinque disposizioni provate (A colonna a destra, B barra sotto, C pulsante unico, D solo gesti, E icone in alto) vale la **D**: nessun pulsante sulla scheda, il testo usa tutta la larghezza.
- tocco a destra / a sinistra: battuta dopo / prima; scorrimento in su: scheda dopo;
- **doppio tocco**: salva la scheda;
- **tieni premuto**: foglio delle azioni (Salva, Ascolta, lingua, Fonte e *Guarda sul portale*, Chiedi da M6);
- in alto a destra resta solo il pulsante **IT/EN**;
- al primo avvio una schermata spiega i quattro gesti con piccole animazioni; si rivede da *Io*;
- accessibilità: tastiera (frecce, spazio) e lettore di schermo raggiungono le stesse azioni con pulsanti nascosti alla vista ma non all'assistenza.

### 4. Ordine del feed
La materia si studia **in ordine** (capitolo, poi lezione, come sul portale) e il feed riparte dall'ultima scheda vista. *Capitolo* apre l'elenco per saltare a un capitolo o a una lezione. Il feed *Per te* (prima i concetti deboli) arriva in M4 con il ripasso.

### 5. Guarda sul portale e minuti anche per le schede dalle slide
Il video non si può incorporare fuori dai domini Epicode e sul telefono non c'è l'estensione: *Guarda sul portale* apre la pagina della **parte video** sul portale (`/course/{corso}/curriculum/{parte}`, lo stesso indirizzo che riconosce l'estensione) e la scheda indica il minuto, da cercare nel player.

L'allineamento passa alla **versione 2** (`ALIGNMENT_VERSION`, `alignCardToLesson` nel core):
- le schede tratte da un video cercano solo in quel video, come in M2;
- le schede tratte da slide e letture cercano in **tutti i video della lezione** e tengono il tratto più sicuro, con le stesse soglie (confidenza, parole in comune, margine sui tratti lontani). Un tratto incerto resta senza minuto;
- il tratto riporta la parte video (`partId`), perché per una scheda dalle slide non coincide con la parte di provenienza.

I feed già salvati si **riallineano da soli** (`RealignLessonFeeds`): quando l'app legge una materia, i feed con una versione vecchia vengono ricalcolati dopo la risposta (`after` di Next.js) con le fonti viste dallo studente, e la volta successiva l'app scarica i minuti nuovi. Nessuna migrazione: cambiano solo le schede nel documento JSON e il campo `alignmentVersion`. Se la lezione è cambiata nel frattempo (impronta delle fonti diversa) il feed resta com'è. La scrittura è protetta dalla versione letta: due letture contemporanee non scrivono due volte.

### 6. Offline: tutta la materia
L'app scarica **tutta la materia** in una richiesta (`GET /api/feed/subjects/{id}`) e la tiene sul dispositivo; la risposta ha un **ETag** calcolato da feed e versioni di allineamento, quindi una materia invariata costa una risposta `304` vuota. L'app è una PWA installabile; il service worker è scritto a mano (nessuna dipendenza) e conserva la cornice dell'app e l'ultima materia scaricata.

### 7. Navigazione
Barra in basso **Feed · Ripasso · Libri · Io** del design approvato; Ripasso (M4) e Libri (M7) visibili ma spenti con *in arrivo*. In *Io*: tema, accento, lingua di studio, interruttori di punti/vibrazione/animazioni, gesti, Salvati, Le mie lezioni, Estensione e Claude Desktop.

### 8. Note di realizzazione (PR 2, 23/11/2026)
Dettagli scelti da Claude realizzando le decisioni sopra, descritti in [feed.md](../functional/feed.md):
- **Parola da indovinare**: se nessun termine del glossario compare nella frase chiave si copre una complessità, un pezzo di codice o un numero. Sulle prime due lezioni DSA trova una parola in 3 schede su 4 in italiano e in più di 4 su 5 in inglese: i termini del glossario sono in inglese. In M4 la generazione potrà indicare la parola.
- **Domande**: una ogni 3 schede (il valore più basso dell'intervallo 3–4), più una a fine lezione. **Modifica del 23/11/2026** (Damian: "porterei le domande da 1 ogni tanto a 3 ogni tanto, sempre sugli argomenti appena visti"): dopo ogni 3 schede arriva un gruppo di **fino a 3 domande** (`QUIZ_BATCH`), prima sui concetti delle ultime schede e poi sugli altri già letti nella lezione, mai su un concetto non ancora visto; a fine lezione un ultimo gruppo se dopo l'ultimo c'è almeno una scheda. Ogni domanda mostra la sua posizione nel gruppo (*1/3*). Sul corso DSA il feed passa da circa 4 a 246 domande su 247 (8 per lezione), 238 delle quali sui concetti delle schede appena lette; gruppi: 55 da 3, 34 da 2, 13 da 1; 10 punti, +2 per ogni risposta giusta di fila oltre la prima, fino a +8; parola indovinata 2 punti.
- **Lingua delle domande**: separata da quella delle schede e inglese di base, come previsto dall'[ADR 0011](0011-studio-bilingue-it-en.md).
- **Doppio tocco**: salva soltanto (come un "mi piace"); per togliere si usano le azioni o *Salvati*. Il tocco singolo aspetta 230 ms per riconoscere il doppio tocco.
- **Fine sessione**: il riepilogo compare alla prima scheda dopo i 5 minuti, non a metà lettura.
- **Fonte delle slide**: le slide importate dallo zip ([ADR 0012](0012-slide-dallo-zip-ufficiale.md)) non hanno una pagina sul portale, quindi il link porta alla lezione.
- **Tema e accento** in cookie (letti dal server al primo render); tutto il resto in `localStorage`.

## Alternative scartate
- **Scheda intera** in una schermata (prototipo 1): più veloce da scorrere, ma un muro di testo per chi fatica a mantenere l'attenzione.
- **Pulsanti** A (colonna, toglie ~60 px al testo), B (barra sotto), C (pulsante unico, un tocco in più per ogni azione), E (icone in alto, lontane dal pollice).
- **Minuto solo per le schede dai video**: 44 schede su 335 avrebbero un minuto.
- **Script una tantum** per i minuti: avrebbe richiesto la connessione privilegiata al database fuori dall'app; il riallineamento alla lettura vale anche per le future revisioni delle regole.
- **Offline solo per il capitolo aperto**: risparmio trascurabile (la materia intera pesa meno di una foto) e feed bloccato dove non si è scaricato.

## Conseguenze
- M3 si sviluppa in tre PR: (1) allineamento v2, lettura della materia e riallineamento; (2) schermata a battute, gesti, *Io* e barra in basso; (3) PWA offline e test Playwright.
- Il codice spiegato a battute usa in M3 un abbinamento automatico tra frasi e blocchi di codice (nomi in comune); in M4 un campo facoltativo della generazione permetterà a Claude di indicare quale frase spiega quali righe.
- PWA (terza PR): service worker scritto a mano in `public/sw.js` con due sole strategie, prima la cache per `/_next/static/` e prima la rete per la pagina `/` (la copia offline si cancella con un rimando all'accesso); la materia resta in `localStorage` come nella seconda PR, non nella cache del service worker, così c'è un solo posto da rivalutare con l'ETag. Test Playwright in CI su un banco di prova del vero `FeedApp` (niente server né database), con le viste di iPhone 13 e Pixel 7 in Chromium: WebKit richiederebbe dipendenze di sistema in più e il comportamento dei gesti è lo stesso.
- Da misurare dopo il primo riallineamento: quante schede dalle slide ricevono un minuto, e con quale affidabilità (controllo a campione di Damian).
