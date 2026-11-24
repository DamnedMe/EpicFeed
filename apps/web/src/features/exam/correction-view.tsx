'use client';

import type { CodeSuggestion } from '@epicfeed/exam';
import { rubricScore, suggestionDiff } from '@epicfeed/exam';
import type { CorrectionEntry } from './corrections';

/**
 * Correzione di Claude di un invio (ADR 0017, *Correzione del codice*):
 * per ogni domanda punti per criterio, suggerimenti di revisione come in una
 * code review (titolo, spiegazione, righe tolte in rosso e nuove in verde con
 * i numeri di riga) e commento generale; in fondo il riepilogo.
 *
 * @param props.entry - Invio, corretto o in attesa.
 */
export function CorrectionView({ entry }: { entry: CorrectionEntry }) {
  if (!entry.correction) {
    return (
      <div className="ef-fb" role="status">
        <p>
          <b>In correzione.</b> In Claude Desktop chiedi «correggi le mie risposte di EpicFeed»: la
          correzione arriva qui alla prossima apertura della sezione Esame.
        </p>
      </div>
    );
  }
  const { correction } = entry;
  return (
    <div className="ef-cr" lang="en">
      {correction.items.map((itemCorrection) => {
        const item = entry.submission.items.find((i) => i.key === itemCorrection.key);
        if (!item) return null;
        const score = rubricScore(item.rubric, itemCorrection.scores);
        return (
          <article key={item.key} className="ef-panel ef-cr-item">
            {entry.submission.items.length > 1 ? <h3 className="ef-cr-q">{item.prompt}</h3> : null}
            <p className="ef-cr-score">
              <b>{Math.round(score * 100)}%</b>
              <span className="ef-hint" lang="it">
                {' '}
                · correzione di Claude
              </span>
            </p>
            <ul className="ef-cr-rubric">
              {item.rubric.map((criterion, i) => (
                <li key={criterion.criterion}>
                  <span>{criterion.criterion}</span>
                  <span className="mono">
                    {itemCorrection.scores[i] ?? 0}/{criterion.points}
                  </span>
                </li>
              ))}
            </ul>
            {itemCorrection.suggestions.map((suggestion, i) => (
              <SuggestionCard key={i} answer={item.answer} suggestion={suggestion} />
            ))}
            {itemCorrection.comment ? (
              <p className="ef-cr-comment">{itemCorrection.comment}</p>
            ) : null}
          </article>
        );
      })}
      {correction.summary ? (
        <p className="ef-panel ef-cr-summary">
          <b>Summary: </b>
          {correction.summary}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Scheda di un suggerimento: titolo, spiegazione e diff delle righe.
 *
 * @param props.answer - Risposta dello studente.
 * @param props.suggestion - Suggerimento di Claude.
 */
function SuggestionCard({ answer, suggestion }: { answer: string; suggestion: CodeSuggestion }) {
  const lines = suggestionDiff(answer, suggestion);
  const range =
    suggestion.fromLine === suggestion.toLine
      ? `line ${suggestion.fromLine}`
      : `lines ${suggestion.fromLine}–${suggestion.toLine}`;
  return (
    <section className="ef-cr-card" aria-label={`Suggestion: ${suggestion.title}`}>
      <header>
        <b>{suggestion.title}</b>
        <span className="ef-hint">{range}</span>
      </header>
      <p>{suggestion.explanation}</p>
      <table className="ef-cr-diff">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className={line.type}>
              <td className="n" aria-hidden="true">
                {line.type === 'added' ? '' : line.oldLine}
              </td>
              <td className="n" aria-hidden="true">
                {line.type === 'removed' ? '' : line.newLine}
              </td>
              <td className="s">
                <span className="ef-sr">
                  {line.type === 'removed' ? 'removed: ' : line.type === 'added' ? 'added: ' : ''}
                </span>
                <span aria-hidden="true">
                  {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
                </span>
              </td>
              <td className="t">
                <code>{line.text || ' '}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
