/** Sessione di studio da 5 minuti (M3, ADR 0015): punti, serie e schede viste. */
export interface Session {
  readonly startedAt: number;
  readonly points: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly right: number;
  readonly answered: number;
  readonly seen: number;
}

/**
 * Sessione appena iniziata (la scheda aperta conta già come vista).
 *
 * @param startedAt - Inizio in millisecondi (`Date.now()`).
 * @returns La sessione vuota.
 */
export const newSession = (startedAt: number): Session => ({
  startedAt,
  points: 0,
  streak: 0,
  bestStreak: 0,
  right: 0,
  answered: 0,
  seen: 1,
});
