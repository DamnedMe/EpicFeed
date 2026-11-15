# Ricognizione del portale Epicode (learn.epicode.edu.mt)

Data: 14 novembre 2026. Analizzate solo parti pubbliche: pagina di login, pagina di registrazione e il bundle JS principale, caricati una volta dal browser come farebbe un utente normale. Nessun login, nessuna chiamata alle API.

## 1. Termini d'uso e privacy

**Termini d'uso per studenti: non trovati in forma pubblica.** Login e registrazione non hanno link a termini, privacy o cookie policy. Il bundle chiama `/v2/onboarding/accept`, quindi è probabile che i termini vengano mostrati e accettati *dentro* la piattaforma al primo accesso, oppure che stiano nel contratto di iscrizione. **Da recuperare da Damian** (contratto, regolamento studenti, schermata di onboarding).

Documenti pubblici trovati:
- [Privacy Policy di Epicode Institute of Technology Ltd](https://instituteoftechnology.epicode.com/en/?p=51158) (Malta). Copre i dati di studenti e candidati, inclusi i log di attività dell'LMS, presenze, esami (con registrazione di immagine e voce agli esami proctored). Non dice nulla su accesso automatizzato o scraping. Contatto: privacy@epicode.edu.mt.
- [Condizioni d'uso della "Hiring Platform"](https://join.epicode.com/wp-content/uploads/2022/11/condizioni-uso-piattaforma_EN_20221014.pdf) di Epic Education S.r.l. Riguardano le **aziende** che assumono, non gli studenti, ma indicano lo stile del gruppo: contenuti e software di proprietà Epicode, vietato riprodurli/copiarli anche parzialmente senza consenso, vietato decompilare, vietato cedere le credenziali.

**Lettura prudente** (non è un parere legale): finché non leggiamo i termini studenti, assumiamo che
- il materiale sia protetto da copyright e utilizzabile solo per studio personale;
- non vada ridistribuito né reso pubblico (l'app resta privata, single-user);
- condividere le credenziali sia vietato (quindi Damian non deve darle a nessuno, nemmeno a noi).

## 2. Stack del frontend

| Aspetto | Cosa si vede |
|---|---|
| Framework | React 18 SPA (id `:r3:` di `useId`), build Vite (`/assets/index-<hash>.js`, ~12,6 MB, 26 chunk) |
| UI | MUI, i18next (IT/EN), react-router, Redux, axios, zod |
| Backend | **Directus** (CMS headless): le chiamate vanno a `VITE_DIRECTUS_LOCAL_URL`, host non visibile prima del login |
| Auth | Email → password (+ login Google, 2FA TOTP). Token Bearer in `localStorage.auth_token`, cookie con `credentials: include`, endpoint `/v2/auth/csrf`, `/auth/refresh` |
| Anti-bot | **Cloudflare Turnstile** sul login. Un login automatico richiederebbe di aggirarlo: escluso |
| Video | Vimeo (player.js, `player.vimeo.com`), anche YouTube, video.js/HLS |
| Telemetria | Sentry, PostHog, OpenPanel, OpenReplay (session replay): la piattaforma registra l'attività, quindi un uso anomalo si nota |
| Altro | Editor.js, Monaco, Firebase, forum, ticket, calendario, chat (`/api/chat`) |

Altri host del gruppo citati nel bundle: `cms.epicode.com`, `exams.epicode.com`, `cert.epicode.com`, `docgen.epicode.com`, `learn.epicode.com`, `app.epicode.com`, `talent.epicode.com`, `uni.epicode.com`.

## 3. Endpoint usati dal frontend (rilevanti per noi)

Percorsi relativi alla base Directus:

- **Corso e curriculum**: `/course/{courseId}/curriculum`, `/course/{courseId}/curriculum/{contentId}`, `/v2/course/{id}/classes`, `/v2/curriculum-bookmarks`, `/v2/content/redirect/{id}`, `/v2/content/calendar`
- **Trascrizioni video**: `/v2/integrations/vimeo/transcript` (molto utile: le clip e i quiz si possono generare dal testo, senza scaricare i video)
- **Profilo**: `/users/me`
- **Esami**: `/v2/exam/{id}/progress`, `/v2/exam/{id}/result`
- **⚠️ Da NON chiamare mai**: `/v2/content/checkmark-completion/{id}` e `/bulk` (segnano i contenuti come completati), qualunque `POST/PATCH` su progressi, esami, forum, ticket.

### Scoperta importante: "Student API" ufficiale

Nelle impostazioni account c'è una sezione **Student API** (`/v2/integrations/student-api/status`, `/register`, `DELETE /v2/integrations/student-api`). Lo studente preme "Carica token", ottiene un **access token** personale e un **URL base API** da copiare. È un'integrazione pensata dalla piattaforma per gli studenti stessi.

Se la usiamo:
- niente password né scraping: Damian genera il token, lo incolla nella nostra app, e può revocarlo quando vuole dallo stesso pannello;
- è il canale più pulito rispetto ai termini d'uso, perché è un accesso offerto da Epicode.

**Aggiornamento 14/11:** nell'account di Damian (Impostazioni → Integrations) la sezione non compare: ci sono solo Calendar Feed (URL ICS), GitHub e Discord. Il codice esiste ma è nascosto, probabilmente dietro un feature flag non attivo per gli studenti. Non chiamiamo l'endpoint a mano: sarebbe usare una funzione che Epicode non ha aperto. Si può chiedere a Epicode se è prevista l'apertura.

Fonte ufficiale già disponibile: il **Calendar Feed ICS** (lezioni e scadenze), utilizzabile per il calendario di studio.

## 4. Come proseguire da loggato

In ordine di preferenza:

1. **File HAR** (strada attuale, perché la Student API non è attiva per Damian). Damian apre una lezione con DevTools → Network attivo, la naviga normalmente (curriculum, una parte video, un riassunto), poi esporta "Save all as HAR (sanitized)". Prima di passarcelo togliamo cookie, header `Authorization` e token con uno script locale. Ci serve solo per capire la forma delle risposte.
2. **Student API**, se Epicode la abilita: token in `.env.local`, mai in chat né in git.
3. **Mai**: password condivisa, login automatico (c'è Turnstile), crawling di tutto il corso in una volta, chiamate a endpoint di completamento.

Regole di traffico per la fase di sviluppo: richieste solo su azione di Damian, cache locale dei contenuti già letti, nessun job in background che scarica il corso.

## 5. Analisi da loggato (HAR del 14/11/2026)

Fonte: un file HAR esportato da Damian mentre navigava il corso *Data Structures and Algorithms* (dashboard, curriculum, alcune lezioni, un riassunto, la pagina di una parte video). 110 richieste. Il file è stato ripulito da cookie e token, analizzato nella sessione di lavoro e poi cancellato: **non è nella repo**.

### Backend

- API: **Directus** su `https://cms.epicode.edu.mt` (endpoint standard `/items/<collezione>` più endpoint custom `/v2/...`). Autenticazione con header Bearer.
- Analytics proprie su `analytics.epicode.tech/api/track` e Sentry.
- **A ogni pagina aperta il frontend fa `POST /items/access_logs`** (corso + contenuto). La piattaforma registra quindi ogni contenuto aperto: è un comportamento normale dell'app, e per noi conferma che ogni richiesta lascia traccia.

### Struttura dei contenuti

`GET /items/content` (con `filter` per corso e `fields` annidati) restituisce l'albero del corso:

```
unit (es. "Data Structures and Algorithms")
└─ module      = capitolo   (es. "3. Trees")
   └─ activity = lezione    (es. "Binary trees")
      ├─ embed/vimeo        = parte video        (91 nel corso)
      ├─ embed/googledocs   = slide/documento    (91)
      ├─ markdown           = riassunto testuale (30)
      ├─ quiz               = "Self-assessment"  (6, uno per capitolo)
      └─ article, nps, meeting, openEnded
```

Il dettaglio di un contenuto è `GET /items/content/{id}`. Campi utili:

| Campo | Cosa contiene |
|---|---|
| `title`, `type`, `embed_type`, `sort` | Titolo, tipo, ordine |
| `url` | Per i video: `https://player.vimeo.com/video/{vimeoId}` |
| `summary` | **Per ogni parte video: riassunto in markdown già pronto, in italiano e in inglese** (`summary.it`, `summary.en`, circa 2.000 caratteri) |
| `markdown` | Per i riassunti di capitolo: testo completo in markdown (circa 10.000 caratteri), con esercizi, soluzioni e Q&A |
| `body` | Blocchi Editor.js; nei riassunti `body.config.metaData` elenca i video collegati (id Vimeo + titolo) |

Altri endpoint visti: `/items/courses`, `/items/courses/{id}`, `/items/folders`, `/items/user_course_folders`, `/v2/content/redirect/{courseId}` (ultimo contenuto aperto), `/items/content_completions` e `/items/video_tracking` (lettura dei progressi).

### Video e trascrizioni

- La configurazione del player Vimeo contiene i **sottotitoli VTT** (`text_tracks`): inglese generato automaticamente e **italiano**, con timestamp. Utili per i tempi, ma spesso generati automaticamente e imprecisi (segnalazione di Damian, 15/11): sono una **fonte secondaria**, usata per collegare le clip al minuto del video e corretta con riassunti e glossario prima dell'uso ([ADR 0006](decisions/0006-sottotitoli-come-fonte-secondaria.md)).
- Gli URL dei VTT sono firmati e scadono: vanno letti al momento, mentre si guarda la lezione, non salvati come link.
- Il video ha **`embed_permission: whitelist`**: si può incorporare solo nei domini autorizzati da Epicode. **Nella nostra app il player Vimeo non funzionerà.** Quindi le clip saranno schede testuali/animate generate da trascrizione e riassunti, con un link "Guarda sul portale" al secondo giusto.

### Progressi: cosa evitare

- `video_tracking` salva gli **intervalli di secondi guardati** (`chunks`) e `content_completions` la percentuale e lo stato completato. Li scrive il player del portale mentre guardi.
- Nel HAR **non ci sono scritture** su progressi o completamenti: solo GET, più `access_logs` e analytics.
- La nostra app non deve mai scrivere su queste collezioni né su `/v2/content/checkmark-completion`, e non deve riprodurre i video del portale in background.

### Attenzione ai dati di altri studenti

`GET /items/courses/{id}` con `fields=*.*` restituisce anche **le iscrizioni di altri studenti** (id utente, classe, stato) e gli utenti del tenant. Non ci servono: la nostra app chiederà solo i campi necessari (`fields=id,title,...`) e non salverà mai dati di altri utenti.

### Cosa significa per l'architettura

- Il materiale "studiabile" è già testuale: riassunti per video (IT/EN), riassunti di capitolo in markdown, sottotitoli VTT italiani. **Non serve scaricare né tagliare video.** La base delle schede sono i riassunti; i sottotitoli danno i tempi ([ADR 0006](decisions/0006-sottotitoli-come-fonte-secondaria.md)).
- L'importazione può avvenire dal browser di Damian mentre usa il portale (estensione): legge solo il contenuto aperto, con le stesse richieste che l'app fa già. Zero traffico in più, nessun crawling.
- I quiz di capitolo (`quiz`) esistono già sul portale: li possiamo usare come riferimento, ma i nostri quiz saranno generati dai riassunti, per non leggere le risposte degli esami.

## 6. Domande aperte

- Testo dei termini d'uso studenti / regolamento (onboarding o contratto).
- Cosa espone la Student API e se ha limiti d'uso.
- ~~Formato dei riassunti e dei capitoli~~: risolto, vedi sezione 5.
- Verificare che i sottotitoli italiani ci siano per tutte le parti video, non solo per la prima.
- Verificare che il riassunto `summary` ci sia per tutte le parti video: se manca, la scheda si basa sul riassunto di capitolo e i passaggi da sottotitoli vanno trattati con più cautela.
