/** Riferimento alla pagina aperta sul portale. */
export interface PortalLocation {
  courseId: string;
  contentId: string;
}

const PORTAL_HOST = 'learn.epicode.edu.mt';
const ROUTE = /^\/course\/(\d{1,12})\/curriculum\/(\d{1,12})(?:\/|$)/;

/**
 * Riconosce l'indirizzo di un contenuto del portale:
 * `https://learn.epicode.edu.mt/course/{corso}/curriculum/{contenuto}`.
 *
 * @param href - Indirizzo della scheda.
 * @returns Corso e contenuto, oppure `null` se la pagina non è un contenuto.
 */
export function parsePortalUrl(href: string): PortalLocation | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== PORTAL_HOST) return null;
  const match = ROUTE.exec(url.pathname);
  return match?.[1] && match[2] ? { courseId: match[1], contentId: match[2] } : null;
}

/**
 * Anno accademico di un corso, da settembre ad agosto: un corso iniziato a
 * febbraio 2025 appartiene al 2024/25, uno di settembre 2025 al 2025/26.
 *
 * @param startsAt - Data di inizio del corso (ISO 8601), se nota.
 * @returns L'etichetta dell'edizione, oppure "Senza data".
 */
export function academicYear(startsAt: string | null | undefined): string {
  const date = startsAt ? new Date(startsAt) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Senza data';
  const year = date.getUTCFullYear();
  const first = date.getUTCMonth() >= 8 ? year : year - 1;
  return `${first}/${String((first + 1) % 100).padStart(2, '0')}`;
}
