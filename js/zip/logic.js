// Zip: draw one path that fills every cell and hits the numbers in order.
// Pure logic — no DOM, so tests can import it directly.
import { shuffle } from '../lib/rng.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const neighbors = (i, n) => {
  const x = i % n, y = (i / n) | 0, out = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < n && ny >= 0 && ny < n) out.push(ny * n + nx);
  }
  return out;
};

export const wallKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Random Hamiltonian path over an n×n grid (randomized DFS, pruned by connectivity). */
export function hamiltonianPath(n, rand = Math.random) {
  const total = n * n;
  const visited = new Uint8Array(total);
  const path = [];
  let budget = 400000;

  // The grid is bipartite. With an odd cell count one colour has one cell more, and
  // a path must both start and end on it — starting anywhere else is hopeless.
  const starts = [];
  for (let i = 0; i < total; i++) {
    if (total % 2 === 0 || ((i % n) + ((i / n) | 0)) % 2 === 0) starts.push(i);
  }

  // Two prunes, both cheap and both decisive:
  //  · the unvisited cells must stay one blob reachable from `cur`
  //  · a cell you can only enter once is a dead end, so it has to be the final cell —
  //    two of those and the path is already doomed.
  const viable = (cur) => {
    const left = total - path.length;
    if (left === 0) return true;
    const seed = neighbors(cur, n).find((k) => !visited[k]);
    if (seed === undefined) return false;

    let terminals = 0;
    for (let i = 0; i < total; i++) {
      if (visited[i]) continue;
      const nb = neighbors(i, n);
      const links = nb.filter((k) => !visited[k]).length + (nb.includes(cur) ? 1 : 0);
      if (links === 0) return false;
      if (links === 1 && ++terminals > 1) return false;
    }

    const seen = new Uint8Array(total);
    const stack = [seed];
    seen[seed] = 1;
    let count = 1;
    while (stack.length) {
      for (const k of neighbors(stack.pop(), n)) {
        if (!visited[k] && !seen[k]) { seen[k] = 1; count++; stack.push(k); }
      }
    }
    return count === left;
  };

  const dfs = (cur) => {
    if (budget-- < 0) throw new Error('budget');
    visited[cur] = 1;
    path.push(cur);
    if (path.length === total) return true;
    if (viable(cur)) {
      for (const k of shuffle(neighbors(cur, n).filter((j) => !visited[j]), rand)) {
        if (dfs(k)) return true;
      }
    }
    visited[cur] = 0;
    path.pop();
    return false;
  };

  for (const start of shuffle(starts, rand)) {
    budget = 200000;
    try {
      if (dfs(start)) return path;
    } catch {
      path.length = 0;
      visited.fill(0);
    }
  }
  throw new Error('no hamiltonian path');
}

/** @returns {{size:number, marks:Object<number,number>, walls:Set<string>, solution:number[]}} */
export function makePuzzle({ size = 6, checkpoints = 8, walls = 5, rand = Math.random } = {}) {
  const total = size * size;
  let path;
  for (let tries = 0; ; tries++) {
    try { path = hamiltonianPath(size, rand); break; } catch (e) {
      if (tries > 20) throw e;
    }
  }

  // Spread checkpoints along the solution; first and last are pinned to the ends.
  const k = Math.max(2, Math.min(checkpoints, total));
  const gap = (total - 1) / (k - 1);
  const positions = [0];
  for (let i = 1; i < k - 1; i++) {
    const jitter = Math.round((rand() - 0.5) * gap * 0.6);
    const p = Math.round(i * gap) + jitter;
    positions.push(Math.min(total - 2 - (k - 1 - i), Math.max(positions[i - 1] + 1, p)));
  }
  positions.push(total - 1);

  const marks = {};
  positions.forEach((p, i) => { marks[path[p]] = i + 1; });

  // Walls may only sit between cells the solution does not traverse consecutively.
  const order = new Int32Array(total);
  path.forEach((c, i) => { order[c] = i; });
  const candidates = [];
  for (let i = 0; i < total; i++) {
    for (const j of neighbors(i, size)) {
      if (j > i && Math.abs(order[i] - order[j]) !== 1) candidates.push([i, j]);
    }
  }
  const wallSet = new Set(shuffle(candidates, rand).slice(0, walls).map(([a, b]) => wallKey(a, b)));

  return { size, marks, walls: wallSet, solution: path };
}

export const canMove = (p, a, b) =>
  neighbors(a, p.size).includes(b) && !p.walls.has(wallKey(a, b));

/** Can the player extend `path` (array of cells) onto `to`? */
export function canStep(p, path, to) {
  if (path.length === 0) return p.marks[to] === 1;
  if (path.includes(to)) return false;
  if (!canMove(p, path[path.length - 1], to)) return false;
  const mark = p.marks[to];
  if (mark === undefined) return true;
  const hit = path.reduce((n, c) => n + (p.marks[c] !== undefined ? 1 : 0), 0);
  return mark === hit + 1;
}

/** Full-solution check: covers the grid, legal moves, checkpoints in ascending order. */
export function validate(p, path) {
  const total = p.size * p.size;
  if (path.length !== total || new Set(path).size !== total) return false;
  for (let i = 1; i < path.length; i++) if (!canMove(p, path[i - 1], path[i])) return false;
  let next = 1;
  for (const c of path) if (p.marks[c] !== undefined && p.marks[c] !== next++) return false;
  return next - 1 === Object.keys(p.marks).length;
}
