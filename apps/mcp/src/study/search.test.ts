import { subjectFeedResponseSchema } from '@epicfeed/feed';
import { describe, expect, it } from 'vitest';
import { formatMinute, normalize, queryTokens, searchLessons } from './search.js';
import { AVL_LESSON, HEAP_LESSON, dsaFeed } from './testing.js';

describe('cerca lezione', () => {
  it('la materia di prova ha la forma dell’API', () => {
    expect(subjectFeedResponseSchema.safeParse(dsaFeed()).success).toBe(true);
  });

  it('normalizza maiuscole, accenti e punteggiatura e scarta le parole vuote', () => {
    expect(normalize('Perché l’AVL-tree?')).toBe('perche l avl tree');
    expect(queryTokens('Dove si parla di rotazioni AVL?')).toEqual(['rotazioni', 'avl']);
    expect(queryTokens('di la')).toEqual([]);
  });

  it('trova la scheda con il minuto del video, in italiano e in inglese', () => {
    const [it] = searchLessons([dsaFeed()], 'rotazioni AVL');
    expect(it?.lessonId).toBe(AVL_LESSON);
    expect(it?.itemType).toBe('card');
    expect(it?.video).toEqual({
      minute: '2:05',
      partTitle: 'AVL rotations',
      url: 'https://learn.epicode.edu.mt/course/177/curriculum/66864',
    });
    const [en] = searchLessons([dsaFeed()], 'sift-down cost');
    expect(en?.lessonId).toBe(HEAP_LESSON);
    expect(en?.video).toBeNull();
  });

  it('mette le schede prima delle domande e rispetta il limite', () => {
    const hits = searchLessons([dsaFeed()], 'avl', 10);
    expect(hits[0]?.itemType).toBe('card');
    expect(hits.some((hit) => hit.itemType === 'quiz')).toBe(true);
    expect(searchLessons([dsaFeed()], 'avl', 1)).toHaveLength(1);
  });

  it('non trova nulla per parole assenti o vuote', () => {
    expect(searchLessons([dsaFeed()], 'grafo diretto')).toEqual([]);
    expect(searchLessons([dsaFeed()], '?')).toEqual([]);
  });

  it('scrive i minuti come m:ss', () => {
    expect(formatMinute(0)).toBe('0:00');
    expect(formatMinute(61_400)).toBe('1:01');
  });
});
