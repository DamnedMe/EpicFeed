import type { StudyContext } from '@epicfeed/assistant';
import type { FeedEntry, SubjectFeed } from '../feed/model';

/**
 * Contesto per l'assistente dalla scheda o dalla domanda del feed: testo
 * nelle due lingue e concetti della lezione toccati.
 * Solo contenuti delle lezioni: niente dati dello studente.
 */

type Bilingual = { readonly it: string; readonly en: string };

const join = (parts: readonly (Bilingual | undefined)[], language: 'it' | 'en'): string =>
  parts
    .flatMap((part) => (part ? [part[language]] : []))
    .filter((text) => text !== '')
    .join('\n');

/**
 * Costruisce il contesto di un elemento del feed.
 *
 * @param feed - Materia (per titolo e concetti della lezione).
 * @param entry - Scheda o domanda su cui si chiede.
 * @returns Il contesto da inviare con la domanda.
 */
export function entryContext(feed: SubjectFeed, entry: FeedEntry): StudyContext {
  const lesson = feed.chapters
    .flatMap((chapter) => chapter.lessons)
    .find((item) => item.lessonId === entry.lessonId);
  const lessonFeed = lesson?.feed ?? null;
  const base = { subjectTitle: feed.title, lessonTitle: entry.lessonTitle };

  if (entry.type === 'quiz') {
    const quiz = entry.quiz;
    const options =
      quiz.kind === 'multiple_choice'
        ? {
            it: quiz.options.it
              .map((option, i) => `${String.fromCharCode(65 + i)}) ${option}`)
              .join('\n'),
            en: quiz.options.en
              .map((option, i) => `${String.fromCharCode(65 + i)}) ${option}`)
              .join('\n'),
          }
        : { it: 'Vero o falso.', en: 'True or false.' };
    const solution =
      quiz.kind === 'multiple_choice'
        ? {
            it: `Risposta giusta: ${String.fromCharCode(65 + quiz.correctIndex)}.`,
            en: `Correct answer: ${String.fromCharCode(65 + quiz.correctIndex)}.`,
          }
        : {
            it: `Risposta giusta: ${quiz.answer ? 'vero' : 'falso'}.`,
            en: `Correct answer: ${quiz.answer ? 'true' : 'false'}.`,
          };
    const concept = lessonFeed?.concepts.find((item) => item.key === quiz.conceptKey);
    return {
      ...base,
      title: quiz.question,
      text: {
        it: join([options, solution, quiz.explanation], 'it'),
        en: join([options, solution, quiz.explanation], 'en'),
      },
      concepts: concept ? [{ name: concept.name, description: concept.description }] : [],
      glossary: [],
    };
  }

  const card = entry.card;
  const steps = card.steps
    ? {
        it: card.steps.it.map((s, i) => `${String(i + 1)}. ${s}`).join('\n'),
        en: card.steps.en.map((s, i) => `${String(i + 1)}. ${s}`).join('\n'),
      }
    : undefined;
  const comparison = card.comparison
    ? {
        it: card.comparison.rows
          .map(
            (row) =>
              `${row.aspect.it}: ${card.comparison?.left.it} ${row.left.it} / ${card.comparison?.right.it} ${row.right.it}`,
          )
          .join('\n'),
        en: card.comparison.rows
          .map(
            (row) =>
              `${row.aspect.en}: ${card.comparison?.left.en} ${row.left.en} / ${card.comparison?.right.en} ${row.right.en}`,
          )
          .join('\n'),
      }
    : undefined;
  const code = card.code
    ? {
        it: `\`\`\`${card.code.language}\n${card.code.source}\n\`\`\``,
        en: `\`\`\`${card.code.language}\n${card.code.source}\n\`\`\``,
      }
    : undefined;
  return {
    ...base,
    title: card.title,
    text: {
      it: join([card.keyPoint, card.body, steps, comparison, code], 'it'),
      en: join([card.keyPoint, card.body, steps, comparison, code], 'en'),
    },
    concepts: (lessonFeed?.concepts ?? [])
      .filter((concept) => card.conceptKeys.includes(concept.key))
      .map((concept) => ({ name: concept.name, description: concept.description })),
    // Il glossario della materia non viaggia con il feed: bastano i termini nella scheda.
    glossary: [],
  };
}
