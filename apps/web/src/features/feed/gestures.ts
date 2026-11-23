/**
 * Riconoscimento dei gesti sulla scheda (disposizione D, ADR 0015 punto 3):
 * tocco a destra o a sinistra, doppio tocco, tieni premuto. Lo scorrimento in
 * su resta allo scroll nativo con aggancio, che è più fluido di qualsiasi
 * imitazione in JavaScript.
 *
 * La logica è separata dal DOM (riceve coordinate e tempi, usa timer
 * sostituibili) così si prova con timer finti.
 */

/** Gesto riconosciuto. */
export type Gesture = 'next' | 'previous' | 'save' | 'actions';

/** Ritardo con cui un tocco singolo diventa tale: serve ad aspettare un eventuale secondo tocco. */
export const DOUBLE_TAP_MS = 230;
/** Durata della pressione che apre il foglio delle azioni. */
export const LONG_PRESS_MS = 500;
/** Oltre questo spostamento il dito sta scorrendo, non toccando. */
export const MOVE_TOLERANCE_PX = 12;
/** Quota sinistra della scheda che vale *indietro* (come nelle storie dei social). */
export const BACK_ZONE = 0.3;

/** Timer sostituibili nei test. */
export interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const browserTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/** Punto del dito: coordinate rispetto alla scheda e larghezza della scheda. */
export interface PointerSample {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * Macchina dei gesti di una scheda. Si alimenta con `down`, `move`, `up` e
 * `cancel` e chiama `onGesture` quando un gesto è certo.
 */
export class GestureRecognizer {
  private start: PointerSample | null = null;
  private moved = false;
  private longPressed = false;
  private longPressTimer: unknown = null;
  private pendingTap: { timer: unknown; x: number; y: number; gesture: Gesture } | null = null;

  /**
   * @param onGesture - Chiamata per ogni gesto riconosciuto.
   * @param timers - Timer (predefiniti quelli del browser).
   */
  constructor(
    private readonly onGesture: (gesture: Gesture) => void,
    private readonly timers: Timers = browserTimers,
  ) {}

  /**
   * Il dito tocca la scheda.
   *
   * @param sample - Punto di contatto.
   */
  down(sample: PointerSample): void {
    this.start = sample;
    this.moved = false;
    this.longPressed = false;
    this.clearLongPress();
    this.longPressTimer = this.timers.set(() => {
      this.longPressed = true;
      this.longPressTimer = null;
      this.cancelPendingTap();
      this.onGesture('actions');
    }, LONG_PRESS_MS);
  }

  /**
   * Il dito si sposta: oltre la tolleranza è uno scorrimento e non conta come tocco.
   *
   * @param sample - Punto attuale.
   */
  move(sample: PointerSample): void {
    if (!this.start || this.moved) return;
    if (Math.hypot(sample.x - this.start.x, sample.y - this.start.y) > MOVE_TOLERANCE_PX) {
      this.moved = true;
      this.clearLongPress();
    }
  }

  /** Il dito si alza: un tocco, oppure il secondo tocco di un doppio tocco. */
  up(): void {
    const start = this.start;
    this.start = null;
    this.clearLongPress();
    if (!start || this.moved || this.longPressed) return;

    const pending = this.pendingTap;
    if (pending && Math.hypot(start.x - pending.x, start.y - pending.y) < 48) {
      this.cancelPendingTap();
      this.onGesture('save');
      return;
    }
    // Un secondo tocco lontano dal primo non è un doppio tocco: il primo vale subito.
    if (pending) {
      this.cancelPendingTap();
      this.onGesture(pending.gesture);
    }
    const gesture: Gesture = start.x < start.width * BACK_ZONE ? 'previous' : 'next';
    this.pendingTap = {
      x: start.x,
      y: start.y,
      gesture,
      timer: this.timers.set(() => {
        this.pendingTap = null;
        this.onGesture(gesture);
      }, DOUBLE_TAP_MS),
    };
  }

  /** Il sistema ha preso il gesto (per esempio lo scroll): nessun tocco. */
  cancel(): void {
    this.start = null;
    this.clearLongPress();
  }

  /** Ferma i timer (scheda smontata). */
  dispose(): void {
    this.cancel();
    this.cancelPendingTap();
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== null) this.timers.clear(this.longPressTimer);
    this.longPressTimer = null;
  }

  private cancelPendingTap(): void {
    if (this.pendingTap) this.timers.clear(this.pendingTap.timer);
    this.pendingTap = null;
  }
}

/** Esito dello swipe di una domanda vero/falso. */
export type SwipeAnswer = boolean | null;

/** Spostamento orizzontale che vale come risposta. */
export const SWIPE_THRESHOLD_PX = 80;

/**
 * Risposta data con uno swipe orizzontale: a destra *vero*, a sinistra
 * *falso*. Uno spostamento soprattutto verticale è uno scroll, non una risposta.
 *
 * @param dx - Spostamento orizzontale.
 * @param dy - Spostamento verticale.
 * @returns La risposta, oppure `null` se lo swipe non basta.
 */
export function swipeAnswer(dx: number, dy: number): SwipeAnswer {
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0;
}
