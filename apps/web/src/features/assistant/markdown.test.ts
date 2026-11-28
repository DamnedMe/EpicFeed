import { describe, expect, it } from 'vitest';
import { parseAnswer, parseInline } from './markdown';

describe('Markdown delle risposte', () => {
  it('grassetto e codice dentro la riga', () => {
    expect(parseInline('Usa **sempre** `left` qui')).toEqual([
      { kind: 'text', text: 'Usa ' },
      { kind: 'bold', text: 'sempre' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'left' },
      { kind: 'text', text: ' qui' },
    ]);
  });

  it('paragrafi, elenchi, titoli e blocchi di codice', () => {
    const blocks = parseAnswer(
      [
        '## Rotazioni',
        'Prima riga',
        'seconda riga.',
        '',
        '- uno',
        '* due',
        '1. primo',
        '2) secondo',
        'dopo',
        '```python',
        'def f():',
        '    return 1',
        '```',
        '<script>alert(1)</script>',
      ].join('\r\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'paragraph',
      'list',
      'list',
      'paragraph',
      'code',
      'paragraph',
    ]);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      parts: [
        { kind: 'bold', text: 'Rotazioni' },
        { kind: 'text', text: ' Prima riga seconda riga.' },
      ],
    });
    expect(blocks[1]).toMatchObject({
      ordered: false,
      items: [[{ text: 'uno' }], [{ text: 'due' }]],
    });
    expect(blocks[2]).toMatchObject({ ordered: true });
    expect(blocks[4]).toEqual({ kind: 'code', language: 'python', text: 'def f():\n    return 1' });
    // L'HTML resta testo: React lo mostra senza eseguirlo.
    expect(blocks[5]).toEqual({
      kind: 'paragraph',
      parts: [{ kind: 'text', text: '<script>alert(1)</script>' }],
    });
  });

  it('un paragrafo seguito da un elenco li separa', () => {
    expect(parseAnswer('Testo\n- punto').map((b) => b.kind)).toEqual(['paragraph', 'list']);
    expect(parseAnswer('```\ncodice senza fine')).toEqual([
      { kind: 'code', language: '', text: 'codice senza fine' },
    ]);
  });
});
