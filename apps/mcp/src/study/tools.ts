import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CORRECTION_REASONS, textEditSchema } from '@epicfeed/feed';
import * as z from 'zod';
import type { EpicFeedApi } from '../api-client.js';
import { issuesResult, text, withErrors } from '../tool-results.js';
import type { SubjectProgress } from './concepts.js';
import { subjectProgress } from './concepts.js';
import type { StudyLibrary } from './library.js';
import type { StudentProgress } from './progress.js';
import { progressProblem } from './progress.js';
import { STUDY_PROMPT } from './prompt.js';
import type { ClaudeReport, PreparedReport } from './report-error.js';
import { prepareReport } from './report-error.js';
import type { SearchHit } from './search.js';
import { searchLessons } from './search.js';

/** Operazioni dell'API usate dagli strumenti di studio (oltre a libreria e progressi). */
export type StudyApi = Pick<EpicFeedApi, 'reportError'>;

/** Servizi dell'assistente di studio. */
export interface StudyServices {
  readonly api: StudyApi;
  readonly library: StudyLibrary;
  readonly progress: StudentProgress;
  /** Adesso (test). */
  readonly now?: () => Date;
  /** Id nuovo per una correzione (test). */
  readonly newId?: () => string;
}

const REPORT_TOOL = 'segnala_errore';

const subjectInput = z
  .string()
  .trim()
  .max(120)
  .optional()
  .describe('Materia: id o parte del titolo (es. "DSA"). Vuoto per tutte.');

/**
 * Registra gli strumenti dell'assistente di studio (M6, ADR 0021):
 * `cerca_lezione`, `concetti_deboli`, `segnala_errore` e il prompt
 * `studia_con_epicfeed`. Lavorano sul feed delle materie, scaricato una volta
 * e tenuto in memoria qualche minuto, e sui progressi decifrati sul PC.
 *
 * @param server - Server MCP di EpicFeed.
 * @param services - Servizi.
 */
export function registerStudyTools(server: McpServer, services: StudyServices): void {
  const now = services.now ?? (() => new Date());
  const newId = services.newId ?? (() => crypto.randomUUID());

  server.registerTool(
    'cerca_lezione',
    {
      title: 'Cerca lezione',
      description:
        'Cerca un argomento nelle lezioni importate dallo studente (schede, domande e concetti, in italiano e in inglese). Restituisce lezione, scheda, frase chiave, testo e, se c’è, il minuto del video con il link al portale, più gli id che servono a segnala_errore.',
      inputSchema: {
        testo: z.string().trim().min(2).max(200).describe('Cosa cercare, in parole semplici.'),
        materia: subjectInput,
        limite: z.number().int().min(1).max(10).optional().describe('Quanti risultati (5).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ testo, materia, limite }) =>
      withErrors(async () => {
        const feeds = await services.library.feedsFor(materia);
        if (feeds.length === 0) return text(noSubjects(materia));
        const hits = searchLessons(feeds, testo, limite ?? 5);
        if (hits.length === 0) {
          return text(
            `Nessuna scheda parla di «${testo}» nelle lezioni importate. Prova con un'altra parola (anche in inglese) o di' allo studente che l'argomento non è tra le sue lezioni.`,
          );
        }
        return { content: hits.map((hit) => ({ type: 'text' as const, text: formatHit(hit) })) };
      }),
  );

  server.registerTool(
    'concetti_deboli',
    {
      title: 'Concetti deboli',
      description:
        'I concetti su cui lo studente sbaglia di più e che non ha ancora consolidato, con errori, probabilità di ricordarli e se sono da ripassare oggi. Legge i progressi sincronizzati, decifrati sul PC.',
      inputSchema: {
        materia: subjectInput,
        limite: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Quanti concetti per materia (8).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ materia, limite }) =>
      withErrors(async () => {
        const reading = await services.progress.read();
        if (reading.status !== 'ok') return text(progressProblem(reading.status));
        const feeds = await services.library.feedsFor(materia);
        if (feeds.length === 0) return text(noSubjects(materia));
        const at = now();
        const parts = feeds.map((feed) =>
          formatProgress(subjectProgress(feed, reading.snapshot.answers, at, limite ?? 8)),
        );
        return { content: parts.map((value) => ({ type: 'text' as const, text: value })) };
      }),
  );

  server.registerTool(
    REPORT_TOOL,
    {
      title: 'Segnala errore',
      description:
        'Corregge per lo studente una scheda o una domanda sbagliata, come Segnala errore nell’app: la correzione vale solo per lui e si annulla in Io › Le mie segnalazioni. Prima chiamala con confirmed false per avere l’anteprima e mostrala allo studente; poi richiamala uguale con confirmed true solo dopo il suo sì.',
      inputSchema: {
        subjectId: z.uuid().describe('Materia, da cerca_lezione.'),
        kind: z
          .enum(['text', 'answer', 'term'])
          .describe(
            'text: una frase sbagliata; answer: la risposta giusta di una domanda è un’altra; term: un termine scritto male in tutta la materia.',
          ),
        lessonId: z.uuid().optional().describe('Lezione (text, answer), da cerca_lezione.'),
        itemType: z.enum(['card', 'quiz']).optional().describe('Scheda o domanda (text).'),
        itemId: z
          .string()
          .min(1)
          .max(80)
          .optional()
          .describe('Id della scheda o domanda (text, answer).'),
        edits: z
          .array(textEditSchema)
          .min(1)
          .max(2)
          .optional()
          .describe(
            'text: la stessa frase corretta in it e in en. original è il tratto sbagliato copiato esattamente dal campo, corrected la versione giusta.',
          ),
        correct: z
          .union([
            z.strictObject({ index: z.number().int().min(0).max(10) }),
            z.strictObject({ answer: z.boolean() }),
          ])
          .optional()
          .describe('answer: index dell’opzione giusta (da 0) oppure answer vero/falso.'),
        from: z.string().trim().min(1).max(80).optional().describe('term: il termine sbagliato.'),
        to: z.string().trim().min(1).max(80).optional().describe('term: il termine giusto.'),
        reason: z.enum(CORRECTION_REASONS).describe('content, translation, code o unclear.'),
        confirmed: z
          .boolean()
          .describe('false per l’anteprima; true solo dopo che lo studente ha detto sì.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) =>
      withErrors(async () => {
        const report = toReport(input);
        if ('missing' in report) {
          return issuesResult([{ path: report.missing, message: 'Campo richiesto' }], REPORT_TOOL);
        }
        const feed = await services.library.feed(input.subjectId);
        const prepared = prepareReport(feed, report);
        if (!prepared.ok) return issuesResult(prepared.issues, REPORT_TOOL);
        if (!input.confirmed) return text(formatPreview(prepared.report));
        await services.api.reportError({
          id: newId(),
          subjectId: feed.subjectId,
          correction: prepared.report.draft,
        });
        services.library.forget(feed.subjectId);
        return text(
          'Correzione salvata: lo studente la vede nel feed alla prossima apertura dell’app ed è in Io › Le mie segnalazioni, dove può annullarla.',
        );
      }, REPORT_TOOL),
  );

  server.registerPrompt(
    'studia_con_epicfeed',
    {
      title: 'Studia con EpicFeed',
      description: 'Riparte dai concetti deboli e propone un argomento da ripassare insieme.',
    },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: STUDY_PROMPT } }] }),
  );
}

type ReportInput = {
  kind: 'text' | 'answer' | 'term';
  lessonId?: string | undefined;
  itemType?: 'card' | 'quiz' | undefined;
  itemId?: string | undefined;
  edits?: Extract<ClaudeReport, { kind: 'text' }>['edits'] | undefined;
  correct?: { index: number } | { answer: boolean } | undefined;
  from?: string | undefined;
  to?: string | undefined;
  reason: ClaudeReport['reason'];
};

/** Dalla richiesta dello strumento alla correzione, o il primo campo mancante. */
function toReport(input: ReportInput): ClaudeReport | { missing: string } {
  const { kind, reason } = input;
  if (kind === 'term') {
    if (!input.from) return { missing: 'from' };
    if (!input.to) return { missing: 'to' };
    return { kind, from: input.from, to: input.to, reason };
  }
  if (!input.lessonId) return { missing: 'lessonId' };
  if (!input.itemId) return { missing: 'itemId' };
  if (kind === 'answer') {
    if (!input.correct) return { missing: 'correct' };
    return { kind, lessonId: input.lessonId, itemId: input.itemId, correct: input.correct, reason };
  }
  if (!input.itemType) return { missing: 'itemType' };
  if (!input.edits) return { missing: 'edits' };
  return {
    kind,
    lessonId: input.lessonId,
    itemType: input.itemType,
    itemId: input.itemId,
    edits: input.edits,
    reason,
  };
}

function noSubjects(subject: string | undefined): string {
  return subject
    ? `Nessuna materia con lezioni generate corrisponde a «${subject}».`
    : 'Lo studente non ha ancora lezioni con il feed: prima vanno importate e generate.';
}

/**
 * Risultato della ricerca in testo per Claude.
 *
 * @param hit - Risultato.
 * @returns Il testo.
 */
export function formatHit(hit: SearchHit): string {
  const kind = hit.itemType === 'card' ? 'Scheda' : 'Domanda';
  const out = [
    `# ${hit.lessonTitle} · ${kind} ${String(hit.position)}`,
    `${hit.subjectTitle} › ${hit.chapterTitle}`,
    `ids: subjectId ${hit.subjectId} · lessonId ${hit.lessonId} · itemType ${hit.itemType} · itemId ${hit.itemId}`,
    `IT: ${hit.title.it} — ${hit.summary.it}`,
    `EN: ${hit.title.en} — ${hit.summary.en}`,
  ];
  if (hit.body) out.push(`Testo IT: ${hit.body.it}`, `Testo EN: ${hit.body.en}`);
  out.push(
    hit.video
      ? `Video: «${hit.video.partTitle}» dal minuto ${hit.video.minute} · ${hit.video.url}`
      : `Lezione sul portale: ${hit.lessonUrl}`,
  );
  return out.join('\n');
}

/**
 * Progressi di una materia in testo per Claude.
 *
 * @param progress - Riepilogo.
 * @returns Il testo.
 */
export function formatProgress(progress: SubjectProgress): string {
  const out = [
    `# ${progress.subjectTitle}`,
    `Concetti visti ${String(progress.seen)} su ${String(progress.concepts)} · da ripassare oggi ${String(progress.due)}`,
  ];
  if (progress.weak.length === 0) {
    out.push('Nessun concetto debole: nessun errore sui concetti non ancora consolidati.');
    return out.join('\n');
  }
  out.push('', 'Concetti deboli, dal più sbagliato:');
  for (const item of progress.weak) {
    const { concept, state } = item;
    const recall = `${String(Math.round(item.recall * 100))}%`;
    out.push(
      `- ${concept.name.it} (${concept.name.en}) · lezione «${concept.lessonTitle}» · errori ${String(state.wrong)} su ${String(state.reps)} risposte · ricordo stimato ${recall}${item.due ? ' · da ripassare oggi' : ''} · conceptKey ${concept.key}`,
    );
  }
  return out.join('\n');
}

/**
 * Anteprima della correzione, da mostrare allo studente prima di salvare.
 *
 * @param report - Correzione preparata.
 * @returns Il testo per Claude.
 */
export function formatPreview(report: PreparedReport): string {
  const { draft } = report;
  const out = ['Anteprima, NON ancora salvata.'];
  if (draft.kind === 'term') {
    const usage = report.usage;
    out.push(
      `Il termine «${draft.from}» diventa «${draft.to}» in ${String(usage?.items ?? 0)} schede e domande di ${String(usage?.lessons ?? 0)} lezioni: ${(usage?.lessonTitles ?? []).join(', ')}.`,
    );
  } else {
    out.push(`Lezione «${report.lessonTitle ?? ''}».`);
    if (draft.kind === 'text') {
      for (const edit of draft.edits) {
        out.push(`- ${edit.field} (${edit.language}): «${edit.original}» → «${edit.corrected}»`);
      }
      if (draft.edits.length === 1 && draft.edits[0]?.field !== 'code') {
        out.push(
          'Manca l’altra lingua: aggiungila in edits, così la correzione vale subito in italiano e in inglese.',
        );
      }
    } else if (draft.kind === 'answer') {
      out.push(
        draft.fix.kind === 'multiple_choice'
          ? `Risposta giusta: «${draft.fix.option.it}» / «${draft.fix.option.en}».`
          : `Risposta giusta: ${draft.fix.answer ? 'vero' : 'falso'}.`,
      );
    }
    out.push(
      'Elemento dopo la correzione:',
      '```json',
      JSON.stringify(report.after, null, 2),
      '```',
    );
  }
  out.push(
    'Mostra la correzione allo studente in poche righe e chiedi conferma. Solo dopo il suo sì richiama segnala_errore con gli stessi dati e confirmed true.',
  );
  return out.join('\n');
}
