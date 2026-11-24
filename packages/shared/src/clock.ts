/**
 * Porte comuni a tutti i casi d'uso: tempo e id, iniettati per renderli
 * deterministici nei test.
 */

/** Sorgente del tempo: iniettata per rendere i casi d'uso deterministici nei test. */
export interface Clock {
  /** Restituisce l'istante corrente. */
  now(): Date;
}

/** Generatore di id univoci (UUID v4 o v7). */
export interface IdGenerator {
  /** Restituisce un nuovo UUID. */
  next(): string;
}

/** Orologio di sistema, da usare fuori dai test. */
export const systemClock: Clock = {
  /** Restituisce l'istante corrente del sistema. */
  now() {
    return new Date();
  },
};
