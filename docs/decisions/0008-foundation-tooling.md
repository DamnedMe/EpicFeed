# ADR 0008: Strumenti e convenzioni delle fondamenta (M0)

- Stato: accettata
- Data: 15/11/2026
- Decisa da: Claude durante M0, nel perimetro del [piano di sviluppo](../development-plan.md) approvato da Damian; da confermare in revisione della PR

## Contesto
Lo stack è deciso (ADR 0001–0007). Costruendo le fondamenta sono servite alcune scelte di dettaglio che il piano non fissava.

## Decisione
1. **TypeScript 6.0**, non 7.0. TypeScript 7 (il compilatore riscritto in Go) è uscito da poco e typescript-eslint supporta ufficialmente versioni fino alla 6.0: con la 7 il lint con informazioni di tipo non sarebbe affidabile. Si passa alla 7 quando l'ecosistema la supporta.
2. **Test della RLS su un Postgres reale in memoria (PGlite)**, con un piccolo strato che simula Supabase (ruoli, `auth.uid()`, privilegi predefiniti). Le policy si verificano in CI a ogni PR, senza un database remoto né Docker.
3. **Token del design system scritti una volta in TypeScript**, da cui si genera il CSS. Tema e accento si applicano con attributi `data-theme` e `data-accent` su `<html>`.
4. **Permessi di tabella ridotti** oltre alla RLS: a `authenticated` resta solo `SELECT`, ad `anon` nulla. Le scritture passano solo dall'API sul server.
5. **Contrasto WCAG AA verificato nei test** per ogni tema e accento. Ne deriva un ritocco del turchese su chiaro (`#0B7F76` → `#0A7870`).
6. **Supply chain**: versioni esatte, lockfile bloccato in CI, `pnpm audit` bloccante dal livello moderato, Dependabot settimanale, niente versioni pubblicate da meno di 24 ore, script di installazione permessi solo a `esbuild`.
7. **TSDoc obbligatoria tramite lint** su tutto ciò che un pacchetto esporta.

## Alternative scartate
- Test della RLS con Supabase CLI in Docker: più fedele, ma CI più lenta e fragile; resta un'opzione per test end-to-end in M1.
- Token scritti a mano in CSS: due fonti da tenere allineate.

## Conseguenze
- I test del database girano in pochi secondi su ogni macchina.
- Ogni nuova tabella deve arrivare con policy e test RLS, altrimenti la revisione la blocca.
