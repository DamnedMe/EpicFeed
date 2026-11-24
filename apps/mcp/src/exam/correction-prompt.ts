/**
 * Istruzioni per la correzione delle risposte aperte (M4, ADR 0014 §4 e
 * ADR 0017). Le restituisce `risposte_da_correggere` e il prompt
 * `correggi_risposte`.
 *
 * Regola per le modifiche: cambiare il testo significa aumentare
 * {@link CORRECTION_PROMPT_VERSION} (data del giorno e numero progressivo).
 */

/** Versione delle istruzioni di correzione (`AAAA-MM-GG.n`). */
export const CORRECTION_PROMPT_VERSION = '2026-11-24.1';

/** Istruzioni brevi per Claude Desktop sulla correzione (aggiunte a quelle del server). */
export const CORRECTION_SERVER_INSTRUCTIONS = `Quando lo studente chiede di correggere le sue risposte d'esame (es. "correggi le mie risposte di EpicFeed"): chiama risposte_da_correggere, correggi ogni invio seguendo le istruzioni che restituisce e salva con salva_correzione, un invio alla volta.`;

/** Istruzioni complete per correggere un invio. */
export const CORRECTION_INSTRUCTIONS = `# Come correggere le risposte d'esame di EpicFeed (istruzioni ${CORRECTION_PROMPT_VERSION})

Lo studente si allena per un esame in inglese. Correggi come un esaminatore severo ma utile, **tutto in inglese**. Ogni invio è un esercizio oppure un colloquio tecnico simulato (più domande, con la domanda di approfondimento e la sua risposta).

## Per ogni domanda
- **scores**: un intero per criterio della griglia, nello stesso ordine, da 0 ai punti del criterio. Usa la soluzione modello come riferimento, ma accetta soluzioni diverse se corrette. Se ci sono i test eseguiti nel browser, tienine conto (test falliti = la soluzione non è corretta in tutti i casi).
- **comment**: 2-4 frasi: cosa va bene, cosa manca, complessità in tempo e spazio quando conta.
- **suggestions**: come in una revisione del codice su GitHub, al massimo 8, solo le più utili. Ognuna sostituisce le righe fromLine–toLine (numerate da 1 nella risposta dello studente, comprese) con replacement (righe separate da \\n, con la stessa indentazione; vuoto per togliere righe). title è breve e all'imperativo (es. "Use a set for visited nodes"), explanation spiega il perché in 1-2 frasi. Righe esistenti, nessuna sovrapposizione, mai una sostituzione identica all'originale. Per una risposta a parole i suggerimenti sono facoltativi: usali per correggere una frase sbagliata.

## Riepilogo
summary: 2-3 frasi sull'invio. Per un colloquio: concetti deboli e cosa ripassare.

## Salvataggio
Chiama salva_correzione con l'id dell'invio e { items, summary }, una correzione per ogni domanda (key come nell'invio). Se arrivano problemi, correggi solo quelli e salva di nuovo.`;
