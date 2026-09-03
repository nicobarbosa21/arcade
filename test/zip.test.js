import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/lib/rng.js';
import { hamiltonianPath, makePuzzle, validate, canStep, canMove, neighbors, wallKey } from '../js/zip/logic.js';

test('hamiltonianPath visits every cell exactly once, moving between neighbours', () => {
  for (const n of [4, 5, 6, 7]) {
    const path = hamiltonianPath(n, mulberry32(n * 99));
    assert.equal(path.length, n * n);
    assert.equal(new Set(path).size, n * n);
    for (let i = 1; i < path.length; i++) {
      assert.ok(neighbors(path[i - 1], n).includes(path[i]), `step ${i} is not adjacent`);
    }
  }
});

test('generated puzzles accept their own solution', () => {
  for (let seed = 0; seed < 25; seed++) {
    const p = makePuzzle({ size: 6, checkpoints: 8, walls: 5, rand: mulberry32(seed) });
    assert.ok(validate(p, p.solution), `seed ${seed} rejects its own solution`);
  }
});

test('checkpoints are numbered 1..k and sit on the path ends', () => {
  const p = makePuzzle({ size: 6, checkpoints: 8, rand: mulberry32(7) });
  const nums = Object.values(p.marks).sort((a, b) => a - b);
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(p.marks[p.solution[0]], 1);
  assert.equal(p.marks[p.solution.at(-1)], 8);
});

test('walls never block a move the solution needs', () => {
  const p = makePuzzle({ size: 6, walls: 12, rand: mulberry32(3) });
  for (let i = 1; i < p.solution.length; i++) {
    assert.ok(!p.walls.has(wallKey(p.solution[i - 1], p.solution[i])));
  }
});

test('canMove refuses to cross a wall', () => {
  const p = { size: 4, marks: {}, walls: new Set([wallKey(0, 1)]) };
  assert.equal(canMove(p, 0, 1), false);
  assert.equal(canMove(p, 0, 4), true);
  assert.equal(canMove(p, 0, 5), false); // diagonal
});

test('canStep enforces start cell, no revisits and checkpoint order', () => {
  const p = { size: 3, marks: { 0: 1, 4: 2, 8: 3 }, walls: new Set() };
  assert.equal(canStep(p, [], 0), true, 'must start on 1');
  assert.equal(canStep(p, [], 1), false);
  assert.equal(canStep(p, [0], 1), true);
  assert.equal(canStep(p, [0, 1], 0), false, 'no revisits');
  assert.equal(canStep(p, [0, 3], 4), true, 'checkpoint 2 after 1');
  assert.equal(canStep(p, [0, 1, 2], 5), true);
  // reaching checkpoint 3 while 2 is still unvisited is illegal
  assert.equal(canStep(p, [0, 1, 2, 5], 8), false);
});

test('validate rejects short paths and out-of-order checkpoints', () => {
  const p = makePuzzle({ size: 5, rand: mulberry32(11) });
  assert.equal(validate(p, p.solution.slice(0, -1)), false);
  assert.equal(validate(p, [...p.solution].reverse()), false);
});
