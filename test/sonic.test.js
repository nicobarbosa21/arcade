import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, createPlayer, heightAt, angleAt, step, launch } from '../js/sonic/physics.js';
import { buildGround, buildLevel } from '../js/sonic/level.js';

const flat = (y = 300, len = 4000, step = 8) => ({
  step, length: len, ground: Float32Array.from({ length: len / step + 1 }, () => y),
});
const NONE = { left: false, right: false, down: false, jumpPressed: false, jumpHeld: false };
const input = (o = {}) => ({ ...NONE, ...o });
const run = (p, lvl, frames, i = NONE) => { for (let f = 0; f < frames; f++) step(p, i, lvl); return p; };

test('heightAt interpolates between samples', () => {
  const lvl = { step: 10, length: 20, ground: Float32Array.from([100, 200, 200]) };
  assert.equal(heightAt(lvl, 0), 100);
  assert.equal(heightAt(lvl, 5), 150);
  assert.equal(heightAt(lvl, 10), 200);
  assert.equal(heightAt(lvl, -50), 100, 'clamps left');
  assert.equal(heightAt(lvl, 9999), 200, 'clamps right');
});

test('angleAt is positive when the ground climbs to the right', () => {
  const up = { step: 8, length: 80, ground: Float32Array.from({ length: 11 }, (_, i) => 300 - i * 8) };
  const down = { step: 8, length: 80, ground: Float32Array.from({ length: 11 }, (_, i) => 300 + i * 8) };
  assert.ok(angleAt(up, 40) > 0);
  assert.ok(angleAt(down, 40) < 0);
  assert.equal(angleAt(flat(), 40), 0);
});

test('running accelerates up to top speed and no further', () => {
  const lvl = flat();
  const p = createPlayer(100, 300);
  step(p, input({ right: true }), lvl);
  assert.ok(Math.abs(p.gsp - P.acc) < 1e-9, 'one frame of acceleration');
  run(p, lvl, 400, input({ right: true }));
  assert.equal(p.gsp, P.top);
  assert.ok(p.x > 100, 'and it actually moved right');
});

test('friction brings a running player to a stop', () => {
  const lvl = flat();
  const p = createPlayer(100, 300);
  run(p, lvl, 200, input({ right: true }));
  run(p, lvl, 300);
  assert.equal(p.gsp, 0);
});

test('holding the other way brakes harder than it accelerates', () => {
  const lvl = flat();
  const p = createPlayer(100, 300);
  run(p, lvl, 200, input({ right: true }));
  const before = p.gsp;
  step(p, input({ left: true }), lvl);
  assert.ok(before - p.gsp >= P.dec - 1e-9, 'deceleration should apply');
  assert.equal(p.face, -1);
});

test('a jump leaves the ground and gravity brings it back', () => {
  const lvl = flat();
  const p = createPlayer(100, 300);
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
  assert.equal(p.y, 300);
  assert.ok(300 - peak > 40, `jump was too low (${300 - peak}px)`);
});

test('releasing the button cuts the jump short', () => {
  const lvl = flat();
  const high = createPlayer(100, 300), low = createPlayer(100, 300);
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
  const hill = { step: 8, length: 800, ground: Float32Array.from({ length: 101 }, (_, i) => 400 - Math.min(i, 50) * 4) };
  const up = createPlayer(40, 400);
  up.gsp = 4;
  step(up, input(), hill);
  assert.ok(up.gsp < 4, 'climbing should cost speed');

  const drop = { step: 8, length: 800, ground: Float32Array.from({ length: 101 }, (_, i) => 200 + i * 4) };
  const down = createPlayer(200, heightAt(drop, 200));
  down.angle = angleAt(drop, 200);
  down.gsp = 4;
  step(down, input(), drop);
  assert.ok(down.gsp > 4, 'descending should add speed');
});

test('a downhill run can push past top speed while still holding forward', () => {
  const drop = { step: 8, length: 1600, ground: Float32Array.from({ length: 201 }, (_, i) => 100 + i * 5) };
  const p = createPlayer(100, heightAt(drop, 100));
  p.angle = angleAt(drop, 100);
  run(p, drop, 120, input({ right: true }));
  assert.ok(p.gsp > P.top, `slope speed (${p.gsp.toFixed(2)}) must survive holding right`);
});

test('spin dash charges and fires faster than running', () => {
  const lvl = flat();
  const p = createPlayer(100, 300);
  step(p, input({ down: true, jumpPressed: true, jumpHeld: true }), lvl);
  assert.ok(p.charging);
  for (let f = 0; f < 30; f++) step(p, input({ down: true, jumpPressed: f % 8 === 0 }), lvl);
  step(p, input(), lvl); // let go of down
  assert.ok(!p.charging);
  assert.ok(p.roll, 'fires as a roll');
  assert.ok(p.gsp > P.top, `spin dash (${p.gsp.toFixed(2)}) should beat top speed (${P.top})`);
});

test('holding down at speed rolls, and rolling stops when slow', () => {
  const lvl = flat();
  const p = createPlayer(100, 300);
  run(p, lvl, 200, input({ right: true }));
  step(p, input({ down: true }), lvl);
  assert.ok(p.roll);
  run(p, lvl, 2000, input({ down: true }));
  assert.ok(!p.roll, 'unrolls once it slows down');
});

test('a spring throws the player into the air', () => {
  const lvl = flat();
  const p = createPlayer(100, 300);
  launch(p, 11);
  assert.equal(p.ground, false);
  let peak = p.y;
  for (let f = 0; f < 300 && !p.ground; f++) { step(p, input(), lvl); peak = Math.min(peak, p.y); }
  assert.ok(300 - peak > 200, `spring should clear 200px, got ${(300 - peak).toFixed(0)}`);
  assert.ok(p.ground, 'and come back down');
});

test('a steep face the player is too slow for takes control away', () => {
  const wall = { step: 8, length: 400, ground: Float32Array.from({ length: 51 }, (_, i) => 400 - i * 7) };
  const p = createPlayer(200, heightAt(wall, 200));
  p.angle = angleAt(wall, 200);
  p.gsp = 0.5;
  step(p, input({ right: true }), wall);
  assert.ok(p.ctrlLock > 0, 'should slip');
  run(p, wall, 60, input({ right: true }));
  assert.ok(p.gsp < 0, 'and slide back down');
});

test('the player never leaves the level bounds', () => {
  const lvl = flat(300, 1000);
  const p = createPlayer(10, 300);
  run(p, lvl, 600, input({ left: true }));
  assert.ok(p.x >= 0);
  run(p, lvl, 1200, input({ right: true }));
  assert.ok(p.x <= lvl.length);
});

test('buildGround keeps segments continuous', () => {
  const g = buildGround([{ type: 'flat', len: 80 }, { type: 'slope', len: 160, dy: 100 }, { type: 'hill', len: 80, amp: 40 }], 300, 8);
  assert.equal(g[0], 300);
  for (let i = 1; i < g.length; i++) {
    assert.ok(Math.abs(g[i] - g[i - 1]) < 30, `jump of ${g[i] - g[i - 1]}px at sample ${i}`);
  }
  assert.equal(g.at(-1), 400, 'slope ends 100px lower and the hill returns to it');
});

test('the act has objects sitting on the ground and a reachable goal', () => {
  const lvl = buildLevel();
  assert.ok(lvl.length > 6000);
  assert.ok(lvl.rings.length > 60);
  for (const o of [...lvl.enemies, ...lvl.spikes, lvl.goal]) {
    assert.ok(Math.abs(o.y - heightAt(lvl, o.x)) < 1, `object at x=${o.x} is off the ground`);
  }
  for (const r of lvl.rings) {
    const h = heightAt(lvl, r.x) - r.y;
    assert.ok(h > 20 && h < 340, `ring at x=${r.x} floats ${h.toFixed(0)}px up`);
  }
  assert.ok(lvl.goal.x < lvl.length && lvl.goal.x > 6000);
});

test('no climb in the act is steeper than running can beat', () => {
  const lvl = buildLevel();
  const limit = Math.asin(P.acc / P.slope); // past this the slope wins and the player is stuck
  for (let i = 0; i + 1 < lvl.ground.length; i++) {
    const climb = Math.atan2(lvl.ground[i] - lvl.ground[i + 1], lvl.step);
    assert.ok(climb < limit,
      `uphill of ${((climb * 180) / Math.PI).toFixed(1)}° at x=${i * lvl.step} can dead-end a player`);
  }
});

test('running right the whole act reaches the goal', () => {
  const lvl = buildLevel();
  const p = createPlayer(lvl.start.x, lvl.start.y);
  let reached = false;
  for (let f = 0; f < 60 * 90 && !reached; f++) {
    // Hop every so often so a slow climb cannot stall the run.
    step(p, input({ right: true, jumpPressed: f % 90 === 0, jumpHeld: f % 90 < 12 }), lvl);
    if (p.x >= lvl.goal.x) reached = true;
  }
  assert.ok(reached, `only got to x=${p.x.toFixed(0)} of ${lvl.goal.x}`);
});
