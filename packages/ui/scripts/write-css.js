// Scrive dist/tokens.css a partire dai token compilati (eseguito da `pnpm build`).
import { writeFileSync } from 'node:fs';
import { renderTokensCss } from '../dist/css.js';

writeFileSync(new URL('../dist/tokens.css', import.meta.url), renderTokensCss());
