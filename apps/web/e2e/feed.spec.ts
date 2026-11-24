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
};
/** Pagine dell'app servite dal banco di prova. */
const PAGES: Record<string, string> = {
  '/': 'index.html',
  '/io': 'io.html',
  '/ripasso': 'ripasso.html',
};
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'";

let problems: string[];

test.beforeEach(async ({ page }) => {
  problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = normalize(join(ROOT, PAGES[path] ?? path));
    if (!file.startsWith(ROOT) || !existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({
      status: 200,
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
      headers: { 'Content-Security-Policy': CSP },
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
  await page.goto(`${ORIGIN}/io`);
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
  await page.goto(`${ORIGIN}/ripasso`);
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

  await page.goto(`${ORIGIN}/ripasso`);
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
  await page.goto(`${ORIGIN}/ripasso`);
  await page.getByRole('tab', { name: 'Esame' }).click();
  await expect(page.getByText('simulazione scritta del colloquio')).toBeVisible();
  await expect(page).toHaveURL(/#esame$/);
  await expect(page.locator('.ef-nav .on')).toHaveText('Ripasso');
});

test('senza chiave il Ripasso chiede la password per sincronizzare', async ({ page }) => {
  await page.goto(`${ORIGIN}/ripasso`);
  await expect(page.getByRole('heading', { name: 'Sincronizza telefono e PC' })).toBeVisible();
  const password = page.getByLabel('Password');
  await expect(page.getByRole('button', { name: 'Sblocca' })).toBeDisabled();
  await password.fill('password sbagliata');
  await page.getByRole('button', { name: 'Sblocca' }).click();
  // Nel banco di prova il server non c'è: la password risulta sempre errata.
  await expect(page.getByRole('alert')).toHaveText('Password non corretta.');
});
