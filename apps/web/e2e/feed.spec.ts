import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Feed sul telefono: gesti, battute, parola da indovinare, domande, azioni,
 * capitoli e preferenze. Il banco di prova è servito con la stessa CSP di
 * produzione per gli stili (niente `style` in linea), quindi un attributo
 * `style` reso nell'HTML farebbe fallire i test.
 */
const ROOT = join(import.meta.dirname, '.harness');
const ORIGIN = 'http://epicfeed.test';
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.zip': 'application/zip',
};
/** Pagine dell'app servite dal banco di prova. */
const PAGES: Record<string, string> = {
  '/': 'index.html',
  '/profile': 'profile.html',
  '/profile/assistant': 'assistant.html',
  '/review': 'review.html',
};

/**
 * File della pagina per un indirizzo, come la sceglierebbe il server dai
 * cookie del dispositivo: senza copia della materia il feed ha l'anteprima,
 * senza chiave il Ripasso chiede la password.
 */
function pageFile(path: string, cookie: string): string {
  const has = (name: string) => new RegExp(`(^|; )${name}=1`).test(cookie);
  if (path === '/' && has('ef-feed-copy')) return 'index-copy.html';
  if (path === '/review' && has('ef-sync-key')) return 'review-key.html';
  return PAGES[path] ?? path;
}
/** Fornitori dell'assistente, chiamati dal browser come in produzione (`src/proxy.ts`). */
const PROVIDERS =
  'https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com';
const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'nonce-e2e-nonce'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' ${PROVIDERS}`;
/** CSP del worker dei test Python, come in produzione (`next.config.ts`). */
const WORKER_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'";

let problems: string[];

test.beforeEach(async ({ page }) => {
  problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = normalize(join(ROOT, pageFile(path, route.request().headers().cookie ?? '')));
    if (!file.startsWith(ROOT) || !existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({
      status: 200,
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
      headers: { 'Content-Security-Policy': path === '/python-worker.js' ? WORKER_CSP : CSP },
    });
  });
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

/** Apre il feed; se `intro` è falso chiude la spiegazione dei gesti. */
async function open(page: Page, intro = false) {
  await page.goto(ORIGIN);
  const button = page.getByRole('button', { name: 'Ho capito, iniziamo' });
  await expect(button).toBeVisible();
  if (!intro) await button.click();
}

const slide = (page: Page) => page.locator('section.ef-slide:not([inert])');

/** Tocco sulla scheda visibile: a destra avanti, a sinistra indietro. */
async function tap(page: Page, side: 'right' | 'left' | 'center' = 'right') {
  const box = await slide(page).locator('.ef-stage').boundingBox();
  if (!box) throw new Error('scheda non visibile');
  const x = box.x + box.width * (side === 'right' ? 0.85 : side === 'left' ? 0.1 : 0.5);
  await page.touchscreen.tap(x, box.y + box.height * 0.25);
  // Il tocco singolo aspetta un eventuale secondo tocco (230 ms).
  await page.waitForTimeout(300);
}

const beats = (page: Page) => slide(page).locator('.ef-beats i');

test('al primo avvio spiega i gesti, poi non più', async ({ page }) => {
  await open(page, true);
  await expect(page.getByRole('heading', { name: 'Quattro gesti, nessun pulsante' })).toBeVisible();
  await page.getByRole('button', { name: 'Ho capito, iniziamo' }).click();
  await page.reload();
  await expect(
    slide(page).getByRole('heading', { name: "Che cos'è una linked list" }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ho capito, iniziamo' })).toHaveCount(0);
});

test('le battute avanzano e tornano indietro con i tocchi, la parola si indovina', async ({
  page,
}) => {
  await open(page);
  await expect(beats(page)).toHaveCount(4);
  await tap(page);
  await expect(slide(page).locator('.ef-blank')).toHaveAttribute('aria-label', /Parola nascosta/);
  await tap(page);
  await expect(slide(page).locator('.ef-blank.open')).toHaveText('head');
  await expect(page.getByLabel('2 punti')).toBeVisible();
  await tap(page);
  await expect(slide(page).locator('.ef-lines li')).toHaveCount(1);
  await tap(page, 'left');
  await expect(slide(page).locator('.ef-key')).toBeVisible();
  await expect(slide(page).locator('.ef-beats i.done')).toHaveCount(1);
});

test('il doppio tocco salva la scheda e la tiene in Salvati', async ({ page }) => {
  await open(page);
  const box = await slide(page).locator('.ef-stage').boundingBox();
  if (!box) throw new Error('scheda non visibile');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 200);
  await page.waitForTimeout(80);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 200);
  await expect(slide(page).getByText('· salvata')).toBeVisible();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('ef:saved') ?? '[]') as { key: string }[],
  );
  expect(saved.map((card) => card.key)).toEqual(['00000000-0000-4000-8000-000000000020:card:what']);
  // Nessun avanzamento: il doppio tocco non è un tocco.
  await expect(slide(page).locator('.ef-beats i.done')).toHaveCount(0);
});

test('tieni premuto apre le azioni con il minuto sul portale', async ({ page }) => {
  await open(page);
  const box = await slide(page).locator('.ef-stage').boundingBox();
  if (!box) throw new Error('scheda non visibile');
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const sheet = page.getByRole('dialog', { name: "Che cos'è una linked list" });
  await expect(sheet).toBeVisible();
  const portal = sheet.getByRole('link', { name: /Guarda sul portale/ });
  await expect(portal).toHaveAttribute(
    'href',
    'https://learn.epicode.edu.mt/course/177/curriculum/66756',
  );
  await expect(portal).toContainText('cerca il minuto 2:14');
  await expect(portal).toHaveAttribute('rel', 'noopener noreferrer');
  await sheet.getByRole('button', { name: 'Leggi in inglese' }).click();
  await expect(slide(page).getByRole('heading', { name: 'What a linked list is' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambia lingua della scheda' })).toHaveText('EN');
});

test('Segnala errore corregge la frase e la scheda lo mostra', async ({ page }) => {
  await open(page);
  await tap(page);
  const box = await slide(page).locator('.ef-stage').boundingBox();
  if (!box) throw new Error('scheda non visibile');
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Segnala errore' }).click();
  const sheet = page.getByRole('dialog', { name: 'Segnala errore' });
  // Parte dalla frase della battuta che si stava leggendo: la frase chiave.
  await expect(sheet.getByText(/frase chiave/)).toBeVisible();
  const field = sheet.getByLabel('Correzione');
  await expect(field).toHaveValue('La head è il primo nodo della lista collegata.');
  await field.fill('La head è il primo nodo della linked list.');
  await sheet.getByRole('button', { name: 'Salva correzione' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(/Correzione salvata/)).toBeVisible();
  await expect(slide(page).locator('.ef-key')).toHaveText(
    'La head è il primo nodo della linked list.',
  );
  await expect(slide(page).getByText('corretta da te')).toBeVisible();
  // Arrivata al server simulato: sul dispositivo non è più da inviare.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('ef:corrections') ?? '{}') as {
          items?: { unsent: boolean }[];
        };
        return state.items?.map((item) => item.unsent);
      }),
    )
    .toEqual([false]);
});

test('Chiedi a Claude: in coda senza chiave, poi con la chiave di Gemini', async ({ page }) => {
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  const asked: string[] = [];
  await page.route(`${GEMINI}/**`, async (route) => {
    const request = route.request();
    // La chiave va solo nell'intestazione, mai nell'indirizzo.
    expect(request.url()).not.toContain('AIza');
    expect(request.headers()['x-goog-api-key']).toBe('AIzaSyFinta1234567890abcdef');
    if (request.method() === 'GET') {
      return route.fulfill({
        json: {
          models: [
            { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.8-pro', supportedGenerationMethods: ['generateContent'] },
          ],
        },
        headers: { 'access-control-allow-origin': '*' },
      });
    }
    asked.push(request.postData() ?? '');
    return route.fulfill({
      json: {
        candidates: [
          {
            content: { parts: [{ text: 'La **head** è il primo nodo:\n- da lì parte la lista' }] },
          },
        ],
      },
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await open(page);
  const box = await slide(page).locator('.ef-stage').boundingBox();
  if (!box) throw new Error('scheda non visibile');
  const hold = async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
  };
  await hold();
  await page.getByRole('button', { name: /Chiedi a Claude/ }).click();
  const empty = page.getByRole('dialog', { name: 'Chiedi a Claude' });
  // Senza chiave la domanda va in coda per Claude Desktop.
  await empty.getByLabel('La tua domanda').fill('Perché serve la head?');
  await empty.getByRole('button', { name: 'Metti in coda per Claude Desktop' }).click();
  await expect(empty.getByText('Domanda in coda per Claude Desktop')).toBeVisible();
  expect(await page.evaluate(() => fetch('/api/questions').then((r) => r.json()))).toMatchObject({
    questions: [{ question: 'Perché serve la head?', status: 'pending', itemType: 'card' }],
  });
  await page.keyboard.press('Escape');
  await hold();
  await page.getByRole('button', { name: /Chiedi a Claude/ }).click();
  await page
    .getByRole('dialog', { name: 'Chiedi a Claude' })
    .getByRole('link', { name: 'Aggiungi una chiave API' })
    .click();

  await expect(page.getByRole('link', { name: /Google AI Studio/ })).toHaveAttribute(
    'href',
    'https://aistudio.google.com/app/apikey',
  );
  await page.getByLabel('Chiave API').fill('  AIzaSyFinta1234567890abcdef ');
  await page.getByRole('button', { name: 'Prova e salva' }).click();
  await expect(page.getByText('Chiave valida · solo su questo dispositivo')).toBeVisible();
  await expect(page.getByLabel(/Modello/)).toHaveValue('gemini-3.8-flash');
  await expect(page.getByText('AIza••••••••••def')).toBeVisible();

  await page.goto(ORIGIN);
  await expect(slide(page)).toBeVisible();
  await hold();
  await page.getByRole('button', { name: /Chiedi a Claude/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Chiedi a Claude' });
  await sheet.getByLabel('La tua domanda').fill('Cos’è la head?');
  await sheet.getByRole('button', { name: 'Chiedi', exact: true }).click();
  await expect(sheet.locator('.ef-ask-reply strong')).toHaveText('head');
  await expect(sheet.locator('.ef-ask-reply li')).toHaveText('da lì parte la lista');
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('linked list');
  expect(asked[0]).toContain('Cos’è la head?');
});

test('scorrendo arrivano passi, confronto, codice e una domanda in inglese', async ({ page }) => {
  await open(page);
  const feed = page.locator('.ef-feed');
  const next = async () => {
    await feed.evaluate((element) => {
      element.scrollBy(0, element.clientHeight);
    });
    await page.waitForTimeout(400);
  };
  await next();
  await expect(slide(page).getByText('passo passo')).toBeVisible();
  await next();
  await expect(slide(page).getByText('confronto')).toBeVisible();
  await next();
  // Dopo tre schede, un gruppo di domande della lezione (qui due), in inglese di base.
  await expect(slide(page).getByText('Quick check')).toBeVisible();
  await expect(slide(page).getByLabel('Question 1 / 2')).toHaveText('1/2');
  await slide(page)
    .getByRole('button', { name: /The head/ })
    .click();
  await expect(slide(page).getByRole('status')).toContainText('Correct!');
  await expect(page.getByLabel('10 punti')).toBeVisible();
  await next();
  await expect(slide(page).getByText('True or false?')).toBeVisible();
  await expect(slide(page).getByLabel('Question 2 / 2')).toHaveText('2/2');
  await next();
  await expect(slide(page).getByText('codice')).toBeVisible();
  await tap(page);
  await tap(page);
  await tap(page);
  await expect(slide(page).locator('.ef-code .ln.on').first()).toBeVisible();
});

test('vero o falso con lo swipe', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const element = document.querySelector('.ef-feed');
    if (element) element.scrollTop = element.clientHeight * 4;
  });
  await expect(slide(page).getByText('True or false?')).toBeVisible();
  const card = slide(page).locator('.ef-swcard');
  const box = await card.boundingBox();
  if (!box) throw new Error('carta non visibile');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(slide(page).getByRole('status')).toContainText('Correct! False.');
});

test('Capitolo salta a una lezione e segnala quelle da generare', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Scegli capitolo o lezione' }).click();
  const sheet = page.getByRole('dialog', { name: 'Data Structures and Algorithms' });
  await expect(sheet.getByRole('button', { name: /Binary trees/ })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: /Linked Lists/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('da tastiera si studia senza toccare lo schermo', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowRight');
  await expect(slide(page).locator('.ef-key')).toBeVisible();
  await page.keyboard.press('s');
  await expect(slide(page).getByText('· salvata')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(slide(page).getByText('passo passo')).toBeVisible();
  await page.keyboard.press('a');
  await expect(page.getByRole('dialog', { name: 'Inserire in testa' })).toBeVisible();
});

test('riparte dall’ultima scheda vista', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowDown');
  await expect(slide(page).getByText('passo passo')).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(slide(page).getByText('passo passo')).toBeVisible();
});

test('si apre subito dalla copia sul telefono, anche con la rete lenta', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowDown');
  await expect(slide(page).getByText('passo passo')).toBeVisible();
  // Il server non risponde: il feed parte lo stesso, dalla scheda dove eri.
  await page.goto(`${ORIGIN}/?rete=lenta`);
  await expect(slide(page).getByText('passo passo')).toBeVisible();
  await expect(page.getByText('Sei offline')).toHaveCount(0);
});

test('alla prima apertura la prima lezione arriva già disegnata dal server', async ({ page }) => {
  // Niente copia sul telefono e server del feed che non risponde: la prima
  // lezione c'è comunque.
  await page.goto(`${ORIGIN}/?rete=lenta`);
  await page.getByRole('button', { name: 'Ho capito, iniziamo' }).click();
  await expect(
    slide(page).getByRole('heading', { name: "Che cos'è una linked list" }),
  ).toBeVisible();
  // Il feed intero salvato sul telefono: dalla prossima volta niente anteprima.
  const hasCopy = async () =>
    (await page.context().cookies()).some((cookie) => cookie.name === 'ef-feed-copy');
  expect(await hasCopy()).toBe(false);
  await page.goto(ORIGIN);
  await expect.poll(hasCopy).toBe(true);
});

test('senza rete studia la copia salvata e lo dice', async ({ page }) => {
  await open(page);
  await page.goto(`${ORIGIN}/?rete=assente`);
  await expect(page.getByText('Sei offline: studi la copia salvata.')).toBeVisible();
  await expect(
    slide(page).getByRole('heading', { name: "Che cos'è una linked list" }),
  ).toBeVisible();
});

test('andando in Io e tornando, posizione e punti restano', async ({ page }) => {
  await open(page);
  await tap(page);
  await tap(page);
  await expect(page.getByLabel('2 punti')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(slide(page).getByText('passo passo')).toBeVisible();
  await page.getByRole('link', { name: 'Io' }).click();
  await expect(page.getByRole('heading', { name: 'Io', exact: true })).toBeVisible();
  await expect(page.locator('.ef-row-link', { hasText: 'Punti totali' })).toContainText('2');
  await page.getByRole('link', { name: 'Feed' }).click();
  await expect(slide(page).getByText('passo passo')).toBeVisible();
});

test('la sessione da 5 minuti si conta quando finisce', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await page.clock.fastForward('05:01');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Altri 5 minuti' })).toBeVisible();
  const sessions = () =>
    page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('ef:stats') ?? '{}') as { sessions?: number }).sessions,
    );
  expect(await sessions()).toBe(1);
  await page.getByRole('button', { name: 'Altri 5 minuti' }).click();
  expect(await sessions()).toBe(1);
});

test('Io sul telefono: righe allineate e barra in basso coprente', async ({ page }) => {
  await page.goto(`${ORIGIN}/profile`);
  await expect(page.getByRole('heading', { name: 'Io', exact: true })).toBeVisible();
  const width = await page.evaluate(() => window.innerWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  // IT ed EN sulla stessa riga, a destra del testo e dentro lo schermo.
  for (const group of await page.locator('.ef-toggle .ef-seg').all()) {
    const [it, en] = await group.locator('button').all();
    const a = await it?.boundingBox();
    const b = await en?.boundingBox();
    if (!a || !b) throw new Error('pulsanti non visibili');
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
  }
  // La barra sfoca e copre quello che scorre sotto.
  const nav = page.locator('.ef-nav');
  const style = await nav.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { blur: computed.backdropFilter, color: computed.backgroundColor };
  });
  expect(style.blur).toContain('blur');
  const alpha = Number(/[\d.]+(?=\)$)/.exec(style.color.replace(/\s/g, ''))?.[0] ?? '1');
  expect(alpha).toBeGreaterThanOrEqual(0.85);
});

test('una risposta sbagliata nel feed entra nel Ripasso, che si fa a battute', async ({ page }) => {
  await page.goto(`${ORIGIN}/review`);
  await expect(page.getByText('Rispondi alle domande del feed')).toBeVisible();

  // Nel feed: vero/falso sbagliato (la risposta giusta è Falso).
  await open(page);
  await page.evaluate(() => {
    const element = document.querySelector('.ef-feed');
    if (element) element.scrollTop = element.clientHeight * 4;
  });
  await slide(page).getByRole('button', { name: 'True →' }).click();
  await expect(slide(page).getByRole('status')).toContainText('Almost.');
  // La risposta si salva in IndexedDB in modo asincrono: si cambia pagina solo
  // dopo che la transazione è confermata, altrimenti la navigazione la annulla.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const request = indexedDB.open('epicfeed-progress');
            request.onsuccess = () => {
              const db = request.result;
              const count = db.transaction('answers').objectStore('answers').count();
              count.onsuccess = () => {
                db.close();
                resolve(count.result);
              };
            };
            request.onerror = () => {
              resolve(0);
            };
          }),
      ),
    )
    .toBe(1);

  await page.goto(`${ORIGIN}/review`);
  await expect(page.getByRole('heading', { name: 'Concetti deboli' })).toBeVisible();
  await expect(page.locator('.ef-rv-list')).toContainText('Linked list');
  await expect(page.locator('.ef-rv-list')).toContainText('1 errore');
  // Appena sbagliato non scade ancora (rivede tra un minuto): si ripassa in anticipo.
  await page.getByRole('button', { name: 'Ripassa in anticipo' }).click();

  // Battuta di richiamo: parola da scoprire, poi la domanda.
  await expect(page.getByRole('heading', { name: 'Linked list' })).toBeVisible();
  await page.locator('.ef-blank').click();
  await expect(page.locator('.ef-blank.open')).toHaveText('head');
  await page.locator('.ef-stage').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.ef-rv-beats i.on')).toHaveCount(2);

  // Domanda in inglese (lingua delle domande predefinita), poi Avanti.
  const options = page.locator('.ef-opt');
  if ((await options.count()) > 0) await options.nth(1).click();
  else await page.getByRole('button', { name: 'False' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Ripasso completato')).toBeVisible();
  await expect(page.getByText('Primo giorno della serie')).toBeVisible();
  await expect(page.locator('.ef-stat').filter({ hasText: 'giorno' })).toContainText('1 giorno');
});

test('Ripasso ed Esame stanno nello stesso tab', async ({ page }) => {
  await page.goto(`${ORIGIN}/review`);
  await page.getByRole('tab', { name: 'Esame' }).click();
  await expect(page.getByRole('heading', { name: 'Allenati come all’esame' })).toBeVisible();
  await expect(page).toHaveURL(/#esame$/);
  await expect(page.locator('.ef-nav .on')).toHaveText('Ripasso');
});

test('il quiz di modulo mescola feed e domande d’esame, in inglese', async ({ page }) => {
  await page.goto(`${ORIGIN}/review#esame`);
  await page.getByRole('button', { name: /1\. Linked lists/ }).click();
  await expect(page.getByText('Questo modulo ha 3 domande')).toBeVisible();
  for (let i = 0; i < 3; i += 1) {
    await page.locator('.ef-opt').first().click();
    await expect(page.locator('.ef-fb')).toBeVisible();
    await page.getByRole('button', { name: i < 2 ? 'Avanti' : 'Vedi il risultato' }).click();
  }
  await expect(page.getByRole('heading', { name: '1. Linked lists' })).toBeVisible();
  await expect(page.getByText(/\/3giuste/)).toBeVisible();
  await page.getByRole('button', { name: 'Torna all’Esame' }).click();
  await expect(page.getByRole('heading', { name: 'Esercizi d’esame' })).toBeVisible();
});

test('esercizio di codice: suggerimento, test con Python nel browser e griglia', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`${ORIGIN}/review#esame`);
  await page.getByRole('button', { name: /Reverse a list/ }).click();
  await expect(page.getByRole('heading', { name: 'Reverse a list' })).toBeVisible();

  await page.getByRole('button', { name: 'Mostra un suggerimento' }).click();
  await expect(page.getByText('Parti dalla tail.')).toBeVisible();
  await page.getByRole('button', { name: 'Lingua dei suggerimenti' }).click();
  await expect(page.getByText('Start from the tail.')).toBeVisible();

  // L'editor (CodeMirror) parte con la firma della funzione.
  const editor = page.getByRole('textbox', { name: 'Your code' });
  await expect(editor).toContainText('def reverse(items: list) -> list:');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('return items[::-1]');
  await page.getByRole('button', { name: 'Esegui i test' }).click();
  await expect(page.getByText('2/2 test superati')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Mostra soluzione e griglia' }).click();
  await page
    .getByRole('group', { name: 'Punti: Returns the reversed list' })
    .getByText('3')
    .click();
  await page.getByRole('group', { name: 'Punti: Handles the empty list' }).getByText('1').click();
  await expect(page.getByText('4/5 punti (80%)')).toBeVisible();
  await page.getByRole('button', { name: 'Salva il punteggio' }).click();
  await expect(page.getByText('Punteggio salvato: 80%.')).toBeVisible();
  await expect(page.getByText('How would you reverse a linked list in place?')).toBeVisible();

  await page.getByRole('button', { name: '← Esame' }).click();
  await expect(page.getByRole('button', { name: /Reverse a list/ })).toContainText('80%');
});

test('Claude corregge l’esercizio con suggerimenti stile revisione del codice', async ({
  page,
}) => {
  await page.goto(`${ORIGIN}/review#esame`);
  await page.getByRole('button', { name: /Reverse a list/ }).click();
  const editor = page.getByRole('textbox', { name: 'Your code' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('return items[::-1]');
  await page.getByRole('button', { name: 'Fai correggere a Claude' }).click();
  await expect(page.getByText(/^Inviata\./)).toBeVisible();
  await expect(page.getByText(/In correzione\./)).toBeVisible();
  await page.getByRole('button', { name: '← Esame' }).click();
  await expect(page.getByRole('button', { name: /Reverse a list/ })).toContainText('In correzione');

  // Claude Desktop corregge; alla riapertura la correzione arriva.
  await page.evaluate(() => {
    (window as unknown as { efCorrectAll: () => void }).efCorrectAll();
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Correzioni di Claude' }).waitFor();
  await page
    .getByRole('button', { name: /Reverse a list|Write reverse/ })
    .first()
    .click();
  const card = page.getByRole('region', { name: 'Suggestion: Reverse in place' });
  await expect(card).toBeVisible();
  await expect(card.locator('tr.removed')).toContainText('return items[::-1]');
  await expect(card.locator('tr.added')).toHaveCount(2);
  await expect(card.locator('tr.added').first()).toContainText('items.reverse()');
  await expect(page.getByText('Slicing copies the list: O(n) extra space.')).toBeVisible();
  await expect(page.getByText('Solid answer; mind the edge cases.')).toBeVisible();
  // Il server non conserva più la risposta.
  const left = await page.evaluate(() => sessionStorage.getItem('fake-submissions'));
  expect(left).toBe('[]');
});

test('simulazione del colloquio in chat con approfondimento', async ({ page }) => {
  await page.goto(`${ORIGIN}/review#esame`);
  await page.getByRole('button', { name: /Simulazione del colloquio/ }).click();
  await page.getByRole('button', { name: 'Inizia il colloquio' }).click();
  await expect(page.getByRole('timer')).toContainText(/^(20:00|19:5\d)$/);
  const box = page.getByRole('textbox', { name: 'Your answer' });
  await box.fill('My first answer.');
  await page.getByRole('button', { name: 'Rispondi' }).click();
  await expect(page.locator('.ef-iv-chat li.me')).toHaveText(['My first answer.']);
  await expect(page.locator('.ef-iv-chat li.them')).toHaveCount(2);
  await box.fill('Follow-up answer.');
  await page.getByRole('button', { name: 'Rispondi' }).click();
  await page.getByRole('button', { name: 'Termina qui' }).click();
  await expect(page.getByRole('heading', { name: 'Colloquio finito' })).toBeVisible();
  await expect(page.getByText('Soluzione modello')).toHaveCount(1);
  await page.getByRole('button', { name: 'Fai correggere a Claude' }).click();
  await expect(page.getByText(/^Inviata\./)).toBeVisible();
  await page.getByRole('button', { name: 'Salva l’autovalutazione' }).click();
  await expect(page.getByText(/Autovalutazione salvata/)).toBeVisible();
});

test('un ciclo infinito si interrompe dopo 5 secondi per test', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${ORIGIN}/review#esame`);
  await page.getByRole('button', { name: /Reverse words/ }).click();
  const editor = page.getByRole('textbox', { name: 'Your code' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('while True: pass');
  await page.getByRole('button', { name: 'Esegui i test' }).click();
  await expect(page.getByText(/Tempo scaduto: il codice/)).toBeVisible({ timeout: 70_000 });
});

test('senza chiave il Ripasso chiede la password per sincronizzare', async ({ page }) => {
  await page.goto(`${ORIGIN}/review`);
  await expect(page.getByRole('heading', { name: 'Sincronizza telefono e PC' })).toBeVisible();
  const password = page.getByLabel('Password');
  await expect(page.getByRole('button', { name: 'Sblocca' })).toBeDisabled();
  await password.fill('password sbagliata');
  await page.getByRole('button', { name: 'Sblocca' }).click();
  // Nel banco di prova il server non c'è: la password risulta sempre errata.
  await expect(page.getByRole('alert')).toHaveText('Password non corretta.');
});
