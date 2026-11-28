import { describe, expect, it } from 'vitest';
import {
  PROVIDERS,
  PROVIDER_IDS,
  chatModels,
  cleanApiKey,
  looksLikeProviderKey,
  pickDefaultModel,
} from './providers.js';

describe('fornitori', () => {
  it('ognuno ha il link per creare la chiave e i passi', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].keyUrl).toMatch(/^https:\/\//);
      expect(PROVIDERS[id].keySteps.length).toBeGreaterThan(1);
    }
    expect(PROVIDERS.gemini.keyUrl).toContain('aistudio.google.com');
  });

  it('pulisce la chiave e riconosce quella di un altro fornitore', () => {
    expect(cleanApiKey('  AIzaSyA1234567890abcdefghij  ')).toBe('AIzaSyA1234567890abcdefghij');
    expect(cleanApiKey('corta')).toBeNull();
    expect(cleanApiKey('AIza con spazi dentro 1234567890')).toBeNull();
    expect(looksLikeProviderKey('gemini', 'AIzaSy123')).toBe(true);
    expect(looksLikeProviderKey('anthropic', 'sk-ant-api03-x')).toBe(true);
    expect(looksLikeProviderKey('openai', 'sk-proj-x')).toBe(true);
    expect(looksLikeProviderKey('openai', 'sk-ant-api03-x')).toBe(false);
    expect(looksLikeProviderKey('gemini', 'sk-proj-x')).toBe(false);
  });
});

describe('scelta del modello', () => {
  it('Gemini: il Flash stabile più recente, non anteprime né modelli audio', () => {
    const ids = [
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3.9-flash-preview',
      'gemini-3.5-flash-lite',
      'gemini-3.8-pro',
      'gemini-3.8-flash-tts',
      'text-embedding-004',
    ];
    expect(pickDefaultModel('gemini', ids)).toBe('gemini-3.8-flash');
    expect(chatModels('gemini', ids)).not.toContain('gemini-3.8-flash-tts');
    expect(pickDefaultModel('gemini', ['gemini-flash-latest', ...ids])).toBe('gemini-flash-latest');
    expect(pickDefaultModel('gemini', ['gemini-3.9-flash-preview'])).toBe(
      'gemini-3.9-flash-preview',
    );
  });

  it('Claude: Haiku più recente, alias senza data prima', () => {
    expect(
      pickDefaultModel('anthropic', [
        'claude-opus-5-5',
        'claude-haiku-4-5-20251001',
        'claude-haiku-5-5',
        'claude-sonnet-5-5',
      ]),
    ).toBe('claude-haiku-5-5');
    expect(pickDefaultModel('anthropic', ['claude-sonnet-5-5'])).toBe('claude-sonnet-5-5');
  });

  it('OpenAI: un modello piccolo, mai audio o immagini', () => {
    const ids = ['gpt-6.1-sol', 'gpt-6-mini', 'gpt-realtime-2.1-mini', 'gpt-image-2', 'whisper-1'];
    expect(pickDefaultModel('openai', ids)).toBe('gpt-6-mini');
    expect(chatModels('openai', ids)).toEqual(['gpt-6.1-sol', 'gpt-6-mini']);
    expect(pickDefaultModel('openai', ['gpt-6.1-sol', 'o9'])).toBe('gpt-6.1-sol');
    expect(pickDefaultModel('openai', ['o9'])).toBe('o9');
  });

  it('senza modelli adatti non sceglie', () => {
    expect(pickDefaultModel('openai', ['whisper-1'])).toBeNull();
  });
});
