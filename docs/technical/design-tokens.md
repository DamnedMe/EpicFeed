# Token del design system

Pacchetto `packages/ui`. Specifiche visive in [design-system.md](../design-system.md); qui come sono implementate.

## Una sola fonte
`src/tokens.ts` contiene tutti i valori (temi, accenti, font, raggi, vetro, animazioni). Da lì:
- `pnpm build` genera `dist/tokens.css` (`src/css.ts` → `scripts/write-css.js`), esportato come `@epicfeed/ui/tokens.css`;
- `tailwind.css` collega le variabili a Tailwind CSS 4 (`bg-background`, `text-muted`, `bg-accent`, `text-accent-text`, `rounded-card`, `font-display`…);
- `src/theme.ts` offre tipi e utilità: `resolveTheme`, `isAccentName`, `themeAttributes`.

## Come si applicano tema e accento
Due attributi sull'elemento `<html>`:

```html
<html data-theme="dark | light | auto" data-accent="racing-red | electric-violet | blu-oltremare | turchese | verde-lime">
```

- Senza attributi: tema scuro e Racing red (i predefiniti).
- `auto` segue `prefers-color-scheme` del sistema.
- Cambiare tema o accento cambia solo le variabili CSS: niente JavaScript a runtime, niente ricaricamento.
- `themeAttributes(preferenza, accento)` valida valori letti da IndexedDB o da altre fonti non fidate e ricade sui predefiniti.
- Gli attributi vanno su `<html>`: il colore del testo d'accento (`--sf-accent-text`) si risolve lì in base al tema.

## Variabili
| Variabile | Uso |
|---|---|
| `--sf-background`, `--sf-surface`, `--sf-border` | Fondo, vetro, bordo del vetro |
| `--sf-text`, `--sf-text-muted` | Testo principale e secondario |
| `--sf-review` | Concetti da ripassare e risposte sbagliate (neutro, mai rosso) |
| `--sf-accent-fill`, `--sf-accent-on-fill` | Riempimento d'accento e testo sopra di esso |
| `--sf-accent-text` | Testo in colore d'accento, già adattato al tema |
| `--sf-font-display`, `--sf-font-body`, `--sf-font-mono` | Space Grotesk, Inter, JetBrains Mono |
| `--sf-radius-*`, `--sf-glass-blur`, `--sf-motion-*` | Angoli, sfocatura del vetro, durate e curva delle animazioni |

I font saranno self-hosted dalla web app con `next/font` (M3): nessuna richiesta a Google Fonts dal browser.

## Accessibilità verificata nei test
`src/tokens.test.ts` calcola il contrasto WCAG 2.2 di ogni combinazione e richiede almeno **4,5:1** (AA, testo normale) per testo e testo secondario su entrambi i temi, testo d'accento sul tema scuro e sul chiaro, e testo sopra ogni riempimento d'accento.

Questo controllo ha portato a una sola modifica rispetto ai mockup approvati: il testo turchese sul tema chiaro passa da `#0B7F76` (contrasto 4,26) a `#0A7870` (4,67), una differenza quasi invisibile.
