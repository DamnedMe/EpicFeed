import type { ReactNode } from 'react';
import type { SubjectFeed } from '@/features/feed/model';
import { createRoot, hydrateRoot } from 'react-dom/client';

/**
 * Monta una pagina del banco: la idrata se è già disegnata (prerender),
 * altrimenti la disegna da zero.
 *
 * @param element - Pagina.
 */
export function mount(element: ReactNode): void {
  const root = document.getElementById('root');
  if (!root) return;
  if (root.firstElementChild) hydrateRoot(root, element);
  else createRoot(root).render(element);
}

/**
 * Anteprima del feed scritta dal prerender nella pagina, se c'è.
 *
 * @returns I dati, oppure `null`.
 */
export function readPreview(): SubjectFeed | null {
  const element = document.getElementById('ef-preview');
  return element?.textContent ? (JSON.parse(element.textContent) as SubjectFeed) : null;
}
