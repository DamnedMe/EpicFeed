import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gesture } from './gestures';
import { DOUBLE_TAP_MS, GestureRecognizer, LONG_PRESS_MS, swipeAnswer } from './gestures';

let seen: Gesture[];
let recognizer: GestureRecognizer;
const at = (x: number, y = 300) => ({ x, y, width: 400 });

beforeEach(() => {
  vi.useFakeTimers();
  seen = [];
  recognizer = new GestureRecognizer((gesture) => seen.push(gesture));
});

afterEach(() => {
  recognizer.dispose();
  vi.useRealTimers();
});

function tap(x: number) {
  recognizer.down(at(x));
  recognizer.up();
}

describe('GestureRecognizer', () => {
  it('tocco a destra: avanti, dopo il ritardo del doppio tocco', () => {
    tap(300);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seen).toEqual(['next']);
  });

  it('tocco a sinistra: indietro', () => {
    tap(40);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seen).toEqual(['previous']);
  });

  it('doppio tocco: salva, senza avanzare', () => {
    tap(200);
    vi.advanceTimersByTime(100);
    tap(205);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seen).toEqual(['save']);
  });

  it('due tocchi lontani sono due tocchi', () => {
    tap(300);
    tap(40);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seen).toEqual(['next', 'previous']);
  });

  it('tieni premuto: azioni, e al rilascio nessun tocco', () => {
    recognizer.down(at(200));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    recognizer.up();
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seen).toEqual(['actions']);
  });

  it('uno scorrimento non è un tocco né una pressione', () => {
    recognizer.down(at(200, 300));
    recognizer.move(at(202, 302));
    recognizer.move(at(200, 200));
    recognizer.move(at(200, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    recognizer.up();
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seen).toEqual([]);
  });

  it('un gesto annullato dal sistema non conta', () => {
    recognizer.down(at(200));
    recognizer.cancel();
    recognizer.up();
    recognizer.move(at(10));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(seen).toEqual([]);
  });
});

describe('swipeAnswer', () => {
  it('destra vero, sinistra falso, poco o verticale nulla', () => {
    expect(swipeAnswer(120, 10)).toBe(true);
    expect(swipeAnswer(-120, 10)).toBe(false);
    expect(swipeAnswer(40, 0)).toBeNull();
    expect(swipeAnswer(100, 90)).toBeNull();
  });
});
