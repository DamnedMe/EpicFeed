import type { StudyLanguage } from '@study-feed/core';

/**
 * Testi dentro la scheda, nella lingua della scheda: chi studia in inglese
 * per l'esame legge anche gli inviti in inglese. Il resto dell'app è in
 * italiano.
 */
export const CARD_COPY = {
  it: {
    from: { summary: 'dal video', reading: 'dalla lettura', slides: 'dalle slide' },
    kinds: { concept: '', steps: 'passo passo', comparison: 'confronto', code: 'codice' },
    tapToContinue: 'tocca a destra per continuare',
    gestures: 'Doppio tocco: salva · Tieni premuto: azioni',
    tapBlank: 'Ricordi la parola? Tocca per scoprirla',
    saved: 'salvata',
    check: 'Verifica rapida',
    trueFalse: 'Vero o falso?',
    true: 'Vero',
    false: 'Falso',
    swipe: 'Swipe a destra per Vero, a sinistra per Falso',
    right: 'Giusto!',
    wrong: 'Quasi.',
    correct: 'giusta',
    yours: 'la tua',
    nextCard: 'Scorri in su per continuare',
    minute: 'minuto',
  },
  en: {
    from: { summary: 'from the video', reading: 'from the reading', slides: 'from the slides' },
    kinds: { concept: '', steps: 'step by step', comparison: 'comparison', code: 'code' },
    tapToContinue: 'tap on the right to continue',
    gestures: 'Double tap: save · Long press: actions',
    tapBlank: 'Remember the word? Tap to reveal it',
    saved: 'saved',
    check: 'Quick check',
    trueFalse: 'True or false?',
    true: 'True',
    false: 'False',
    swipe: 'Swipe right for True, left for False',
    right: 'Correct!',
    wrong: 'Almost.',
    correct: 'correct',
    yours: 'yours',
    nextCard: 'Swipe up to continue',
    minute: 'minute',
  },
} as const satisfies Record<StudyLanguage, unknown>;

/** Codice BCP 47 per la sintesi vocale. */
export const SPEECH_LANG: Record<StudyLanguage, string> = { it: 'it-IT', en: 'en-GB' };
