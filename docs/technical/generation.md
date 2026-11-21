# Generazione di schede e quiz (M2)

Stato: in sviluppo. Decisioni: [ADR 0007](../decisions/0007-generazione-via-mcp-e-login.md), [ADR 0011](../decisions/0011-studio-bilingue-it-en.md), [ADR 0012](../decisions/0012-slide-dallo-zip-ufficiale.md), [ADR 0013](../decisions/0013-generazione-m2-dettagli.md).

## Flusso
```
Claude Desktop ──stdio──▶ server MCP (PC) ──HTTPS + token "genera"──▶ API EpicFeed ──▶ Postgres
   │  lezioni_da_generare      │ legge le fonti della lezione (riassunti IT+EN, testi, sottotitoli, slide)
   │  leggi_lezione            │
   │  (Claude genera il feed)  │
   └─ salva_feed_lezione ──────┘ valida (zod + checkLessonFeed) → API rivalida, allinea ai video, salva
```

Unità di generazione: la **lezione**. Un feed è legato all'**impronta delle fonti** (`computeLessonSourcesHash`) letta da Claude: se la lezione cambia nel frattempo, l'API rifiuta il salvataggio.

## Il feed di una lezione
Ogni testo per lo studente è una coppia `{ it, en }` (ADR 0011). Schemi in `packages/contracts/src/generation.ts`, tipi e regole in `packages/core/src/domain/feed.ts`.

| Elemento | Campi principali | Obiettivo per lezione | Limiti accettati |
|---|---|---|---|
| Scheda (`concept`, `steps`, `comparison`, `code`) | titolo (≤ 120), frase chiave (obiettivo 140, max 220), spiegazione (obiettivo 500, max 900), passi / confronto / codice secondo il tipo, termini, concetti, parte di provenienza, origine | 8–12 | 3–20 |
| Domanda (`multiple_choice`, `true_false`) | domanda, 3–5 opzioni nello stesso ordine nelle due lingue o risposta vero/falso, spiegazione, concetto, difficoltà 1–3 | 6–8 | 2–12 |
| Concetto | chiave stabile in kebab-case, nome, descrizione | 3–6 | 1–10 |
| Voce di glossario | termine inglese del corso, traduzione italiana, definizione | secondo la lezione | 0–40 |

### Controlli
1. **Forma** (zod, oggetti `strict`): campi ammessi, tipi, lunghezze, testi su una riga dove serve, id in kebab-case, UUID delle parti.
2. **Regole** (`checkLessonFeed`, restituisce tutti i problemi con il percorso, es. `quiz[2].correctIndex`):
   - quantità nei limiti;
   - id di schede e domande e chiavi dei concetti univoci; termini del glossario univoci senza distinzione di maiuscole;
   - ogni concetto citato esiste, ogni concetto compare in almeno una scheda;
   - la parte di provenienza appartiene alla lezione;
   - passi e opzioni in numero uguale nelle due lingue, risposta corretta tra le opzioni, opzioni non ripetute;
   - passi solo nelle schede `steps`, confronto solo in `comparison`, codice obbligatorio in `code`;
   - un testo lungo identico nelle due lingue è segnalato come traduzione mancante.

Il server MCP esegue entrambi i controlli prima di inviare e restituisce a Claude l'elenco dei problemi da correggere; l'API li ripete, perché non si fida del client.

## Allineamento al minuto
`alignCard(scheda, tracce)` in `packages/core/src/domain/alignment.ts`, eseguito dall'API al salvataggio per le schede tratte da una parte video.

1. Le parole di scheda e sottotitoli si riducono a una radice grezza: minuscolo, senza accenti, senza parole frequenti italiane e inglesi, senza la `s` finale, primi 5 caratteri (`trees` → `tree`, `alberi` → `alber`).
2. La traccia si divide in finestre di 30 secondi, una per ogni riga di partenza.
3. Punteggio di una finestra: somma dei pesi delle parole della scheda presenti, diviso il totale delle parole della scheda presenti nella traccia. Peso = `log(1 + righe / righe che contengono la parola)`, doppio per i termini del glossario.
4. Si accetta la finestra migliore solo se: confidenza ≥ 0,3, almeno 3 parole in comune, almeno il 20% meglio della miglior finestra che non si sovrappone. Altrimenti `null`: "Guarda sul portale" apre la parte dall'inizio.
5. Il tratto parte 1,5 secondi prima della finestra. Si prova ogni traccia con i testi della scheda nella sua lingua e si tiene il risultato più sicuro; a parità vince la traccia non automatica.

I parametri (`DEFAULT_ALIGNMENT_OPTIONS`) si tarano sul set di valutazione di M2.

## Prossimi passi (PR successive di M2)
- Database e API: `lesson_feeds`, `glossary_terms`, token "genera", route per lezioni da generare, fonti e salvataggio.
- Server MCP (`apps/mcp`) e pacchetto `.mcpb`.
- Slide dallo zip (`importa_slide`).
