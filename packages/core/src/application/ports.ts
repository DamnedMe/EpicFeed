/**
 * Porte (interfacce) che i casi d'uso usano per parlare con il mondo esterno.
 * Le implementazioni stanno in `packages/adapters`; i test usano dei doppi.
 *
 * Le porte di persistenza (`ContentRepository`, `EntitlementRepository`) e il
 * caso d'uso `ImportLesson` arrivano con la milestone M1.
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
