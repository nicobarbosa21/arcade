import { setup, pointerPos, fmtTime } from '../lib/canvas.js';
import { generate, conflicts, isSolved, EMPTY, SUN, MOON } from './logic.js';

const SIZE = 540, PAD = 18, N = 6;
const C = {
  bg: '#ffffff', line: '#d4d4d8', given: '#f4f4f5', bad: '#fee2e2',
  sun: '#f59e0b', moon: '#4f46e5', ink: '#18181b', muted: '#71717a',
};

const canvas = document.getElementById('board');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const ctx = setup(canvas, SIZE, SIZE);

const cell = (SIZE - 2 * PAD) / N;
let puzzle, board, history = [], won = false, startedAt = 0, elapsed = 0;

const at = (r, c) => ({ x: PAD + c * cell, y: PAD + r * cell });

function newGame() {
  statusEl.textContent = 'Generando…';
  // Let the browser paint the message before the solver blocks the thread.
  setTimeout(() => {
    puzzle = generate(N);
    board = Int8Array.from(puzzle.given);
    history = [];
    won = false;
    startedAt = 0;
    elapsed = 0;
    statusEl.textContent = 'Tocá una casilla para poner sol, otra vez para luna.';
    draw();
  }, 16);
}

function set(i, v) {
  if (puzzle.given[i] !== EMPTY || won) return;
  history.push([i, board[i]]);
  board[i] = v;
  if (!startedAt) startedAt = Date.now();
  if (isSolved(board, N, puzzle.cons)) {
    won = true;
    elapsed = Date.now() - startedAt;
    statusEl.textContent = `¡Resuelto en ${fmtTime(elapsed)}!`;
  }
  draw();
}

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = pointerPos(canvas, e, SIZE, SIZE);
  const c = Math.floor((x - PAD) / cell), r = Math.floor((y - PAD) / cell);
  if (c < 0 || r < 0 || c >= N || r >= N) return;
  const i = r * N + c;
  const next = { [EMPTY]: SUN, [SUN]: MOON, [MOON]: EMPTY };
  set(i, e.button === 2 ? { [EMPTY]: MOON, [SUN]: EMPTY, [MOON]: SUN }[board[i]] : next[board[i]]);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.getElementById('new').onclick = newGame;
document.getElementById('undo').onclick = () => {
  const last = history.pop();
  if (!last) return;
  board[last[0]] = last[1];
  won = false;
  draw();
};
document.getElementById('clear').onclick = () => {
  board = Int8Array.from(puzzle.given);
  history = [];
  won = false;
  draw();
};

function drawSun(x, y, r, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, 7);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
}

function drawMoon(x, y, r, colour) {
  // Clip to the disc first, then punch the bite out with even-odd.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.clip();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.arc(x + r * 0.5, y - r * 0.22, r * 0.92, 0, 7);
  ctx.fill('evenodd');
  ctx.restore();
}

function draw() {
  const bad = conflicts(board, N, puzzle.cons);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c, { x, y } = at(r, c);
      const fill = bad.has(i) ? C.bad : puzzle.given[i] !== EMPTY ? C.given : C.bg;
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, cell - 1.5, cell - 1.5);

      const v = board[i];
      if (v === EMPTY) continue;
      const cx = x + cell / 2, cy = y + cell / 2, r0 = cell * 0.28;
      const colour = puzzle.given[i] !== EMPTY ? C.muted : v === SUN ? C.sun : C.moon;
      v === SUN ? drawSun(cx, cy, r0, colour) : drawMoon(cx, cy, r0 * 0.95, colour);
    }
  }

  ctx.font = `bold ${Math.round(cell * 0.3)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const k of puzzle.cons) {
    const ra = (k.a / N) | 0, ca = k.a % N;
    const horizontal = k.b === k.a + 1;
    const x = PAD + ca * cell + (horizontal ? cell : cell / 2);
    const y = PAD + ra * cell + (horizontal ? cell / 2 : cell);
    ctx.fillStyle = C.bg;
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.17, 0, 7);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.fillText(k.eq ? '=' : '×', x, y + 1);
  }

  ctx.strokeStyle = won ? '#16a34a' : C.ink;
  ctx.lineWidth = won ? 4 : 2;
  ctx.strokeRect(PAD - 1, PAD - 1, cell * N + 2, cell * N + 2);

  const left = [...board].filter((v) => v === EMPTY).length;
  timerEl.innerHTML = `<small>${fmtTime(won ? elapsed : startedAt ? Date.now() - startedAt : 0)} · faltan ${left}</small>`;
}

setInterval(() => { if (startedAt && !won) draw(); }, 500);
newGame();
