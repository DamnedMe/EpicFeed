/**
 * Istruzioni di generazione di EpicFeed (prompt MCP versionato nella repo,
 * ADR 0007 e ADR 0013). Ogni feed salvato porta la versione del prompt con cui
 * è nato, così si sa quali lezioni rigenerare se le istruzioni cambiano.
 *
 * Regola per le modifiche: cambiare il testo significa aumentare
 * {@link PROMPT_VERSION} (data del giorno e numero progressivo).
 */

/** Versione delle istruzioni di generazione (`AAAA-MM-GG.n`). */
export const PROMPT_VERSION = '2026-11-21.1';

/**
 * Istruzioni brevi per Claude Desktop, inviate all'avvio del server: dicono
 * quando usare gli strumenti e in che ordine.
 */
export const SERVER_INSTRUCTIONS = `EpicFeed trasforma le lezioni Epicode importate dallo studente in un feed di schede, quiz e concetti, in italiano e in inglese.
Quando lo studente chiede di generare le lezioni (es. "genera le lezioni nuove di EpicFeed"):
1. chiama lezioni_da_generare;
2. per ogni lezione, una alla volta: leggi_lezione, poi crea il feed seguendo le istruzioni che leggi_lezione restituisce, poi salva_feed_lezione;
3. se salva_feed_lezione elenca problemi, correggili e salva di nuovo (non ricominciare da capo);
4. alla fine riassumi in due righe: lezioni generate, schede e domande create.
Non inventare contenuti che non sono nelle fonti. Non chiedere conferma per ogni lezione: lo studente ha già chiesto di generarle.`;

/**
 * Istruzioni complete per creare il feed di una lezione. Le restituisce
 * `leggi_lezione` insieme alle fonti e il prompt MCP `genera_lezioni`.
 */
export const GENERATION_INSTRUCTIONS = `# Come creare il feed di una lezione EpicFeed (istruzioni ${PROMPT_VERSION})

Lo studente studia sul telefono, scorrendo schede brevi come in un feed. L'esame è in inglese: ogni testo va scritto in italiano (it) e in inglese (en), nella stessa passata, con la stessa struttura.

## Fonti e loro affidabilità
1. Riassunti delle parti video (summaries.it e summaries.en) e testi di lettura (markdown): sono la base. Scrivi la versione italiana dalle fonti italiane e quella inglese dalle fonti inglesi; traduci solo ciò che esiste in una lingua sola (di solito i testi di lettura, in inglese).
2. Glossario della materia: usa i termini esattamente in quella forma.
3. Niente altro. Se un dettaglio non è nelle fonti, non scriverlo: meglio una scheda in meno che una scheda sbagliata. Non aggiungere esempi, numeri o complessità che le fonti non danno.
I riassunti italiani a volte sono tradotti male ("le sotto-alberi"): correggi la lingua, non il contenuto.

## Schede (cards): 8-12 per lezione
Una sola idea per scheda, leggibile in 20-40 secondi. Copri tutti gli argomenti importanti della lezione, nell'ordine delle parti.
- kind "concept": definizione e perché conta.
- kind "steps": una procedura; campo steps con 3-6 passi brevi, stesso numero in it ed en.
- kind "comparison": due idee a confronto; campo comparison con left, right e 2-4 righe (aspect, left, right).
- kind "code": un frammento dalle fonti con spiegazione; campo code { language, source }. Il codice non si traduce.
Campi di ogni scheda:
- id: kebab-case univoco nella lezione (es. "avl-rotation").
- title: max ~60 caratteri.
- keyPoint: la frase da ricordare, max 140 caratteri, su una riga.
- body: spiegazione, max 500 caratteri. Testo semplice, frasi brevi.
- terms: i termini del glossario citati, nella forma inglese del corso.
- conceptKeys: 1-2 concetti della lezione a cui la scheda appartiene.
- sourcePartId: l'id della parte da cui viene la scheda (esattamente come in leggi_lezione).
- origin: "summary" se dal riassunto di un video, "reading" se da un testo di lettura.
Nomi di API, funzioni, strutture dati e simboli restano nella forma originale in entrambe le lingue (es. HashMap, O(log n), "AVL tree" può diventare "albero AVL" ma il termine inglese va in terms).

## Quiz: 6-8 domande per lezione
- kind "multiple_choice": 4 opzioni plausibili, una sola giusta; options.it e options.en nello stesso ordine, correctIndex uguale per le due lingue (indice da 0). Le opzioni sbagliate devono essere errori tipici, non assurdità.
- kind "true_false": answer true o false. Usane al massimo 2.
- explanation: perché la risposta giusta è giusta, 1-2 frasi.
- conceptKey: il concetto verificato. Difficulty: 1 facile, 2 media, 3 difficile; mescola i livelli.
- Domande solo su ciò che le schede insegnano. Niente domande trabocchetto sulla formulazione.

## Concetti: 3-6 per lezione
Le unità del ripasso. key in kebab-case inglese, stabile e generica (es. "binary-search-tree", non "lezione-3-bst"): se lo stesso concetto torna in un'altra lezione, usa la stessa key. Ogni concetto deve comparire in almeno una scheda. name e description (1 frase) in it ed en.

## Glossario: i termini tecnici nuovi della lezione
term: forma inglese del corso; translation: resa italiana (uguale al termine se in italiano non si traduce); definition in it ed en, 1 frase. Non ripetere termini già presenti nel glossario della materia.

## Salvataggio
Chiama salva_feed_lezione con lessonId e sourcesHash esattamente come restituiti da leggi_lezione e il feed { cards, quiz, concepts, glossary }. Se arrivano problemi da correggere, correggi solo quelli e salva di nuovo.`;
