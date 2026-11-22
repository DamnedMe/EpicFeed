import { describe, expect, it } from 'vitest';
import type { SlideFile } from './archive.js';
import { matchSlideFiles, normalizeTitle, parseSlideFileName } from './match.js';

const file = (fileName: string): SlideFile => ({
  fileName,
  entry: `zip/${fileName}`,
  read: () => Promise.resolve(new Uint8Array()),
});

const lesson = (
  lessonId: string,
  lessonTitle: string,
  subjectTitle = 'DSA',
  chapterTitle = 'Capitolo',
) => ({ lessonId, lessonTitle, chapterTitle, subjectTitle });

/** PDF di uno zip, con la posizione della voce nello zip. */
const zipped = (names: readonly string[]): SlideFile[] =>
  names.map((fileName, archiveOrder) => ({ ...file(fileName), archiveOrder }));

describe('parseSlideFileName e normalizeTitle', () => {
  it('legge titolo e numero', () => {
    expect(parseSlideFileName('Binary trees & AVL trees-2.pdf')).toEqual({
      title: 'Binary trees & AVL trees',
      number: 2,
    });
    expect(parseSlideFileName('Heaps - 1.PDF')).toEqual({ title: 'Heaps', number: 1 });
    expect(parseSlideFileName('Heaps.pdf')).toBeNull();
    expect(parseSlideFileName('Heaps-0.pdf')).toBeNull();
  });

  it('confronta i titoli senza accenti né punteggiatura', () => {
    expect(normalizeTitle('Che cos’è un Árbol? (parte 1)')).toBe('che cos e un arbol parte 1');
  });
});

describe('matchSlideFiles', () => {
  it('abbina per titolo e lascia fuori i casi dubbi, con il motivo', () => {
    const lessons = [
      lesson('l1', 'Binary trees & AVL trees'),
      lesson('l2', 'Introduction'),
      lesson('l3', 'Introduction', 'Web'),
    ];
    const result = matchSlideFiles(
      [
        file('Binary trees  AVL trees-2.pdf'),
        file('Binary trees & AVL trees-1.pdf'),
        file('Binary trees & AVL trees-01.pdf'),
        file('Introduction-1.pdf'),
        file('Graphs-1.pdf'),
        file('notes.pdf'),
      ],
      lessons,
    );
    const l1 = result.matched.get('l1');
    expect(l1?.files.map((f) => [f.number, f.file.fileName])).toEqual([
      [1, 'Binary trees & AVL trees-1.pdf'],
      [2, 'Binary trees  AVL trees-2.pdf'],
    ]);
    expect(result.unmatched.map((u) => [u.fileName, u.reason])).toEqual([
      ['Binary trees & AVL trees-01.pdf', 'numero di presentazione ripetuto'],
      [
        'Introduction-1.pdf',
        '2 lezioni con questo titolo: usa lo zip scaricato dal portale, non la cartella estratta',
      ],
      ['Graphs-1.pdf', 'nessuna lezione importata con questo titolo'],
      ['notes.pdf', 'il nome non è "titolo-numero.pdf"'],
    ]);
  });

  it('con la materia risolve i titoli uguali', () => {
    const result = matchSlideFiles(
      [file('Introduction-1.pdf')],
      [lesson('l2', 'Introduction'), lesson('l3', 'Introduction', 'Web development')],
      'web',
    );
    expect([...result.matched.keys()]).toEqual(['l3']);
  });

  it('distingue le lezioni omonime con l’ordine dello zip e rinumera da 1', () => {
    // Estratto reale del corso DSA: la numerazione prosegue tra lezioni omonime.
    const lessons = [
      lesson('onb', 'Introduction', 'DSA', 'Onboarding & Guidelines'),
      lesson('intro1', 'Introduction', 'DSA', '1. Big O notation, arrays and linked lists'),
      lesson('arrays', 'Arrays', 'DSA', '1. Big O notation, arrays and linked lists'),
      lesson('ops', 'Operations', 'DSA', '2. Stacks and queues'),
      lesson('ex2', 'Examples', 'DSA', '2. Stacks and queues'),
      lesson('apps', 'Examples of applications', 'DSA', '3. Trees'),
      lesson('mst', 'Minimum spanning tree', 'DSA', '4. Graphs'),
      lesson('ex4', 'Examples', 'DSA', '4. Graphs'),
    ];
    const names = [
      'Introduction-1.pdf',
      'Introduction-2.pdf',
      'Introduction-3.pdf',
      'Arrays-1.pdf',
      'Operations-1.pdf',
      'Examples-1.pdf',
      'Examples-2.pdf',
      'Examples-3.pdf',
      'Examples of applications-1.pdf',
      'Minimum spanning tree-1.pdf',
      'Examples-4.pdf',
      'Examples-5.pdf',
      'Examples-6.pdf',
      'Exam Prep-1.pdf',
    ];
    const result = matchSlideFiles(zipped(names), lessons);
    const decks = (id: string) =>
      result.matched.get(id)?.files.map((f) => `${String(f.number)}:${f.file.fileName}`);
    expect(decks('intro1')).toEqual([
      '1:Introduction-1.pdf',
      '2:Introduction-2.pdf',
      '3:Introduction-3.pdf',
    ]);
    expect(decks('ex2')).toEqual(['1:Examples-1.pdf', '2:Examples-2.pdf', '3:Examples-3.pdf']);
    expect(decks('ex4')).toEqual(['1:Examples-4.pdf', '2:Examples-5.pdf', '3:Examples-6.pdf']);
    expect(decks('onb')).toBeUndefined();
    expect(result.unmatched.map((u) => u.fileName)).toEqual(['Exam Prep-1.pdf']);
  });

  it('lascia fuori un titolo omonimo quando i vicini non bastano a scegliere', () => {
    const lessons = [
      lesson('a', 'Examples', 'DSA', 'Capitolo A'),
      lesson('b', 'Examples', 'DSA', 'Capitolo B'),
    ];
    const result = matchSlideFiles(zipped(['Examples-1.pdf']), lessons);
    expect(result.unmatched).toEqual([
      {
        fileName: 'Examples-1.pdf',
        reason: "2 lezioni con questo titolo e l'ordine dello zip non basta a scegliere",
      },
    ]);
  });

  it('usa il capitolo del vicino quando più omonime stanno tra i vicini', () => {
    const lessons = [
      lesson('x', 'Intro', 'DSA', 'Capitolo A'),
      lesson('y', 'Intro', 'DSA', 'Capitolo B'),
      lesson('z', 'Heaps', 'DSA', 'Capitolo B'),
    ];
    const result = matchSlideFiles(zipped(['Intro-1.pdf', 'Heaps-1.pdf']), lessons);
    expect(result.matched.get('y')?.files.map((f) => f.file.fileName)).toEqual(['Intro-1.pdf']);
  });
});
