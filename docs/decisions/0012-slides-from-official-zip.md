# ADR 0012: Slide delle lezioni dallo zip ufficiale, lette da Claude Desktop

- Stato: accettata
- Data: 21/11/2026
- Decisa da: Damian (scelta "Zip ufficiale via Claude Desktop" tra tre opzioni); Claude per i dettagli tecnici, da confermare all'avvio di M2

## Contesto
Le lezioni Epicode hanno, oltre ai video e ai riassunti, le **slide** (parti `embed` di tipo `googledocs`, 91 nel corso *Data Structures and Algorithms*). L'import di M1 le esclude perché nella pagina sono una presentazione incorporata, senza testo leggibile dal CMS. Damian le vuole come fonte, importabili anche separatamente dal resto, visto che sono l'unico materiale che manca.

Verifiche sul portale (21/11/2026, profilo Chrome loggato):
- la pagina **Course downloads** del corso (`/course/{id}/downloads`) elenca un PDF per ogni presentazione, con nome `{titolo lezione}-{n}.pdf`, e ha un pulsante **Download all PDFs** che scarica tutto in uno zip;
- i PDF sono l'esportazione di Google Slides (`docs.google.com/presentation/d/{id}/export/pdf`), lo stesso link del pulsante *Download Attachment* nella pagina della lezione;
- le slide sono in inglese e contengono diagrammi (alberi, grafi, tabelle) che il testo da solo non rende.

## Decisione
1. **Download fatto dallo studente**: Damian preme *Download all PDFs* sul portale, una volta per corso (e di nuovo se il corso aggiunge lezioni). È una funzione del portale usata come previsto: l'estensione non scarica nulla e non chiama Google.
2. **Lettura sul PC con il server MCP (M2)**: un nuovo strumento `importa_slide` riceve il percorso dello zip (o della cartella estratta) e lo legge in locale. I PDF **non lasciano il PC**, come per i libri ([ADR 0005](0005-books-section.md)).
3. **Abbinamento alla lezione per nome**: ogni file `{titolo lezione}-{n}.pdf` viene abbinato a una lezione già importata dallo studente (titolo normalizzato, nello stesso corso), con `n` come ordine della presentazione nella lezione. I file che non trovano una lezione, o ne trovano più di una, vengono elencati e lasciati fuori: nessun abbinamento a indovinare. Le lezioni non ancora importate si importano prima con l'estensione.
4. **Cosa arriva al server**: il **testo** di ogni pagina, estratto sul PC, come nuova parte della lezione con provenienza `slides`, con la sua impronta (stesso testo, nessun doppione; testo cambiato, nuova versione). Le immagini e i PDF non si salvano sul server.
5. **Diagrammi letti da Claude**: durante la generazione `leggi_lezione` passa a Claude Desktop, oltre al testo, l'immagine delle pagine con figure, prodotta sul PC al momento. Claude usa i diagrammi per spiegare il concetto nella scheda (per esempio la rotazione di un albero AVL), a parole.
6. **Gerarchia delle fonti**: le slide sono materiale curato come i riassunti, quindi stanno allo stesso livello (riassunti e slide > glossario > sottotitoli, [ADR 0006](0006-subtitles-as-secondary-source.md)). Essendo in inglese, sono anche la fonte migliore per la terminologia dell'esame ([ADR 0011](0011-bilingual-study-it-en.md)).

## Alternative scartate
- **Estensione, solo il testo** (era la consigliata): pulsante *Importa slide* che scarica i PDF dal link Google del portale ed estrae il testo nel browser. Automatico, ma perde i diagrammi e aggiunge richieste a Google fatte dall'estensione.
- **Estensione, PDF interi** caricati nell'area privata di EpicFeed: diagrammi disponibili anche dal server, ma 100–200 MB per corso salvati fuori dal PC e richieste a Google fatte dall'estensione.

## Conseguenze
- **Estensione**: nessuna modifica. Le slide restano escluse dall'import delle lezioni.
- **M2**: nuovo strumento MCP `importa_slide`; `leggi_lezione` include testo e immagini delle slide; nuovo tipo di parte `slides` nel catalogo (migrazione che aggiunge un valore, non distruttiva). Libreria per leggere e disegnare le pagine dei PDF da scegliere all'avvio di M2.
- **Un passaggio a mano per corso**: scaricare lo zip e indicarlo a Claude Desktop.
- **Limite delle immagini**: per non appesantire la generazione, solo le pagine con figure o con poco testo passano come immagine, con un tetto per lezione da tarare sul set di valutazione di M2.

## Punti aperti
- ~~Verificare all'avvio di M2 che i nomi dentro lo zip coincidano con quelli della pagina *Course downloads* (finora visti solo nella pagina).~~ Verificato il 22/11/2026 sullo zip DSA (91 PDF): nomi `{titolo}-{n}.pdf` senza cartelle, nell'ordine del corso; per lezioni con lo stesso titolo la numerazione prosegue (`Examples-1…6`), e l'abbinamento usa l'ordine dello zip (vedi `docs/technical/generation.md`).
- Le lezioni fatte solo di slide (es. "Exam Prep") non vengono importate dall'estensione, quindi le loro slide restano fuori: da decidere se importarle come lezioni senza video.
- Testo delle slide nel catalogo condiviso: con un solo utente va bene; prima di aprire l'app ad altri studenti (M8) serve una verifica, perché il testo arriva da un file sul PC e non dal portale (stesso tema dei metadati condivisi in [import.md](../technical/import.md#limiti-noti)).
- Schede con il diagramma come immagine: possibile più avanti, richiederebbe di salvare immagini sul server.
