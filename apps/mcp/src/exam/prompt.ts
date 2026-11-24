/**
 * Istruzioni per i pacchetti d'esame delle lezioni (M4, ADR 0014 e ADR 0017).
 * Come per il feed, ogni pacchetto salvato porta la versione delle istruzioni
 * con cui è nato.
 *
 * Regola per le modifiche: cambiare il testo significa aumentare
 * {@link EXAM_PROMPT_VERSION} (data del giorno e numero progressivo).
 */

/** Versione delle istruzioni dei pacchetti d'esame (`AAAA-MM-GG.n`). */
export const EXAM_PROMPT_VERSION = '2026-11-24.1';

/** Istruzioni brevi per Claude Desktop sui pacchetti d'esame (aggiunte a quelle del server). */
export const EXAM_SERVER_INSTRUCTIONS = `Quando lo studente chiede di preparare le domande d'esame (es. "genera le domande d'esame di EpicFeed"):
1. chiama lezioni_per_esame;
2. per ogni lezione, una alla volta: leggi_lezione_esame, poi scrivi il pacchetto seguendo le istruzioni che restituisce, poi salva_domande_esame;
3. se salva_domande_esame elenca problemi, correggili e salva di nuovo;
4. alla fine riassumi in due righe: lezioni completate, domande create.
Quando lo studente indica il materiale d'esame del corso (es. "Exam Prep" nello zip delle slide) o chiede la banca degli esercizi d'esame: chiama leggi_materiale_esame con il percorso dello zip, scrivi la banca seguendo le istruzioni che restituisce, poi salva_esercizi_esame.`;

/**
 * Istruzioni complete per il pacchetto d'esame di una lezione. Le restituisce
 * `leggi_lezione_esame` insieme al feed e il prompt `genera_domande_esame`.
 */
export const EXAM_INSTRUCTIONS = `# Come scrivere il pacchetto d'esame di una lezione EpicFeed (istruzioni ${EXAM_PROMPT_VERSION})

L'esame del corso è in inglese: un quiz di 50 domande a scelta multipla per modulo e un colloquio tecnico finale. Il pacchetto aggiunge alla lezione domande nuove per allenarsi a entrambi. **Scrivi tutto in inglese**, tranne i suggerimenti, che sono in italiano (it) e in inglese (en).

## Fonte
Solo il feed della lezione che ricevi (concetti, schede, domande già presenti). Non aggiungere argomenti, numeri o complessità che il feed non insegna: meglio una domanda in meno che una sbagliata. Usa i termini del corso come compaiono nelle schede.

## Domande a scelta multipla (questions): 10
Diverse da quelle del feed (elencate in "Domande già nel feed"): stesso argomento va bene, stessa domanda no. Il quiz di modulo le mescola con quelle del feed, quindi ognuna deve stare in piedi da sola.
- id: kebab-case univoco nel pacchetto (es. "mc-avl-rotation").
- question: una frase, come in un test d'esame ("Which…", "What is the time complexity of…"). Va bene anche un breve frammento di codice da leggere.
- options: esattamente 4, una sola giusta; le sbagliate sono errori tipici, non assurdità. correctIndex da 0, e varia la posizione della risposta giusta.
- explanation: perché la risposta giusta è giusta, 1-2 frasi.
- conceptKey: un concetto della lezione, esattamente come in "Concetti".
- difficulty: 1 facile, 2 media, 3 difficile; circa 3 facili, 4 medie, 3 difficili.

## Domande aperte (openQuestions): 1 o 2
Come al colloquio: lo studente deve produrre la risposta, non riconoscerla.
- kind "code": scrivere una funzione Python. Servono signature (es. "def is_balanced(s: str) -> bool:") e da 2 a 8 tests { call, expected }: call è un'espressione Python che chiama la funzione, expected è il risultato come lo stampa repr() (es. "True", "[1, 2, 3]", "'abc'"). I test girano nel browser con la sola libreria standard: niente input(), file o rete. Includi i casi limite (vuoto, un elemento).
- kind "explain": spiegare o confrontare (es. "Explain the difference between a stack and a queue, with one use case each.").
- kind "analyze": analizzare un codice dato nel campo code (es. complessità in Big-O, cosa stampa, dove sbaglia).
- prompt: la consegna, chiara e completa, in markdown.
- hints: da 1 a 3 suggerimenti progressivi { it, en }, dal più vago al più concreto; non devono dare la soluzione.
- modelAnswer: la soluzione modello completa (con il codice per "code"), come la scriverebbe uno studente preparato.
- rubric: da 3 a 5 criteri { criterion, points } con punti interi da 1 a 5, verificabili (es. "Uses a stack to match brackets", "Handles the empty string", "O(n) time").
- conceptKeys: da 1 a 3 concetti della lezione.
- followUp: una domanda di approfondimento sullo stesso tema, come la farebbe l'esaminatore dopo la risposta.
Se la lezione ha codice nelle schede, preferisci almeno una domanda "code" o "analyze".

## Salvataggio
Chiama salva_domande_esame con lessonId e feedId esattamente come restituiti da leggi_lezione_esame e il pacchetto { questions, openQuestions }. Se arrivano problemi da correggere, correggi solo quelli e salva di nuovo.`;

/** Versione delle istruzioni della banca degli esercizi (`AAAA-MM-GG.n`). */
export const EXAM_BANK_PROMPT_VERSION = '2026-11-24.1';

/**
 * Istruzioni per la banca degli esercizi di una materia. Le restituisce
 * `leggi_materiale_esame` insieme al materiale.
 */
export const EXAM_BANK_INSTRUCTIONS = `# Come scrivere la banca degli esercizi d'esame (istruzioni ${EXAM_BANK_PROMPT_VERSION})

Il materiale d'esame del corso contiene esercizi aperti in inglese, senza soluzioni; esempi e codice sono spesso nelle immagini delle pagine. La banca li trasforma in esercizi con cui lo studente si allena nell'app. **Tutto in inglese**, tranne i suggerimenti (it ed en).

## Esercizi ufficiali (origin "official")
Uno per ogni esercizio del materiale, nell'ordine del PDF.
- prompt: il testo **fedele** all'originale, in markdown, con gli esempi di input/output trascritti dalle immagini. Non semplificare e non aggiungere richieste.
- page: la pagina del PDF in cui si trova.
- title: titolo breve (es. "Balanced brackets with a stack").
- Se l'esercizio dà codice da analizzare, trascrivilo nel campo code (kind "analyze").

## Varianti (origin "variant"): esattamente 2 per ogni ufficiale
Stesso argomento e stessa difficoltà, ma dati o richiesta diversi (es. altre parentesi, un'altra struttura, chiedere la versione iterativa). variantOf: l'id dell'ufficiale; page: la stessa dell'ufficiale. Non devono potersi risolvere copiando la soluzione dell'ufficiale.

## Campi di ogni esercizio
- id: kebab-case univoco nella banca (es. "balanced-brackets", "balanced-brackets-v1").
- kind: "code" (scrivere una funzione Python), "explain" (spiegare o confrontare), "analyze" (analizzare il codice in code: complessità, output, errori).
- code: solo per "analyze".
- signature e tests: solo per "code". signature è la riga def della funzione; tests da 2 a 8 { call, expected }: call è un'espressione Python che chiama la funzione, expected il risultato come lo stampa repr(). Gli esempi del materiale diventano test, più i casi limite. Solo libreria standard, niente input(), file o rete. Se l'esercizio chiede una classe, la firma è quella del costruttore o del metodo principale e i test usano espressioni come "Stack2Q().push(1) or True" solo se servono: preferisci funzioni che restituiscono un valore.
- hints: da 1 a 3 suggerimenti progressivi { it, en }, senza dare la soluzione.
- modelAnswer: la soluzione modello completa, con il codice per "code" e la complessità quando conta.
- rubric: da 3 a 5 criteri { criterion, points } con punti interi da 1 a 5, verificabili.
- conceptKeys: da 1 a 3 concetti della materia, scelti dall'elenco "Concetti della materia" (esattamente quelle chiavi).
- followUp: una domanda di approfondimento come la farebbe l'esaminatore al colloquio.

## Salvataggio
Chiama salva_esercizi_esame con il subjectId restituito da leggi_materiale_esame e la banca { exercises } (prima tutti gli ufficiali con le loro varianti, nell'ordine del PDF). Se arrivano problemi, correggi solo quelli e salva di nuovo.`;
