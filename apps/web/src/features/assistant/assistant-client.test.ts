import type { StudyContext } from '@epicfeed/assistant';
import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from './assistant-client';
import { FAILURE_MESSAGES, askAssistant, checkKey } from './assistant-client';

const context: StudyContext = {
  subjectTitle: 'DSA',
  lessonTitle: 'AVL',
  title: { it: 'Rotazioni', en: 'Rotations' },
  text: { it: 'Testo.', en: 'Text.' },
  concepts: [],
  glossary: [],
};

const reply = (status: number, body: unknown): FetchLike =>
  vi.fn(() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    ),
  );

describe('prova della chiave', () => {
  it('elenca i modelli e sceglie quello veloce', async () => {
    const fetchFn = reply(200, {
      models: [
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-pro', supportedGenerationMethods: ['generateContent'] },
      ],
    });
    expect(await checkKey('gemini', 'AIza-chiave', fetchFn)).toEqual({
      status: 'ok',
      model: 'gemini-3.8-flash',
      models: ['gemini-3.8-flash', 'gemini-3.8-pro'],
    });
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(init?.headers['x-goog-api-key']).toBe('AIza-chiave');
  });

  it('dice perché la chiave non va', async () => {
    expect(await checkKey('openai', 'sk-x', reply(401, 'no'))).toEqual({
      status: 'failed',
      failure: 'invalid_key',
    });
    expect(await checkKey('openai', 'sk-x', reply(200, { data: [{ id: 'whisper-1' }] }))).toEqual({
      status: 'failed',
      failure: 'no_models',
    });
    const offline: FetchLike = () => Promise.reject(new Error('rete'));
    expect(await checkKey('anthropic', 'sk-ant-x', offline)).toEqual({
      status: 'failed',
      failure: 'offline',
    });
  });
});

describe('domanda all’assistente', () => {
  const input = {
    provider: 'anthropic' as const,
    key: 'sk-ant-x',
    model: 'claude-haiku-5-5',
    context,
    language: 'it' as const,
    history: [],
    question: 'Perché?',
  };

  it('restituisce il testo della risposta', async () => {
    const fetchFn = reply(200, { content: [{ type: 'text', text: 'Perché sì.' }] });
    expect(await askAssistant(input, fetchFn)).toEqual({ status: 'ok', text: 'Perché sì.' });
    const [, init] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    const sent = JSON.parse(init?.body ?? '{}') as { system: string; messages: unknown[] };
    expect(sent.system).toContain('Card (Italian): Rotazioni');
    expect(sent.messages).toEqual([{ role: 'user', content: 'Perché?' }]);
  });

  it('risposta vuota o limite raggiunto', async () => {
    expect(await askAssistant(input, reply(200, { content: [] }))).toEqual({
      status: 'failed',
      failure: 'empty',
    });
    expect(await askAssistant(input, reply(429, 'rate'))).toEqual({
      status: 'failed',
      failure: 'rate_limited',
    });
  });

  it('ogni motivo ha un messaggio', () => {
    for (const message of Object.values(FAILURE_MESSAGES))
      expect(message.length).toBeGreaterThan(20);
  });
});
