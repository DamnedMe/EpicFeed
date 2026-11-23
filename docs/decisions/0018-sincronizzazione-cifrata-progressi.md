# ADR 0018: Sincronizzazione dei progressi cifrata sul dispositivo (M4, PR 2)

- Stato: accettata
- Data: 23/11/2026
- Decisa da: Damian (scelta 6 dell'[ADR 0017](0017-ripasso-ed-esame-m4.md): sincronizzazione già in M4, chiave ricavata dalla password); Claude per i dettagli tecnici
- Modifica: [ADR 0003](0003-risultati-sul-dispositivo.md) (i progressi di studio escono dal dispositivo, ma solo cifrati)

## Contesto
Da M4 ogni risposta del feed e del ripasso aggiorna il ripasso del concetto, salvato in IndexedDB. Damian studia sul telefono e sul PC: senza sincronizzazione i due ripassi divergono. L'ADR 0003 voleva i risultati solo sul dispositivo, per privacy; Damian ha scelto di sincronizzarli subito, a patto che il server non li possa leggere (scartata la cifratura del solo database, perché chi lo amministra potrebbe leggerli).

## Decisione

### Cosa si sincronizza
Lo **storico**, non gli stati: tutte le risposte (concetto, domanda, fonte, valutazione, lingua, momento), i giorni con un ripasso completato (ultimi 400) e la serie migliore. Ogni dispositivo unisce le risposte (una risposta è identificata da momento, concetto, fonte e domanda) e ricalcola gli stati FSRS ripassandole in ordine di tempo. FSRS è senza variazione casuale (ADR 0017), quindi lo stesso storico dà gli stessi stati ovunque e l'unione non dipende dall'ordine. La logica è pura, nel core (`progress-sync.ts`).

Punti, salvati, posizione nel feed e preferenze restano solo sul dispositivo, come in M3.

### Cifratura (solo WebCrypto, nessuna libreria)
1. **Chiave della password**: PBKDF2-SHA256 con 600.000 iterazioni (raccomandazione OWASP) sulla password, con sale = SHA-256 dell'email normalizzata con un prefisso fisso. Si calcola nel browser quando la password è a portata di mano: all'accesso con password, quando si imposta o cambia la password, e allo sblocco. Si conserva come chiave HKDF **non estraibile** in IndexedDB (`epicfeed-sync`): il browser la usa, nessuno script ne legge i byte. La password non viene salvata.
2. **Chiave di ogni scrittura**: HKDF-SHA256 con 16 byte casuali (`salt`) → AES-GCM a 256 bit, con 12 byte casuali di `iv`; entrambi nuovi a ogni scrittura. I dati associati legano il testo cifrato al metodo di derivazione (`kdf`).
3. Il testo in chiaro è la copia in JSON, compressa con gzip (`CompressionStream`) quando il browser lo permette.

Al server arrivano solo `kdf`, `salt`, `iv` e testo cifrato, in base64.

### Server
- Tabella `progress_snapshots`, una riga per utente: `revision`, `kdf`, `salt`, `iv`, `ciphertext` (≤ 4 milioni di caratteri, ~3 MB), `updated_at`. RLS: lo studente legge solo la propria riga; nessuna scrittura dal client; scrive solo l'API. Migrazioni `0008` e `0009`, solo aggiunte.
- `GET /api/progress` restituisce la copia (`404` se non c'è). `PUT /api/progress` scrive solo se il dispositivo parte dall'ultima `revision` (concorrenza ottimistica: altrimenti `409`, e il dispositivo rilegge, unisce e riprova, fino a 3 volte). Sessione, stessa origine, corpo ≤ 4,1 MB (sotto il limite di Vercel), forma validata con zod.

### Quando si sincronizza
All'apertura del feed e del Ripasso, 20 secondi dopo l'ultima risposta, alla fine di una sessione di ripasso, quando l'app va in secondo piano e quando torna la rete. Una sincronizzazione alla volta. Se il dispositivo e il server non hanno niente di nuovo l'uno per l'altro, si legge e basta.

### Password cambiata e sblocco
- Una chiave **appena verificata** dal server (accesso, nuova password, sblocco) può rifare la copia sul server se questa non si decifra: vuol dire che era cifrata con la password vecchia. I progressi del dispositivo restano.
- Una chiave **vecchia** che non decifra la copia non sovrascrive mai: il Ripasso mostra *La password è cambiata* e chiede la password. Il server la verifica (`confirmPassword`, lo stesso accesso di Supabase con i suoi limiti di tentativi), il browser ne ricava la chiave nuova e unisce.
- Su un dispositivo senza chiave (per esempio entrato con il codice via email) il Ripasso propone *Sincronizza telefono e PC* con la stessa richiesta della password.

### Più account sullo stesso browser
I progressi del dispositivo hanno un proprietario. Se entra un altro account, i progressi del precedente si cancellano dal dispositivo (se erano già sincronizzati restano sul server, cifrati) invece di finire nella copia dell'altro.

## Alternative scartate
- **Sincronizzare gli stati FSRS** con regole "vince l'ultimo": perde risposte date offline su due dispositivi.
- **Sale casuale salvato sul server per PBKDF2**: richiederebbe di leggere il sale prima dell'accesso, rivelando quali email hanno un account; il sale dall'email è unico per utente e non ha bisogno del server. Il sale casuale c'è comunque, a ogni scrittura, nell'HKDF.
- **Argon2** (più resistente agli attacchi con GPU): non è in WebCrypto e servirebbe una libreria WebAssembly; PBKDF2 con 600.000 iterazioni è la scelta standard senza dipendenze. Il campo `kdf` permette di cambiarla in futuro.
- **Frase di recupero** separata dalla password: più sicura contro chi conosce la password, ma un segreto in più da conservare. Resta l'opzione per *Accedi con Google* (M8), dove non c'è password.

## Conseguenze
- Il server conserva i progressi senza poterli leggere; chi conosce la password di Damian sì, come per l'account stesso.
- Con la password dimenticata, la copia sul server non si recupera: si rifà dal primo dispositivo che entra con la password nuova, con i progressi che ha.
- Se la sincronizzazione non riesce (offline, errore) lo studio continua: i progressi restano sul dispositivo e partono alla volta successiva.
- La chiave resta sul dispositivo anche dopo l'uscita dall'account, come i progressi in chiaro: entrambi spariscono se entra un altro account o si cancellano i dati del sito.
