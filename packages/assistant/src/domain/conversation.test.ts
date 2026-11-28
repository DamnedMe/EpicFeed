import { describe, expect, it } from 'vitest';
import type { ChatMessage, StudyContext } from './conversation.js';
import {
  CHAT_LIMITS,
  QUICK_ASK_LABELS,
  cleanQuestion,
  messagesToSend,
  quickAskText,
  systemPrompt,
} from './conversation.js';

const context: StudyContext = {
  subjectTitle: 'Data Structures',
  lessonTitle: 'Binary trees & AVL trees',
  title: { it: 'Rotazioni', en: 'Rotations' },
  text: { it: 'Dopo un inserimento si ribilancia.', en: 'After an insert it rebalances.' },
  concepts: [
    {
      name: { it: 'Rotazioni AVL', en: 'AVL rotations' },
      description: { it: 'Ribilanciano.', en: 'They rebalance.' },
    },
  ],
  glossary: [{ term: 'AVL', definition: { it: 'Albero bilanciato.', en: 'Balanced tree.' } }],
};

describe('conversazione con l’assistente', () => {
  it('le istruzioni portano la scheda nelle due lingue, concetti e glossario', () => {
    const prompt = systemPrompt(context, 'it');
    expect(prompt).toContain('Lesson: Binary trees & AVL trees');
    expect(prompt).toContain('Card (Italian): Rotazioni');
    expect(prompt).toContain('After an insert it rebalances.');
    expect(prompt).toContain('AVL rotations / Rotazioni AVL');
    expect(prompt).toContain('- AVL: Balanced tree.');
    expect(prompt).toContain('study language is Italian');
    expect(systemPrompt({ ...context, concepts: [], glossary: [] }, 'en')).not.toContain(
      'Glossary',
    );
  });

  it('il contesto non supera il limite', () => {
    const long = { ...context, text: { it: 'x'.repeat(10_000), en: 'y' } };
    expect(systemPrompt(long, 'it').length).toBeLessThan(CHAT_LIMITS.context + 2000);
  });

  it('pulisce la domanda', () => {
    expect(cleanQuestion('   ')).toBeNull();
    expect(cleanQuestion(' perché? ')).toBe('perché?');
    expect(cleanQuestion('a'.repeat(5000))).toHaveLength(CHAT_LIMITS.question);
  });

  it('domande rapide nelle due lingue', () => {
    for (const ask of Object.keys(QUICK_ASK_LABELS) as (keyof typeof QUICK_ASK_LABELS)[]) {
      expect(quickAskText(ask, 'it')).not.toBe(quickAskText(ask, 'en'));
    }
  });

  it('invia gli ultimi messaggi partendo da una domanda', () => {
    const history: ChatMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: String(i),
    }));
    const sent = messagesToSend(history, 'nuova');
    expect(sent[0]?.role).toBe('user');
    expect(sent.at(-1)).toEqual({ role: 'user', text: 'nuova' });
    expect(sent.length).toBeLessThanOrEqual(CHAT_LIMITS.history + 1);
    expect(messagesToSend([{ role: 'assistant', text: 'x' }], 'q')).toEqual([
      { role: 'user', text: 'q' },
    ]);
  });
});
