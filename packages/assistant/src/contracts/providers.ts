import * as z from 'zod';
import type { ChatMessage } from '../domain/conversation.js';
import { CHAT_LIMITS } from '../domain/conversation.js';
import type { ProviderId } from '../domain/providers.js';

/**
 * Richieste HTTP ai fornitori e lettura delle risposte. Le chiamate partono
 * dal browser direttamente verso il fornitore (ADR 0021): qui si costruisce
 * solo la richiesta, il `fetch` lo fa l'app. Le risposte si leggono con zod
 * tenendo solo i campi che servono.
 */

/** Richiesta pronta per `fetch`. */
export interface ProviderRequest {
  readonly url: string;
  readonly init: {
    readonly method: 'GET' | 'POST';
    readonly headers: Record<string, string>;
    readonly body?: string;
  };
}

/** Domanda da inviare al modello. */
export interface CompletionInput {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly ChatMessage[];
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const ANTHROPIC = 'https://api.anthropic.com/v1';
const OPENAI = 'https://api.openai.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/** Indirizzi dei fornitori, per la Content Security Policy dell'app. */
export const PROVIDER_ORIGINS: readonly string[] = [
  'https://generativelanguage.googleapis.com',
  'https://api.anthropic.com',
  'https://api.openai.com',
];

function headers(provider: ProviderId, key: string): Record<string, string> {
  switch (provider) {
    case 'gemini':
      return { 'x-goog-api-key': key };
    case 'anthropic':
      return {
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
        // Le chiamate dal browser vanno dichiarate: la chiave è dello studente.
        'anthropic-dangerous-direct-browser-access': 'true',
      };
    case 'openai':
      return { authorization: `Bearer ${key}` };
  }
}

/**
 * Richiesta dell'elenco dei modelli: serve anche a provare la chiave.
 *
 * @param provider - Fornitore.
 * @param key - Chiave dello studente.
 * @returns La richiesta.
 */
export function listModelsRequest(provider: ProviderId, key: string): ProviderRequest {
  const url =
    provider === 'gemini'
      ? `${GEMINI}/models?pageSize=1000`
      : provider === 'anthropic'
        ? `${ANTHROPIC}/models?limit=1000`
        : `${OPENAI}/models`;
  return { url, init: { method: 'GET', headers: headers(provider, key) } };
}

/**
 * Richiesta di una risposta.
 *
 * @param provider - Fornitore.
 * @param key - Chiave dello studente.
 * @param input - Modello, istruzioni e messaggi.
 * @returns La richiesta.
 */
export function completionRequest(
  provider: ProviderId,
  key: string,
  input: CompletionInput,
): ProviderRequest {
  const json = { ...headers(provider, key), 'content-type': 'application/json' };
  switch (provider) {
    case 'gemini':
      return {
        url: `${GEMINI}/models/${encodeURIComponent(input.model)}:generateContent`,
        init: {
          method: 'POST',
          headers: json,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: input.messages.map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.text }],
            })),
            generationConfig: { maxOutputTokens: CHAT_LIMITS.answerTokens, temperature: 0.4 },
          }),
        },
      };
    case 'anthropic':
      return {
        url: `${ANTHROPIC}/messages`,
        init: {
          method: 'POST',
          headers: json,
          body: JSON.stringify({
            model: input.model,
            max_tokens: CHAT_LIMITS.answerTokens,
            system: input.system,
            messages: input.messages.map((message) => ({
              role: message.role,
              content: message.text,
            })),
          }),
        },
      };
    case 'openai':
      return {
        url: `${OPENAI}/chat/completions`,
        init: {
          method: 'POST',
          headers: json,
          body: JSON.stringify({
            model: input.model,
            max_completion_tokens: CHAT_LIMITS.answerTokens,
            messages: [
              { role: 'system', content: input.system },
              ...input.messages.map((message) => ({ role: message.role, content: message.text })),
            ],
          }),
        },
      };
  }
}

const geminiModels = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        supportedGenerationMethods: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});
const idList = z.object({ data: z.array(z.object({ id: z.string() })).default([]) });

/**
 * Id dei modelli nella risposta dell'elenco.
 *
 * @param provider - Fornitore.
 * @param body - JSON della risposta.
 * @returns Gli id (vuoto se la risposta non ha la forma attesa).
 */
export function parseModels(provider: ProviderId, body: unknown): string[] {
  if (provider === 'gemini') {
    const parsed = geminiModels.safeParse(body);
    if (!parsed.success) return [];
    return parsed.data.models
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent') ?? true)
      .map((model) => model.name.replace(/^models\//, ''));
  }
  const parsed = idList.safeParse(body);
  return parsed.success ? parsed.data.data.map((model) => model.id) : [];
}

const textPart = z.object({ text: z.string().optional() });
const geminiReply = z.object({
  candidates: z
    .array(z.object({ content: z.object({ parts: z.array(textPart).default([]) }).optional() }))
    .default([]),
});
const anthropicReply = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).default([]),
});
const openaiReply = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().optional() }) }))
    .default([]),
});

/**
 * Testo della risposta del modello.
 *
 * @param provider - Fornitore.
 * @param body - JSON della risposta.
 * @returns Il testo, oppure `null` se è vuoto o la forma non è quella attesa.
 */
export function parseCompletion(provider: ProviderId, body: unknown): string | null {
  let text: string;
  if (provider === 'gemini') {
    const parsed = geminiReply.safeParse(body);
    if (!parsed.success) return null;
    text = (parsed.data.candidates[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
  } else if (provider === 'anthropic') {
    const parsed = anthropicReply.safeParse(body);
    if (!parsed.success) return null;
    text = parsed.data.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
  } else {
    const parsed = openaiReply.safeParse(body);
    if (!parsed.success) return null;
    text = parsed.data.choices[0]?.message.content ?? '';
  }
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** Perché il fornitore ha rifiutato una richiesta. */
export type ProviderFailure = 'invalid_key' | 'rate_limited' | 'no_credit' | 'unavailable';

/**
 * Motivo del rifiuto dallo stato HTTP e dal corpo dell'errore.
 *
 * @param status - Stato HTTP.
 * @param body - Corpo dell'errore come testo (può essere vuoto).
 * @returns Il motivo.
 */
export function classifyFailure(status: number, body: string): ProviderFailure {
  const text = body.toLowerCase();
  if (/credit|billing|quota exceeded for this month|insufficient_quota|balance/.test(text)) {
    return 'no_credit';
  }
  if (status === 401 || status === 403 || /api[_ ]key[_ ]invalid|invalid.*api key/.test(text)) {
    return 'invalid_key';
  }
  if (status === 400 && /api key/.test(text)) return 'invalid_key';
  if (status === 429) return 'rate_limited';
  return 'unavailable';
}
