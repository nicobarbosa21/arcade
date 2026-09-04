// End-to-end check in a real browser: pages load, ES modules resolve, canvases paint,
// and real key and pointer events do what they should. The node suite covers the logic
// and the drawing calls; this covers everything that only a browser can tell you.
//
//   npm i -D playwright-core && npx playwright install --with-deps chromium
//   node tools/smoke.mjs [screenshot-dir]
//
// CHROME_PATH overrides the browser binary if you already have one.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright-core').catch(() => {
  console.error('needs playwright-core:  npm i -D playwright-core');
  process.exit(1);
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv[2] ?? join(ROOT, 'shots');
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT);

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const text = (sel) => page.$eval(sel, (el) => el.textContent.trim());
// A canvas that never rendered comes back as one flat colour.
const painted = (sel) => page.evaluate((s) => {
  const c = document.querySelector(s);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen.size;
}, sel);

await page.goto(`${BASE}/index.html`);
check('the hub lists three games', (await page.$$('.cards article')).length === 3);

/* ---------------------------------------------------------------------- zip */
errors.length = 0;
await page.goto(`${BASE}/zip.html`);
await page.waitForTimeout(400);
check('zip paints a board', (await painted('#board')) > 3);
check('zip starts empty', (await text('#timer')).includes('0/36'));

await page.keyboard.press('ArrowRight'); // with no path yet, this jumps to checkpoint 1
check('zip places the first cell', (await text('#timer')).includes('1/36'));

// Walk greedily, never pressing the reverse of the last move — that is the erase
// gesture and would only undo the step we came from.
const OPPOSITE = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' };
let last = null, filled = 1, best = 1;
for (let i = 0; i < 60; i++) {
  let moved = false;
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) {
    if (key === OPPOSITE[last]) continue;
    await page.keyboard.press(key);
    const now = Number((await text('#timer')).match(/(\d+)\/36/)[1]);
    if (now === filled) continue;
    last = now > filled ? key : null;
    filled = now;
    best = Math.max(best, filled);
    moved = true;
    break;
  }
  if (!moved) break;
}
check('zip extends the path with the keyboard', best > 3, `reached ${best}/36 cells`);
await page.screenshot({ path: `${SHOTS}/zip.png`, clip: { x: 0, y: 90, width: 1100, height: 640 } });
check('zip logged no errors', errors.length === 0, errors[0]);

/* -------------------------------------------------------------------- tango */
errors.length = 0;
await page.goto(`${BASE}/tango.html`);
await page.waitForFunction(() => !document.getElementById('status').textContent.includes('Generando'), null, { timeout: 15000 });
await page.waitForTimeout(300);
check('tango paints a board', (await painted('#board')) > 3);

const blanks = async () => Number((await text('#timer')).match(/faltan (\d+)/)[1]);
const before = await blanks();
check('tango leaves blanks to fill', before > 6, `${before} blanks`);

const box = await page.$eval('#board', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
const cell = (540 - 36) / 6;
let after = before;
for (let r = 0; r < 6 && after === before; r++) {
  for (let c = 0; c < 6 && after === before; c++) {
    await page.mouse.click(
      box.x + (18 + (c + 0.5) * cell) * (box.w / 540),
      box.y + (18 + (r + 0.5) * cell) * (box.w / 540),
    );
    after = await blanks();
  }
}
check('tango accepts a move on an empty cell', after === before - 1, `${before} → ${after}`);
await page.click('#undo');
check('tango undo puts it back', (await blanks()) === before);
await page.screenshot({ path: `${SHOTS}/tango.png`, clip: { x: 0, y: 90, width: 1100, height: 640 } });
check('tango logged no errors', errors.length === 0, errors[0]);

/* -------------------------------------------------------------------- sonic */
errors.length = 0;
await page.goto(`${BASE}/sonic.html`);
await page.waitForTimeout(600);
check('sonic paints the title screen', (await painted('#game')) > 8);
const title = await page.locator('#game').screenshot();

await page.keyboard.press('Space');
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(2500);
const running = await page.locator('#game').screenshot();
check('sonic leaves the title screen', !title.equals(running));

await page.waitForTimeout(1200);
check('sonic keeps animating while running', !running.equals(await page.locator('#game').screenshot()));
await page.screenshot({ path: `${SHOTS}/sonic.png`, clip: { x: 0, y: 90, width: 1100, height: 640 } });
await page.keyboard.up('ArrowRight');
check('sonic logged no errors', errors.length === 0, errors[0]);

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
