import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUIZ_VIEW_FALLBACK, fileQuizView } from './quiz-view.js';

describe('pagina della scheda del quiz', () => {
  it('legge la pagina accanto al server una volta sola', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quiz-view-'));
    const file = join(dir, 'quiz-view.html');
    await writeFile(file, '<p>quiz</p>');
    const view = fileQuizView(pathToFileURL(file));
    expect(await view()).toBe('<p>quiz</p>');
    await writeFile(file, '<p>altro</p>');
    expect(await view()).toBe('<p>quiz</p>');
  });

  it('senza file usa la pagina di riserva', async () => {
    const view = fileQuizView(pathToFileURL(join(tmpdir(), 'manca', 'quiz-view.html')));
    expect(await view()).toBe(QUIZ_VIEW_FALLBACK);
  });
});
