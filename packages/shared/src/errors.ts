/**
 * Codici degli errori di dominio. Sono stabili: l'API li traduce in risposte
 * HTTP e la UI in messaggi, senza dipendere dal testo del messaggio.
 */
export type DomainErrorCode =
  | 'INVALID_ID'
  | 'INVALID_TEXT'
  | 'INVALID_POSITION'
  | 'INVALID_CONTENT'
  | 'INVALID_HASH'
  | 'INVALID_STATUS_TRANSITION'
  | 'ENTITLEMENT_MISMATCH'
  | 'NOT_FOUND'
  | 'SOURCES_CHANGED'
  | 'INVALID_FEED'
  | 'LIMIT_REACHED'
  | 'ALREADY_DONE';

/**
 * Violazione di una regola del dominio (dato non valido o operazione non
 * consentita). Non rappresenta mai un guasto tecnico.
 */
export class DomainError extends Error {
  /**
   * @param code - Codice stabile dell'errore.
   * @param message - Descrizione leggibile, per log e sviluppatori.
   */
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
