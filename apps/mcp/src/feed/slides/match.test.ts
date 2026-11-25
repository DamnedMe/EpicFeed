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
    const lessons = [lesson('l1', 'Binary trees & AVL trees')];
    const result = matchSlideFiles(
      [
        file('Binary trees  AVL trees-2.pdf'),
        file('Binary trees & AVL trees-1.pdf'),
        file('Binary trees & AVL trees-01.pdf'),
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
      ['Graphs-1.pdf', 'nessuna lezione importata con questo titolo'],
      ['notes.pdf', 'il nome non è "titolo-numero.pdf"'],
    ]);
  });

  it('dalla cartella estratta lascia fuori i titoli ripetuti', () => {
    const result = matchSlideFiles(
      [file('Introduction-1.pdf')],
      [lesson('l2', 'Introduction', 'DSA', 'A'), lesson('l3', 'Introduction', 'DSA', 'B')],
    );
    expect(result.unmatched).toEqual([
      {
        fileName: 'Introduction-1.pdf',
        reason:
          '2 lezioni con questo titolo: usa lo zip scaricato dal portale, non la cartella estratta',
      },
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

  it('tra omonime di materie diverse sceglie la materia dello zip', () => {
    const lessons = [
      lesson('l1', 'Heaps'),
      lesson('l2', 'Introduction'),
      lesson('l3', 'Arrays'),
      lesson('w1', 'Introduction', 'Web'),
    ];
    const result = matchSlideFiles(
      zipped(['Introduction-1.pdf', 'Heaps-1.pdf', 'Arrays-1.pdf']),
      lessons,
    );
    expect([...result.matched.keys()].sort()).toEqual(['l1', 'l2', 'l3']);
    expect(result.unmatched).toEqual([]);
  });

  // Catalogo e nomi reali del corso DSA: la numerazione prosegue tra lezioni omonime.
  const dsa = [
    lesson('onb', 'Introduction', 'DSA', 'Onboarding & Guidelines'),
    lesson('intro1', 'Introduction', 'DSA', '1. Big O notation, arrays and linked lists'),
    lesson('arrays', 'Arrays', 'DSA', '1. Big O notation, arrays and linked lists'),
    lesson('ops', 'Operations', 'DSA', '2. Stacks and queues'),
    lesson('ex2', 'Examples', 'DSA', '2. Stacks and queues'),
    lesson('tree', 'Tree structure and properties', 'DSA', '3. Trees'),
    lesson('mst', 'Minimum spanning tree algorithms', 'DSA', '4. Graphs'),
    lesson('ex4', 'Examples', 'DSA', '4. Graphs'),
    lesson('hash', 'Hash functions', 'DSA', '5. Hashing'),
  ];
  const dsaZip = [
    'Introduction-1.pdf',
    'Introduction-2.pdf',
    'Introduction-3.pdf',
    'Arrays-1.pdf',
    'Operations-1.pdf',
    'Examples-1.pdf',
    'Examples-2.pdf',
    'Examples-3.pdf',
    'Tree structure and properties-1.pdf',
    'Minimum spanning tree algorithms-1.pdf',
    'Examples-4.pdf',
    'Examples-5.pdf',
    'Examples-6.pdf',
    'Hash functions-1.pdf',
    'Exam Prep-1.pdf',
  ];
  const decksOf = (result: ReturnType<typeof matchSlideFiles>, id: string) =>
    result.matched.get(id)?.files.map((f) => `${String(f.number)}:${f.file.fileName}`);

  it('distingue le lezioni omonime con i blocchi dello zip e rinumera da 1', () => {
    const result = matchSlideFiles(zipped(dsaZip), dsa);
    expect(decksOf(result, 'intro1')).toEqual([
      '1:Introduction-1.pdf',
      '2:Introduction-2.pdf',
      '3:Introduction-3.pdf',
    ]);
    expect(decksOf(result, 'ex2')).toEqual([
      '1:Examples-1.pdf',
      '2:Examples-2.pdf',
      '3:Examples-3.pdf',
    ]);
    expect(decksOf(result, 'ex4')).toEqual([
      '1:Examples-4.pdf',
      '2:Examples-5.pdf',
      '3:Examples-6.pdf',
    ]);
    expect(decksOf(result, 'onb')).toBeUndefined();
    expect(result.unmatched.map((u) => u.fileName)).toEqual(['Exam Prep-1.pdf']);
  });

  it('con il catalogo incompleto non abbina a caso le lezioni omonime', () => {
    // Importata solo la lezione "Examples" del capitolo 4, senza le lezioni vicine.
    const partial = dsa.filter((l) => !['ex2', 'mst', 'hash'].includes(l.lessonId));
    const result = matchSlideFiles(zipped(dsaZip), partial);
    expect(decksOf(result, 'ex4')).toBeUndefined();
    expect(result.unmatched.map((u) => u.fileName)).toEqual([
      'Examples-1.pdf',
      'Examples-2.pdf',
      'Examples-3.pdf',
      'Minimum spanning tree algorithms-1.pdf',
      'Examples-4.pdf',
      'Examples-5.pdf',
      'Examples-6.pdf',
      'Hash functions-1.pdf',
      'Exam Prep-1.pdf',
    ]);
    expect(result.unmatched[0]?.reason).toBe(
      '1 lezioni importate con questo titolo e 2 gruppi di PDF nello zip: non so con certezza a quale vada',
    );
  });

  it('con il catalogo incompleto abbina il blocco accanto alla sua lezione vicina', () => {
    // Importate "Examples" del capitolo 4 e la lezione che la precede.
    const partial = dsa.filter((l) => l.lessonId !== 'ex2');
    const result = matchSlideFiles(zipped(dsaZip), partial);
    expect(decksOf(result, 'ex4')).toEqual([
      '1:Examples-4.pdf',
      '2:Examples-5.pdf',
      '3:Examples-6.pdf',
    ]);
    expect(result.unmatched.map((u) => u.fileName).slice(0, 3)).toEqual([
      'Examples-1.pdf',
      'Examples-2.pdf',
      'Examples-3.pdf',
    ]);
  });
});
