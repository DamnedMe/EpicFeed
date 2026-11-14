# ADR 0002: Catalogo condiviso e deduplicato, accesso con prova di possesso

- Stato: accettata
- Data: 14/11/2026
- Decisa da: Damian

## Contesto
Damian vuole evitare dati duplicati quando più studenti usano l'app, con il materiale organizzato per corso di studi, anno e materia e con revisioni datate. Il materiale però è di Epicode: passarlo a chi non lo ha già sarebbe ridistribuzione, con rischio di ban e di violazione del copyright.

## Opzioni
1. **Deduplica con prova di accesso**: una sola copia per versione, visibile solo a chi l'ha importata dal proprio account.
2. Condivisione libera: chi importa per primo rende la lezione visibile a tutti.
3. Solo dati personali separati: semplice, ma con duplicati e costi di generazione ripetuti.
4. Condivisione dei soli derivati (quiz e concetti): più prudente della 2, ma comunque derivati del materiale.
5. Permessi ricavati da ciò che l'utente vede su Epicode: è il modello ideale, ma senza un canale ufficiale si basa su dati del client, che si possono falsificare.

## Decisione
Opzione 1 ora. L'opzione 5 diventa la **fase 2**, quando ci sarà una verifica ufficiale (Student API, login Epicode o accordo con Epicode).

## Conseguenze
- Gerarchia `StudyProgram > Edition > Subject > Chapter > Lesson > LessonPart > ContentVersion`.
- `ContentVersion` identificata da `contentHash`; una modifica lato Epicode crea una nuova versione datata.
- Derivati generati una volta per versione.
- La porta `EntitlementVerifier` separa la regola dal modo di verificarla: il passaggio alla fase 2 è un nuovo adapter.
- RLS di Postgres come seconda linea di difesa.
