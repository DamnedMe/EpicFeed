#!/usr/bin/env node
/**
 * Stato dello sviluppo nella documentazione.
 *
 * Legge `docs/status.json` (unica fonte di verità) e rigenera:
 * - `apps/web/public/readme/status-dark.svg` e `status-light.svg`: la plancia in cima al README;
 * - il blocco tra `<!-- stato:inizio -->` e `<!-- stato:fine -->` nel README (plancia e riquadro).
 *
 * Le immagini del README sono servite dall'app pubblica su Vercel e non dalla repo: la repo è
 * privata e l'app GitHub per smartphone non riesce a scaricare le immagini delle repo private.
 * Il parametro `?v=` con la data di aggiornamento evita che GitHub mostri una copia vecchia.
 *
 * Uso:
 *   node scripts/docs-status.mjs          rigenera i file
 *   node scripts/docs-status.mjs --check  fallisce se i file non sono allineati (usato in CI)
 *
 * Nessuna dipendenza: solo moduli di Node, così gira ovunque senza installare nulla.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_PATH = join(ROOT, 'docs/status.json');
const README_PATH = join(ROOT, 'README.md');
const MARK_START = '<!-- stato:inizio -->';
const MARK_END = '<!-- stato:fine -->';
const PUBLIC_DIR = 'apps/web/public/readme';
/** Indirizzo pubblico della cartella `public/readme` dell'app in produzione. */
const PUBLIC_URL = 'https://study-feed-steel.vercel.app/readme';

/** Palette del design system approvato (docs/design-system.md), accento racing red. */
const THEMES = {
  scuro: {
    bg: '#0B0B0E',
    fg: '#DCE3EA',
    muted: '#98A0A9',
    line: '#26262C',
    glass: '#FFFFFF',
    glassOpacity: 0.07,
    accent: '#E10600',
    accentText: '#FF4D3D',
  },
  chiaro: {
    bg: '#EDF0F3',
    fg: '#0B0B0E',
    muted: '#5B6570',
    line: '#CBD2D9',
    glass: '#FFFFFF',
    glassOpacity: 0.72,
    accent: '#E10600',
    accentText: '#C80500',
  },
};

const FONT_TEXT = `font-family="Inter, 'Segoe UI', system-ui, -apple-system, sans-serif"`;
const FONT_HEAD = `font-family="'Space Grotesk', Inter, 'Segoe UI', system-ui, sans-serif"`;
const FONT_MONO = `font-family="'JetBrains Mono', ui-monospace, Consolas, Menlo, monospace"`;

/**
 * Converte una data ISO (AAAA-MM-GG) nel formato italiano breve.
 * @param {string} iso data ISO
 * @param {boolean} [year] se includere l'anno
 * @returns {string} es. "23/11" o "23/11/2026"
 */
function formatDate(iso, year = false) {
  const [y, m, d] = iso.split('-');
  return year ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/**
 * Esegue l'escape dei caratteri speciali XML, perché i testi finiscono dentro l'SVG.
 * @param {string} text testo libero
 * @returns {string} testo sicuro per l'SVG
 */
function xml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Divide un nome lungo in due righe, allo spazio più vicino al centro, così le etichette
 * delle milestone vicine non si sovrappongono.
 * @param {string} name nome della milestone
 * @returns {string[]} una o due righe
 */
function wrapName(name) {
  if (name.length <= 12 || !name.includes(' ')) return [name];
  const spaces = [...name.matchAll(/ /g)].map((m) => m.index);
  const cut = spaces.reduce((best, i) =>
    Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2) ? i : best,
  );
  return [name.slice(0, cut), name.slice(cut + 1)];
}

/**
 * Valida la forma di status.json e calcola i numeri mostrati.
 * @param {any} status contenuto di status.json
 * @returns {{ milestones: any[], mvpIndex: number, doneCount: number, mvpPercent: number, current: number }}
 */
function summarize(status) {
  const milestones = status.milestone;
  const states = new Set(['fatta', 'in-corso', 'da-fare']);
  for (const m of milestones) {
    if (!states.has(m.stato)) throw new Error(`${m.id}: stato "${m.stato}" non valido`);
    if (m.stato === 'fatta' && !m.data) throw new Error(`${m.id}: manca la data`);
  }
  const mvpIndex = milestones.findIndex((m) => m.id === status.mvpFinoA);
  if (mvpIndex < 0) throw new Error(`mvpFinoA "${status.mvpFinoA}" non trovata`);
  /** Avanzamento di una milestone tra 0 e 1. */
  const progress = (m) =>
    m.stato === 'fatta' ? 1 : m.stato === 'in-corso' ? (m.avanzamento ?? 0) : 0;
  const mvp = milestones.slice(0, mvpIndex + 1);
  return {
    milestones,
    mvpIndex,
    doneCount: milestones.filter((m) => m.stato === 'fatta').length,
    mvpPercent: Math.round((mvp.reduce((sum, m) => sum + progress(m), 0) / mvp.length) * 100),
    current: milestones.findIndex((m) => m.stato === 'in-corso'),
  };
}

/**
 * Disegna la plancia dello stato: titolo, percentuale dell'MVP e percorso delle milestone.
 * @param {any} status contenuto di status.json
 * @param {keyof typeof THEMES} themeName tema da usare
 * @returns {string} documento SVG
 */
function renderBoard(status, themeName) {
  const c = THEMES[themeName];
  const { milestones, mvpIndex, doneCount, mvpPercent, current } = summarize(status);
  const W = 1200;
  const H = 480;
  const x0 = 80;
  const x1 = 1120;
  const step = (x1 - x0) / (milestones.length - 1);
  const trackY = 330;
  const out = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stato dello sviluppo di EpicFeed: MVP al ${mvpPercent}%">`,
    `<defs><radialGradient id="glow" cx="85%" cy="0%" r="70%"><stop offset="0" stop-color="${c.accent}" stop-opacity="${themeName === 'scuro' ? 0.22 : 0.12}"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient></defs>`,
    `<rect width="${W}" height="${H}" rx="28" fill="${c.bg}"/>`,
    `<rect width="${W}" height="${H}" rx="28" fill="url(#glow)"/>`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="28" fill="none" stroke="${c.line}"/>`,
    `<text x="64" y="78" ${FONT_MONO} font-size="15" letter-spacing="3" fill="${c.accentText}">STATO DELLO SVILUPPO · ${formatDate(status.aggiornato, true)}</text>`,
    `<text x="64" y="140" ${FONT_HEAD} font-size="58" font-weight="700" fill="${c.fg}">EpicFeed<tspan fill="${c.accent}">.</tspan></text>`,
    `<text x="64" y="178" ${FONT_TEXT} font-size="20" fill="${c.muted}">Il materiale Epicode diventa un feed di studio, quiz e ripasso.</text>`,
  );

  // Riquadro in vetro con la percentuale dell'MVP.
  const barW = 228;
  out.push(
    `<g transform="translate(860,62)">`,
    `<rect width="276" height="128" rx="20" fill="${c.glass}" fill-opacity="${c.glassOpacity}" stroke="${c.line}"/>`,
    `<text x="24" y="38" ${FONT_MONO} font-size="13" letter-spacing="2" fill="${c.muted}">MVP (M0–${xml(status.mvpFinoA)})</text>`,
    `<text x="24" y="92" ${FONT_HEAD} font-size="50" font-weight="700" fill="${c.fg}">${mvpPercent}<tspan font-size="26">%</tspan></text>`,
    `<text x="252" y="92" text-anchor="end" ${FONT_TEXT} font-size="15" fill="${c.muted}">${doneCount} di ${milestones.length} milestone</text>`,
    `<rect x="24" y="106" width="${barW}" height="6" rx="3" fill="${c.line}"/>`,
    `<rect x="24" y="106" width="${(barW * mvpPercent) / 100}" height="6" rx="3" fill="${c.accent}"/>`,
    `</g>`,
  );

  // Parentesi che raggruppa le milestone dell'MVP.
  const bx1 = x0 - 26;
  const bx2 = x0 + step * mvpIndex + 26;
  out.push(
    `<path d="M${bx1} 262 v-10 h${bx2 - bx1} v10" fill="none" stroke="${c.line}" stroke-width="2"/>`,
    `<text x="${(bx1 + bx2) / 2}" y="244" text-anchor="middle" ${FONT_MONO} font-size="13" letter-spacing="2" fill="${c.muted}">MVP</text>`,
  );

  // Binario: grigio per intero, rosso fino al punto raggiunto.
  const reached =
    current >= 0 ? current - 1 + (milestones[current].avanzamento ?? 0) : doneCount - 1;
  out.push(
    `<line x1="${x0}" y1="${trackY}" x2="${x1}" y2="${trackY}" stroke="${c.line}" stroke-width="4" stroke-linecap="round"/>`,
  );
  if (reached > 0) {
    out.push(
      `<line x1="${x0}" y1="${trackY}" x2="${x0 + step * reached}" y2="${trackY}" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>`,
    );
  }

  milestones.forEach((m, i) => {
    const x = x0 + step * i;
    if (m.stato === 'fatta') {
      out.push(
        `<circle cx="${x}" cy="${trackY}" r="15" fill="${c.accent}"/>`,
        `<path d="M${x - 6} ${trackY} l4 4.5 l8 -9" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    } else if (m.stato === 'in-corso') {
      out.push(
        `<circle cx="${x}" cy="${trackY}" r="26" fill="${c.accent}" fill-opacity="0.16"/>`,
        `<circle cx="${x}" cy="${trackY}" r="15" fill="${c.bg}" stroke="${c.accent}" stroke-width="4"/>`,
        `<circle cx="${x}" cy="${trackY}" r="5" fill="${c.accent}"/>`,
      );
    } else {
      out.push(
        `<circle cx="${x}" cy="${trackY}" r="13" fill="${c.bg}" stroke="${c.line}" stroke-width="3"/>`,
      );
    }
    const color = m.stato === 'da-fare' ? c.muted : c.fg;
    const detail =
      m.stato === 'fatta'
        ? `✓ ${formatDate(m.data)}`
        : m.stato === 'in-corso'
          ? `in corso${m.nota ? ` · ${xml(m.nota)}` : ''}`
          : 'in programma';
    out.push(
      `<text x="${x}" y="${trackY + 52}" text-anchor="middle" ${FONT_MONO} font-size="15" font-weight="500" fill="${m.stato === 'in-corso' ? c.accentText : color}">${xml(m.id)}</text>`,
      ...wrapName(m.nome).map(
        (line, n) =>
          `<text x="${x}" y="${trackY + 76 + n * 18}" text-anchor="middle" ${FONT_TEXT} font-size="14" fill="${color}">${xml(line)}</text>`,
      ),
      `<text x="${x}" y="${trackY + 120}" text-anchor="middle" ${FONT_TEXT} font-size="13" fill="${m.stato === 'in-corso' ? c.accentText : c.muted}">${detail}</text>`,
    );
  });

  out.push('</svg>');
  return out.join('\n') + '\n';
}

/**
 * Costruisce il blocco Markdown dello stato da inserire nel README (riquadri di GitHub).
 * @param {any} status contenuto di status.json
 * @returns {string} Markdown tra i due marcatori
 */
function renderReadmeBlock(status) {
  const version = status.aggiornato;
  const lines = [
    MARK_START,
    '<!-- Blocco generato da scripts/docs-status.mjs a partire da docs/status.json: non modificarlo a mano. -->',
    '<picture>',
    `  <source media="(prefers-color-scheme: light)" srcset="${PUBLIC_URL}/status-light.svg?v=${version}">`,
    `  <img src="${PUBLIC_URL}/status-dark.svg?v=${version}" alt="Stato dello sviluppo di EpicFeed: milestone da ${status.milestone[0].id} a ${status.milestone.at(-1).id}" width="100%">`,
    '</picture>',
    '',
    '> [!TIP]',
    `> 🏁 Ultimo traguardo: ${status.ultimoTraguardo}`,
  ];
  if (status.inCorso) lines.push('>', `> 🛠️ Ora: ${status.inCorso}`);
  lines.push('', MARK_END);
  return lines.join('\n');
}

/**
 * Sostituisce il blocco tra i marcatori nel README.
 * @param {string} readme contenuto attuale del README
 * @param {string} block nuovo blocco, marcatori inclusi
 * @returns {string} README aggiornato
 */
function replaceBlock(readme, block) {
  const start = readme.indexOf(MARK_START);
  const end = readme.indexOf(MARK_END);
  if (start < 0 || end < start) throw new Error('Marcatori dello stato non trovati nel README');
  return readme.slice(0, start) + block + readme.slice(end + MARK_END.length);
}

/** Punto di ingresso: rigenera i file oppure, con --check, verifica che siano allineati. */
function main() {
  const check = process.argv.includes('--check');
  const status = JSON.parse(readFileSync(STATUS_PATH, 'utf8'));
  const outputs = [
    [join(ROOT, PUBLIC_DIR, 'status-dark.svg'), renderBoard(status, 'scuro')],
    [join(ROOT, PUBLIC_DIR, 'status-light.svg'), renderBoard(status, 'chiaro')],
    [README_PATH, replaceBlock(readFileSync(README_PATH, 'utf8'), renderReadmeBlock(status))],
  ];
  const stale = [];
  for (const [path, content] of outputs) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // Il file non esiste ancora: verrà creato (o segnalato come non allineato).
    }
    if (current === content) continue;
    if (check) stale.push(path.slice(ROOT.length + 1));
    else writeFileSync(path, content);
  }
  if (stale.length > 0) {
    console.error(`Stato della documentazione non allineato: ${stale.join(', ')}`);
    console.error('Esegui `pnpm docs:status` e committa i file aggiornati.');
    process.exit(1);
  }
  console.log(
    check ? 'Stato della documentazione allineato.' : 'Stato della documentazione rigenerato.',
  );
}

main();
