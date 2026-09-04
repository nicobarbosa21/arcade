// End-to-end check in a real browser: the page loads, ES modules resolve, the canvas
// paints, and real key and pointer events do what they should. The node suite covers the logic
// and the drawing calls; this covers everything that only a browser can tell you.
//
//   npm i -D playwright-core && npx playwright install --with-deps chromium
//   node tools/smoke.mjs [screenshot-dir]
//
// CHROME_PATH overrides the browser binary if you already have one.
// BASE_URL points the same checks at a deployment instead of the local copy, which is
// the only way to catch a broken deploy — wrong MIME types, missing files, bad rewrites.
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
const BASE = process.env.BASE_URL?.replace(/\/$/, '') ?? `http://localhost:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = process.env.BASE_URL ? null : createServer(async (req, res) => {
  const path = normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
server?.listen(PORT);

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

// A canvas that never rendered comes back as one flat colour.
const painted = (sel) => page.evaluate((s) => {
  const c = document.querySelector(s);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen.size;
}, sel);

await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(600);
check('the page loads the game canvas', (await page.$$('#game')).length === 1);
check('it paints the title screen', (await painted('#game')) > 8);
const title = await page.locator('#game').screenshot();

await page.keyboard.press('Space');
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(2500);
const running = await page.locator('#game').screenshot();
check('it leaves the title screen', !title.equals(running));

await page.waitForTimeout(1200);
check('it keeps animating while running', !running.equals(await page.locator('#game').screenshot()));
await page.screenshot({ path: `${SHOTS}/sonic.png`, clip: { x: 0, y: 90, width: 1100, height: 640 } });
await page.keyboard.up('ArrowRight');
check('no errors in the console', errors.length === 0, errors[0]);

await browser.close();
server?.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
