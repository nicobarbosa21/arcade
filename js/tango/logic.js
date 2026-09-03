// Tango: fill the grid with suns and moons.
//  · every row and column holds the same number of each
//  · never three identical in a row
//  · "=" means the pair matches, "×" means it differs
import { shuffle } from '../lib/rng.js';

export const EMPTY = 0, SUN = 1, MOON = 2;

/**
 * Walks the board looking for rule breaks. With `bad` it collects every offending
 * cell (for highlighting); without it, it bails out at the first one (for the solver).
 */
function scan(board, n, cons, bad) {
  const half = n / 2;
  const flag = (...cells) => {
    if (!bad) return true;
    for (const c of cells) bad.add(c);
    return false;
  };

  for (let k = 0; k < n; k++) {
    let rs = 0, rm = 0, cs = 0, cm = 0;
    for (let j = 0; j < n; j++) {
      const r = board[k * n + j], c = board[j * n + k];
      if (r === SUN) rs++; else if (r === MOON) rm++;
      if (c === SUN) cs++; else if (c === MOON) cm++;
    }
    if (rs > half || rm > half) {
      const row = Array.from({ length: n }, (_, j) => k * n + j);
      if (flag(...row)) return true;
    }
    if (cs > half || cm > half) {
      const col = Array.from({ length: n }, (_, j) => j * n + k);
      if (flag(...col)) return true;
    }
  }

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c, v = board[i];
      if (v === EMPTY) continue;
      if (c <= n - 3 && board[i + 1] === v && board[i + 2] === v && flag(i, i + 1, i + 2)) return true;
      if (r <= n - 3 && board[i + n] === v && board[i + 2 * n] === v && flag(i, i + n, i + 2 * n)) return true;
    }
  }

  for (const k of cons) {
    const a = board[k.a], b = board[k.b];
    if (a === EMPTY || b === EMPTY) continue;
    if ((k.eq ? a !== b : a === b) && flag(k.a, k.b)) return true;
  }
  return bad ? bad.size > 0 : false;
}

export const hasConflict = (board, n, cons) => scan(board, n, cons, null);
export const conflicts = (board, n, cons) => { const s = new Set(); scan(board, n, cons, s); return s; };

/** Depth-first solver. Stops once `limit` solutions are found — limit 2 answers "is it unique?". */
export function solve(board, n, cons, limit = 2, rand = null) {
  const b = Int8Array.from(board);
  const blanks = [];
  for (let i = 0; i < b.length; i++) if (b[i] === EMPTY) blanks.push(i);
  const solutions = [];

  const rec = (k) => {
    if (k === blanks.length) { solutions.push(Int8Array.from(b)); return; }
    const i = blanks[k];
    for (const v of rand && rand() < 0.5 ? [MOON, SUN] : [SUN, MOON]) {
      b[i] = v;
      if (!hasConflict(b, n, cons)) rec(k + 1);
      b[i] = EMPTY;
      if (solutions.length >= limit) return;
    }
  };
  rec(0);
  return solutions;
}

export const isSolved = (board, n, cons) =>
  board.every((v) => v !== EMPTY) && !hasConflict(board, n, cons);

/** Builds a puzzle with exactly one solution. */
export function generate(n = 6, rand = Math.random) {
  const solution = solve(new Int8Array(n * n), n, [], 1, rand)[0];

  const pairs = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c < n - 1) pairs.push({ a: i, b: i + 1 });
      if (r < n - 1) pairs.push({ a: i, b: i + n });
    }
  }
  let cons = shuffle(pairs, rand)
    .slice(0, n + 2)
    .map((p) => ({ ...p, eq: solution[p.a] === solution[p.b] }));

  // Start from the full solution and strip clues while the answer stays unique.
  const given = Int8Array.from(solution);
  for (const i of shuffle([...given.keys()], rand)) {
    const v = given[i];
    given[i] = EMPTY;
    if (solve(given, n, cons, 2).length !== 1) given[i] = v;
  }

  // Drop constraints that carry no information.
  const keep = [];
  for (let k = 0; k < cons.length; k++) {
    if (solve(given, n, keep.concat(cons.slice(k + 1)), 2).length !== 1) keep.push(cons[k]);
  }
  cons = keep;

  return { n, given, cons, solution };
}
