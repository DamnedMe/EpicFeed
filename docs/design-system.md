# EpicFeed: design system (approvato da Damian il 14/11/2026)

## Direzione
Layout "Inchiostro": vetro leggero (bianco 7% su scuro, bianco 72% su chiaro, blur 22px), angoli medi (card 16–26px, telefono 46px), azioni in colonna a destra nel feed, barra di navigazione in vetro (Feed, Libri, Ripasso, Io; i quiz si aprono dal feed, vedi ADR 0005).

## Colori principali
| Ruolo | Scuro | Chiaro |
|---|---|---|
| Fondo | Ossidiana #0B0B0E | #EDF0F3 |
| Superficie / vetro | rgba(255,255,255,.07) | rgba(255,255,255,.72) |
| Testo | Ghiaccio #DCE3EA | Ossidiana #0B0B0E |
| Testo secondario | #98A0A9 | #5B6570 |
| Concetti da ripassare / risposta sbagliata | Ghiaccio #DCE3EA | #4A535D |

## Accenti (a scelta dell'utente, default Racing red)
L'accento colora azioni, progresso, voce attiva e risposta giusta.

| Accento | Riempimento | Testo su scuro | Testo su chiaro | Testo sopra il riempimento |
|---|---|---|---|---|
| Racing red (default) | #E10600 | #FF4D3D | #C80500 | #FFFFFF |
| Electric violet | #8F00FF | #B266FF | #7A00DB | #FFFFFF |
| Blu oltremare | #2340FF | #8593FF | #2340FF | #FFFFFF |
| Turchese | #30D5C8 | #30D5C8 | #0A7870 ¹ | #0B0B0E |
| Verde lime | #A3E635 | #A3E635 | #3F6B0A | #0B0B0E |

¹ Approvato come #0B7F76, scurito appena in M0 per raggiungere il contrasto WCAG AA (4,5:1) sul fondo chiaro: da 4,26 a 4,67 ([ADR 0008](decisions/0008-strumenti-delle-fondamenta.md)).

Ogni combinazione di tema e accento è verificata nei test (contrasto ≥ 4,5:1). Implementazione: [technical/design-tokens.md](technical/design-tokens.md).

Con il rosso, la risposta giusta va confermata anche con un'icona di spunta, perché il rosso si legge come errore.

Temi: scuro, chiaro, automatico (segue il sistema).

## Tipografia
- Titoli: Space Grotesk 700
- Testo: Inter 400/500/600
- Etichette, codice, contatori: JetBrains Mono 400/500

## Mockup
- [design/mockups/](design/mockups/) (scuro: `A-`…`E-`, chiaro: `*-chiaro-*`)
- [design/mockups/libri-scuro-racing-red.png](design/mockups/libri-scuro-racing-red.png): sezione Libri (libreria, caricamento, feed di lettura). Le copertine usano titoli in Fraunces solo come segnaposto per le copertine generate.
