import { describe, expect, it } from 'vitest';
import { parseVtt } from './vtt';

describe('parseVtt', () => {
  it('legge tempi, testo su più righe e ignora intestazioni e note', () => {
    const vtt = `\uFEFFWEBVTT

NOTE generato da Vimeo

1
00:00:01.000 --> 00:00:03.500 align:start
<v Docente>Oggi parliamo
di <i>alberi</i> binari

00:04.250 --> 00:06.000
Struttura &amp; proprietà

01:02:03.004 --> 01:02:04.000
fine`;
    expect(parseVtt(vtt)).toEqual([
      { startMs: 1000, endMs: 3500, text: 'Oggi parliamo\ndi alberi binari' },
      { startMs: 4250, endMs: 6000, text: 'Struttura & proprietà' },
      { startMs: 3723004, endMs: 3724000, text: 'fine' },
    ]);
  });

  it('scarta righe vuote e tempi incoerenti', () => {
    const vtt =
      'WEBVTT\r\n\r\n00:00:05.000 --> 00:00:01.000\r\nx\r\n\r\n00:00:01.000 --> 00:00:02.000\r\n   ';
    expect(parseVtt(vtt)).toEqual([]);
  });
});
