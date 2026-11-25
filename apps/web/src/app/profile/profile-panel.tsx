'use client';

import type { AccentName, ThemePreference } from '@epicfeed/ui';
import { accents } from '@epicfeed/ui';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { preferences, savedCards, stats, useLocalValue } from '@/features/feed/local-state';
import type { Preferences } from '@/features/feed/storage';
import { saveAppearance } from './actions';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Scuro' },
  { value: 'light', label: 'Chiaro' },
  { value: 'auto', label: 'Auto' },
];

type Toggle = keyof Pick<Preferences, 'points' | 'vibration' | 'animations' | 'autoAdvance'>;
const TOGGLES: { key: Toggle; label: string; hint: string }[] = [
  { key: 'points', label: 'Punti e serie', hint: 'Punti per parole indovinate e risposte giuste' },
  { key: 'vibration', label: 'Vibrazione', hint: 'Una breve vibrazione quando guadagni punti' },
  {
    key: 'animations',
    label: 'Animazioni',
    hint: 'Spente da sole se il sistema chiede di ridurle',
  },
  {
    key: 'autoAdvance',
    label: 'Avanzamento automatico',
    hint: 'Le battute scorrono alla velocità di lettura',
  },
];

/** Scelta tra italiano e inglese. */
function LanguageChoice({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: 'it' | 'en';
  onChange: (value: 'it' | 'en') => void;
}) {
  return (
    <div className="ef-toggle">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <div className="ef-seg" role="group" aria-label={label}>
        <button
          type="button"
          aria-pressed={value === 'it'}
          onClick={() => {
            onChange('it');
          }}
        >
          IT
        </button>
        <button
          type="button"
          aria-pressed={value === 'en'}
          onClick={() => {
            onChange('en');
          }}
        >
          EN
        </button>
      </div>
    </div>
  );
}

/** Pannello interattivo di *Io*: le scelte valgono subito, senza ricaricare. */
export function ProfilePanel({ theme, accent }: { theme: ThemePreference; accent: AccentName }) {
  const prefs = useLocalValue(preferences);
  const saved = useLocalValue(savedCards);
  const totals = useLocalValue(stats);
  const [appearance, setAppearance] = useState({ theme, accent });
  const [, startTransition] = useTransition();

  const choose = (kind: 'theme' | 'accent', value: string) => {
    // Subito sulla pagina, poi nel cookie per i prossimi caricamenti.
    document.documentElement.setAttribute(`data-${kind}`, value);
    setAppearance((previous) => ({ ...previous, [kind]: value }));
    startTransition(() => saveAppearance(kind, value));
  };
  const setPreference = (patch: Partial<Preferences>) => {
    preferences.set((previous) => ({ ...previous, ...patch }));
  };

  return (
    <>
      <section className="ef-section" aria-labelledby="profile-look">
        <h2 id="profile-look">Aspetto</h2>
        <div className="ef-panel">
          <div className="ef-seg" role="group" aria-label="Tema">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={appearance.theme === option.value}
                onClick={() => {
                  choose('theme', option.value);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="ef-seg" role="group" aria-label="Accento">
            {(Object.keys(accents) as AccentName[]).map((name) => (
              <button
                key={name}
                type="button"
                className="ef-swatch"
                data-accent={name}
                aria-pressed={appearance.accent === name}
                aria-label={accents[name].label}
                title={accents[name].label}
                onClick={() => {
                  choose('accent', name);
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="ef-section" aria-labelledby="profile-study">
        <h2 id="profile-study">Studio</h2>
        <div className="ef-panel">
          <LanguageChoice
            label="Lingua di studio"
            hint="Schede; ognuna si cambia anche con IT/EN"
            value={prefs.language}
            onChange={(language) => {
              setPreference({ language });
            }}
          />
          <LanguageChoice
            label="Lingua delle domande"
            hint="L'esame è in inglese: allenati a rispondere così"
            value={prefs.quizLanguage}
            onChange={(quizLanguage) => {
              setPreference({ quizLanguage });
            }}
          />
          {TOGGLES.map((toggle) => (
            <div key={toggle.key} className="ef-toggle">
              <span id={`profile-${toggle.key}`}>
                {toggle.label}
                <small>{toggle.hint}</small>
              </span>
              <button
                type="button"
                role="switch"
                className="ef-switch"
                aria-checked={prefs[toggle.key]}
                aria-labelledby={`profile-${toggle.key}`}
                onClick={() => {
                  setPreference({ [toggle.key]: !prefs[toggle.key] });
                }}
              />
            </div>
          ))}
          <Link className="ef-row-link" href="/?gesti=1">
            Rivedi i gesti
            <small>→</small>
          </Link>
        </div>
      </section>

      <section className="ef-section" aria-labelledby="profile-mine">
        <h2 id="profile-mine">I tuoi dati sul dispositivo</h2>
        <div className="ef-panel">
          <Link className="ef-row-link" href="/profile/saved">
            Salvati
            <small>{saved.length}</small>
          </Link>
          <div className="ef-row-link">
            Punti totali
            <small>{totals.points}</small>
          </div>
          <div className="ef-row-link">
            Serie migliore
            <small>{totals.bestStreak}</small>
          </div>
          <div className="ef-row-link">
            Sessioni completate
            <small>{totals.sessions}</small>
          </div>
        </div>
      </section>

      <section className="ef-section" aria-labelledby="profile-content">
        <h2 id="profile-content">Contenuti</h2>
        <div className="ef-panel">
          <Link className="ef-row-link" href="/lessons">
            Le mie lezioni
            <small>→</small>
          </Link>
          <Link className="ef-row-link" href="/extension">
            Estensione
            <small>→</small>
          </Link>
          <Link className="ef-row-link" href="/claude-desktop">
            Claude Desktop
            <small>→</small>
          </Link>
        </div>
      </section>
    </>
  );
}
