# @epicfeed/assistant

Assistente di studio nell'app con la chiave API dello studente: Google Gemini, Anthropic Claude od OpenAI ([ADR 0021](../../docs/decisions/0021-study-assistant-m6.md), scelta 0). La chiave resta sul dispositivo e le richieste partono dal browser verso il fornitore: questo pacchetto non fa chiamate, prepara le richieste e legge le risposte.

Ha anche la coda delle domande per Claude Desktop senza chiave (scelta 1). Dipende da `shared` e, solo in `infrastructure`, da `db`. Dettagli: [technical/web.md](../../docs/technical/web.md#assistente-nellapp-m6).

## Struttura

```
src/
├─ domain/          providers (fornitori, scelta del modello), conversation (contesto, istruzioni, domande rapide), usage (richieste del giorno), questions (limiti della coda)
├─ application/     questions.ts (AskQuestion, ListQuestions, DeleteQuestion, AnswerQuestion, porta QuestionRepository)
├─ contracts/       providers.ts (richieste HTTP e risposte dei tre fornitori), questions.ts (schemi delle API della coda)
├─ infrastructure/  question-repository.ts (Drizzle, export `@epicfeed/assistant/infrastructure`)
└─ index.ts
```

Comandi: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
