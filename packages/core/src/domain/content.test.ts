import { describe, expect, it } from 'vitest';
import type { LessonPartContent, VideoPartContent } from './content.js';
import { MAX_TEXT_LENGTH, canonicalJson, hasSummary, normalizeContent } from './content.js';

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
