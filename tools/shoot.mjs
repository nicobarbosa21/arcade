// Renders real frames of the game to PNG, with no browser involved.
//
// The game draws to a canvas and nothing else, so swapping the browser's 2D context
// for a native one is enough to see exactly what a player sees. Handy when there is no
// display around, and much faster than driving a real browser.
//
//   npm i -D @napi-rs/canvas
//   node tools/shoot.mjs shots/
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { installDom } from '../test/helpers/fakedom.js';

const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas').catch(() => {
  console.error('needs @napi-rs/canvas:  npm i -D @napi-rs/canvas');
  process.exit(1);
});

// The page asks for system-ui; point that at whatever the machine actually has.
for (const file of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  for (const family of ['system-ui', 'sans-serif']) {
    try { GlobalFonts.registerFromPath(`/usr/share/fonts/truetype/dejavu/${file}`, family); } catch { /* Skia falls back */ }
  }
}

const outDir = process.argv[2] ?? 'shots';
mkdirSync(outDir, { recursive: true });

let surface = null;
const dom = installDom({
  ids: ['game', 'restart'],
  groups: { '#pad button': ['left', 'right', 'down', 'jump'] },
  contextFactory: (el) => {
    surface = createCanvas(el.width, el.height);
    const c = surface.getContext('2d');
    c.imageSmoothingEnabled = false;
    return c;
  },
});
await import('../js/sonic/game.js');

// The framebuffer is 448×252; blow it up the same way the browser does so the PNG shows
// what a player actually sees rather than a thumbnail.
const SHOW = 3;
const save = (name) => {
  const big = createCanvas(surface.width * SHOW, surface.height * SHOW);
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(surface, 0, 0, big.width, big.height);
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, big.toBuffer('image/png'));
  console.log('wrote', file);
};

dom.tick(3);
save('1-title');

dom.fire('keydown', { key: ' ' });
dom.fire('keyup', { key: ' ' });
dom.fire('keydown', { key: 'ArrowRight' });
dom.tick(150);
save('2-running');

dom.tick(260);
save('3-hills');

dom.fire('keydown', { key: ' ' });
dom.tick(14);
save('4-jumping');
dom.fire('keyup', { key: ' ' });

dom.tick(300);
dom.fire('keydown', { key: 'ArrowDown' });
dom.tick(25);
save('5-rolling');
dom.fire('keyup', { key: 'ArrowDown' });

// Thirty seconds of game time to the arena, hopping so nothing stalls the run.
for (let i = 0; i < 40; i++) {
  dom.tick(70);
  dom.fire('keydown', { key: ' ' });
  dom.tick(10);
  dom.fire('keyup', { key: ' ' });
}
save('6-boss');
dom.tick(120);
save('7-boss-swing');
