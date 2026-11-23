# Uso del portale Epicode: vincoli

EpicFeed legge solo il materiale a cui lo studente ha già accesso sul portale, dal suo browser, per uso personale. La ricognizione tecnica dettagliata del portale (come è costruito, quali richieste fa) è una nota riservata, fuori dalla repo.

## Vincoli che il progetto rispetta sempre
- **Nessuna scrittura** sul portale, in particolare sui progressi: nessun video o contenuto risulta visto o completato per effetto di EpicFeed.
- **Nessun login automatico** e nessun aggiramento di protezioni (il login del portale ha un controllo anti-bot): l'import avviene solo dalla sessione che lo studente ha già aperto nel suo browser.
- **Traffico come un uso normale**: richieste solo su azione dello studente, una alla volta, con pause; niente crawling e niente job in background che scaricano il corso.
- **Solo ciò che serve**: si leggono i campi necessari all'import e solo i contenuti visibili adesso; nessun dato di altri utenti viene letto o salvato.
- **Credenziali**: le password Epicode non passano mai da EpicFeed né dalle sue estensioni.
- **Materiale del corso**: resta di Epicode. Non è nella repo, non viene ridistribuito né reso pubblico.

## Cosa significa per l'architettura
- Il materiale studiabile è già testuale (riassunti delle parti video in italiano e in inglese, riassunti di capitolo, sottotitoli con i tempi, slide scaricabili dalla pagina ufficiale dei download): **non serve scaricare né tagliare video**. Le schede nascono dai riassunti; i sottotitoli danno i tempi ([ADR 0006](decisions/0006-sottotitoli-come-fonte-secondaria.md)), le slide arrivano dallo zip ufficiale ([ADR 0012](decisions/0012-slide-dallo-zip-ufficiale.md)).
- Il player video del portale funziona solo nei domini Epicode: nell'app le clip sono schede testuali con "Guarda sul portale" al minuto giusto.
- L'import avviene dall'estensione nel browser dello studente ([ADR 0001](decisions/0001-architettura-ibrida.md), [import.md](technical/import.md)).
