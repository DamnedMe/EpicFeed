# ADR 0004: Clean architecture, stack e standard di qualità

- Stato: accettata
- Data: 14/11/2026
- Decisa da: Damian

## Contesto
L'app potrebbe essere presentata a Epicode e diffondersi. Falle di sicurezza, latenza o codice di scarsa qualità sarebbero motivo per scartarla.

## Decisione
- **Stack**: monorepo pnpm in TypeScript. Next.js + Tailwind + Motion (PWA), Supabase (Postgres, Auth) con Drizzle, estensione Chrome MV3, server MCP con SDK ufficiale, Claude API per la generazione, FSRS (`ts-fsrs`) per il ripasso.
- **Clean architecture**: `core/domain` e `core/application` senza dipendenze da framework; porte implementate da adapter; app solo composizione e UI.
- **Codice**: TypeScript strict, ESLint, Prettier; TSDoc su ogni metodo pubblico; commenti interni solo sul perché.
- **Test e CI**: Vitest e Playwright; GitHub Actions con lint, typecheck, test, build, audit e budget Lighthouse; merge bloccato se qualcosa fallisce.
- **Documentazione**: tecnica e funzionale aggiornata nello stesso PR del codice; ogni nuova decisione rilevante va in un nuovo ADR.

## Conseguenze
Un po' più di struttura iniziale, in cambio di codice testabile, sostituibile e presentabile.
