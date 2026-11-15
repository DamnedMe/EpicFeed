# Web app (`apps/web`)

Next.js 16 (App Router, `src/proxy.ts` al posto del middleware), React 19, Tailwind 4 con i token di `packages/ui`. Stato: milestone **M1** (accesso, Le mie lezioni, collegamento dell'estensione, API di import).

## Pagine e API
| Percorso | Cosa fa | Accesso |
|---|---|---|
| `/accedi` | Codice via email al primo accesso, poi email e password | pubblico |
| `/accedi/callback` | Ritorno dal link dell'email di accesso (scambia il codice PKCE con la sessione) | pubblico |
| `/accedi/password` | Imposta la password (almeno 12 caratteri) dopo il primo accesso | sessione |
| `/lezioni` | **Le mie lezioni**: lezioni importate raggruppate per materia e capitolo, con numero di parti, sottotitoli e stato di generazione | sessione |
| `/estensione` | Collega l'estensione, elenca e revoca i collegamenti | sessione |
| `POST /api/import` | Import di una lezione ([import.md](import.md#api-post-apiimport)) | token di import |
| `POST /api/extension/token` | Crea un token di import | sessione, stessa origine |
| `DELETE /api/extension/token/{id}` | Revoca un token | sessione, stessa origine |

`/` porta a `/lezioni`. Tutte le pagine sono dinamiche (`force-dynamic`): dipendono dalla sessione e non vanno mai in cache.

## Struttura
```
apps/web/src/
├─ proxy.ts             CSP con nonce, rinnovo della sessione, redirect ad /accedi
├─ app/                 pagine e route (solo composizione e presentazione)
├─ components/          guscio dell'app (barra, navigazione)
└─ server/              solo lato server ('server-only')
   ├─ env.ts            variabili d'ambiente validate con zod alla prima lettura
   ├─ supabase.ts       client Supabase con i cookie della richiesta
   ├─ auth.ts           utente corrente, allowlist delle email, password impostata
   ├─ container.ts      composizione: connessione Postgres, repository, casi d'uso
   ├─ http.ts           risposte di errore uniformi, controllo dell'origine, bearer
   └─ import-handler.ts POST /api/import, testabile senza Next.js
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
