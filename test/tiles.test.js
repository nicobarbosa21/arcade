import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, MODES, modeFor, buildWorld, solidAt, cast, groundSensors,
  groundField, ringField, boxField, union,
} from '../js/sonic/tiles.js';

const deg = (rad) => (rad * 180) / Math.PI;
const flatAt = (y) => groundField(() => y);

test('a flat floor rasterises solid below and empty above', () => {
  const w = buildWorld([flatAt(160)], 20, 20);
  assert.equal(solidAt(w, 0, 100, 159), false, 'just above the floor is air');
  assert.equal(solidAt(w, 0, 100, 160), true, 'the floor itself is solid');
  assert.equal(solidAt(w, 0, 100, 300), true, 'and everything under it');
  assert.equal(solidAt(w, 0, -50, 200), false, 'outside the grid is empty');
  assert.equal(solidAt(w, 0, 100, 99999), false);
});

test('a downward sensor measures the gap to the floor and the depth inside it', () => {
  const w = buildWorld([flatAt(160)], 20, 20);
  const above = cast(w, 0, 100, 140, 0);
  assert.ok(above.hit);
  assert.equal(above.distance, 20, 'the floor is 20px below');

  const on = cast(w, 0, 100, 160, 0);
  assert.equal(on.distance, 0, 'standing exactly on the surface');

  const buried = cast(w, 0, 100, 168, 0);
  assert.equal(buried.distance, -8, 'eight pixels deep');

  assert.equal(cast(w, 0, 100, 40, 0, 32).hit, false, 'nothing within reach');
});

test('tile angles come out in the maths convention', () => {
  const flat = buildWorld([flatAt(160)], 20, 20);
  assert.ok(Math.abs(deg(cast(flat, 0, 100, 140, 0).angle)) < 3, 'flat ground is 0°');

  // A slope climbing to the right: ground y falls as x grows.
  const up = buildWorld([groundField((x) => 300 - x)], 30, 30);
  const upAngle = deg(cast(up, 0, 160, 100, 0, 64).angle);
  assert.ok(upAngle > 35 && upAngle < 55, `expected ~45°, got ${upAngle.toFixed(1)}°`);

  const down = buildWorld([groundField((x) => 60 + x)], 30, 30);
  const downAngle = deg(cast(down, 0, 160, 180, 0, 64).angle);
  assert.ok(downAngle < -35 && downAngle > -55, `expected ~-45°, got ${downAngle.toFixed(1)}°`);
});

test('a wall reads as 90° and a ceiling as 180°', () => {
  const wall = buildWorld([boxField(200, 0, 400, 400)], 30, 30);
  // Cast rightwards (right-wall mode) into the left face of the box.
  const face = cast(wall, 0, 150, 200, 1, 64);
  assert.ok(face.hit);
  assert.equal(face.distance, 50);
  assert.ok(Math.abs(deg(face.angle) - 90) < 12, `wall read ${deg(face.angle).toFixed(1)}°`);

  const roof = buildWorld([boxField(0, 0, 400, 100)], 30, 30);
  const under = cast(roof, 0, 200, 160, 2, 64); // cast upward
  assert.ok(under.hit);
  assert.equal(under.distance, 60);
  assert.ok(Math.abs(Math.abs(deg(under.angle)) - 180) < 12, `ceiling read ${deg(under.angle).toFixed(1)}°`);
});

test('modeFor picks the wall the player is walking on', () => {
  assert.equal(modeFor(0), 0);
  assert.equal(modeFor(Math.PI / 2), 1);
  assert.equal(modeFor(Math.PI), 2);
  assert.equal(modeFor(-Math.PI / 2), 3);
  assert.equal(modeFor(Math.PI / 8), 0, 'a gentle slope is still floor');
});

test('the foot sensors take the higher of the two grounds', () => {
  // A step: ground at 200 on the left, 160 on the right.
  const w = buildWorld([groundField((x) => (x < 300 ? 200 : 160))], 40, 30);
  const straddling = groundSensors(w, 0, 300, 150, 0, 9);
  assert.equal(straddling.distance, 10, 'should latch onto the higher side, 160');
});

test('layers are independent solid maps', () => {
  const w = buildWorld([flatAt(160), boxField(0, 0, 640, 80)], 40, 30);
  assert.equal(solidAt(w, 0, 100, 200), true);
  assert.equal(solidAt(w, 1, 100, 200), false, 'layer 1 has no floor there');
  assert.equal(solidAt(w, 1, 100, 40), true);
  assert.equal(solidAt(w, 0, 100, 40), false);
});

test('the shape palette shares identical tiles instead of storing every one', () => {
  const w = buildWorld([flatAt(160)], 60, 40);
  // A flat world only needs: empty, the surface tile, and fully solid.
  assert.ok(w.angles.length <= 4, `palette blew up to ${w.angles.length} shapes`);
  assert.equal(w.shapes.length, w.angles.length * TILE);
});

/* --------------------------------------------------------------- the loop */

// The ring sits tangent to the ground: its lowest inner point touches the floor, so the
// floor flows straight onto the loop's inside with no seam. Layer 0 has the ring and is
// what carries you round; layer 1 is the bare ground, which is how you get to leave.
const LOOP = { cx: 480, cy: 200, inner: 84, outer: 132 };
LOOP.floor = LOOP.cy + LOOP.inner;

const loopWorld = () => {
  const ground = groundField(() => LOOP.floor);
  const ring = ringField(LOOP.cx, LOOP.cy, LOOP.inner, LOOP.outer);
  return buildWorld([union(ring, ground), ground], 60, 30);
};

test('the loop is solid all the way round and hollow inside', () => {
  const w = loopWorld();
  let missing = 0, blocked = 0;
  for (let a = 0; a < 360; a += 5) {
    const rad = (a * Math.PI) / 180;
    const out = (r) => [
      Math.round(LOOP.cx + Math.cos(rad) * r),
      Math.round(LOOP.cy + Math.sin(rad) * r),
    ];
    if (!solidAt(w, 0, ...out(LOOP.inner + 6))) missing++;
    // Just inside the surface has to be free, or there is nowhere to stand.
    if (solidAt(w, 0, ...out(LOOP.inner - 8))) blocked++;
  }
  assert.equal(missing, 0, `${missing} of 72 samples had no surface to run on`);
  assert.equal(blocked, 0, `${blocked} of 72 samples were solid where the player goes`);
});

test('the ground flows onto the loop without a step', () => {
  const w = loopWorld();
  // Approaching the tangent point, the surface height must change smoothly.
  let previous = null;
  for (let x = LOOP.cx - 60; x <= LOOP.cx + 60; x += 4) {
    const hit = cast(w, 0, x, LOOP.floor - 40, 0, 64);
    assert.ok(hit.hit, `no ground at x=${x}`);
    const surface = LOOP.floor - 40 + hit.distance;
    if (previous !== null) {
      assert.ok(Math.abs(surface - previous) < 12, `${Math.abs(surface - previous)}px step at x=${x}`);
    }
    previous = surface;
  }
});

test('the second layer drops the loop so the player can run past it', () => {
  const w = loopWorld();
  const inside = [LOOP.cx + LOOP.inner + 6, LOOP.cy];
  assert.equal(solidAt(w, 0, ...inside), true, 'layer 0 keeps the loop');
  assert.equal(solidAt(w, 1, ...inside), false, 'layer 1 drops it');
  assert.equal(solidAt(w, 1, LOOP.cx, LOOP.floor + 10), true, 'but both keep the ground');
});

test('sensors find the loop surface with the right angle at every quarter', () => {
  const w = loopWorld();
  // Standing inside the ring, the surface is always outward from the centre.
  const probes = [
    { at: 90, mode: 0, expect: 0 },      // bottom of the loop, running on the floor
    { at: 0, mode: 1, expect: 90 },      // right side, surface running up
    { at: 270, mode: 2, expect: 180 },   // top, upside down
    { at: 180, mode: 3, expect: 270 },   // left side, coming back down
  ];
  for (const { at, mode, expect } of probes) {
    const rad = (at * Math.PI) / 180;
    const x = LOOP.cx + Math.cos(rad) * (LOOP.inner - 12);
    const y = LOOP.cy + Math.sin(rad) * (LOOP.inner - 12);
    const hit = cast(w, 0, Math.round(x), Math.round(y), mode, 40);
    assert.ok(hit.hit, `no surface found at ${at}° in mode ${mode}`);
    const got = ((deg(hit.angle) % 360) + 360) % 360;
    const off = Math.min(Math.abs(got - expect), 360 - Math.abs(got - expect));
    assert.ok(off < 25, `at ${at}° expected ~${expect}°, got ${got.toFixed(1)}°`);
  }
});

test('modeFor walks through all four modes around a loop', () => {
  const w = loopWorld();
  const seen = new Set();
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(LOOP.cx + Math.cos(rad) * (LOOP.inner - 6));
    const y = Math.round(LOOP.cy + Math.sin(rad) * (LOOP.inner - 6));
    // Point the sensor outward from the centre — that is where the surface is.
    for (let mode = 0; mode < 4; mode++) {
      const { down } = MODES[mode];
      if (down[0] * Math.cos(rad) + down[1] * Math.sin(rad) < 0.7) continue;
      const hit = cast(w, 0, x, y, mode, 40);
      if (hit.hit && hit.distance >= 0 && hit.distance < 30) seen.add(modeFor(hit.angle));
    }
  }
  assert.equal(seen.size, 4, `only reached modes ${[...seen].sort().join(',')} — a loop needs all four`);
});
