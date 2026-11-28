import type { InlinePart } from './markdown';
import { parseAnswer } from './markdown';

function Inline({ parts }: { parts: readonly InlinePart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.kind === 'bold' ? (
          <strong key={i}>{part.text}</strong>
        ) : part.kind === 'code' ? (
          <code key={i}>{part.text}</code>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Risposta dell'assistente: Markdown semplice disegnato come elementi React,
 * senza mai inserire HTML ricevuto dal fornitore.
 */
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="ef-answer">
      {parseAnswer(text).map((block, i) => {
        if (block.kind === 'code') {
          return (
            <pre key={i} data-language={block.language || undefined}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === 'list') {
          const items = block.items.map((item, j) => (
            <li key={j}>
              <Inline parts={item} />
            </li>
          ));
          return block.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        return (
          <p key={i}>
            <Inline parts={block.parts} />
          </p>
        );
      })}
    </div>
  );
}
