import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SubjectsForExamResponse } from '@epicfeed/contracts';
import { examBankDraftSchema } from '@epicfeed/contracts';
import { checkExamBank } from '@epicfeed/core';
import * as z from 'zod';
import type { EpicFeedApi } from './api-client.js';
import { EXAM_BANK_INSTRUCTIONS, EXAM_BANK_PROMPT_VERSION } from './exam-prompt.js';
import type { SlideFile } from './slides/archive.js';
import { isExamMaterial, matchSlideFiles, normalizeTitle } from './slides/match.js';
import type { SlidesToolkit } from './slides/toolkit.js';
import { issuesResult, text, withErrors } from './tool-results.js';

/** Operazioni dell'API usate dalla banca d'esame (sostituibili nei test). */
export type ExamBankApi = Pick<EpicFeedApi, 'listExamSubjects' | 'saveExamBank' | 'listCatalog'>;

/** Strumento da richiamare dopo aver corretto una banca. */
const SAVE_TOOL = 'salva_esercizi_esame';

/** Massimo di pagine del materiale d'esame mostrate a Claude come immagine. */
export const MAX_EXAM_IMAGES = 24;

type Subject = SubjectsForExamResponse['subjects'][number];

/**
 * Registra gli strumenti della banca degli esercizi d'esame (M4, ADR 0014 §2):
 * `leggi_materiale_esame` e `salva_esercizi_esame`.
 *
 * Il materiale d'esame (es. `Exam Prep-1.pdf` dello zip delle slide) si legge
 * solo sul PC: a Claude arrivano testo e immagini delle pagine, a EpicFeed
 * solo la banca scritta da Claude.
 *
 * @param server - Server MCP di EpicFeed.
 * @param api - Client dell'API.
 * @param slides - Operazioni sui PDF.
 */
export function registerExamBankTools(
  server: McpServer,
  api: ExamBankApi,
  slides: SlidesToolkit,
): void {
  // Concetti della materia letta in questa sessione, per il controllo locale.
  const conceptsBySubject = new Map<string, ReadonlySet<string>>();

  server.registerTool(
    'leggi_materiale_esame',
    {
      title: "Leggi materiale d'esame",
      description:
        'Legge sul PC il materiale d\'esame del corso (i PDF "Exam Prep" dello zip delle slide di Course downloads) e restituisce testo e immagini delle pagine, la materia con i suoi concetti e le istruzioni per scrivere la banca degli esercizi. Da chiamare prima di salva_esercizi_esame.',
      inputSchema: {
        percorso: z
          .string()
          .min(1)
          .max(1024)
          .describe('Percorso dello zip delle slide o della cartella estratta, sul PC.'),
        materia: z
          .string()
          .max(200)
          .optional()
          .describe('Materia, se EpicFeed non la riconosce da solo dallo zip.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ percorso, materia }) =>
      withErrors(async () => {
        let files: SlideFile[];
        try {
          files = await slides.listFiles(percorso.trim());
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Errore nella lettura dello zip.';
          return { isError: true, content: [{ type: 'text', text: message }] };
        }
        const material = files.filter((file) => isExamMaterial(file.fileName));
        if (material.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `In "${percorso}" non c'è materiale d'esame (un PDF con "Exam Prep" nel nome).`,
              },
            ],
          };
        }
        const { subjects } = await api.listExamSubjects();
        const subject = await pickSubject(subjects, files, materia, api);
        if (typeof subject === 'string') {
          return { isError: true, content: [{ type: 'text', text: subject }] };
        }
        conceptsBySubject.set(
          subject.subjectId,
          new Set(subject.concepts.map((concept) => concept.key)),
        );

        const content: CallToolResult['content'] = [];
        const header = [
          `# Materiale d'esame: ${subject.subjectTitle}`,
          `subjectId: ${subject.subjectId}`,
        ];
        if (subject.hasBank) {
          header.push(
            "Nota: hai già una banca per questa materia; salvarne un'altra non cambia nulla.",
          );
        }
        header.push('', '## Concetti della materia');
        header.push(...subject.concepts.map((c) => `- ${c.key}: ${c.name}. ${c.description}`));
        content.push({ type: 'text', text: header.join('\n') });

        let images = 0;
        for (const file of material) {
          const data = await file.read();
          const pages = await slides.readPages(data);
          const lines = [`## ${file.fileName}`];
          for (const page of pages) {
            lines.push('', `### Pagina ${String(page.number)}`, page.text || '(solo immagine)');
          }
          content.push({ type: 'text', text: lines.join('\n') });
          // Esempi e codice sono spesso immagini: si mostrano tutte le pagine, entro il tetto.
          const numbers = pages.map((page) => page.number).slice(0, MAX_EXAM_IMAGES - images);
          for (const rendered of await slides.render(data, numbers)) {
            content.push({
              type: 'text',
              text: `Figura: ${file.fileName}, pagina ${String(rendered.page)}`,
            });
            content.push({
              type: 'image',
              data: rendered.png.toString('base64'),
              mimeType: 'image/png',
            });
            images += 1;
          }
        }
        content.push({ type: 'text', text: EXAM_BANK_INSTRUCTIONS });
        return { content };
      }, SAVE_TOOL),
  );

  server.registerTool(
    'salva_esercizi_esame',
    {
      title: "Salva esercizi d'esame",
      description:
        "Salva in EpicFeed la banca degli esercizi d'esame di una materia (esercizi ufficiali con 2 varianti ciascuno, in inglese). Controlla la banca prima di inviarla: se ci sono problemi li elenca, da correggere prima di salvare di nuovo.",
      inputSchema: {
        subjectId: z.uuid().describe('Id della materia restituito da leggi_materiale_esame.'),
        bank: examBankDraftSchema.describe('La banca degli esercizi.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ subjectId, bank }) =>
      withErrors(async () => {
        const concepts = conceptsBySubject.get(subjectId.toLowerCase());
        if (concepts) {
          const issues = checkExamBank(bank, concepts);
          if (issues.length > 0) return issuesResult(issues, SAVE_TOOL);
        }
        const saved = await api.saveExamBank({
          subjectId,
          promptVersion: EXAM_BANK_PROMPT_VERSION,
          bank,
        });
        const verb = saved.created
          ? "Banca d'esame salvata"
          : 'Avevi già una banca per questa materia (vale la prima)';
        return text(
          `${verb}: ${String(saved.officials)} esercizi ufficiali e ${String(saved.variants)} varianti.`,
        );
      }, SAVE_TOOL),
  );
}

/**
 * Sceglie la materia del materiale d'esame: quella indicata, altrimenti quella
 * delle lezioni a cui si abbinano le slide dello stesso zip, altrimenti l'unica
 * materia con feed.
 *
 * @returns La materia, o il messaggio per Claude se non si può scegliere.
 */
async function pickSubject(
  subjects: readonly Subject[],
  files: readonly SlideFile[],
  requested: string | undefined,
  api: ExamBankApi,
): Promise<Subject | string> {
  if (subjects.length === 0) {
    return "Nessuna materia ha ancora lezioni generate: genera prima le lezioni, poi la banca d'esame.";
  }
  if (requested !== undefined && requested.trim() !== '') {
    const key = normalizeTitle(requested);
    const found = subjects.filter((s) => normalizeTitle(s.subjectTitle).includes(key));
    if (found.length === 1 && found[0]) return found[0];
    return `Materia "${requested}" non trovata o ambigua. Materie con lezioni generate: ${subjects.map((s) => s.subjectTitle).join(', ')}.`;
  }
  const { lessons } = await api.listCatalog();
  const { matched } = matchSlideFiles(
    files.filter((file) => !isExamMaterial(file.fileName)),
    lessons,
  );
  const votes = new Map<string, number>();
  for (const { lesson } of matched.values()) {
    votes.set(lesson.subjectTitle, (votes.get(lesson.subjectTitle) ?? 0) + 1);
  }
  const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const byVote = best ? subjects.find((s) => s.subjectTitle === best[0]) : undefined;
  if (byVote) return byVote;
  if (subjects.length === 1 && subjects[0]) return subjects[0];
  return `Non riconosco la materia dallo zip: richiama lo strumento con materia, scegliendo tra ${subjects.map((s) => s.subjectTitle).join(', ')}.`;
}
