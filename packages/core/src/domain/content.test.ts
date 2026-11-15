import { describe, expect, it } from 'vitest';
import type { LessonPartContent, VideoPartContent } from './content.js';
import { MAX_SUBTITLE_CUES, MAX_TEXT_LENGTH, canonicalJson, normalizeContent } from './content.js';

const video: VideoPartContent = {
  kind: 'video',
  summaries: { it: ' Le closure  \r\nricordano lo scope. ', en: '' },
  subtitles: [
    { startMs: 4000, endMs: 6000, text: 'seconda\nriga' },
    { startMs: 0, endMs: 3000, text: 'prima riga ' },
    { startMs: 7000, endMs: 8000, text: '   ' },
  ],
};

describe('normalizeContent', () => {
  it('normalizza i riassunti e scarta quelli vuoti', () => {
    const result = normalizeContent(video) as VideoPartContent;
    expect(result.summaries).toEqual({ it: 'Le closure\nricordano lo scope.' });
  });

  it('ordina i sottotitoli, unisce le righe e scarta quelli vuoti', () => {
    const result = normalizeContent(video) as VideoPartContent;
    expect(result.subtitles).toEqual([
      { startMs: 0, endMs: 3000, text: 'prima riga' },
      { startMs: 4000, endMs: 6000, text: 'seconda riga' },
    ]);
  });

  it('a parità di inizio ordina per fine', () => {
    const result = normalizeContent({
      kind: 'video',
      summaries: {},
      subtitles: [
        { startMs: 0, endMs: 2000, text: 'b' },
        { startMs: 0, endMs: 1000, text: 'a' },
      ],
    }) as VideoPartContent;
    expect(result.subtitles.map((cue) => cue.text)).toEqual(['a', 'b']);
  });

  it('normalizza le parti da leggere', () => {
    expect(normalizeContent({ kind: 'reading', markdown: '# Titolo  \r\n\r\n\r\ntesto' })).toEqual({
      kind: 'reading',
      markdown: '# Titolo\n\ntesto',
    });
  });

  it.each<[string, LessonPartContent]>([
    ['video senza testo', { kind: 'video', summaries: { it: ' ' }, subtitles: [] }],
    ['lettura vuota', { kind: 'reading', markdown: '\n\n' }],
    [
      'tempi negativi',
      { kind: 'video', summaries: {}, subtitles: [{ startMs: -1, endMs: 5, text: 'x' }] },
    ],
    [
      'fine prima di inizio',
      { kind: 'video', summaries: {}, subtitles: [{ startMs: 9, endMs: 5, text: 'x' }] },
    ],
    [
      'tempi decimali',
      { kind: 'video', summaries: {}, subtitles: [{ startMs: 0.5, endMs: 5, text: 'x' }] },
    ],
    ['testo troppo lungo', { kind: 'reading', markdown: 'x'.repeat(MAX_TEXT_LENGTH + 1) }],
    [
      'troppi sottotitoli',
      {
        kind: 'video',
        summaries: { it: 'ok' },
        subtitles: Array.from({ length: MAX_SUBTITLE_CUES + 1 }, (_, i) => ({
          startMs: i,
          endMs: i,
          text: 'x',
        })),
      },
    ],
  ])('rifiuta: %s', (_label, content) => {
    expect(() => normalizeContent(content)).toThrow(
      expect.objectContaining({ code: 'INVALID_CONTENT' }),
    );
  });
});

describe('canonicalJson', () => {
  it("non dipende dall'ordine delle proprietà", () => {
    const a: LessonPartContent = { kind: 'video', summaries: { it: 'a', en: 'b' }, subtitles: [] };
    const b = {
      subtitles: [],
      summaries: { en: 'b', it: 'a' },
      kind: 'video',
    } as LessonPartContent;
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe(
      '{"kind":"video","subtitles":[],"summaries":{"en":"b","it":"a"}}',
    );
  });
});
