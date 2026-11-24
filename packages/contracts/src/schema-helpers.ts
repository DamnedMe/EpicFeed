import type { ConceptKey } from '@study-feed/core';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from '@study-feed/core';
import * as z from 'zod';

/**
 * Mattoni comuni agli schemi dei contenuti generati da Claude (feed e
 * pacchetti d'esame). Interni al pacchetto: non esportati da `index.ts`.
 */

/** Testo breve su una riga, non vuoto. */
export const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes('\n'), 'Il testo deve stare su una riga');

/** Testo che può andare a capo (spiegazioni), non vuoto. */
export const paragraph = (max: number) => z.string().trim().min(1).max(max);

/** Coppia italiano/inglese dello stesso testo (ADR 0011). */
export const bilingual = <T extends z.ZodType>(schema: T) =>
  z.strictObject({ it: schema, en: schema });

/** Identificativo in kebab-case. */
export const slug = z
  .string()
  .max(MAX_SLUG_LENGTH)
  .regex(SLUG_PATTERN, 'Usa il kebab-case: lettere minuscole, cifre e trattini');

/** Chiave di un concetto della lezione. */
export const conceptKeySchema = slug.transform((value) => value as ConceptKey);

/** Versione delle istruzioni di generazione (prompt MCP), es. `2026-11-21.1`. */
export const promptVersionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{1,3}$/, 'Versione del prompt non valida');
