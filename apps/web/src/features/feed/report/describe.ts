import type { CorrectionOutcome, StoredCorrection } from '@epicfeed/feed';

/**
 * Testi di *Le mie segnalazioni* (M5, ADR 0020): stato e riassunto di ogni
 * correzione. Funzioni pure, provate senza DOM.
 */

/** Stato mostrato per una correzione. */
export interface ReportStatus {
  readonly tone: 'ok' | 'wait' | 'check';
  readonly label: string;
  /** Spiegazione sotto il riassunto (nota di Claude, frase sparita). */
  readonly detail: string | null;
}

const cut = (text: string, max = 70) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Stato di una correzione.
 *
 * @param correction - Correzione.
 * @param unsent - `true` se non è ancora arrivata al server.
 * @param outcome - Esito sul feed della materia, se la materia è sul dispositivo.
 * @returns Lo stato da mostrare.
 */
export function reportStatus(
  correction: StoredCorrection,
  unsent: boolean,
  outcome: CorrectionOutcome | undefined,
): ReportStatus {
  if (correction.completion?.outcome === 'disputed') {
    const { note, evidence } = correction.completion;
    return {
      tone: 'check',
      label: 'Da ricontrollare',
      detail: evidence ? `${note} Dal riassunto: «${cut(evidence, 200)}»` : note,
    };
  }
  if (outcome === 'missing') {
    return {
      tone: 'check',
      label: 'Da ricontrollare',
      detail: 'La lezione è cambiata e la frase corretta non c’è più.',
    };
  }
  if (unsent) return { tone: 'wait', label: 'Da inviare', detail: null };
  if (correction.claudeStatus === 'pending') {
    return correction.correction.kind === 'regenerate'
      ? { tone: 'wait', label: 'In attesa di Claude', detail: null }
      : { tone: 'ok', label: 'Applicata · altra lingua in attesa di Claude', detail: null };
  }
  const where = correction.correction.kind === 'term' ? ' in tutta la materia' : '';
  return { tone: 'ok', label: `Applicata${where}`, detail: null };
}

/**
 * Riassunto di una correzione su una riga.
 *
 * @param correction - Correzione.
 * @returns Il testo, nella lingua dell'interfaccia.
 */
export function reportSummary(correction: StoredCorrection): string {
  const draft = correction.correction;
  switch (draft.kind) {
    case 'term':
      return `Termine «${draft.from}» → «${draft.to}»`;
    case 'answer':
      return draft.fix.kind === 'true_false'
        ? `Risposta giusta: ${draft.fix.answer ? 'vero' : 'falso'} · «${cut(draft.question.it, 50)}»`
        : `Risposta giusta: «${cut(draft.fix.option.it, 40)}»`;
    case 'regenerate':
      return 'Da riscrivere dai riassunti';
    case 'text': {
      const [edit] = draft.edits;
      return edit ? `«${cut(edit.original, 40)}» → «${cut(edit.corrected, 40)}»` : 'Correzione';
    }
  }
}
