# ADR 0016: Reattività dell'app: regione dei server, sessione verificata in locale, feed dalla copia

- Stato: accettata
- Data: 23/11/2026
- Chiesta da: Damian (23/11/2026: "l'app è molto lenta nel passare da una voce di menu a un'altra … va resa più fluida e reattiva"); Claude per le scelte tecniche, tutte reversibili

## Contesto
Misure dai log di Supabase del 23/11/2026, durante l'uso di Damian:

- il database e l'autenticazione di Supabase stanno in **Irlanda** (`eu-west-1`);
- il proxy di Next.js girava vicino all'utente (Francoforte), ma **le pagine e le API giravano in Virginia** (`iad1`, la regione predefinita di Vercel): ogni query attraversava l'Atlantico;
- ogni pagina chiedeva due volte al server di autenticazione chi fosse l'utente (`getUser` nel proxy e di nuovo in `requireUser`); dalla Virginia una di queste chiamate durava **300–500 ms**;
- il feed aspettava due risposte delle API (elenco delle materie e materia) prima di mostrare la copia già salvata sul telefono, e a ogni ritorno sul feed rileggeva e validava circa 700 KB di materia;
- tra una sezione e l'altra non c'era nessuna schermata di attesa: il tocco sembrava ignorato finché il server non rispondeva.

## Decisione
1. **Server a Dublino** (`apps/web/vercel.json`, `regions: ["dub1"]`): le funzioni girano accanto al database e all'autenticazione di Supabase, ed è anche la regione Vercel più vicina all'Italia dopo Francoforte.
2. **Sessione verificata in locale** con `getClaims` nel proxy e in `getCurrentUser`: il token è firmato con una chiave asimmetrica (ES256), quindi firma e scadenza si controllano con la chiave pubblica del progetto, tenuta in memoria, senza chiamate per pagina. `getUser` (chiamata al server) resta dove serve la parola definitiva: pagine e azioni di accesso, ritorno dal link dell'email, creazione e revoca dei token di estensione e Claude Desktop, e quando il token dice che la password non è ancora impostata (il campo si aggiorna solo al rinnovo del token).
3. **Feed dalla copia**: il feed mostra subito la materia salvata sul telefono e intanto chiede al server se è cambiata (ETag, come prima). Se è cambiata la sostituisce restando sulla scheda che si stava guardando. La materia già validata resta in memoria: tornare sul feed da *Io* non la rilegge.
4. **Schermata di attesa** (`src/app/loading.tsx`): Next.js la mostra appena si tocca un collegamento e la scarica in anticipo con il prefetch dei link; la barra in basso resta al suo posto.
5. **Prima schermata dal server** (24/11/2026): alla prima apertura su un dispositivo, senza copia della materia, la pagina del feed arriva con la prima lezione già disegnata e il Ripasso con la richiesta della password; due cookie con solo `1` dicono al server cosa c'è già sul dispositivo. Così il LCP resta sotto 2,5 s anche su 4G lenta, prima che arrivino gli script (dettagli in [web.md](../technical/web.md#prima-schermata-dal-server)).
6. **Risposta al tocco**: pulsanti, voci della barra e righe di *Io* reagiscono subito alla pressione (leggera riduzione o attenuazione), senza l'evidenziazione grigia dei browser mobili.

## Conseguenze
- Una sessione chiusa da **un altro dispositivo** resta valida su questo fino alla scadenza del token, al massimo un'ora; l'uscita da questo dispositivo cancella subito i cookie. È il comportamento consigliato da Supabase per i token asimmetrici; i token di estensione e Claude Desktop, che durano di più, si creano e revocano solo con la verifica sul server.
- La regione si cambia dal file `vercel.json`; un deploy la applica. Se un giorno il progetto Supabase cambiasse regione, va cambiata anche questa.
- Il feed può mostrare per un attimo una versione vecchia della materia (per esempio senza i minuti appena riallineati) e poi aggiornarla; la posizione non cambia.
- Durante questo lavoro è emerso che, scrivendo sia `backdrop-filter` sia `-webkit-backdrop-filter`, Lightning CSS teneva solo la forma prefissata: su Chrome la barra in basso non sfocava ed era trasparente sopra il testo. Ora si scrive solo la forma standard (il prefisso lo aggiunge Lightning CSS) e un test Playwright controlla sfocatura e opacità della barra.
- Il progresso nel feed (posizione, punti, serie, sessioni) resta sul dispositivo come da [ADR 0003](0003-results-on-device.md). Due correzioni: la posizione si salva anche quando si apre una scheda da *Salvati*, e una sessione da 5 minuti si conta quando finisce, non solo se si sceglie *Altri 5 minuti* o *Basta per ora*.
