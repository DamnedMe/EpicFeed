# ADR 0005: Sezione Libri (PDF/EPUB personali trasformati in feed)

- Stato: accettata
- Data: 14/11/2026
- Decisa da: Damian

## Contesto
Damian vuole caricare libri suoi, in PDF o EPUB, e ottenere lo stesso trattamento del materiale Epicode. Al caricamento sceglie se studiarli o solo leggerli. I libri finiscono in una sezione dedicata, in un catalogo personale con le copertine, e la trasformazione passa dal server MCP con Claude.

## Decisione
- **Modalità** scelta al caricamento e modificabile dopo: *Studiare* (clip per concetto, quiz di fine capitolo, ripasso FSRS) o *Solo leggere* (feed di passaggi chiave e idee del capitolo, senza quiz).
- **Trasformazione via MCP** da Claude Desktop sul PC. Il server MCP legge il file in locale, lo divide in capitoli e salva il feed generato da Claude un capitolo alla volta. Il file originale non lascia il PC. Il caricamento dall'app (con Claude API lato server) è una possibile estensione futura.
- **Archiviazione**: il feed generato (capitoli, clip, passaggi, quiz, concetti e copertina) va in un'area privata del server, visibile solo al proprietario tramite RLS. I risultati personali restano sul dispositivo (ADR 0003).
- **Solo personale**: nessuna condivisione e nessuna deduplica tra utenti, a differenza del catalogo Epicode (ADR 0002).
- **Copertina** dai metadati dell'EPUB o dalla prima pagina del PDF; se manca, una copertina tipografica generata. Sostituibile dall'utente.
- Solo file **senza DRM**. Nessun aggiramento di protezioni.

## Alternative scartate
- Feed del libro solo sul dispositivo: per leggerlo dal telefono servirebbe da subito una sincronizzazione.
- Feed cifrato end-to-end sul server: più privato ma più complesso. Resta un'evoluzione possibile.

## Conseguenze
- Nel dominio, lezione Epicode e libro diventano due tipi di `Source` con la stessa struttura `Source > Unit (capitolo) > FeedItem (Clip | Passage)`, più `QuizItem` e `Concept`. Feed, quiz e ripasso sono unici per entrambe le fonti; il ripasso può filtrare per fonte.
- Nuovi strumenti MCP: `importa_libro`, `leggi_capitolo`, `salva_feed_capitolo`, `stato_elaborazione`.
- Navigazione: Feed, Libri, Ripasso, Io (i quiz si aprono dal feed).
- I PDF scansionati richiedono OCR: fase successiva.
