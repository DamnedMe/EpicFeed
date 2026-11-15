# Documentazione funzionale: panoramica

Cosa fa l'app dal punto di vista dello studente. Ogni funzione nuova aggiunge o aggiorna una sezione qui.

## Importare una lezione
Lo studente apre una lezione nel portale Epicode come sempre e preme **Importa** nell'estensione. La lezione entra nel suo feed. Se un altro studente l'aveva già importata, non viene duplicata. Ognuno vede solo le lezioni che ha importato dal proprio account.

## Feed
Nella barra in basso: Feed, Libri, Ripasso, Io.

Clip verticali di un concetto ciascuna, ordinate per capitolo o in modalità "Per te". Su ogni clip ci sono quattro azioni: **Salva**, **Chiedi** (domanda all'assistente), **Quiz** rapido e **Fonte** ("Guarda sul portale": apre la lezione al minuto della clip). Le clip sono schede testuali animate, perché i video Epicode non si possono riprodurre fuori dal portale. Una barra in alto mostra l'avanzamento nel capitolo.

### Da dove viene il testo delle schede
Il testo nasce dai riassunti scritti di ogni parte video e del capitolo. I sottotitoli del portale, spesso generati in automatico e imprecisi, servono soprattutto a sapere a che minuto aprire la lezione con "Guarda sul portale". Quando una scheda riporta un dettaglio preso dai sottotitoli, Claude lo ha prima corretto con i riassunti e con un glossario dei termini tecnici del corso, e la scheda lo indica con un piccolo segno.

### Segnala errore
Dal menu di ogni scheda, **Segnala errore** permette di evidenziare il testo sbagliato e scrivere quello giusto, oppure solo di segnalare che qualcosa non torna (in questo caso la scheda viene rigenerata dai riassunti). La correzione resta: vale sul telefono e sul PC, viene riapplicata se Epicode aggiorna la lezione e, se riguarda un termine tecnico, viene usata anche per le lezioni successive della stessa materia. Le correzioni sono visibili solo a chi le scrive. Si può segnalare un errore anche chiedendolo all'assistente di studio.

## Quiz di fine capitolo
Domande generate dai riassunti del capitolo (mai dai sottotitoli), con la spiegazione dopo ogni risposta. Le risposte sbagliate aggiungono il concetto al ripasso.

## Ripasso
Ogni giorno l'app propone i concetti da rivedere, secondo un algoritmo di ripetizione spaziata (FSRS). Lo studente valuta quanto se lo ricordava (Di nuovo, Difficile, Bene, Facile) e l'app pianifica il ripasso successivo.

## Libri
Sezione dedicata con la libreria personale: copertine, filtro Tutti/Studio/Lettura e un riquadro "Continua" per l'ultimo libro aperto. Con **+** si carica un PDF o un EPUB (senza DRM) e si sceglie:
- **Studiare**: clip per concetto, quiz a fine capitolo e ripasso degli errori, come per le lezioni Epicode;
- **Solo leggere**: un feed di passaggi chiave e idee del capitolo, con Salva, Chiedi, Pagina (il punto del libro) e Studia (passa alla modalità studio).

Si possono anche scegliere i capitoli da includere e la lunghezza delle clip. La trasformazione si avvia da Claude Desktop sul PC; durante l'elaborazione la libreria mostra il capitolo a cui è arrivata. Il file resta sul PC e il libro è visibile solo a chi l'ha caricato.

## Aspetto
Tema scuro, chiaro o automatico, e cinque colori di accento: racing red (predefinito), electric violet, blu oltremare, turchese e verde lime. Vedi [design-system.md](../design-system.md).

## Privacy
I risultati (risposte, errori, ripasso) restano sul dispositivo dello studente. Si possono esportare e reimportare con un file di backup.
