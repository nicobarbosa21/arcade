import { setup, pointerPos, fmtTime } from '../lib/canvas.js';
import { makePuzzle, canStep, validate, wallKey } from './logic.js';

const SIZE = 540, PAD = 16;
const C = {
  bg: '#ffffff', grid: '#e4e4e7', wall: '#18181b', path: '#3b82f6',
  mark: '#18181b', markText: '#ffffff', done: '#16a34a',
};

const canvas = document.getElementById('board');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const ctx = setup(canvas, SIZE, SIZE);

let puzzle, path = [], dragging = false, won = false, startedAt = 0, elapsed = 0;

const cell = () => (SIZE - 2 * PAD) / puzzle.size;
const centre = (i) => {
  const s = cell();
  return { x: PAD + (i % puzzle.size) * s + s / 2, y: PAD + ((i / puzzle.size) | 0) * s + s / 2 };
};
const cellAt = (x, y) => {
  const s = cell(), cx = Math.floor((x - PAD) / s), cy = Math.floor((y - PAD) / s);
  if (cx < 0 || cy < 0 || cx >= puzzle.size || cy >= puzzle.size) return -1;
  return cy * puzzle.size + cx;
};

function newGame() {
  const size = Number(document.getElementById('size').value);
  const total = size * size;
  puzzle = makePuzzle({ size, checkpoints: Math.round(total / 4.5), walls: size });
  path = [];
  won = false;
  startedAt = 0;
  elapsed = 0;
  say('Arrastrá desde el 1 para dibujar el camino.');
  draw();
}

const say = (msg) => { statusEl.textContent = msg; };

function push(i) {
  if (won) return;
  if (!canStep(puzzle, path, i)) return;
  if (!path.length) startedAt = Date.now();
  path.push(i);
  if (path.length === puzzle.size * puzzle.size && validate(puzzle, path)) {
    won = true;
    elapsed = Date.now() - startedAt;
    say(`¡Resuelto en ${fmtTime(elapsed)}!`);
  }
  draw();
}

function pointerTo(i) {
  if (i < 0) return;
  const at = path.indexOf(i);
  if (at >= 0) { path.length = at + 1; draw(); return; } // backtrack
  push(i);
}

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = pointerPos(canvas, e, SIZE, SIZE);
  const i = cellAt(x, y);
  if (i < 0) return;
  canvas.setPointerCapture(e.pointerId);
  dragging = true;
  pointerTo(i);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const { x, y } = pointerPos(canvas, e, SIZE, SIZE);
  pointerTo(cellAt(x, y));
});
const stop = () => { dragging = false; };
canvas.addEventListener('pointerup', stop);
canvas.addEventListener('pointercancel', stop);

const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
window.addEventListener('keydown', (e) => {
  const d = KEYS[e.key];
  if (!d) return;
  e.preventDefault();
  const head = path.at(-1);
  if (head === undefined) {
    const first = Object.keys(puzzle.marks).find((k) => puzzle.marks[k] === 1);
    push(Number(first));
    return;
  }
  const x = (head % puzzle.size) + d[0], y = ((head / puzzle.size) | 0) + d[1];
  if (x < 0 || y < 0 || x >= puzzle.size || y >= puzzle.size) return;
  pointerTo(y * puzzle.size + x);
});

document.getElementById('new').onclick = newGame;
document.getElementById('size').onchange = newGame;
document.getElementById('reset').onclick = () => {
  path = [];
  won = false;
  startedAt = 0;
  say('Arrastrá desde el 1 para dibujar el camino.');
  draw();
};

function draw() {
  const s = cell(), n = puzzle.size;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1.5;
  for (let k = 0; k <= n; k++) {
    const p = PAD + k * s + 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD, p); ctx.lineTo(SIZE - PAD, p);
    ctx.moveTo(p, PAD); ctx.lineTo(p, SIZE - PAD);
    ctx.stroke();
  }

  if (path.length > 1) {
    ctx.strokeStyle = won ? C.done : C.path;
    ctx.lineWidth = s * 0.5;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    path.forEach((c, k) => {
      const { x, y } = centre(c);
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  } else if (path.length === 1) {
    const { x, y } = centre(path[0]);
    ctx.fillStyle = C.path;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.25, 0, 7);
    ctx.fill();
  }

  // Walls sit on the edge shared by the two cells they separate.
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const key of puzzle.walls) {
    const [a, b] = key.split(':').map(Number);
    const ax = a % n, ay = (a / n) | 0;
    const left = PAD + ax * s, top = PAD + ay * s;
    ctx.beginPath();
    if (b === a + 1) { ctx.moveTo(left + s, top + 4); ctx.lineTo(left + s, top + s - 4); }
    else { ctx.moveTo(left + 4, top + s); ctx.lineTo(left + s - 4, top + s); }
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(s * 0.36)}px system-ui, sans-serif`;
  for (const [key, num] of Object.entries(puzzle.marks)) {
    const { x, y } = centre(Number(key));
    ctx.fillStyle = C.mark;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.3, 0, 7);
    ctx.fill();
    ctx.fillStyle = C.markText;
    ctx.fillText(num, x, y + 1);
  }

  const filled = path.length;
  timerEl.innerHTML = `<small>${fmtTime(won ? elapsed : startedAt ? Date.now() - startedAt : 0)} · ${filled}/${n * n}</small>`;
}

setInterval(() => { if (startedAt && !won) draw(); }, 500);
newGame();
