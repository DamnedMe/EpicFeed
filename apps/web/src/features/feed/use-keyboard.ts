import { useEffect, useRef } from 'react';

/**
 * Ascolta la tastiera della finestra con il gestore più recente, senza
 * registrare un nuovo listener a ogni render.
 *
 * @param handler - Gestore dei tasti; vede sempre lo stato dell'ultimo render.
 */
export function useKeyboard(handler: (event: KeyboardEvent) => void): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      latest.current(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, []);
}
