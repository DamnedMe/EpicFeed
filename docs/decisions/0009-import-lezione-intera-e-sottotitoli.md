# ADR 0009: Import della lezione intera, sottotitoli come tracce separate, token dell'estensione

- Stato: accettata
- Data: 15/11/2026
- Decisa da: Damian (punto 1, scelta "Lezione intera, sottotitoli tutti"); Claude durante M1 per i punti 2–5, nel perimetro del [piano di sviluppo](../development-plan.md), da confermare in revisione della PR

## Contesto
In M1 l'estensione deve importare la lezione aperta nel portale ([ADR 0001](0001-architettura-ibrida.md), [ADR 0007](0007-generazione-via-mcp-e-login.md)). Dalla ricognizione ([portal-recon.md](../portal-recon.md)):
- riassunti e riassunto di capitolo arrivano dal CMS Directus con le credenziali della pagina;
- i sottotitoli non sono nel CMS: li elenca la configurazione del player Vimeo (`window.playerConfig`), che funziona solo dentro i domini Epicode, con URL firmati a scadenza;
- per leggere i sottotitoli di un video serve quindi aprirne il player nella pagina del portale.

## Decisione
1. **Lezione intera con un clic, sottotitoli di tutte le parti video.** L'estensione monta nella pagina del portale un iframe del player nascosto, muto e senza autoplay, uno alla volta con una pausa di 1,5 s, legge l'elenco delle tracce, scarica i VTT e rimuove l'iframe. Nessuna riproduzione, nessuna scrittura sul portale.
2. **Sottotitoli come tracce separate dalle versioni** (`subtitle_tracks` + `subtitle_access`), non dentro il contenuto della versione. Ogni traccia ha la sua impronta, si deduplica e si concede per prova di possesso come le versioni.
3. **Corrispondenza del catalogo**: tenant → corso di studi, anno accademico da `starts_at` → edizione, corso Epicode → materia, modulo → capitolo, attività → lezione ([import.md](../technical/import.md#corrispondenza-portale--catalogo)).
4. **Token di import per l'estensione**: `sfi_` + 256 bit casuali, solo SHA-256 nel database, scope `import`, 30 giorni, revocabile dalla pagina Estensione; consegnato dalla web app con `externally_connectable` e accettato solo dall'origine della web app. ID dell'estensione fisso tramite la chiave pubblica nel manifest.
5. **Limite di frequenza nel database** (`import_events`, 60 import/ora per utente), senza servizi esterni.

## Alternative scartate
- *Solo il video aperto*: un clic per ogni video, più lento e facile dimenticarne uno.
- *Sottotitoli nel contenuto della versione* (come previsto in M0): i sottotitoli auto-generati cambiano più spesso dei riassunti; ogni cambio avrebbe creato una nuova versione e fatto rigenerare le schede. E una traccia che una volta non si scarica avrebbe cambiato l'impronta.
- *Aprire il player in una scheda nuova o in background*: più visibile per lo studente e più simile a un'automazione; l'iframe nascosto nella pagina già aperta è il comportamento più vicino all'uso normale.
- *Sessione Supabase condivisa con l'estensione*: darebbe all'estensione accesso a tutto l'account; il token di import apre una sola API.
- *Upstash/Redis per il limite di frequenza*: un servizio in più per un traffico minimo.

## Conseguenze
- Per una lezione con 5 video l'import richiede circa 10 secondi; l'estensione mostra l'avanzamento.
- La migrazione M0 prevedeva i sottotitoli nel contenuto: il tipo `VideoPartContent` ora ha solo i riassunti. Nessun dato era ancora stato importato, quindi nessuna migrazione di dati.
- Se Epicode cambia la struttura del player o del CMS, l'import smette di funzionare finché non si aggiorna l'estensione: i parser sono isolati in `apps/extension/src/lib` e testati.
- Titoli e posizioni del catalogo condiviso sono "vince l'ultimo import": da rivedere prima di aprire l'app ad altri studenti (M8).
