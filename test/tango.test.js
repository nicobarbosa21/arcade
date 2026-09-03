import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/lib/rng.js';
import { generate, solve, conflicts, hasConflict, isSolved, EMPTY, SUN, MOON } from '../js/tango/logic.js';

const rows = (b, n) => Array.from({ length: n }, (_, r) => [...b.slice(r * n, r * n + n)]);
const cols = (b, n) => Array.from({ length: n }, (_, c) => Array.from({ length: n }, (_, r) => b[r * n + c]));

test('a solved board balances every row and column', () => {
  const { solution, n } = generate(6, mulberry32(1));
  for (const line of [...rows(solution, n), ...cols(solution, n)]) {
    assert.equal(line.filter((v) => v === SUN).length, n / 2);
    assert.equal(line.filter((v) => v === MOON).length, n / 2);
  }
});

test('a solved board never has three identical in a row', () => {
  const { solution, n } = generate(6, mulberry32(2));
  for (const line of [...rows(solution, n), ...cols(solution, n)]) {
    for (let i = 0; i + 2 < n; i++) {
      assert.ok(!(line[i] === line[i + 1] && line[i + 1] === line[i + 2]));
    }
  }
});

test('generated puzzles have exactly one solution', () => {
  for (let seed = 0; seed < 6; seed++) {
    const { given, cons, n, solution } = generate(6, mulberry32(seed));
    const found = solve(given, n, cons, 3);
    assert.equal(found.length, 1, `seed ${seed} is not unique`);
    assert.deepEqual([...found[0]], [...solution]);
  }
});

test('given cells agree with the solution and leave real work to do', () => {
  const { given, solution, n } = generate(6, mulberry32(4));
  given.forEach((v, i) => { if (v !== EMPTY) assert.equal(v, solution[i]); });
  assert.ok(given.filter((v) => v === EMPTY).length > n, 'puzzle is almost pre-filled');
});

test('constraints match the solution', () => {
  const { cons, solution } = generate(6, mulberry32(5));
  for (const c of cons) assert.equal(solution[c.a] === solution[c.b], c.eq);
});

test('conflicts points at the offending cells', () => {
  const n = 4;
  const board = Int8Array.from([SUN, SUN, SUN, EMPTY, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const bad = conflicts(board, n, []);
  assert.ok([0, 1, 2].every((i) => bad.has(i)), 'the triple should be flagged');
  assert.ok(hasConflict(board, n, []));
});

test('conflicts catches a broken = / × pair', () => {
  const n = 4;
  const board = new Int8Array(n * n);
  board[0] = SUN; board[1] = MOON;
  assert.ok(hasConflict(board, n, [{ a: 0, b: 1, eq: true }]));
  assert.ok(!hasConflict(board, n, [{ a: 0, b: 1, eq: false }]));
});

test('isSolved needs a full board with no conflicts', () => {
  const { solution, given, n, cons } = generate(6, mulberry32(8));
  assert.ok(isSolved(solution, n, cons));
  assert.ok(!isSolved(given, n, cons));
});
