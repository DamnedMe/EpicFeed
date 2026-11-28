import { App } from '@modelcontextprotocol/ext-apps';
import type { QuizChoice, QuizSession, QuizViewData } from '../../src/study/quiz-session.js';
import {
  answer,
  currentQuestion,
  isCorrect,
  isFinished,
  next,
  startSession,
  summarize,
  summaryMessage,
} from '../../src/study/quiz-session.js';

/**
 * Scheda del quiz al volo dentro Claude Desktop (app MCP): riceve il quiz
 * dal risultato di `quiz_al_volo`, mostra una domanda alla volta con la
 * spiegazione dopo la risposta e alla fine registra le risposte nel ripasso
 * con `registra_risposte`.
 */

type Language = 'it' | 'en';

const root = document.getElementById('quiz') as HTMLElement;
const app = new App({ name: 'EpicFeed quiz', version: '1.0.0' });

let data: QuizViewData | null = null;
let session: QuizSession | null = null;
let language: Language = 'it';
let recordStatus = '';

const LABELS = {
  it: {
    next: 'Avanti',
    end: 'Vedi il risultato',
    right: 'Giusto',
    wrong: 'Sbagliato',
    true: 'Vero',
    false: 'Falso',
    missed: 'Da ripassare',
    ask: 'Chiedi a Claude di spiegarli',
    done: 'Fatto',
    perfect: 'Tutte giuste: ottimo lavoro.',
    of: 'su',
  },
  en: {
    next: 'Next',
    end: 'See the result',
    right: 'Correct',
    wrong: 'Wrong',
    true: 'True',
    false: 'False',
    missed: 'To review',
    ask: 'Ask Claude to explain them',
    done: 'Done',
    perfect: 'All correct: great job.',
    of: 'of',
  },
} as const;

/** Crea un elemento con classe e testo. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Ridisegna la scheda dallo stato corrente. */
function render(): void {
  root.replaceChildren();
  if (!data || !session) {
    root.append(el('p', 'muted', 'Preparo il quiz…'));
    return;
  }
  if (isFinished(session)) {
    renderSummary(session);
    return;
  }
  renderQuestion(session);
}

/** Intestazione con materia, avanzamento e lingua. */
function header(current: QuizSession): HTMLElement[] {
  const top = el('div', 'top');
  top.append(el('span', 'grow', current.quiz.subjectTitle));
  const done = Math.min(current.current + 1, current.quiz.questions.length);
  top.append(el('span', '', `${String(done)}/${String(current.quiz.questions.length)}`));
  const toggle = el('button', 'lang', language === 'it' ? 'EN' : 'IT');
  toggle.title = language === 'it' ? 'Switch to English' : 'Passa all’italiano';
  toggle.onclick = () => {
    language = language === 'it' ? 'en' : 'it';
    render();
  };
  top.append(toggle);
  const bar = el('div', 'bar');
  const fill = el('span');
  const answered = current.current + (current.revealed ? 1 : 0);
  fill.style.width = `${String((answered / current.quiz.questions.length) * 100)}%`;
  bar.append(fill);
  return [top, bar];
}

/** Domanda corrente, con le opzioni e, dopo la risposta, la spiegazione. */
function renderQuestion(current: QuizSession): void {
  const question = currentQuestion(current);
  if (!question) return;
  const labels = LABELS[language];
  root.append(...header(current));
  root.append(el('p', 'concept', `${question.conceptName[language]} · ${question.lessonTitle}`));
  root.append(el('h1', '', question.question[language]));

  const choices: { label: string; choice: QuizChoice }[] =
    question.kind === 'multiple_choice'
      ? question.options[language].map((label, index) => ({ label, choice: { index } }))
      : [
          { label: labels.true, choice: { value: true } },
          { label: labels.false, choice: { value: false } },
        ];
  const list = el('div', question.kind === 'true_false' ? 'options tf' : 'options');
  for (const { label, choice } of choices) {
    const button = el('button', 'option', label);
    if (current.revealed) {
      button.disabled = true;
      if (isCorrect(question, choice)) button.classList.add('right');
      else if (JSON.stringify(choice) === JSON.stringify(current.revealed)) {
        button.classList.add('wrong');
      }
    } else {
      button.onclick = () => {
        session = answer(current, choice, language);
        render();
      };
    }
    list.append(button);
  }
  root.append(list);

  if (current.revealed) {
    const right = isCorrect(question, current.revealed);
    const box = el('div', 'explain');
    box.append(el('strong', '', right ? labels.right : labels.wrong));
    box.append(document.createTextNode(question.explanation[language]));
    root.append(box);
    const actions = el('div', 'actions');
    const last = current.current === current.quiz.questions.length - 1;
    const go = el('button', 'primary', last ? labels.end : labels.next);
    go.onclick = () => {
      session = next(current);
      if (isFinished(session)) void finish(session);
      render();
    };
    actions.append(go);
    root.append(actions);
    go.focus();
  }
}

/** Riepilogo finale, con i concetti da ripassare. */
function renderSummary(current: QuizSession): void {
  const labels = LABELS[language];
  const { right, total, missed } = summarize(current, language);
  root.append(el('div', 'top', current.quiz.subjectTitle));
  root.append(el('p', 'score', `${String(right)} ${labels.of} ${String(total)}`));
  if (recordStatus) root.append(el('p', 'muted', recordStatus));
  if (missed.length === 0) {
    root.append(el('p', '', labels.perfect));
    return;
  }
  root.append(el('p', 'concept', labels.missed));
  const list = el('ul');
  for (const name of missed) list.append(el('li', '', name));
  root.append(list);
  const actions = el('div', 'actions');
  const ask = el('button', 'primary', labels.ask);
  ask.onclick = () => {
    ask.disabled = true;
    ask.textContent = labels.done;
    void app.sendMessage({
      role: 'user',
      content: [{ type: 'text', text: summaryMessage(current, language) }],
    });
  };
  actions.append(ask);
  root.append(actions);
}

/**
 * Fine del quiz: registra le risposte nel ripasso e lascia a Claude il
 * risultato nel contesto, senza scrivere in chat al posto dello studente.
 */
async function finish(done: QuizSession): Promise<void> {
  if (!data) return;
  const summary = summaryMessage(done, language);
  void app
    .updateModelContext({ content: [{ type: 'text', text: summary }] })
    .catch(() => undefined);
  if (!data.canRecord) {
    recordStatus =
      'Le risposte non sono entrate nel ripasso: imposta email e password nelle impostazioni dell’estensione.';
    render();
    return;
  }
  recordStatus = 'Registro le risposte nel ripasso…';
  render();
  try {
    const result = await app.callServerTool({
      name: data.recordTool,
      arguments: { risposte: done.answers },
    });
    const text = result.content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');
    recordStatus = result.isError ? `Non registrate: ${text}` : 'Risposte registrate nel ripasso.';
  } catch {
    recordStatus = 'Non sono riuscito a registrare le risposte: chiedi a Claude di riprovare.';
  }
  render();
}

/** Segue il tema di Claude Desktop (chiaro o scuro). */
function applyTheme(theme: string | undefined): void {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
}

app.addEventListener('toolresult', (result) => {
  const incoming = result.structuredContent as QuizViewData | undefined;
  if (!incoming?.quiz) return;
  data = incoming;
  language = incoming.language;
  session = startSession(incoming.quiz);
  recordStatus = '';
  render();
});
app.addEventListener('hostcontextchanged', (context) => {
  applyTheme(context.theme);
});

await app.connect();
applyTheme(app.getHostContext()?.theme);
