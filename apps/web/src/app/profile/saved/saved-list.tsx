'use client';

import Link from 'next/link';
import { preferences, savedCards, useHydrated, useLocalValue } from '@/features/feed/local-state';

/** Elenco delle schede salvate: un tocco riapre il feed su quella scheda. */
export function SavedList() {
  const hydrated = useHydrated();
  const saved = useLocalValue(savedCards);
  const { language } = useLocalValue(preferences);
  if (!hydrated) return null;
  if (saved.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nessuna scheda salvata. Nel feed fai doppio tocco su una scheda per ritrovarla qui.
      </p>
    );
  }
  return (
    <ul className="ef-panel">
      {saved.map((card) => (
        <li key={card.key} className="ef-toggle">
          <Link
            href={`/?subject=${encodeURIComponent(card.subjectId)}&card=${encodeURIComponent(card.key)}`}
            className="min-w-0 flex-1"
          >
            {card.title[language]}
            <small>{card.lessonTitle}</small>
          </Link>
          <button
            type="button"
            className="ef-link text-sm"
            onClick={() => {
              savedCards.set((list) => list.filter((item) => item.key !== card.key));
            }}
          >
            Rimuovi
          </button>
        </li>
      ))}
    </ul>
  );
}
