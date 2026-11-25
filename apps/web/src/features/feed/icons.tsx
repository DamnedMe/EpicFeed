/** Icone del feed: SVG in linea (nessuna richiesta in più, colore dal testo). */

const paths = {
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  listen: (
    <>
      <path d="M11 5L6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  play: <path d="M7 4l13 8-13 8z" />,
  ask: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  source: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M14 3v5h5" />
    </>
  ),
  language: (
    <>
      <path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 4-3 7-6 8" />
      <path d="M13 21l4-9 4 9M14.5 18h5" />
    </>
  ),
  hand: (
    <>
      <path d="M9 11V5a1.5 1.5 0 0 1 3 0v5" />
      <path d="M12 10V4a1.5 1.5 0 0 1 3 0v6" />
      <path d="M15 10V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4.5a1.5 1.5 0 0 1 2.5-1.5L9 14" />
    </>
  ),
  chevron: <path d="M6 9l6 6 6-6" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  flame: <path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z" />,
  feed: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  review: (
    <>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v4h4" />
    </>
  ),
  books: (
    <>
      <path d="M4 4h5v16H4zM9 4h5v16H9z" />
      <path d="M14.5 5l4.5-1 2 15.5-4.5 1z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  flag: <path d="M5 21V4h11l-1.5 4L16 12H5" />,
} as const;

export type IconName = keyof typeof paths;

/**
 * Icona decorativa (nascosta ai lettori di schermo: il testo accanto basta).
 *
 * @param props - Nome dell'icona e classe facoltativa.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`ef-svg ${className ?? ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

/** Cuore pieno del doppio tocco. */
export function SavedMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}
