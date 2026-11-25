import { useCallback, useState } from 'react';

/**
 * Lettura ad alta voce con la sintesi vocale del browser (*Ascolta*). Una
 * sola voce alla volta; se la sintesi non c'è, non succede nulla.
 *
 * @returns La chiave che si sta leggendo, `speak` e `stopSpeaking`.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState<string | null>(null);

  const stopSpeaking = useCallback(() => {
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {
      // Sintesi vocale non disponibile.
    }
    setSpeaking(null);
  }, []);

  /**
   * Legge un testo, interrompendo quello in corso.
   *
   * @param key - Cosa si sta leggendo (es. la chiave della scheda).
   * @param text - Testo da leggere.
   * @param lang - Lingua BCP 47 della voce.
   */
  const speak = useCallback((key: string, text: string, lang: string) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.onend = () => {
        setSpeaking(null);
      };
      synth.speak(utterance);
      setSpeaking(key);
    } catch {
      setSpeaking(null);
    }
  }, []);

  return { speaking, speak, stopSpeaking };
}
