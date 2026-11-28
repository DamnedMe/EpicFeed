import type {
  AssistantLanguage,
  ChatMessage,
  ProviderFailure,
  ProviderId,
  ProviderRequest,
  StudyContext,
} from '@epicfeed/assistant';
import {
  chatModels,
  classifyFailure,
  completionRequest,
  listModelsRequest,
  messagesToSend,
  parseCompletion,
  parseModels,
  pickDefaultModel,
  systemPrompt,
} from '@epicfeed/assistant';

/**
 * Chiamate dal browser ai fornitori con la chiave dello studente. Il server
 * di EpicFeed non è mai in mezzo: la chiave e la domanda vanno dal
 * dispositivo al fornitore.
 */

/** Fetch sostituibile nei test. */
export type FetchLike = (
  url: string,
  init: ProviderRequest['init'] & { signal?: AbortSignal },
) => Promise<Response>;

/** Motivo per cui non c'è risposta. */
export type AssistantFailure = ProviderFailure | 'offline' | 'no_models' | 'empty';

/** Tempo massimo di una richiesta. */
export const REQUEST_TIMEOUT_MS = 30_000;

type Sent = { ok: true; body: unknown } | { ok: false; failure: AssistantFailure };

async function send(fetchFn: FetchLike, request: ProviderRequest): Promise<Sent> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(request.url, { ...request.init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, failure: classifyFailure(response.status, text) };
    }
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, failure: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Esito della prova della chiave. */
export type KeyCheck =
  | { readonly status: 'ok'; readonly model: string; readonly models: readonly string[] }
  | { readonly status: 'failed'; readonly failure: AssistantFailure };

/**
 * Prova la chiave chiedendo l'elenco dei modelli e sceglie quello predefinito.
 *
 * @param provider - Fornitore.
 * @param key - Chiave pulita.
 * @param fetchFn - Fetch del browser.
 * @returns Il modello scelto e quelli disponibili, oppure il motivo del rifiuto.
 */
export async function checkKey(
  provider: ProviderId,
  key: string,
  fetchFn: FetchLike = fetch,
): Promise<KeyCheck> {
  const sent = await send(fetchFn, listModelsRequest(provider, key));
  if (!sent.ok) return { status: 'failed', failure: sent.failure };
  const ids = parseModels(provider, sent.body);
  const model = pickDefaultModel(provider, ids);
  if (!model) return { status: 'failed', failure: 'no_models' };
  return { status: 'ok', model, models: chatModels(provider, ids) };
}

/** Domanda all'assistente. */
export interface AskInput {
  readonly provider: ProviderId;
  readonly key: string;
  readonly model: string;
  readonly context: StudyContext;
  readonly language: AssistantLanguage;
  readonly history: readonly ChatMessage[];
  /** Domanda già pulita. */
  readonly question: string;
}

/** Esito della domanda. */
export type AskResult =
  | { readonly status: 'ok'; readonly text: string }
  | { readonly status: 'failed'; readonly failure: AssistantFailure };

/**
 * Chiede al modello e restituisce la risposta.
 *
 * @param input - Chiave, modello, contesto, conversazione e domanda.
 * @param fetchFn - Fetch del browser.
 * @returns Il testo della risposta, oppure il motivo per cui manca.
 */
export async function askAssistant(
  input: AskInput,
  fetchFn: FetchLike = fetch,
): Promise<AskResult> {
  const request = completionRequest(input.provider, input.key, {
    model: input.model,
    system: systemPrompt(input.context, input.language),
    messages: messagesToSend(input.history, input.question),
  });
  const sent = await send(fetchFn, request);
  if (!sent.ok) return { status: 'failed', failure: sent.failure };
  const text = parseCompletion(input.provider, sent.body);
  return text ? { status: 'ok', text } : { status: 'failed', failure: 'empty' };
}

/** Messaggi per lo studente, in italiano. */
export const FAILURE_MESSAGES: Readonly<Record<AssistantFailure, string>> = {
  invalid_key: 'La chiave non è valida o è stata revocata: controllala in Io › Assistente.',
  rate_limited:
    'Hai raggiunto il limite di richieste del fornitore per ora: riprova tra un minuto (o domani, se è il limite del giorno).',
  no_credit: 'Il credito sul sito del fornitore è finito: ricaricalo o usa un altro fornitore.',
  unavailable: 'Il fornitore non risponde in questo momento: riprova tra poco.',
  offline: 'Nessuna risposta: controlla la connessione e riprova.',
  no_models:
    'Questa chiave non può usare modelli di chat: controlla il progetto sul sito del fornitore.',
  empty: 'Il modello non ha risposto: prova a fare la domanda in un altro modo.',
};
