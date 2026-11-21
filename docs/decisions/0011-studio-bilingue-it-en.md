# ADR 0011: Studio in italiano e in inglese

- Stato: **proposta**, in attesa della scelta di Damian tra le opzioni del punto "Opzioni"; va decisa prima di iniziare M2, perché cambia lo schema delle schede e dei quiz
- Data: 21/11/2026
- Richiesta da: Damian ("lo studio deve poter essere fatto sia in italiano che in inglese perché poi l'esame sarà in inglese")

## Contesto
Damian studia in italiano, ma l'esame del corso è in inglese: deve saper leggere e rispondere con la terminologia inglese. Le fonti importate ci sono già in entrambe le lingue (verificato il 21/11/2026 sul corso *Data Structures and Algorithms*, 31 lezioni importate):

| Fonte | Italiano | Inglese |
|---|---|---|
| Riassunto di ogni parte video (`summary`) | sì, per tutti i 91 video | sì, per tutti i 91 video |
| Sottotitoli | `it`, caricati dal portale (non auto-generati) | `en-x-autogen`, auto-generati; stessi tempi della traccia italiana |
| Riassunto di capitolo (markdown "- Summary") | no | sì, circa 10.000 caratteri |
| Slide ([ADR 0012](0012-slide-dallo-zip-ufficiale.md)) | no | sì |

L'import ([ADR 0009](0009-import-lezione-intera-e-sottotitoli.md)) salva già entrambe le lingue di riassunti e sottotitoli: lato estensione non serve nulla.

## Cosa vale con qualunque opzione
- **Import invariato**: si continuano a salvare riassunti IT ed EN e tutte le tracce di sottotitoli.
- **Termini tecnici in forma originale**: nomi di API, funzioni e codice restano come nel corso (`useState`, `HashMap`, "AVL tree"), in entrambe le lingue.
- **Glossario bilingue per materia** ([ADR 0006](0006-sottotitoli-come-fonte-secondaria.md) §2): ogni termine ha la forma inglese del corso e la traduzione italiana, così una scheda in italiano può sempre mostrare il termine che uscirà all'esame.
- **Ripasso unico**: un concetto è lo stesso nelle due lingue; il ripasso FSRS non si duplica se si studia in entrambe.
- **Fonti nella stessa lingua**: la versione inglese nasce dalle fonti inglesi e quella italiana dalle fonti italiane, non da una traduzione dell'altra; si traduce solo ciò che esiste in una lingua sola (riassunto di capitolo e slide).

## Opzioni
| Opzione | Come funziona | Pro | Contro |
|---|---|---|---|
| **A. Schede e quiz in entrambe le lingue** (consigliata) | Claude genera ogni scheda e ogni quiz in IT ed EN nella stessa passata, con la stessa struttura. In *Io* si sceglie la lingua di studio e quella dei quiz; su ogni scheda un pulsante IT/EN cambia lingua al volo | Studi come preferisci e ti alleni in inglese; il pulsante su ogni scheda aiuta a imparare i termini | Generazione più lunga in Claude Desktop (circa il doppio del testo in uscita, nessun costo a consumo); schema più ricco |
| B. Tutto in inglese, aiuti in italiano | Schede e quiz solo in inglese, come all'esame, con i termini chiave tradotti nel glossario; le spiegazioni in italiano si chiedono all'assistente (M6) | Massima immersione, generazione più rapida | Studiare argomenti nuovi solo in inglese è più faticoso; l'aiuto in italiano arriva solo con M6 |
| C. Tutto in italiano, quiz anche in inglese | Schede in italiano con i termini tecnici in inglese; i quiz si generano in entrambe le lingue | Studio comodo, allenamento all'esame sui quiz | Le schede non abituano a leggere spiegazioni in inglese |

## Effetti tecnici dell'opzione A (se scelta)
- **Contratti** (`packages/contracts`): i testi di schede, quiz e concetti diventano coppie `{ it, en }`. La validazione richiede entrambe le lingue, lo stesso numero di opzioni e la stessa risposta corretta, così una domanda vale uguale nelle due lingue.
- **Generazione (M2)**: `leggi_lezione` restituisce le fonti di tutte e due le lingue; il prompt chiede le due versioni nella stessa passata, con gli stessi id. `salva_feed_lezione` rifiuta un feed con una lingua mancante.
- **Feed (M3)**: preferenza "Lingua di studio" in *Io* (predefinita: italiano) e pulsante IT/EN su ogni scheda. Il cambio è locale, senza nuove richieste: la scheda contiene già le due lingue.
- **Quiz e ripasso (M4)**: preferenza "Lingua dei quiz" (proposta: inglese, per l'esame). I risultati salvano la lingua usata, per mostrare come vanno le risposte in inglese.
- **Spazio**: trascurabile (testo).

Con B o C lo schema resta più semplice: un testo per lingua generata, più le traduzioni del glossario.

## Alternative scartate
- **Tradurre al volo nell'app** con un servizio esterno: costi, latenza, invio dei testi a terzi e traduzioni non controllate dei termini tecnici.
- **Generare una lingua sola e tradurre l'altra in un secondo momento**: due passate e due stati di generazione per versione, con il rischio di schede non allineate.

## Conseguenze
- Finché la scelta non è presa, M2 non fissa lo schema delle schede: è il primo punto da chiudere all'avvio della milestone.
- Il piano di sviluppo ([development-plan.md](../development-plan.md)) riporta in M2, M3 e M4 cosa cambia con l'opzione consigliata.
