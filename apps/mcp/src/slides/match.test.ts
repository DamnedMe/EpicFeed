import { describe, expect, it } from 'vitest';
import type { SlideFile } from './archive.js';
import { matchSlideFiles, normalizeTitle, parseSlideFileName } from './match.js';

const file = (fileName: string): SlideFile => ({
  fileName,
  entry: `zip/${fileName}`,
  read: () => Promise.resolve(new Uint8Array()),
});

const lesson = (lessonId: string, lessonTitle: string, subjectTitle = 'DSA') => ({
  lessonId,
  lessonTitle,
  chapterTitle: 'Capitolo',
  subjectTitle,
});

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
      ['Introduction-1.pdf', '2 lezioni con questo titolo: indica la materia'],
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
});
