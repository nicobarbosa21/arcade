// Drives the real UI modules against a fake DOM. This is what catches a mistyped
// canvas call, a NaN reaching the renderer or a control that stopped being wired up —
// none of which the pure-logic tests can see.
// One test per module: ES imports are cached, so a module can only ever be bound to
// the first fake DOM it saw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/fakedom.js';
import { mulberry32 } from '../js/lib/rng.js';

const filledCells = (dom) => Number(dom.el('timer').innerHTML.match(/(\d+)\/\d+/)[1]);
const blanks = (dom) => Number(dom.el('timer').innerHTML.match(/faltan (\d+)/)[1]);

test('zip renders, plays with keyboard and pointer, and resets', async () => {
  // A blind walker dead-ends on some boards, which is the puzzle working as intended —
  // so pin the generator to a known one instead of letting the assertion flake.
  const realRandom = Math.random;
  Math.random = mulberry32(2);
  const dom = installDom({ ids: ['board', 'status', 'timer', 'new', 'reset', 'size'] });
  dom.el('size').value = '6';
  await import('../js/zip/play.js');
  Math.random = realRandom;

  assert.ok(dom.log.calls.length > 50, 'the board should have been drawn');
  assert.equal(filledCells(dom), 0);

  dom.fire('keydown', { key: 'ArrowRight' }); // with an empty path this jumps to checkpoint 1
  assert.equal(filledCells(dom), 1, 'the first press should land on the 1');

  // Walk greedily, never pressing the reverse of the last move — that is the erase
  // gesture and would just undo the step we came from.
  const OPPOSITE = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' };
  let last = null, filled = 1, best = 1;
  for (let i = 0; i < 200; i++) {
    let moved = false;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) {
      if (key === OPPOSITE[last]) continue;
      dom.fire('keydown', { key });
      const now = filledCells(dom);
      if (now === filled) continue;
      last = now > filled ? key : null; // a drop means we crossed the path and it truncated
      filled = now;
      best = Math.max(best, filled);
      moved = true;
      break;
    }
    if (!moved) break;
  }
  assert.ok(best >= 8, `path only reached ${best} cells`);

  dom.el('reset').onclick();
  assert.equal(filledCells(dom), 0, 'reset should clear the path');

  // Now the same thing by dragging. Only the checkpoint 1 cell may start a path,
  // so poke every cell until one takes.
  const board = dom.el('board');
  const cell = (540 - 32) / 6;
  const at = (r, c) => ({ pointerId: 1, button: 0, clientX: 16 + (c + 0.5) * cell, clientY: 16 + (r + 0.5) * cell });
  let start = null;
  for (let r = 0; r < 6 && !start; r++) {
    for (let c = 0; c < 6 && !start; c++) {
      board.dispatch('pointerdown', at(r, c));
      if (filledCells(dom) === 1) start = [r, c];
    }
  }
  assert.ok(start, 'no cell started a path');

  let stepped = false;
  for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const r = start[0] + dr, c = start[1] + dc;
    if (r < 0 || c < 0 || r > 5 || c > 5) continue;
    board.dispatch('pointermove', at(r, c));
    if (filledCells(dom) === 2) { stepped = true; break; }
  }
  assert.ok(stepped, 'dragging to a neighbour should extend the path');

  board.dispatch('pointermove', at(start[0], start[1]));
  assert.equal(filledCells(dom), 1, 'dragging back should undo the last cell');
  board.dispatch('pointerup', { pointerId: 1 });

  const drawn = dom.log.calls.length;
  dom.el('new').onclick();
  assert.ok(dom.log.calls.length > drawn, 'a new puzzle should redraw');
  dom.restore();
});

test('tango generates, renders, accepts moves and undoes them', async () => {
  const dom = installDom({ ids: ['board', 'status', 'timer', 'new', 'undo', 'clear'] });
  await import('../js/tango/play.js');

  assert.ok(dom.log.calls.length > 100, 'the board should have been drawn');
  const start = blanks(dom);
  assert.ok(start > 6, `puzzle only has ${start} blanks`);
  assert.ok(dom.el('status').textContent.includes('Tocá'), dom.el('status').textContent);

  const board = dom.el('board');
  const cell = (540 - 36) / 6;
  let after = start;
  outer: for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      board.dispatch('pointerdown', {
        button: 0, clientX: 18 + (c + 0.5) * cell, clientY: 18 + (r + 0.5) * cell,
      });
      after = blanks(dom);
      if (after < start) break outer;
    }
  }
  assert.equal(after, start - 1, 'clicking an empty cell should fill it');

  dom.el('undo').onclick();
  assert.equal(blanks(dom), start, 'undo should give the blank back');

  dom.el('clear').onclick();
  assert.equal(blanks(dom), start, 'clear should return to the given cells');
  dom.restore();
});

test('blue blur boots, runs, collects rings and survives every animation branch', async () => {
  const dom = installDom({ ids: ['game', 'restart'], groups: { '#pad button': ['left', 'right', 'down', 'jump'] } });
  await import('../js/sonic/game.js');

  dom.tick(3);
  assert.ok(dom.log.text.includes('BLUE BLUR'), 'title screen should render');

  dom.fire('keydown', { key: ' ' });
  dom.fire('keyup', { key: ' ' });
  dom.fire('keydown', { key: 'ArrowRight' });
  dom.tick(900); // fifteen seconds of running

  const hud = dom.log.text;
  const i = hud.lastIndexOf('ANILLOS');
  assert.ok(i > 0, 'the HUD should be drawing');
  assert.ok(Number(hud[i + 1]) > 0, `no rings collected in 15s (got ${hud[i + 1]})`);
  assert.notEqual(hud[i + 3], '00:00', 'the clock should be running');
  assert.ok(!hud.includes('GAME OVER'), 'a clean run should not die');

  dom.fire('keydown', { key: ' ' });   // jump
  dom.tick(20);
  dom.fire('keyup', { key: ' ' });
  dom.tick(40);
  dom.fire('keydown', { key: 'ArrowDown' }); // roll
  dom.tick(60);
  dom.fire('keyup', { key: 'ArrowRight' });
  dom.tick(120);
  dom.fire('keydown', { key: ' ' });   // spin dash charge
  dom.fire('keyup', { key: ' ' });
  dom.tick(30);
  dom.fire('keyup', { key: 'ArrowDown' }); // release, launch
  dom.tick(120);
  dom.fire('keyup', { key: 'ArrowRight' });

  // The on-screen pad has to move him too.
  const [, right, , jump] = dom.group('#pad button');
  jump.dispatch('pointerdown');
  jump.dispatch('pointerup');
  right.dispatch('pointerdown');
  dom.tick(200);
  right.dispatch('pointerleave');
  dom.tick(30);

  dom.el('restart').onclick();
  dom.tick(10);
  const j = dom.log.text.lastIndexOf('ANILLOS');
  assert.equal(dom.log.text[j + 1], '0', 'restart should reset the ring count');
  dom.restore();
});
