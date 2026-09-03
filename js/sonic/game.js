import { setup, fmtTime } from '../lib/canvas.js';
import { createPlayer, heightAt, step, launch } from './physics.js';
import { buildLevel } from './level.js';

const W = 896, H = 504, FRAME = 1000 / 60;
const canvas = document.getElementById('game');
const ctx = setup(canvas, W, H);

let level, p, cam, loose, rings, score, frames, state, invuln, bonus;

function reset() {
  level = buildLevel();
  p = createPlayer(level.start.x, level.start.y);
  cam = { x: 0, y: p.y - H * 0.62 };
  loose = [];
  rings = 0;
  score = 0;
  frames = 0;
  invuln = 0;
  bonus = null;
  state = 'title';
}

/* ---------------------------------------------------------------- input */

const held = { left: false, right: false, down: false, jump: false };
let jumpEdge = false;

const KEYMAP = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', z: 'jump', Z: 'jump',
};

addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') { reset(); state = 'play'; return; }
  const k = KEYMAP[e.key];
  if (!k) return;
  e.preventDefault();
  if (k === 'jump' && !held.jump) jumpEdge = true;
  held[k] = true;
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.key];
  if (k) held[k] = false;
});

for (const b of document.querySelectorAll('#pad button')) {
  const k = b.dataset.key;
  const on = (e) => { e.preventDefault(); if (k === 'jump' && !held.jump) jumpEdge = true; held[k] = true; };
  const off = () => { held[k] = false; };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
}
document.getElementById('restart').onclick = () => { reset(); state = 'play'; canvas.focus(); };
canvas.addEventListener('pointerdown', () => canvas.focus());

/* ---------------------------------------------------------------- update */

function hurt() {
  if (invuln > 0 || state !== 'play') return;
  if (rings > 0) {
    scatter(Math.min(rings, 20));
    rings = 0;
    invuln = 120;
    p.ysp = -4;
    p.xsp = -2 * p.face;
    p.ground = false;
    p.roll = false;
    p.jumping = false;
    p.charging = false;
  } else {
    state = 'dead';
    p.ysp = -7;
    p.ground = false;
  }
}

// Rings burst out in a fan, half of them mirrored, the outer ring slower.
function scatter(n) {
  let angle = Math.PI * 0.5625, speed = 4;
  for (let i = 0; i < n; i++) {
    loose.push({
      x: p.x, y: p.y - 20, life: 300, got: false,
      vx: Math.cos(angle) * speed * (i % 2 ? -1 : 1),
      vy: -Math.sin(angle) * speed,
    });
    if (i % 2) angle += Math.PI / 8;
    if (i === 15) { speed = 2; angle = Math.PI * 0.5625; }
  }
}

function collide() {
  const cx = p.x, cy = p.y - 20;
  const near = (ax, ay, r) => (ax - cx) ** 2 + (ay - cy) ** 2 < r * r;

  // Rings use a generous box, the way the originals did — missing one you ran through feels bad.
  const grabbed = (ax, ay) => Math.abs(ax - cx) < 26 && Math.abs(ay - cy) < 30;
  for (const r of level.rings) {
    if (!r.got && grabbed(r.x, r.y)) { r.got = true; rings++; score += 10; }
  }
  for (const l of loose) {
    if (!l.got && l.life < 260 && grabbed(l.x, l.y)) { l.got = true; rings++; score += 10; }
  }
  for (const s of level.springs) {
    // Only while coming down or standing on it, otherwise the launch retriggers itself.
    if (p.ysp >= 0 && Math.abs(s.x - p.x) < 26 && Math.abs(s.y - p.y) < 44) {
      launch(p, s.power);
      s.squash = 10;
    }
  }
  for (const e of level.enemies) {
    if (e.dead || !near(e.x, e.y - 14, 30)) continue;
    if (p.roll || !p.ground) {
      e.dead = true;
      score += 100;
      p.ysp = -5;
      p.ground = false;
      p.jumping = false;
    } else hurt();
  }
  for (const s of level.spikes) {
    if (Math.abs(s.x - p.x) < 22 && p.y > s.y - 44 && p.y < s.y + 8) hurt();
  }
  if (!level.goal.hit && Math.abs(p.x - level.goal.x) < 34) {
    level.goal.hit = true;
    state = 'clear';
    const time = Math.max(0, 6000 - Math.floor(frames / 60) * 60);
    bonus = { time, rings: rings * 100 };
    score += time + bonus.rings;
  }
}

function update() {
  const input = {
    left: held.left, right: held.right, down: held.down,
    jumpPressed: jumpEdge, jumpHeld: held.jump,
  };
  jumpEdge = false;

  if (state === 'title' && input.jumpPressed) state = 'play';
  else if (state === 'dead') {
    if (input.jumpPressed) { reset(); state = 'play'; }
    else { p.ysp = Math.min(16, p.ysp + 0.22); p.y += p.ysp; }
  }

  if (state === 'play') {
    frames++;
    if (invuln > 0) invuln--;
    step(p, input, level);
    collide();
  } else if (state === 'clear') {
    // Victory lap: keep running right until the level runs out.
    step(p, { left: false, right: p.x < level.length - 60, down: false, jumpPressed: false, jumpHeld: false }, level);
  }

  for (const e of level.enemies) {
    if (e.dead) continue;
    e.x += e.dir * e.speed;
    if (Math.abs(e.x - e.home) > e.range) { e.dir *= -1; e.x = e.home + Math.sign(e.x - e.home) * e.range; }
    e.y = heightAt(level, e.x);
  }
  for (const s of level.springs) if (s.squash > 0) s.squash--;
  for (const l of loose) {
    l.vy += 0.28;
    l.x += l.vx;
    l.y += l.vy;
    const g = heightAt(level, l.x) - 9;
    if (l.y > g) { l.y = g; l.vy *= -0.72; l.vx *= 0.95; }
    l.life--;
  }
  loose = loose.filter((l) => l.life > 0 && !l.got);
  level.goal.spin += level.goal.hit ? 0.35 : 0;

  cam.x += (p.x - W * 0.42 - cam.x) * 0.18;
  cam.x = Math.max(0, Math.min(level.length - W, cam.x));
  cam.y += (p.y - H * 0.62 - cam.y) * (p.ground ? 0.09 : 0.05);
}

/* ---------------------------------------------------------------- render */

const disc = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
const oval = (x, y, rx, ry, fill) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, 7);
  if (fill) ctx.fillStyle = fill;
  ctx.fill();
};

function backdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2f9ae8');
  sky.addColorStop(1, '#b6e6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 6; i++) {
    const x = ((i * 340 - cam.x * 0.12) % (W + 260) + W + 260) % (W + 260) - 130;
    const y = 40 + ((i * 61) % 90);
    oval(x, y, 46, 17);
    oval(x + 30, y - 9, 32, 15);
    oval(x - 28, y + 3, 26, 12);
  }

  const lift = Math.max(-40, Math.min(40, (cam.y - 200) * 0.1));
  hills(0.22, '#5fbf7e', 46, H * 0.56 - lift, 210);
  hills(0.45, '#3f9f5f', 62, H * 0.72 - lift, 150);
}

function hills(factor, colour, amp, base, period) {
  const off = cam.x * factor;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    const t = (x + off) / period;
    ctx.lineTo(x, base + Math.sin(t) * amp + Math.sin(t * 2.7) * amp * 0.3);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function terrain() {
  const x0 = Math.max(0, cam.x - 24), x1 = Math.min(level.length, cam.x + W + 24);
  const floor = cam.y + H + 260;

  ctx.beginPath();
  ctx.moveTo(x0, floor);
  for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, heightAt(level, x));
  ctx.lineTo(x1, floor);
  ctx.closePath();
  ctx.fillStyle = '#8a5a2b';
  ctx.fill();

  const band = (offset, colour, width, dash) => {
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 8) {
      const y = heightAt(level, x) + offset;
      x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  };

  band(12, '#3fbf5f', 24);
  band(2, '#7ee08f', 5);
  band(44, '#6b4522', 3, [26, 22]);
  band(78, '#6b4522', 3, [18, 34]);
}

function drawRing(x, y, phase) {
  const squash = Math.max(0.14, Math.abs(Math.cos(phase)));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squash, 1);
  ctx.strokeStyle = '#f5c518';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, 7);
  ctx.stroke();
  ctx.strokeStyle = '#fff2ab';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 9, -2.3, -1.3);
  ctx.stroke();
  ctx.restore();
}

function objects() {
  const t = frames * 0.11;
  for (const r of level.rings) if (!r.got) drawRing(r.x, r.y, t);
  for (const l of loose) if (l.life > 20 || Math.floor(l.life / 3) % 2) drawRing(l.x, l.y, t * 1.6);

  for (const s of level.spikes) {
    ctx.fillStyle = '#9aa2ad';
    ctx.beginPath();
    for (let k = -1; k <= 1; k++) {
      ctx.moveTo(s.x + k * 12 - 7, s.y);
      ctx.lineTo(s.x + k * 12, s.y - 22);
      ctx.lineTo(s.x + k * 12 + 7, s.y);
    }
    ctx.fill();
    ctx.fillStyle = '#5c6470';
    ctx.fillRect(s.x - 20, s.y - 5, 40, 6);
  }

  for (const s of level.springs) {
    const squash = s.squash > 0 ? 8 : 0;
    ctx.fillStyle = '#c22a2a';
    ctx.fillRect(s.x - 20, s.y - 10, 40, 10);
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const y = s.y - 12 - k * 4 + squash * (k / 3);
      ctx.moveTo(s.x - 15, y);
      ctx.lineTo(s.x + 15, y - 2);
    }
    ctx.stroke();
    ctx.fillStyle = '#f5c518';
    ctx.fillRect(s.x - 22, s.y - 30 + squash, 44, 9);
  }

  for (const e of level.enemies) {
    if (e.dead) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.dir, 1);
    ctx.fillStyle = '#2b2f36';
    ctx.beginPath();
    ctx.roundRect(-16, -26, 32, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.roundRect(-13, -30, 26, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#f5c518';
    disc(9, -25, 3);
    ctx.strokeStyle = '#2b2f36';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -30);
    ctx.lineTo(-12, -38);
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    disc(-12, -39, 3);
    ctx.fillStyle = '#3a4049';
    disc(-8, -7, 7);
    disc(8, -7, 7);
    ctx.fillStyle = '#8d949d';
    disc(-8, -7, 3);
    disc(8, -7, 3);
    ctx.restore();
  }

  const g = level.goal;
  ctx.fillStyle = '#b8bec7';
  ctx.fillRect(g.x - 3, g.y - 96, 6, 96);
  ctx.save();
  ctx.translate(g.x, g.y - 76);
  ctx.scale(Math.max(0.12, Math.abs(Math.cos(g.spin))), 1);
  ctx.fillStyle = '#f2f4f7';
  ctx.beginPath();
  ctx.roundRect(-26, -20, 52, 40, 6);
  ctx.fill();
  ctx.fillStyle = g.hit ? '#2456e0' : '#c0392b';
  disc(0, 0, 13);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g.hit ? '★' : 'GO', 0, 1);
  ctx.restore();
}

function drawBall(spin) {
  ctx.save();
  ctx.rotate(spin);
  ctx.fillStyle = '#1e46c8';
  disc(0, 0, 18);
  ctx.strokeStyle = '#5c8bff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(0, 0, 10, k * 2.09, k * 2.09 + 1.05);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8503a';
  disc(12, 2, 5);
  ctx.restore();
}

function drawStanding(speed) {
  ctx.fillStyle = '#1a3ea8';
  ctx.beginPath();
  ctx.moveTo(-4, -9); ctx.lineTo(-25, -15); ctx.lineTo(-6, -1);
  ctx.moveTo(-4, -1); ctx.lineTo(-27, -2); ctx.lineTo(-5, 6);
  ctx.moveTo(-3, 5); ctx.lineTo(-23, 12); ctx.lineTo(-4, 12);
  ctx.fill();

  ctx.fillStyle = '#2456e0';
  disc(0, 0, 15);

  oval(8, 4, 9, 7, '#f7cfa4');
  oval(5, -5, 5, 6.5, '#ffffff');
  oval(12.5, -5, 4.5, 6, '#ffffff');
  oval(6, -4, 2, 2.7, '#1b2138');
  oval(13, -4, 2, 2.7, '#1b2138');
  ctx.fillStyle = '#232323';
  disc(15, 1, 2.4);

  if (speed > 0.7) {
    // Legs move too fast to see — the classic blurred figure of eight.
    oval(1, 17, 15, 6, '#e8503a');
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(1, 17, 15, 6, 0, 0, 7);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#e8503a';
    ctx.beginPath();
    ctx.roundRect(-12, 11, 13, 10, 4);
    ctx.roundRect(2, 11, 14, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-12, 15, 13, 3);
    ctx.fillRect(2, 15, 14, 3);
  }
  ctx.fillStyle = '#ffffff';
  disc(-3, 9, 4.5);
}

function hero() {
  if (invuln > 0 && Math.floor(frames / 4) % 2) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.ground) ctx.rotate(-p.angle);
  ctx.translate(0, -19);
  if (p.charging) {
    drawBall(frames * 0.9);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let k = 0; k < 3; k++) disc(-24 - k * 9, 14 - k * 2, 6 - k * 1.4);
  } else if (p.roll || !p.ground) {
    const spd = p.ground ? p.gsp : p.xsp;
    drawBall(frames * (0.18 + Math.abs(spd) * 0.05) * (spd < 0 ? -1 : 1));
  } else {
    ctx.scale(p.face, 1);
    drawStanding(Math.abs(p.gsp));
  }
  ctx.restore();
}

function label(text, x, y, size, colour) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(10,20,50,.55)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function hud() {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const rows = [
    ['ANILLOS', String(rings), rings === 0 && Math.floor(frames / 8) % 2 ? '#ff6b6b' : '#ffd94a'],
    ['TIEMPO', fmtTime((frames / 60) * 1000), '#ffffff'],
    ['PUNTOS', String(score), '#ffffff'],
  ];
  rows.forEach(([k, v, colour], i) => {
    label(k, 18, 16 + i * 26, 19, '#ffd94a');
    label(v, 132, 16 + i * 26, 19, colour);
  });

  // Progress through the act.
  const w = 180;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.roundRect(W - w - 18, 18, w, 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.roundRect(W - w - 18, 18, Math.max(6, Math.min(w, (w * p.x) / level.goal.x)), 10, 5);
  ctx.fill();
}

function panel(lines) {
  ctx.fillStyle = 'rgba(8,16,40,.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = H / 2 - (lines.length - 1) * 20;
  lines.forEach((l, i) => label(l.text, W / 2, top + i * (l.size > 30 ? 52 : 30), l.size, l.colour || '#ffffff'));
}

function overlay() {
  if (state === 'title') {
    panel([
      { text: 'BLUE BLUR', size: 54, colour: '#ffd94a' },
      { text: 'ACTO 1 · COLINAS', size: 22 },
      { text: '← → correr · espacio saltar · ↓ rodar · ↓+salto rulo de carga', size: 17 },
      { text: 'Pulsá saltar para empezar', size: 20, colour: '#8fd0ff' },
    ]);
  } else if (state === 'dead') {
    panel([
      { text: 'GAME OVER', size: 52, colour: '#ff6b6b' },
      { text: 'Sin anillos no hay segunda oportunidad', size: 18 },
      { text: 'Saltar o R para reintentar', size: 20, colour: '#8fd0ff' },
    ]);
  } else if (state === 'clear' && bonus) {
    panel([
      { text: '¡ACTO SUPERADO!', size: 46, colour: '#ffd94a' },
      { text: `Tiempo ${fmtTime((frames / 60) * 1000)} · bonus ${bonus.time}`, size: 20 },
      { text: `Anillos ${rings} · bonus ${bonus.rings}`, size: 20 },
      { text: `Puntaje ${score}`, size: 26, colour: '#8fd0ff' },
      { text: 'R para volver a correr', size: 18 },
    ]);
  }
}

function render() {
  backdrop();
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  terrain();
  objects();
  hero();
  ctx.restore();
  hud();
  overlay();
}

let acc = 0, last = performance.now();
function loop(now) {
  acc += Math.min(200, now - last);
  last = now;
  while (acc >= FRAME) { update(); acc -= FRAME; }
  render();
  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
