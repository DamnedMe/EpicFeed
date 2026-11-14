# ADR 0003: Risultati personali sul dispositivo

- Stato: accettata
- Data: 14/11/2026
- Decisa da: Damian

## Contesto
I risultati personali (risposte, errori, schede di ripasso) non devono occupare spazio sul server, e tenerli in locale è anche meglio per la privacy.

## Decisione
I risultati restano in IndexedDB nel browser dell'utente, dietro la porta `ProgressStore`.

## Conseguenze
- Il server non conosce i risultati.
- Se i dati del browser vengono cancellati si perdono: serve export/import di backup.
- Più dispositivi e server MCP richiederanno in futuro una sincronizzazione cifrata end-to-end (decisione da prendere con un nuovo ADR).
