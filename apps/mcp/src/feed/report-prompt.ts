/**
 * Istruzioni per completare le segnalazioni di *Segnala errore* (M5,
 * ADR 0020 §2). Le restituisce `segnalazioni_in_attesa` e il prompt
 * `sistema_segnalazioni`.
 *
 * Regola per le modifiche: cambiare il testo significa aumentare
 * {@link REPORT_PROMPT_VERSION} (data del giorno e numero progressivo).
 */

/** Versione delle istruzioni (`AAAA-MM-GG.n`). */
export const REPORT_PROMPT_VERSION = '2026-11-25.1';

/** Istruzioni brevi per Claude Desktop (aggiunte a quelle del server). */
export const REPORT_SERVER_INSTRUCTIONS = `Quando lo studente chiede di sistemare le segnalazioni (es. "sistema le mie segnalazioni di EpicFeed"), e alla fine di ogni generazione di lezioni: chiama segnalazioni_in_attesa e completa ogni segnalazione con completa_segnalazione, una alla volta, seguendo le istruzioni che restituisce.`;

/** Istruzioni complete per una segnalazione. */
export const REPORT_INSTRUCTIONS = `# Come completare le segnalazioni di EpicFeed (istruzioni ${REPORT_PROMPT_VERSION})

Lo studente ha corretto una scheda o una domanda del suo feed con *Segnala errore*. La correzione vale solo per lui e si applica sul suo dispositivo: tu non modifichi il feed della lezione, completi la correzione.

Prima di tutto leggi le fonti della lezione con leggi_lezione (lessonId della segnalazione) e verifica la correzione con i riassunti. Le fonti valgono più della scheda e più dello studente.

## Correzione di una frase (tipo text)
Lo studente ha corretto la lingua che vedeva; l'altra va allineata.
- Se i riassunti confermano la correzione (o almeno non la contraddicono): outcome "done" con, per ogni campo corretto, l'intervento nell'altra lingua. field e index uguali a quelli dello studente, language l'altra lingua, original il testo attuale preso dall'elemento (snapshot) in quella lingua, esattamente com'è, corrected la stessa correzione tradotta.
- Se i riassunti dicono chiaramente il contrario: outcome "disputed" con note (in italiano, 1-2 frasi: cosa dice la fonte) ed evidence (il passaggio del riassunto, testuale). La correzione resta applicata finché lo studente non la annulla.

## Scheda o domanda da rifare (tipo regenerate)
Lo studente non sapeva la correzione: riscrivi l'elemento dai riassunti. outcome "done" con gli interventi sui campi da cambiare, **in entrambe le lingue**: original è il testo attuale dello snapshot (esatto), corrected il testo nuovo. Cambia solo quello che serve, rispettando le stesse regole delle schede (frase chiave breve, spiegazione chiara, niente contenuti fuori dalle fonti). Le righe di codice si correggono con field "code" e una sola lingua. Se dopo aver letto i riassunti l'elemento è giusto, usa outcome "disputed" e spiega perché.

## Salvataggio
Chiama completa_segnalazione con l'id della segnalazione e l'esito. Se arrivano problemi, correggi solo quelli e salva di nuovo. Alla fine dì allo studente in una riga quante segnalazioni hai completato e quante sono da ricontrollare.`;
