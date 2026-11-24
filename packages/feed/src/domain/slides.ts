/** Regole delle slide importate dallo zip ufficiale (ADR 0012). */

/** Massimo di presentazioni per lezione in un import (nel corso DSA: 1–4). */
export const MAX_PRESENTATIONS_PER_LESSON = 20;

/**
 * Le parti `slides` seguono quelle del portale: posizione = base + numero della
 * presentazione, così restano in fondo alla lezione e in ordine.
 */
export const SLIDES_POSITION_BASE = 10_000;
