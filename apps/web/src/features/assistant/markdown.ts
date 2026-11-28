/**
 * Markdown semplice delle risposte dell'assistente, trasformato in blocchi
 * da disegnare con React (mai HTML del fornitore nella pagina): paragrafi,
 * elenchi, blocchi di codice; dentro il testo grassetto e codice.
 */

/** Pezzo di testo dentro una riga. */
export type InlinePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string };

/** Blocco della risposta. */
export type AnswerBlock =
  | { readonly kind: 'paragraph'; readonly parts: readonly InlinePart[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly InlinePart[])[];
    }
  | { readonly kind: 'code'; readonly language: string; readonly text: string };

/**
 * Divide una riga in testo, grassetto (`**…**`) e codice (`` `…` ``).
 *
 * @param line - Riga.
 * @returns I pezzi.
 */
export function parseInline(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index;
    if (index > last) parts.push({ kind: 'text', text: line.slice(last, index) });
    const token = match[0];
    parts.push(
      token.startsWith('**')
        ? { kind: 'bold', text: token.slice(2, -2) }
        : { kind: 'code', text: token.slice(1, -1) },
    );
    last = index + token.length;
  }
  if (last < line.length) parts.push({ kind: 'text', text: line.slice(last) });
  return parts;
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

/**
 * Trasforma la risposta in blocchi.
 *
 * @param text - Risposta del modello.
 * @returns I blocchi, nell'ordine.
 */
export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: InlinePart[][] } | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', parts: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const fence = /^\s*```\s*([\w+#-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? '')) {
        code.push(lines[i] ?? '');
        i += 1;
      }
      blocks.push({ kind: 'code', language: fence[1] ?? '', text: code.join('\n') });
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    const ordered = NUMBER.test(line);
    if (ordered || BULLET.test(line)) {
      if (paragraph.length > 0 || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(line.replace(ordered ? NUMBER : BULLET, '')));
      continue;
    }
    if (list) flush();
    // I titoli Markdown diventano righe in grassetto.
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    paragraph.push(heading ? `**${heading[1] ?? ''}**` : line.trim());
  }
  flush();
  return blocks;
}
