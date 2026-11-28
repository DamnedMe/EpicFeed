import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { AssistantKeyStore, openAssistantDb } from './key-store';

const settings = {
  provider: 'gemini' as const,
  key: 'AIzaSyA1234567890abcdefghij',
  model: 'gemini-3.8-flash',
  models: ['gemini-3.8-flash'],
  savedAt: '2026-11-28T10:00:00.000Z',
};

describe('chiave dell’assistente sul dispositivo', () => {
  it('salva, legge e rimuove la chiave; conta le richieste', async () => {
    const store = new AssistantKeyStore(await openAssistantDb(new IDBFactory()));
    expect(await store.load()).toBeNull();
    await store.save(settings);
    expect(await store.load()).toEqual(settings);
    await store.saveUsage({ day: '2026-11-28', count: 3 });
    expect(await store.loadUsage()).toEqual({ day: '2026-11-28', count: 3 });
    await store.remove();
    expect(await store.load()).toBeNull();
  });

  it('ignora dati che non hanno la forma attesa', async () => {
    const db = await openAssistantDb(new IDBFactory());
    const tx = db.transaction('state', 'readwrite').objectStore('state');
    tx.put({ ...settings, provider: 'altro' }, 'settings');
    tx.put({ day: 1 }, 'usage');
    await new Promise((resolve) => {
      tx.transaction.oncomplete = resolve;
    });
    const store = new AssistantKeyStore(db);
    expect(await store.load()).toBeNull();
    expect(await store.loadUsage()).toBeNull();
  });
});
