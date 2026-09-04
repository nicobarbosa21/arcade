import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, BODY, createPlayer, step, launch } from '../js/sonic/physics.js';
import { buildWorld, groundField, ringField, union, TILE } from '../js/sonic/tiles.js';

/** A test level from a signed distance field. */
const level = (field, cols, rows) => ({
  world: buildWorld([field], cols, rows),
  length: cols * TILE,
});
const flat = (y = 300, cols = 120, rows = 30) => level(groundField(() => y), cols, rows);

/** Drops the player onto a floor: the physics anchor is the centre, not the feet. */
const stand = (x, floorY) => createPlayer(x, floorY - BODY.half);

const NONE = { left: false, right: false, down: false, jumpPressed: false, jumpHeld: false };
const input = (o = {}) => ({ ...NONE, ...o });
const run = (p, lvl, frames, i = NONE) => { for (let f = 0; f < frames; f++) step(p, i, lvl); return p; };

test('the player settles onto flat ground and stays there', () => {
  const lvl = flat(300);
  const p = stand(400, 300);
  run(p, lvl, 30);
  assert.equal(p.ground, true);
  assert.equal(p.mode, 0);
  assert.ok(Math.abs(p.y - (300 - BODY.half)) < 2, `drifted to y=${p.y}`);
});

test('running accelerates up to top speed and no further', () => {
  const lvl = flat();
  const p = stand(400, 300);
  step(p, input({ right: true }), lvl);
  assert.ok(Math.abs(p.gsp - P.acc) < 1e-9, 'one frame of acceleration');
  run(p, lvl, 400, input({ right: true }));
  assert.equal(p.gsp, P.top);
  assert.ok(p.x > 400, 'and it actually moved right');
});

test('friction brings a running player to a stop', () => {
  const lvl = flat();
  const p = stand(400, 300);
  run(p, lvl, 200, input({ right: true }));
  run(p, lvl, 300);
  assert.equal(p.gsp, 0);
});

test('holding the other way brakes harder than it accelerates', () => {
  const lvl = flat();
  const p = stand(400, 300);
  run(p, lvl, 200, input({ right: true }));
  const before = p.gsp;
  step(p, input({ left: true }), lvl);
  assert.ok(before - p.gsp >= P.dec - 1e-9, 'deceleration should apply');
  assert.equal(p.face, -1);
});

test('a jump leaves the ground and gravity brings it back', () => {
  const lvl = flat();
  const p = stand(400, 300);
  step(p, input({ jumpPressed: true, jumpHeld: true }), lvl);
  assert.equal(p.ground, false);
  assert.ok(p.ysp < 0, 'moving upward');
  assert.ok(p.roll, 'curled up in the air');

  let peak = p.y;
  for (let f = 0; f < 200 && !p.ground; f++) {
    step(p, input({ jumpHeld: true }), lvl);
    peak = Math.min(peak, p.y);
  }
  assert.ok(p.ground, 'landed again');
  assert.ok(Math.abs(p.y - (300 - BODY.half)) < 2);
  assert.ok(300 - BODY.half - peak > 40, `jump was too low (${(300 - BODY.half - peak).toFixed(0)}px)`);
});

test('releasing the button cuts the jump short', () => {
  const lvl = flat();
  const high = stand(400, 300), low = stand(400, 300);
  step(high, input({ jumpPressed: true, jumpHeld: true }), lvl);
  step(low, input({ jumpPressed: true, jumpHeld: true }), lvl);
  let hp = high.y, lp = low.y;
  for (let f = 0; f < 200; f++) {
    if (!high.ground) { step(high, input({ jumpHeld: true }), lvl); hp = Math.min(hp, high.y); }
    if (!low.ground) { step(low, input(), lvl); lp = Math.min(lp, low.y); }
  }
  assert.ok(hp < lp, 'held jump must go higher than a tapped one');
});

test('a slope steals speed uphill and gives it back downhill', () => {
  const climb = level(groundField((x) => 500 - x * 0.5), 120, 40);
  const up = stand(400, 300);
  up.angle = Math.atan(0.5);
  up.gsp = 4;
  step(up, input(), climb);
  assert.ok(up.gsp < 4, 'climbing should cost speed');

  const drop = level(groundField((x) => 200 + x * 0.5), 120, 60);
  const down = stand(400, 400);
  down.angle = -Math.atan(0.5);
  down.gsp = 4;
  step(down, input(), drop);
  assert.ok(down.gsp > 4, 'descending should add speed');
});

test('a downhill run can push past top speed while still holding forward', () => {
  const drop = level(groundField((x) => 120 + x * 0.6), 160, 80);
  const p = stand(200, 240);
  p.angle = -Math.atan(0.6);
  run(p, drop, 140, input({ right: true }));
  assert.ok(p.gsp > P.top, `slope speed (${p.gsp.toFixed(2)}) must survive holding right`);
});

test('spin dash charges and fires faster than running', () => {
  const lvl = flat();
  const p = stand(400, 300);
  step(p, input({ down: true, jumpPressed: true, jumpHeld: true }), lvl);
  assert.ok(p.charging);
  for (let f = 0; f < 30; f++) step(p, input({ down: true, jumpPressed: f % 8 === 0 }), lvl);
  step(p, input(), lvl);
  assert.ok(!p.charging);
  assert.ok(p.roll, 'fires as a roll');
  assert.ok(p.gsp > P.top, `spin dash (${p.gsp.toFixed(2)}) should beat top speed (${P.top})`);
});

test('holding down at speed rolls, and rolling stops when slow', () => {
  const lvl = flat();
  const p = stand(400, 300);
  run(p, lvl, 200, input({ right: true }));
  step(p, input({ down: true }), lvl);
  assert.ok(p.roll);
  run(p, lvl, 2000, input({ down: true }));
  assert.ok(!p.roll, 'unrolls once it slows down');
});

test('a spring throws the player into the air', () => {
  const lvl = flat();
  const p = stand(400, 300);
  launch(p, 11);
  assert.equal(p.ground, false);
  let peak = p.y;
  for (let f = 0; f < 300 && !p.ground; f++) { step(p, input(), lvl); peak = Math.min(peak, p.y); }
  assert.ok(300 - BODY.half - peak > 200, `spring should clear 200px, got ${(300 - BODY.half - peak).toFixed(0)}`);
  assert.ok(p.ground, 'and come back down');
});

test('a steep face the player is too slow for takes control away', () => {
  const wall = level(groundField((x) => 600 - x * 0.9), 120, 50);
  const p = stand(300, 600 - 300 * 0.9);
  p.angle = Math.atan(0.9);
  p.gsp = 0.5;
  step(p, input({ right: true }), wall);
  assert.ok(p.ctrlLock > 0, 'should slip');
  run(p, wall, 60, input({ right: true }));
  assert.ok(p.gsp < 0, 'and slide back down');
});

test('the player never leaves the level bounds', () => {
  const lvl = flat(300, 60, 30);
  const p = stand(100, 300);
  run(p, lvl, 600, input({ left: true }));
  assert.ok(p.x >= 0);
  run(p, lvl, 1200, input({ right: true }));
  assert.ok(p.x <= lvl.length);
});

test('a ceiling stops an upward jump', () => {
  const roof = level(union(groundField(() => 300), (x, y) => y - 180), 60, 30);
  const p = stand(400, 300);
  step(p, input({ jumpPressed: true, jumpHeld: true }), roof);
  for (let f = 0; f < 60 && !p.ground; f++) step(p, input({ jumpHeld: true }), roof);
  assert.ok(p.y - BODY.half >= 178, `head went through the ceiling to y=${p.y}`);
});

/* ------------------------------------------------------------------ the loop */

const LOOP = { cx: 1200, inner: 84, outer: 132, floor: 400 };
LOOP.cy = LOOP.floor - LOOP.inner;

// Layer 0 is bare ground, so nothing blocks the run-up. Layer 1 adds the ring, and the
// switcher at the tangent point is what moves the player between them.
const loopLevel = () => {
  const ground = groundField(() => LOOP.floor);
  const ring = ringField(LOOP.cx, LOOP.cy, LOOP.inner, LOOP.outer);
  return {
    world: buildWorld([ground, union(ground, ring)], 150, 40),
    length: 150 * TILE,
    switchers: [{ x: LOOP.cx, y: LOOP.cy, radius: LOOP.outer + 12, layer: 1, needSpeed: 6 }],
  };
};

test('at speed the player runs right around the inside of a loop', () => {
  const lvl = loopLevel();
  const p = stand(600, LOOP.floor);
  p.gsp = 12; // roughly what a spin dash gives you

  const modes = new Set();
  let highest = p.y;
  for (let f = 0; f < 600; f++) {
    step(p, input({ right: true }), lvl);
    modes.add(p.mode);
    highest = Math.min(highest, p.y);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `went non-finite at frame ${f}`);
  }

  assert.ok(modes.has(1), 'never ran up the wall of the loop');
  assert.ok(modes.has(2), 'never made it upside down over the top');
  assert.ok(modes.has(3), 'never came down the far side');
  // The top of the loop is a whole diameter above the floor.
  assert.ok(highest < LOOP.cy - LOOP.inner + 40, `only reached y=${highest.toFixed(0)}`);
});

test('too slow and the loop spits the player back out instead of sticking them to it', () => {
  const lvl = loopLevel();
  const p = stand(1100, LOOP.floor);
  p.gsp = 2; // nowhere near enough

  let upsideDown = false;
  for (let f = 0; f < 400; f++) {
    step(p, input(), lvl);
    if (p.mode === 2) upsideDown = true;
  }
  assert.ok(!upsideDown, 'a crawl should never carry you over the top');
  assert.ok(p.ground, 'and it should end up back on solid ground');
  assert.ok(p.y > LOOP.cy, `left hanging at y=${p.y.toFixed(0)}`);
});
