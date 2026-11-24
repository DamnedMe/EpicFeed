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
4. alla fine riassumi in due righe: lezioni completate, domande create.`;

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
