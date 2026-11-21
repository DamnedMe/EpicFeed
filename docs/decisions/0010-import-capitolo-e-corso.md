# ADR 0010: Import per capitolo e per corso, a ritmo prudente

- Stato: accettata
- Data: 21/11/2026
- Decisa da: Damian (scelta "lezione, capitolo o corso intero a scelta, con tempi non compromettenti: va bene lasciare la scheda aperta qualche minuto"); Claude per i dettagli tecnici dei punti 2–6, da confermare in revisione della PR

## Contesto
Con l'import di una lezione alla volta ([ADR 0009](0009-import-lezione-intera-e-sottotitoli.md)) un corso di 30–40 lezioni chiede decine di clic. Damian vuole poter importare anche un capitolo o l'intero corso, a patto che la sessione del portale regga e che il traffico non sembri un comportamento anomalo.

Verifiche sul portale reale (21/11/2026, profilo Chrome loggato, nessuna richiesta aggiuntiva al CMS):
- a ogni pagina aperta il portale fa circa 15 richieste al CMS, tra cui **l'albero intero del corso** per la barra laterale (`GET /items/content?filter[courses][course][_eq]={id}&filter[type]=unit`, con unità, moduli, attività e parti, titoli e visibilità);
- il token di accesso al CMS che il portale usa ha una **validità di 30 giorni**: un import di mezz'ora non rischia la scadenza della sessione;
- le letture (GET) non scrivono nulla: i progressi passano da altre collezioni e da `POST /items/access_logs`, che l'estensione non chiama.

## Decisione
1. **Tre scelte nel popup**: *Importa la lezione* (come prima), *Importa il capitolo*, *Importa tutto il corso*, ciascuna con il numero di lezioni e la durata stimata.
2. **Indice dal portale, senza richieste in più**: lo script nel mondo principale della pagina conserva una copia ridotta dell'albero che il portale ha già scaricato (solo id, titoli, tipi, ordine e visibilità). L'estensione sa così capitoli, lezioni e parti senza leggere attività, moduli e unità: per ogni lezione restano solo le GET delle parti utili (video e testi), una per parte.
3. **Ritmo prudente, con pause casuali**: una richiesta alla volta; 1,5–4 s tra una parte e l'altra, 2,5–5,5 s tra un player video e il successivo, 6–15 s tra due lezioni, 20–40 s al cambio di capitolo. Niente intervalli regolari e niente parallelismo. Per un corso di 30 lezioni (circa 90 video) servono una ventina di minuti; un capitolo ne chiede 3–4.
4. **Solo contenuti visibili**: le parti nascoste, non ancora aperte (`opens_at` futuro) o chiuse non si leggono, come nel portale.
5. **Lavoro nel service worker con ripresa**: il job importa una lezione alla volta; ogni lezione è un import a sé, quindi un errore su una lezione non ferma le altre. Si ferma per errori che colpirebbero anche le successive (scheda chiusa, sessione del portale, collegamento con EpicFeed), dopo 3 errori di fila o se lo studente preme *Interrompi*. Le lezioni importate si ricordano nello storage locale e si saltano al giro successivo, così un import interrotto riprende da dove era arrivato. Un segnale di vita ogni 20 s impedisce a Chrome di chiudere il service worker durante le pause.
6. **Limite orario di EpicFeed** (60 import/ora, invariato): se scatta, il job attende il tempo indicato dal server (al massimo 30 minuti) e ritenta solo l'invio, senza rileggere portale e video.

## Alternative scartate
- *Leggere tutto in anticipo nel popup*: il popup si chiude appena si clicca altrove; con un corso intero il lavoro andrebbe perso.
- *Chiedere al CMS l'elenco delle lezioni con un filtro*: una richiesta in più e un tipo di lettura (filtri, elenchi) che il ponte oggi non ammette di proposito; l'albero che il portale scarica comunque basta.
- *Leggere più lezioni in parallelo*: più veloce, ma crea raffiche di richieste che il portale stesso non fa mai fuori dall'apertura di una pagina.
- *Pause fisse*: più semplici, ma gli intervalli regolari sono la firma tipica di un automatismo.
- *Aprire le lezioni nella scheda una dopo l'altra*: imiterebbe la navigazione, ma ogni apertura registra un accesso (`access_logs`), invia analytics e può segnare contenuti come visti: proprio ciò che va evitato.

## Conseguenze
- Il traffico verso il CMS di un intero corso (circa 120 GET in 20 minuti) è inferiore a quello di una decina di pagine aperte a mano.
- La scheda del portale deve restare aperta sul corso per tutta la durata; il popup si può chiudere e, riaperto, mostra l'avanzamento.
- Se Epicode cambia la richiesta dell'albero del corso, capitolo e corso spariscono dal popup (resta l'import della lezione) finché non si aggiorna l'estensione; `treeCourseId` e `parseOutline` sono isolati e testati.
- La memoria delle lezioni importate è per browser: da un altro PC un corso si reimporta (senza doppioni, grazie all'impronta sul server).
