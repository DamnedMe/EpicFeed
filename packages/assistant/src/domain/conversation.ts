/**
 * Conversazione con l'assistente su una scheda del feed: contesto da
 * inviare al fornitore, istruzioni, domande rapide e limiti. Funzioni pure.
 *
 * Al fornitore vanno solo la domanda, la scheda, i concetti della lezione e
 * le voci del glossario della scheda (ADR 0021): mai email, password o token.
 */

/** Lingua di studio. */
export type AssistantLanguage = 'it' | 'en';

type Bilingual = { readonly it: string; readonly en: string };

/** Contesto della scheda su cui si chiede. */
export interface StudyContext {
  readonly subjectTitle: string;
  readonly lessonTitle: string;
  /** Titolo della scheda o testo della domanda del quiz. */
  readonly title: Bilingual;
  /** Testo che lo studente vede: frase chiave, corpo, passi, opzioni. */
  readonly text: Bilingual;
  /** Concetti della lezione toccati dalla scheda. */
  readonly concepts: readonly { readonly name: Bilingual; readonly description: Bilingual }[];
  /** Voci del glossario dei termini della scheda. */
  readonly glossary: readonly { readonly term: string; readonly definition: Bilingual }[];
}

/** Messaggio della conversazione. */
export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

/** Limiti della conversazione: tengono basso il costo di ogni domanda. */
export const CHAT_LIMITS = {
  /** Caratteri di una domanda. */
  question: 1000,
  /** Messaggi precedenti inviati con la domanda (gli ultimi). */
  history: 8,
  /** Caratteri del contesto della scheda. */
  context: 6000,
  /** Lunghezza massima della risposta, in token. */
  answerTokens: 900,
} as const;

/** Domande rapide sotto la risposta. */
export type QuickAsk = 'simpler' | 'english' | 'quizMe' | 'example';

/** Etichette delle domande rapide, nella lingua dell'interfaccia (italiano). */
export const QUICK_ASK_LABELS: Readonly<Record<QuickAsk, string>> = {
  simpler: 'Spiegamelo più semplice',
  example: 'Fammi un esempio',
  english: 'In inglese',
  quizMe: 'Fammi una domanda',
};

/**
 * Testo della domanda rapida, come se lo scrivesse lo studente.
 *
 * @param ask - Domanda rapida.
 * @param language - Lingua di studio.
 * @returns La domanda.
 */
export function quickAskText(ask: QuickAsk, language: AssistantLanguage): string {
  const texts: Record<QuickAsk, Bilingual> = {
    simpler: {
      it: 'Spiegamelo in modo più semplice, con parole di tutti i giorni.',
      en: 'Explain it more simply, in everyday words.',
    },
    example: {
      it: 'Fammi un esempio concreto e breve.',
      en: 'Give me a short, concrete example.',
    },
    english: {
      it: "Rispiegamelo in inglese, la lingua dell'esame, con i termini tecnici giusti.",
      en: 'Explain it again in English, the exam language, with the right technical terms.',
    },
    quizMe: {
      it: 'Fammi una domanda su questa scheda per vedere se l’ho capita. Non dirmi la risposta finché non rispondo.',
      en: "Ask me one question about this card to check I understood it. Don't tell me the answer until I reply.",
    },
  };
  return texts[ask][language];
}

/**
 * Pulisce la domanda dello studente.
 *
 * @param question - Testo scritto.
 * @returns La domanda, oppure `null` se è vuota.
 */
export function cleanQuestion(question: string): string | null {
  const trimmed = question.trim().slice(0, CHAT_LIMITS.question);
  return trimmed === '' ? null : trimmed;
}

/** Testo della scheda nelle due lingue, tagliato al limite del contesto. */
function contextBlock(context: StudyContext): string {
  const lines = [
    `Subject: ${context.subjectTitle}`,
    `Lesson: ${context.lessonTitle}`,
    '',
    `Card (Italian): ${context.title.it}`,
    context.text.it,
    '',
    `Card (English): ${context.title.en}`,
    context.text.en,
  ];
  if (context.concepts.length > 0) {
    lines.push('', 'Concepts of the lesson:');
    for (const concept of context.concepts) {
      lines.push(`- ${concept.name.en} / ${concept.name.it}: ${concept.description.en}`);
    }
  }
  if (context.glossary.length > 0) {
    lines.push('', 'Glossary:');
    for (const entry of context.glossary) {
      lines.push(`- ${entry.term}: ${entry.definition.en}`);
    }
  }
  return lines.join('\n').slice(0, CHAT_LIMITS.context);
}

/**
 * Istruzioni di sistema per il fornitore: tutor di uno studente Epicode,
 * risposte brevi basate sulla scheda, nella lingua della domanda.
 *
 * @param context - Scheda su cui si chiede.
 * @param language - Lingua di studio dello studente.
 * @returns Il testo delle istruzioni.
 */
export function systemPrompt(context: StudyContext, language: AssistantLanguage): string {
  return [
    'You are the study assistant of EpicFeed, an app where a student of an online coding school studies their lessons as short cards. The final exam is in English.',
    `Answer in the language of the student's question (their study language is ${language === 'it' ? 'Italian' : 'English'}). Switch to English when asked.`,
    'Be brief: at most about 150 words, short paragraphs or a short list, code only when useful. Start from the card below and the lesson concepts; you may add correct general knowledge, but say so when you go beyond the card. If the card looks wrong, say it politely and suggest using "Segnala errore".',
    'Never ask for personal data. Plain text with simple Markdown (bold, lists, inline code, code blocks).',
    '',
    'The card the student is looking at:',
    contextBlock(context),
  ].join('\n');
}

/**
 * Messaggi da inviare: gli ultimi della conversazione più la nuova domanda.
 * La conversazione inviata comincia sempre con una domanda dello studente.
 *
 * @param history - Messaggi precedenti.
 * @param question - Nuova domanda (già pulita).
 * @returns I messaggi, al massimo `CHAT_LIMITS.history + 1`.
 */
export function messagesToSend(history: readonly ChatMessage[], question: string): ChatMessage[] {
  const recent = history.slice(-CHAT_LIMITS.history);
  const firstUser = recent.findIndex((message) => message.role === 'user');
  const trimmed = firstUser === -1 ? [] : recent.slice(firstUser);
  return [...trimmed, { role: 'user', text: question }];
}
