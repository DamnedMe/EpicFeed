import { describe, expect, it } from 'vitest';
import type { LessonPartContent, VideoPartContent } from './content.js';
import { MAX_TEXT_LENGTH, canonicalJson, hasSummary, normalizeContent } from './content.js';
import { DomainError } from '@epicfeed/shared';

const video: VideoPartContent = {
  kind: 'video',
  summaries: { it: ' Le closure  \r\nricordano lo scope. ', en: '' },
};

describe('normalizeContent', () => {
  it('normalizza i riassunti e scarta quelli vuoti', () => {
    const result = normalizeContent(video) as VideoPartContent;
    expect(result.summaries).toEqual({ it: 'Le closure\nricordano lo scope.' });
    expect(hasSummary(result)).toBe(true);
  });

  it('accetta un video senza riassunti (la parte porterà i sottotitoli)', () => {
    const result = normalizeContent({ kind: 'video', summaries: { it: ' ' } }) as VideoPartContent;
    expect(result).toEqual({ kind: 'video', summaries: {} });
    expect(hasSummary(result)).toBe(false);
  });

  it('normalizza le parti da leggere', () => {
    expect(normalizeContent({ kind: 'reading', markdown: '# Titolo  \r\n\r\n\r\ntesto' })).toEqual({
      kind: 'reading',
      markdown: '# Titolo\n\ntesto',
    });
  });

  it.each<[string, LessonPartContent]>([
    ['lettura vuota', { kind: 'reading', markdown: '\n\n' }],
    ['testo troppo lungo', { kind: 'reading', markdown: 'x'.repeat(MAX_TEXT_LENGTH + 1) }],
    [
      'riassunto troppo lungo',
      { kind: 'video', summaries: { en: 'x'.repeat(MAX_TEXT_LENGTH + 1) } },
    ],
  ])('rifiuta: %s', (_label, content) => {
    expect(() => normalizeContent(content)).toThrow(
      expect.objectContaining({ code: 'INVALID_CONTENT' }),
    );
  });
});

describe('canonicalJson', () => {
  it("non dipende dall'ordine delle proprietà", () => {
    const a: LessonPartContent = { kind: 'video', summaries: { it: 'a', en: 'b' } };
    const b = { summaries: { en: 'b', it: 'a' }, kind: 'video' } as LessonPartContent;
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"kind":"video","summaries":{"en":"b","it":"a"}}');
  });

  it('mantiene l’ordine degli array', () => {
    expect(canonicalJson({ cues: [{ b: 1, a: 2 }, 3] })).toBe('{"cues":[{"a":2,"b":1},3]}');
  });
});

describe('normalizeContent (slides)', () => {
  const base = { kind: 'slides' as const, fileName: ' AVL trees-1.pdf ' };

  it('ordina le pagine, normalizza i testi e accetta pagine senza testo', () => {
    expect(
      normalizeContent({
        ...base,
        pages: [
          { number: 2, text: '' },
          { number: 1, text: 'AVL  trees ' },
        ],
      }),
    ).toEqual({
      kind: 'slides',
      fileName: 'AVL trees-1.pdf',
      pages: [
        { number: 1, text: 'AVL  trees' },
        { number: 2, text: '' },
      ],
    });
  });

  it.each<[string, unknown]>([
    ['nome vuoto', { ...base, fileName: ' ', pages: [{ number: 1, text: 'x' }] }],
    ['nome lunghissimo', { ...base, fileName: 'x'.repeat(300), pages: [{ number: 1, text: 'x' }] }],
    ['nessuna pagina', { ...base, pages: [] }],
    [
      'pagina ripetuta',
      {
        ...base,
        pages: [
          { number: 1, text: 'a' },
          { number: 1, text: 'b' },
        ],
      },
    ],
    ['pagina zero', { ...base, pages: [{ number: 0, text: 'a' }] }],
    ['testo enorme', { ...base, pages: [{ number: 1, text: 'x'.repeat(MAX_TEXT_LENGTH + 1) }] }],
  ])('rifiuta: %s', (_label, content) => {
    expect(() => normalizeContent(content as LessonPartContent)).toThrow(DomainError);
  });
});
