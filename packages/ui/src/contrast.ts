/**
 * Calcoli di contrasto secondo WCAG 2.2, usati nei test per garantire che
 * ogni combinazione di tema e accento resti leggibile.
 */

/**
 * Luminanza relativa di un colore esadecimale `#RRGGBB`.
 *
 * @param hex - Colore in formato `#RRGGBB`.
 * @returns Luminanza tra 0 (nero) e 1 (bianco).
 * @throws Error se il formato non è `#RRGGBB`.
 */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Colore non valido: ${hex}`);
  const [r, g, b] = match.slice(1).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Rapporto di contrasto tra due colori (da 1:1 a 21:1).
 * WCAG AA richiede almeno 4,5 per il testo normale e 3 per testo grande e icone.
 *
 * @param foreground - Colore del testo, `#RRGGBB`.
 * @param background - Colore dello sfondo, `#RRGGBB`.
 * @returns Il rapporto di contrasto.
 */
export function contrastRatio(foreground: string, background: string): number {
  const [darker, lighter] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => a - b,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
