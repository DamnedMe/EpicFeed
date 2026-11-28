import { describe, expect, it } from 'vitest';
import {
  PROVIDER_ORIGINS,
  classifyFailure,
  completionRequest,
  listModelsRequest,
  parseCompletion,
  parseModels,
} from './providers.js';

const input = {
  model: 'm-1',
  system: 'sistema',
  messages: [
    { role: 'user', text: 'ciao' },
    { role: 'assistant', text: 'risposta' },
    { role: 'user', text: 'perché?' },
  ],
} as const;

const body = (init: { body?: string }) => JSON.parse(init.body ?? '{}') as Record<string, unknown>;

describe('richieste ai fornitori', () => {
  it('Gemini: chiave nell’intestazione, ruoli user/model, istruzioni di sistema', () => {
    const request = completionRequest('gemini', 'AIza-k', input);
    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/m-1:generateContent',
    );
    expect(request.init.headers['x-goog-api-key']).toBe('AIza-k');
    expect(request.url).not.toContain('AIza-k');
    const sent = body(request.init);
    expect(sent.systemInstruction).toEqual({ parts: [{ text: 'sistema' }] });
    expect((sent.contents as { role: string }[]).map((c) => c.role)).toEqual([
      'user',
      'model',
      'user',
    ]);
  });

  it('Anthropic: intestazioni per il browser e messaggi', () => {
    const request = completionRequest('anthropic', 'sk-ant-k', input);
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.init.headers).toMatchObject({
      'x-api-key': 'sk-ant-k',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(body(request.init)).toMatchObject({ model: 'm-1', system: 'sistema' });
  });

  it('OpenAI: istruzioni come primo messaggio', () => {
    const request = completionRequest('openai', 'sk-k', input);
    expect(request.init.headers.authorization).toBe('Bearer sk-k');
    const messages = body(request.init).messages as { role: string }[];
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });

  it('elenco dei modelli per i tre fornitori, solo verso indirizzi noti', () => {
    for (const provider of ['gemini', 'anthropic', 'openai'] as const) {
      const request = listModelsRequest(provider, 'k');
      expect(request.init.method).toBe('GET');
      expect(PROVIDER_ORIGINS.some((origin) => request.url.startsWith(origin))).toBe(true);
    }
  });
});

describe('risposte dei fornitori', () => {
  it('legge i modelli', () => {
    expect(
      parseModels('gemini', {
        models: [
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-x' },
        ],
      }),
    ).toEqual(['gemini-3.8-flash', 'gemini-x']);
    expect(parseModels('openai', { data: [{ id: 'gpt-6-mini' }] })).toEqual(['gpt-6-mini']);
    expect(parseModels('anthropic', { data: 'no' })).toEqual([]);
    expect(parseModels('gemini', null)).toEqual([]);
  });

  it('legge il testo della risposta', () => {
    expect(
      parseCompletion('gemini', {
        candidates: [{ content: { parts: [{ text: 'Ciao ' }, { text: 'Anna' }] } }],
      }),
    ).toBe('Ciao Anna');
    expect(
      parseCompletion('anthropic', {
        content: [{ type: 'thinking' }, { type: 'text', text: ' Risposta ' }],
      }),
    ).toBe('Risposta');
    expect(parseCompletion('openai', { choices: [{ message: { content: 'ok' } }] })).toBe('ok');
    expect(parseCompletion('openai', { choices: [] })).toBeNull();
    expect(parseCompletion('gemini', { candidates: [{}] })).toBeNull();
    expect(parseCompletion('gemini', 'x')).toBeNull();
    expect(parseCompletion('anthropic', 3)).toBeNull();
    expect(parseCompletion('openai', null)).toBeNull();
  });

  it('riconosce il motivo del rifiuto', () => {
    expect(classifyFailure(401, '')).toBe('invalid_key');
    expect(classifyFailure(400, '{"error":{"message":"API key not valid"}}')).toBe('invalid_key');
    expect(classifyFailure(429, 'rate limit')).toBe('rate_limited');
    expect(classifyFailure(429, 'insufficient_quota')).toBe('no_credit');
    expect(classifyFailure(400, 'Your credit balance is too low')).toBe('no_credit');
    expect(classifyFailure(500, '')).toBe('unavailable');
  });
});
