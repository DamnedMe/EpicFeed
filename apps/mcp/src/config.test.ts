import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_API_URL, apiFromEnv, credentialsFromEnv } from './config.js';

const token = `sfg_${'A'.repeat(43)}`;
const ok = () =>
  vi.fn<(url: URL) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ lessons: [], totals: { lessons: 0, ready: 0, toGenerate: 0 } }),
      ),
    ),
  );

describe('apiFromEnv', () => {
  it('senza token valido risponde con le istruzioni per configurarlo', async () => {
    const api = apiFromEnv({ EPICFEED_TOKEN: 'sbagliato' });
    await expect(api.listLessons(1)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(api.readLesson('x')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(apiFromEnv({}).listLessons(1)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('usa l’indirizzo predefinito se manca o è un segnaposto non sostituito', async () => {
    for (const url of [undefined, '', '${user_config.api_url}']) {
      const fetchMock = ok();
      await apiFromEnv(
        { EPICFEED_TOKEN: token, EPICFEED_API_URL: url },
        fetchMock as typeof fetch,
      ).listLessons(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(DEFAULT_API_URL);
    }
  });

  it('usa l’indirizzo configurato', async () => {
    const fetchMock = ok();
    await apiFromEnv(
      { EPICFEED_TOKEN: ` ${token} `, EPICFEED_API_URL: 'http://localhost:3000' },
      fetchMock as typeof fetch,
    ).listLessons(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('http://localhost:3000/');
  });
});

describe('credentialsFromEnv', () => {
  it('legge email e password, senza toccare gli spazi della password', () => {
    expect(
      credentialsFromEnv({ EPICFEED_EMAIL: ' anna@example.com ', EPICFEED_PASSWORD: ' segreta ' }),
    ).toEqual({ email: 'anna@example.com', password: ' segreta ' });
  });

  it('senza uno dei due, o con i segnaposto di Claude Desktop, non ci sono credenziali', () => {
    expect(credentialsFromEnv({})).toBeNull();
    expect(credentialsFromEnv({ EPICFEED_EMAIL: 'anna@example.com' })).toBeNull();
    expect(credentialsFromEnv({ EPICFEED_EMAIL: 'anna', EPICFEED_PASSWORD: 'x' })).toBeNull();
    expect(
      credentialsFromEnv({
        EPICFEED_EMAIL: '${user_config.account_email}',
        EPICFEED_PASSWORD: '${user_config.account_password}',
      }),
    ).toBeNull();
    expect(
      credentialsFromEnv({
        EPICFEED_EMAIL: 'anna@example.com',
        EPICFEED_PASSWORD: '${user_config.account_password}',
      }),
    ).toBeNull();
  });
});
