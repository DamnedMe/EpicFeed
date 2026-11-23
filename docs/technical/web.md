# Web app (`apps/web`)

Next.js 16 (App Router, `src/proxy.ts` al posto del middleware), React 19, Tailwind 4 con i token di `packages/ui`. Stato: milestone **M3** in corso (accesso, Le mie lezioni, collegamento dell'estensione e di Claude Desktop, API di import e di generazione, feed di studio con *Io*).

## Pagine e API
| Percorso | Cosa fa | Accesso |
|---|---|---|
| `/accedi` | Codice via email al primo accesso, poi email e password | pubblico |
| `/accedi/callback` | Ritorno dal link dell'email di accesso (scambia il codice PKCE con la sessione) | pubblico |
| `/accedi/password` | Imposta la password (almeno 12 caratteri) dopo il primo accesso | sessione |
| `/` | **Feed di studio** a battute ([feed.md](../functional/feed.md)); la materia arriva da `GET /api/feed/subjects/{id}` | sessione |
| `/io` | **Io**: aspetto, preferenze di studio, totali, collegamenti | sessione |
| `/io/salvati` | Schede salvate sul dispositivo | sessione |
| `/lezioni` | **Le mie lezioni**: lezioni importate raggruppate per materia e capitolo, con numero di parti, sottotitoli e stato di generazione | sessione |
| `/estensione` | Collega l'estensione, elenca e revoca i collegamenti | sessione |
| `/claude-desktop` | Crea il token "genera" per Claude Desktop (mostrato una volta), elenca e revoca i token | sessione |
| `GET /api/generation/lessons` | Lezioni da generare e totali ([generation.md](generation.md#api)) | token "genera" |
| `GET /api/generation/lessons/{id}` | Fonti di una lezione per Claude | token "genera" |
| `POST /api/generation/lessons/{id}/feed` | Salva il feed generato | token "genera" |
| `POST /api/generation/token` | Crea un token "genera" (90 giorni) | sessione, stessa origine |
| `DELETE /api/generation/token/{id}` | Revoca un token "genera" | sessione, stessa origine |
| `GET /api/feed/subjects` | Materie con lezioni importate e quante hanno un feed ([feed di studio](#feed-di-studio-m3)) | sessione |
| `GET /api/feed/subjects/{id}` | Feed di tutta la materia, con ETag (`304` se invariato) | sessione |
| `POST /api/import` | Import di una lezione ([import.md](import.md#api-post-apiimport)) | token di import |
| `POST /api/extension/token` | Crea un token di import | sessione, stessa origine |
| `DELETE /api/extension/token/{id}` | Revoca un token | sessione, stessa origine |

Tutte le pagine sono dinamiche (`force-dynamic`): dipendono dalla sessione e non vanno mai in cache.

## Struttura
```
apps/web/src/
├─ proxy.ts             CSP con nonce, rinnovo della sessione, redirect ad /accedi
├─ app/                 pagine e route (solo composizione e presentazione)
├─ components/          guscio delle pagine di servizio, barra in basso
├─ features/feed/       feed di studio (client): modello, gesti, dati sul dispositivo, schermate
└─ server/              solo lato server ('server-only')
   ├─ env.ts            variabili d'ambiente validate con zod alla prima lettura
   ├─ supabase.ts       client Supabase con i cookie della richiesta
   ├─ auth.ts           utente corrente, allowlist delle email, password impostata
   ├─ container.ts      composizione: connessione Postgres, repository, casi d'uso
   ├─ http.ts           risposte di errore uniformi, controllo dell'origine, bearer
   ├─ import-handler.ts POST /api/import, testabile senza Next.js
   ├─ feed-handler.ts   GET /api/feed/subjects[/{id}], testabile senza Next.js
   ├─ appearance.ts     tema e accento dai cookie, per il primo render
   └─ feed-deps.ts      collega gli handler del feed ai servizi e al riallineamento con `after`
```
Le route chiamano `getServices()` di `container.ts`, che crea una sola volta la connessione (`postgres`, `prepare: false` per il pooler di Supabase, TLS obbligatorio tranne che su `localhost`) e collega gli adapter di `packages/adapters` ai casi d'uso del core.

## Accesso
Supabase Auth con email ([ADR 0007](../decisions/0007-generazione-via-mcp-e-login.md)):
1. lo studente inserisce l'email; se è in `ALLOWED_EMAILS` riceve un'email di accesso (`signInWithOtp`); altrimenti il messaggio è lo stesso, per non rivelare quali email sono ammesse;
2. l'email contiene un **link** che torna a `/accedi/callback` (flusso PKCE: funziona nel browser da cui è stato chiesto). Il **codice a 6 cifre** compare solo con un modello email personalizzato, che Supabase permette di modificare solo con un server SMTP proprio; l'app accetta entrambi;
3. entrato, al primo accesso imposta una password (salvata da Supabase; `user_metadata.password_set` ricorda che l'ha fatto);
4. dalle volte successive entra con email e password.

Ogni pagina protetta richiama `requireUser()` (sessione verificata con Supabase, non solo letta dal cookie) e ricontrolla l'allowlist.

Le letture del catalogo passano da `withUserRls`: la query gira con il ruolo `authenticated` e l'id dell'utente nei claim, quindi la RLS del database decide cosa si vede anche se il server usa una connessione privilegiata.

## Sicurezza
- **CSP per richiesta** (`proxy.ts`): script e stili solo con nonce, `frame-ancestors 'none'`, `connect-src` solo verso l'app e Supabase, `upgrade-insecure-requests` in HTTPS.
- Header fissi (`next.config.ts`): HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- Le API che usano la sessione accettano solo richieste della stessa origine (`isSameOrigin`), contro il CSRF.
- Nessuna chiave privilegiata nel client: il browser riceve solo URL e chiave pubblicabile di Supabase.
- Errori verso il client con codici stabili (`packages/contracts/src/errors.ts`) e messaggi in italiano, senza dettagli interni.

## Feed di studio (M3)
Decisioni in [ADR 0015](../decisions/0015-feed-di-studio-m3.md).

- `GET /api/feed/subjects` → `{ subjects: [{ subjectId, title, editionLabel, lessons, lessonsWithFeed }] }` (`ListStudySubjects`).
- `GET /api/feed/subjects/{id}` → la materia intera (`subjectFeedResponseSchema` in `packages/contracts/src/feed.ts`): capitoli in ordine, lezioni con link alla pagina del portale, parti con il loro link (per *Guarda sul portale*; le slide importate dallo zip non hanno una pagina sul portale e rimandano alla lezione) e feed salvato (`null` se la lezione non è ancora generata). Gli id del portale restano sul server: l'app riceve solo i link, costruiti e validati da `portalContentUrl` del core.
- **Cache**: `Cache-Control: private, no-cache` ed `ETag` = impronta di feed e versioni di allineamento (`ReadSubjectFeed`); con `If-None-Match` uguale la risposta è `304` senza corpo. Il DSA intero pesa circa 700 KB (150 KB compressi).
- **Permessi**: sessione verificata con Supabase (`getCurrentUser`, password già impostata); letture con `withUserRls` (`DrizzleStudyFeedRepository`): materie, lezioni, parti e feed visibili solo se importati. Per ogni lezione vale il feed più recente tra quelli visibili.
- **Riallineamento**: se la materia contiene feed allineati con regole vecchie, la risposta parte subito e `after()` di Next.js esegue `RealignLessonFeeds` (una lezione alla volta, fonti lette con i permessi dello studente, impronta delle fonti ricontrollata). La scrittura usa la connessione del server ed è condizionata alla versione letta, così due richieste contemporanee non scrivono due volte. Alla visita successiva l'ETag è cambiato e l'app scarica i minuti nuovi.

### Schermata del feed (`src/features/feed`)
Le regole pure stanno nel core ([core.md](core.md#feed-di-studio)): `storyOf` (battute, parola da indovinare, abbinamento frasi–codice), `buildStudySequence` (ordine e domande), `answerPoints`. La web app aggiunge:

| File | Ruolo |
|---|---|
| `model.ts` | Dalla risposta dell'API agli elementi da scorrere (`buildEntries`), indice dei capitoli, posizione da cui riprendere, minuto leggibile |
| `feed-client.ts` | `loadFeed`: materia scelta (ultima aperta con lezioni pronte), copia sul dispositivo mostrata subito, `If-None-Match` con la versione salvata, `304` → copia; senza rete la copia, con l'avviso *offline* |
| `storage.ts`, `local-state.ts` | `localStorage` con prefisso `ef:`, ogni lettura validata con zod e ogni errore assorbito; valori condivisi tra i componenti con `useSyncExternalStore` (sul server e al primo render valgono i predefiniti, quindi niente differenze di idratazione) |
| `gestures.ts` | `GestureRecognizer` senza DOM, con timer sostituibili: tocco (destra/sinistra, quota sinistra 30%), doppio tocco entro 230 ms, pressione di 500 ms, tolleranza di 12 px oltre la quale è uno scroll; `swipeAnswer` per il vero/falso (80 px, soprattutto orizzontale) |
| `feed-app.tsx` | Composizione: scroll verticale nativo con `scroll-snap`, solo le schede entro ±2 da quella visibile sono disegnate (le altre sono segnaposto vuoti alti uno schermo), le schede non visibili sono `inert`; sessione, punti, toast, sintesi vocale, tastiera, avanzamento automatico |
| `card-slide.tsx`, `quiz-slide.tsx`, `sheets.tsx`, `overlays.tsx` | Scheda a battute, domande, fogli delle azioni e dei capitoli, spiegazione dei gesti e riepilogo della sessione |
| `feed.css` | Stili del feed con i token `--sf-*`: tema e accento cambiano senza ricaricare; `data-motion='off'` e `prefers-reduced-motion` spengono animazioni e transizioni |

**CSP e stili**: la CSP non permette attributi `style` nell'HTML del server. I pochi valori dinamici (durata della battuta in avanzamento automatico, anello dei 5 minuti, trascinamento del vero/falso) sono variabili CSS impostate dal client con `style.setProperty` dopo il montaggio; il feed stesso si disegna solo nel browser, dopo il caricamento della materia.

**Aspetto**: `/io` salva tema e accento con la server action `saveAppearance` in due cookie `httpOnly` (`ef-theme`, `ef-accent`, un anno, valori validati con `isThemePreference`/`isAccentName`); il layout li legge con `readAppearance` e li mette su `<html>`, così la pagina nasce nei colori scelti. Nel frattempo il client cambia subito gli attributi di `<html>`.

**Font**: Space Grotesk, Inter e JetBrains Mono con `next/font/google`, scaricati alla build e serviti dall'app (`font-src 'self'`); la classe `ef-fonts` su `<html>` li collega ai token `--sf-font-*`.

## Variabili d'ambiente
Esempio commentato in `apps/web/.env.example`. In locale vanno in `apps/web/.env.local` (ignorato da git), su Vercel in *Settings → Environment Variables*.

| Variabile | Segreta | Cosa è |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | URL del progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | chiave pubblicabile (`sb_publishable_…`) |
| `DATABASE_URL` | **sì** | *Transaction pooler* di Supabase (porta 6543) con la password del database |
| `ALLOWED_EMAILS` | no, ma privata | email ammesse, separate da virgole |
| `NEXT_PUBLIC_EXTENSION_ID` | no | `bchcghaegcogobjapblaanbpnkpkihdd` |

La build in CI non ha bisogno di nessuna variabile: vengono lette e validate solo quando arriva una richiesta.

## Messa online (Vercel)
Una volta sola:
1. Vercel → *Add New → Project* → importa `DamnedMe/study-feed`; *Root Directory* `apps/web` (Vercel riconosce pnpm e Turborepo).
2. Aggiungi le variabili della tabella. Per `DATABASE_URL`: in Supabase *Connect → Transaction pooler*; la password, se non la conosci, si reimposta da *Database → Settings → Reset database password* (meglio solo lettere e numeri).
3. In Supabase *Authentication → URL Configuration*: *Site URL* = indirizzo Vercel, e tra i *Redirect URLs* `https://<indirizzo>/**`.
4. (Facoltativo) Per ricevere il codice invece del link: configurare un SMTP proprio in *Authentication → Emails → SMTP Settings* e mettere `{{ .Token }}` nei modelli *Magic link or OTP* e *Confirm sign up*.
5. Dopo aver creato il tuo account, *Authentication → Sign In / Providers*: disattiva *Allow new users to sign up*, così nessun altro può registrarsi anche conoscendo l'indirizzo.
6. Ricompila l'estensione con `WXT_APP_ORIGIN` = indirizzo Vercel ([import.md](import.md#build-e-installazione)).

## Sviluppo in locale
```bash
cp apps/web/.env.example apps/web/.env.local   # e compila i valori
pnpm --filter @study-feed/web dev              # http://localhost:3000
```

## Test
`src/server/*.test.ts` (Vitest): `handleImport` con servizi finti (ogni caso di errore), controllo dell'origine e lettura del bearer. I flussi con il database sono coperti dai test di `packages/adapters` e dalla prova end-to-end descritta in [import.md](import.md#come-è-testato).
