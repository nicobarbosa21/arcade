import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, createBoss, updateBoss, hitBoss, ballPos, podHit, ballHit, rage } from '../js/sonic/boss.js';
import { P, createPlayer, heightAt, step } from '../js/sonic/physics.js';
import { buildLevel } from '../js/sonic/level.js';

const arenaOf = () => buildLevel().arena;
const run = (b, arena, frames) => { for (let i = 0; i < frames; i++) updateBoss(b, arena); return b; };

test('the boss flies in from the right and settles into its sweep', () => {
  const arena = arenaOf();
  const b = createBoss(arena);
  assert.equal(b.state, 'enter');
  assert.ok(b.x > arena.x1, 'starts off screen');
  run(b, arena, 200);
  assert.equal(b.state, 'sweep');
  assert.ok(b.x < arena.x1 && b.x > arena.x0, 'ends up inside the arena');
});

test('the sweep stays inside the arena and turns around at both walls', () => {
  const arena = arenaOf();
  const b = run(createBoss(arena), arena, 120);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    updateBoss(b, arena);
    seen.add(b.dir);
    assert.ok(b.x >= arena.x0 + BOSS.margin - 1 && b.x <= arena.x1 - BOSS.margin + 1, `escaped to x=${b.x}`);
  }
  assert.equal(seen.size, 2, 'it should have gone both ways');
});

test('the wrecking ball reaches head height at the bottom of its swing', () => {
  const arena = arenaOf();
  const b = run(createBoss(arena), arena, 200);
  let lowest = -Infinity, widest = 0;
  for (let i = 0; i < 1200; i++) {
    updateBoss(b, arena);
    const ball = ballPos(b);
    lowest = Math.max(lowest, ball.y);
    widest = Math.max(widest, Math.abs(ball.x - b.x));
  }
  // A standing player's head is about 40px above the floor.
  assert.ok(arena.floor - lowest < 55, `ball only drops to ${(arena.floor - lowest).toFixed(0)}px above the floor`);
  assert.ok(widest > 70, `swing is only ${widest.toFixed(0)}px wide`);
});

test('a full jump reaches the pod, and standing under it does not', () => {
  const lvl = buildLevel();
  const arena = lvl.arena;
  const b = run(createBoss(arena), arena, 200);
  b.y = arena.floor - BOSS.hoverY - 12; // top of its bob — the worst case for the player

  const still = createPlayer(b.x, arena.floor);
  assert.ok(!podHit(b, still.x, still.y - 19, 15), 'the pod has to be out of reach on foot');

  const p = createPlayer(b.x, arena.floor);
  const idle = { left: false, right: false, down: false, jumpPressed: false, jumpHeld: true };
  step(p, { ...idle, jumpPressed: true }, lvl);
  let connected = false;
  for (let f = 0; f < 120 && !p.ground; f++) {
    step(p, idle, lvl);
    if (podHit(b, p.x, p.y - 19, 15)) connected = true;
  }
  assert.ok(connected, 'a full jump from directly underneath must connect');
  assert.ok(p.ground, 'and come back down');
});

test('it takes eight hits, and refuses hits while flashing', () => {
  const arena = arenaOf();
  const b = run(createBoss(arena), arena, 200);
  assert.equal(b.hp, BOSS.maxHp);

  assert.equal(hitBoss(b), true);
  assert.equal(b.hp, BOSS.maxHp - 1);
  assert.equal(hitBoss(b), false, 'a second hit in the same moment must not count');
  assert.equal(b.hp, BOSS.maxHp - 1);

  let landed = 1;
  for (let i = 0; i < 2000 && b.state === 'sweep'; i++) {
    updateBoss(b, arena);
    if (hitBoss(b)) landed++;
  }
  assert.equal(landed, BOSS.maxHp, `took ${landed} hits`);
  assert.equal(b.hp, 0);
  assert.equal(b.state, 'dying');
});

test('a hit is ignored before it arrives and after it is beaten', () => {
  const arena = arenaOf();
  const fresh = createBoss(arena);
  assert.equal(hitBoss(fresh), false, 'cannot be hit while flying in');

  const b = run(createBoss(arena), arena, 200);
  for (let i = 0; i < 2000 && b.state === 'sweep'; i++) { updateBoss(b, arena); hitBoss(b); }
  assert.equal(hitBoss(b), false, 'cannot be hit once dying');
});

test('it gets faster as it takes damage', () => {
  const arena = arenaOf();
  const b = run(createBoss(arena), arena, 200);
  const fresh = rage(b);
  b.hp = 2;
  assert.ok(rage(b) > fresh * 1.5, 'a wounded boss should be noticeably quicker');
});

test('the wreck falls away and stops existing', () => {
  const arena = arenaOf();
  const b = run(createBoss(arena), arena, 200);
  b.hp = 1;
  hitBoss(b);
  assert.equal(b.state, 'dying');
  const startY = b.y;
  run(b, arena, 100);
  assert.ok(b.y > startY, 'the wreck should drop');
  assert.ok(b.puffs.length > 0, 'and throw off explosions');
  run(b, arena, 60);
  assert.ok(b.gone);
});

test('hitboxes answer where the player actually is', () => {
  const arena = arenaOf();
  const b = run(createBoss(arena), arena, 200);
  assert.ok(podHit(b, b.x, b.y, 15), 'dead centre is a hit');
  assert.ok(!podHit(b, b.x + 300, b.y, 15), 'across the arena is not');
  assert.ok(!podHit(b, b.x, b.y - 200, 15), 'far above is not');

  const ball = ballPos(b);
  assert.ok(ballHit(b, ball.x, ball.y, 15));
  assert.ok(!ballHit(b, ball.x + 200, ball.y, 15));
});

test('the fight is winnable — a bot that chases and jumps beats it', () => {
  const lvl = buildLevel();
  const arena = lvl.arena;
  const b = run(createBoss(arena), arena, 200);
  const p = createPlayer(arena.x0 + 200, arena.floor);
  let hits = 0, hurtFrames = 0;

  for (let f = 0; f < 60 * 150 && b.state === 'sweep'; f++) {
    updateBoss(b, arena);
    const cx = p.x, cy = p.y - 19;
    const ball = ballPos(b);
    const clear = Math.hypot(ball.x - cx, ball.y - cy) > 95;
    const under = Math.abs(p.x - b.x) < 36;
    step(p, {
      left: !under && p.x > b.x,
      right: !under && p.x < b.x,
      down: false,
      jumpPressed: p.ground && under && clear,
      jumpHeld: true,
    }, lvl);
    p.x = Math.max(arena.x0 + 24, Math.min(arena.x1 - 24, p.x));

    if (ballHit(b, p.x, p.y - 19, 15)) hurtFrames++;
    else if (podHit(b, p.x, p.y - 19, 15) && (p.roll || !p.ground) && hitBoss(b)) {
      hits++;
      p.ysp = -6;
      p.ground = false;
      p.jumping = false;
    }
  }
  assert.equal(b.hp, 0, `the bot only landed ${hits} of ${BOSS.maxHp} hits`);
  assert.ok(hurtFrames < 60 * 20, 'a competent player should not be in the ball constantly');
});

test('the arena is one screen of flat ground with room to fight', () => {
  const lvl = buildLevel();
  const a = lvl.arena;
  assert.ok(a.x1 - a.x0 >= 800, 'arena is too cramped');
  assert.ok(a.x1 <= lvl.length, 'arena runs off the end of the level');
  assert.ok(a.trigger > a.x0 && a.trigger < a.x1);
  for (let x = a.x0; x <= a.x1; x += 16) {
    assert.ok(Math.abs(heightAt(lvl, x) - a.floor) < 1, `arena floor is not flat at x=${x}`);
  }
  const inside = lvl.rings.filter((r) => r.x > a.x0 && r.x < a.x1);
  assert.ok(inside.length >= 6, `only ${inside.length} rings in the arena — one mistake would end the run`);
});

test('the goal is inside the arena and hidden until the boss is beaten', () => {
  const lvl = buildLevel();
  assert.equal(lvl.goal.shown, false);
  assert.ok(lvl.goal.x > lvl.arena.x0 && lvl.goal.x < lvl.arena.x1);
});

test('a player running right arrives at the arena on their feet', () => {
  const lvl = buildLevel();
  const p = createPlayer(lvl.start.x, lvl.start.y);
  let arrived = false;
  for (let f = 0; f < 60 * 120 && !arrived; f++) {
    step(p, { left: false, right: true, down: false, jumpPressed: f % 90 === 0, jumpHeld: f % 90 < 12 }, lvl);
    if (p.x >= lvl.arena.trigger) arrived = true;
  }
  assert.ok(arrived, `only got to x=${p.x.toFixed(0)} of ${lvl.arena.trigger}`);
});
