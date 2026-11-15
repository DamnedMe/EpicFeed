# `@study-feed/core`: dominio

Il core contiene le regole dell'app in TypeScript puro ([ADR 0004](../decisions/0004-clean-architecture-e-qualita.md)): nessun framework, nessun accesso a rete o database. Gira uguale nel browser, in Node, nelle funzioni edge e nel server MCP, e si testa senza simulare nulla.

```
packages/core/src/
├─ domain/
│  ├─ ids.ts              id "marchiati" (LessonId, LessonPartId…) e parseId
│  ├─ errors.ts           DomainError con codici stabili
│  ├─ text.ts             normalizzazione dei testi
│  ├─ catalog.ts          Source, Lesson, LessonPart
│  ├─ content.ts          contenuto di una parte e forma canonica
│  ├─ content-hash.ts     impronta SHA-256 del contenuto
│  ├─ content-version.ts  ContentVersion e stati di generazione
│  └─ entitlement.ts      Entitlement e prova di possesso
└─ application/
   └─ ports.ts            Clock, IdGenerator (le porte di persistenza arrivano in M1)
```

## Entità
| Entità | Cosa rappresenta |
|---|---|
| `Source` | Una fonte di studio: lezione Epicode o libro personale (i libri arrivano in M7) |
| `Lesson` | Lezione del catalogo condiviso (Directus `activity`), solo metadati |
| `LessonPart` | Parte di una lezione, `video` o `reading`: l'unità su cui si concedono i permessi |
| `ContentVersion` | Revisione datata del contenuto di una parte, identificata dall'impronta |
| `Entitlement` | Permesso di uno studente su una versione |

Gli id sono tipi "marchiati": a runtime sono stringhe UUID, ma il compilatore impedisce di passare un `LessonId` dove serve un `LessonPartId`. Le funzioni `create*` validano e normalizzano i campi e restituiscono oggetti congelati.

## Contenuto, forma canonica e impronta
Il contenuto importato di una parte è:
- `video`: riassunti `it`/`en` (fonte principale) e sottotitoli con tempi in millisecondi (solo per l'allineamento, [ADR 0006](../decisions/0006-sottotitoli-come-fonte-secondaria.md));
- `reading`: un testo markdown (per esempio il riassunto di capitolo).

`normalizeContent` lo porta in **forma canonica**, in modo che due import dello stesso materiale siano identici byte per byte:
- testi in Unicode NFC, fine riga `\n`, niente spazi in coda, al massimo una riga vuota di fila (l'indentazione resta, perché nel codice conta);
- riassunti vuoti rimossi;
- sottotitoli ordinati per tempo, righe vuote scartate, a capo interni uniti;
- limiti di sicurezza: 200 000 caratteri per testo, 10 000 righe di sottotitoli, tempi interi e coerenti.

`computeContentHash` serializza la forma canonica in JSON con le chiavi ordinate (`canonicalJson`), la codifica in UTF-8 e ne calcola lo SHA-256 con la Web Crypto API (iniettabile per i test). Risultato: 64 caratteri esadecimali.

Perché conta: lo stesso contenuto importato da più studenti si salva **una volta sola**, e se Epicode modifica una lezione l'impronta cambia e nasce una **nuova versione** ([ADR 0002](../decisions/0002-contenuti-condivisi-con-prova-di-accesso.md)).

## Stati di generazione
Le schede le genera Claude Desktop tramite il server MCP ([ADR 0007](../decisions/0007-generazione-via-mcp-e-login.md)). Ogni versione ha uno stato:

```
pending ──▶ generating ──▶ ready (finale)
               │  ▲  │
               │  │  └──▶ failed ──▶ generating
               └──┴──▶ pending   (generazione abbandonata)
```

`ready` è finale: il risultato si accetta una volta sola per versione; le correzioni passano da una nuova versione o da "Segnala errore". `transitionGeneration` rifiuta le transizioni non ammesse con `INVALID_STATUS_TRANSITION`.

## Prova di possesso
`grantByPossessionProof(user, version, presentedHash, now)` concede il permesso solo se l'impronta del contenuto presentato coincide con quella della versione. L'impronta va calcolata **dal server** sul contenuto ricevuto, mai presa dal client: non basta dichiarare di avere una lezione, bisogna inviarne il contenuto.

## Errori
`DomainError` ha un `code` stabile (`INVALID_ID`, `INVALID_CONTENT`, `ENTITLEMENT_MISMATCH`…) che l'API tradurrà in risposte HTTP e la UI in messaggi, senza dipendere dal testo.

## Test
Vitest, un file di test per modulo, con soglie di copertura (95% righe/funzioni, 90% rami) che fanno fallire la CI se scendono. Oggi la copertura è al 100% delle righe.
