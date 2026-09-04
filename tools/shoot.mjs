// Renders real frames of a game to PNG, with no browser involved.
//
// The games draw to a canvas and nothing else, so swapping the browser's 2D context
// for a native one is enough to see exactly what a player sees. Handy when there is no
// display around, and much faster than driving a real browser.
//
//   npm i -D @napi-rs/canvas
//   node tools/shoot.mjs sonic shots/
//
// Games: sonic | zip | tango
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { installDom } from '../test/helpers/fakedom.js';

const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas').catch(() => {
  console.error('needs @napi-rs/canvas:  npm i -D @napi-rs/canvas');
  process.exit(1);
});

// The pages ask for system-ui; point that at whatever the machine actually has.
for (const [file, weight] of [['DejaVuSans.ttf', 400], ['DejaVuSans-Bold.ttf', 700]]) {
  for (const family of ['system-ui', 'sans-serif']) {
    try { GlobalFonts.registerFromPath(`/usr/share/fonts/truetype/dejavu/${file}`, family); } catch { /* fall back to Skia's default */ }
  }
  void weight;
}

const game = process.argv[2] ?? 'sonic';
const outDir = process.argv[3] ?? 'shots';
mkdirSync(outDir, { recursive: true });

let surface = null;
const contextFactory = (el) => {
  surface = createCanvas(el.width, el.height);
  return surface.getContext('2d');
};

const save = (name) => {
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, surface.toBuffer('image/png'));
  console.log('wrote', file);
};

if (game === 'sonic') {
  const dom = installDom({
    ids: ['game', 'restart'],
    groups: { '#pad button': ['left', 'right', 'down', 'jump'] },
    contextFactory,
  });
  await import('../js/sonic/game.js');

  dom.tick(3);
  save('sonic-1-title');

  dom.fire('keydown', { key: ' ' });
  dom.fire('keyup', { key: ' ' });
  dom.fire('keydown', { key: 'ArrowRight' });
  dom.tick(150);
  save('sonic-2-running');

  dom.tick(260);
  save('sonic-3-hills');

  dom.fire('keydown', { key: ' ' });
  dom.tick(14);
  save('sonic-4-jumping');
  dom.fire('keyup', { key: ' ' });

  dom.tick(300);
  dom.fire('keydown', { key: 'ArrowDown' });
  dom.tick(25);
  save('sonic-5-rolling');
  dom.fire('keyup', { key: 'ArrowDown' });

  // Thirty seconds of game time to the arena, hopping so nothing stalls the run.
  for (let i = 0; i < 40; i++) {
    dom.tick(70);
    dom.fire('keydown', { key: ' ' });
    dom.tick(10);
    dom.fire('keyup', { key: ' ' });
  }
  save('sonic-6-boss');
  dom.tick(120);
  save('sonic-7-boss-swing');
} else if (game === 'zip') {
  const dom = installDom({ ids: ['board', 'status', 'timer', 'new', 'reset', 'size'], contextFactory });
  dom.el('size').value = '6';
  await import('../js/zip/play.js');
  save('zip-1-fresh');

  dom.fire('keydown', { key: 'ArrowRight' });
  const opposite = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' };
  let last = null, filled = 1;
  for (let i = 0; i < 200; i++) {
    let moved = false;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) {
      if (key === opposite[last]) continue;
      dom.fire('keydown', { key });
      const now = Number(dom.el('timer').innerHTML.match(/(\d+)\/\d+/)[1]);
      if (now === filled) continue;
      last = now > filled ? key : null;
      filled = now;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  save('zip-2-path');
} else if (game === 'tango') {
  const dom = installDom({ ids: ['board', 'status', 'timer', 'new', 'undo', 'clear'], contextFactory });
  await import('../js/tango/play.js');
  save('tango-1-fresh');

  // Fill in a chunk of the real solution so the symbols and the = / × markers show up.
  const board = dom.el('board');
  const cell = (540 - 36) / 6;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      board.dispatch('pointerdown', {
        button: 0, clientX: 18 + (c + 0.5) * cell, clientY: 18 + (r + 0.5) * cell,
      });
    }
  }
  save('tango-2-played');
} else {
  console.error(`unknown game "${game}" — use sonic, zip or tango`);
  process.exit(1);
}
