/** Riga di sottotitoli con tempi in millisecondi (come nei contratti). */
export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

const TIMING = /^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{3})/;

/**
 * Converte un file WebVTT (i sottotitoli di Vimeo) in righe con tempi in
 * millisecondi. Ignora intestazione, blocchi NOTE/STYLE/REGION, identificativi
 * delle righe, impostazioni di posizione e tag di formattazione (`<i>`, `<c.x>`…).
 *
 * @param text - Contenuto del file `.vtt`.
 * @returns Le righe nell'ordine del file.
 */
export function parseVtt(text: string): Cue[] {
  const blocks = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const index = lines.findIndex((line) => line.includes('-->'));
    if (index === -1) continue;
    const match = TIMING.exec(lines[index]?.trim() ?? '');
    if (!match?.[1] || !match[2]) continue;
    const body = lines
      .slice(index + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
    const startMs = toMs(match[1]);
    const endMs = toMs(match[2]);
    if (body && endMs >= startMs) cues.push({ startMs, endMs, text: body });
  }
  return cues;
}

function toMs(stamp: string): number {
  const [clock = '0', millis = '0'] = stamp.replace(',', '.').split('.');
  const parts = clock.split(':').map(Number);
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
  return ((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000 + Number(millis);
}
