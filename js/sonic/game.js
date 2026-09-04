import { setup, fmtTime } from '../lib/canvas.js';
import { PAL, md, drawText, pixelDisc, pixelRingEllipse, ditherBands, checker, drawSprite, HERO_IDLE, HERO_RUN } from './art.js';
import { createPlayer, BODY, step, launch } from './physics.js';
import { buildLevel } from './level.js';
import { createBoss, updateBoss, hitBoss, podHit, ballHit, drawBoss, drawBossBar } from './boss.js';

// The physics constants are Genesis pixels-per-frame, so the framebuffer is a
// Genesis-sized window of the world — drawn at 1:1 and blown up by SCALE with
// nearest-neighbour, which is what makes it read as 16-bit rather than as vector art.
const VW = 448, VH = 252, SCALE = 2, FRAME = 1000 / 60;
const canvas = document.getElementById('game');
const ctx = setup(canvas, VW, VH, SCALE);

let level, p, cam, loose, rings, score, frames, state, invuln, bonus, boss;

function reset() {
  level = buildLevel();
  p = createPlayer(level.start.x, level.start.y);
  cam = { x: 0, y: p.y - VH * 0.68 };
  loose = [];
  rings = 0;
  score = 0;
  frames = 0;
  invuln = 0;
  bonus = null;
  boss = null;
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
      x: p.x, y: p.y, life: 300, got: false,
      vx: Math.cos(angle) * speed * (i % 2 ? -1 : 1),
      vy: -Math.sin(angle) * speed,
    });
    if (i % 2) angle += Math.PI / 8;
    if (i === 15) { speed = 2; angle = Math.PI * 0.5625; }
  }
}

function collide() {
  const cx = p.x, cy = p.y;
  const feet = p.y + BODY.half;
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
    if (p.ysp >= 0 && Math.abs(s.x - p.x) < 26 && Math.abs(s.y - feet) < 30) {
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
    if (Math.abs(s.x - p.x) < 22 && feet > s.y - 40 && feet < s.y + 12) hurt();
  }

  if (boss && !boss.gone && boss.state !== 'dying') {
    // The ball is never safe. The pod is, but only while curled up.
    if (ballHit(boss, cx, cy, 15)) hurt();
    else if (podHit(boss, cx, cy, 15)) {
      if (p.roll || !p.ground) {
        if (hitBoss(boss)) {
          score += 200;
          p.ysp = -6;
          p.ground = false;
          p.jumping = false;
        }
      } else hurt();
    }
  }

  if (level.goal.shown && !level.goal.hit && Math.abs(p.x - level.goal.x) < 34) {
    level.goal.hit = true;
    state = 'clear';
    const time = Math.max(0, 9000 - Math.floor(frames / 60) * 60);
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

    const arena = level.arena;
    if (!boss && p.x > arena.trigger) boss = createBoss(arena);
    if (boss) {
      updateBoss(boss, arena);
      if (boss.gone) level.goal.shown = true;
      else {
        // Walled in until it is scrap. Running at the wall should stop you dead,
        // not pin you to it with the speed still stored up.
        const held = Math.max(arena.x0 + 24, Math.min(arena.x1 - 24, p.x));
        if (held !== p.x) { p.x = held; p.gsp = 0; p.xsp = 0; }
      }
    }
    collide();
  } else if (state === 'clear') {
    // Victory lap: keep running right until the level runs out.
    step(p, { left: false, right: p.x < level.length - 60, down: false, jumpPressed: false, jumpHeld: false }, level);
  }

  for (const e of level.enemies) {
    if (e.dead) continue;
    e.x += e.dir * e.speed;
    if (Math.abs(e.x - e.home) > e.range) { e.dir *= -1; e.x = e.home + Math.sign(e.x - e.home) * e.range; }
    e.y = level.groundAt(e.x);
  }
  for (const s of level.springs) if (s.squash > 0) s.squash--;
  for (const l of loose) {
    l.vy += 0.28;
    l.x += l.vx;
    l.y += l.vy;
    const g = level.groundAt(l.x) - 9;
    if (l.y > g) { l.y = g; l.vy *= -0.72; l.vx *= 0.95; }
    l.life--;
  }
  loose = loose.filter((l) => l.life > 0 && !l.got);
  level.goal.spin += level.goal.hit ? 0.35 : 0;

  // The fight is framed as one fixed screen; everywhere else the camera trails the player.
  const fighting = boss && !boss.gone;
  const target = fighting ? level.arena.x0 : p.x - VW * 0.42;
  cam.x += (target - cam.x) * (fighting ? 0.1 : 0.18);
  cam.x = Math.max(0, Math.min(level.length - VW, cam.x));
  // The pod hovers high, so the fight needs more sky in frame than running does.
  const camY = fighting ? level.arena.floor - VH * 0.78 : p.y - VH * 0.68;
  cam.y += (camY - cam.y) * (p.ground || fighting ? 0.09 : 0.05);
}

/* ---------------------------------------------------------------- render */

const rect = (x, y, w, h, colour) => { ctx.fillStyle = colour; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

function backdrop() {
  ditherBands(ctx, VW, 0, VH, [
    md(1, 3, 7), md(2, 4, 7), md(3, 5, 7), md(4, 6, 7), md(5, 7, 7),
  ]);

  for (let i = 0; i < 7; i++) {
    const span = VW + 130;
    const x = Math.round(((i * 97 - cam.x * 0.10) % span + span) % span - 65);
    const y = 16 + ((i * 29) % 46);
    cloud(x, y);
  }

  const lift = Math.max(-20, Math.min(20, (cam.y - 120) * 0.1));
  hills(0.22, PAL.farHill, PAL.farHillLit, 22, VH * 0.56 - lift, 150);
  hills(0.45, PAL.midHill, PAL.midHillLit, 30, VH * 0.72 - lift, 104);
}

function cloud(x, y) {
  rect(x, y, 26, 5, PAL.cloud);
  rect(x + 5, y - 4, 15, 5, PAL.cloud);
  rect(x + 11, y - 7, 9, 4, PAL.cloud);
  rect(x - 5, y + 3, 34, 4, PAL.cloud);
  rect(x - 5, y + 6, 30, 2, PAL.cloudShade);
}

function hills(factor, colour, lit, amp, base, period) {
  const off = cam.x * factor;
  ctx.fillStyle = colour;
  for (let x = 0; x < VW; x++) {
    const t = (x + off) / period;
    const y = Math.round(base + Math.sin(t) * amp + Math.sin(t * 2.7) * amp * 0.3);
    ctx.fillRect(x, y, 1, VH - y);
  }
  // A lit rim along the top edge gives the band some form without any gradient.
  ctx.fillStyle = lit;
  for (let x = 0; x < VW; x++) {
    const t = (x + off) / period;
    const y = Math.round(base + Math.sin(t) * amp + Math.sin(t * 2.7) * amp * 0.3);
    ctx.fillRect(x, y, 1, 2);
  }
}

function terrain() {
  const x0 = Math.max(0, Math.floor(cam.x) - 24);
  const x1 = Math.min(level.length, Math.ceil(cam.x) + VW + 24);
  const floor = cam.y + VH + 200;

  const groundPath = () => {
    ctx.beginPath();
    ctx.moveTo(x0, floor);
    for (let x = x0; x <= x1; x += 2) ctx.lineTo(x, Math.round(level.groundAt(x)));
    ctx.lineTo(x1, floor);
    ctx.closePath();
  };

  // Checkerboard dirt, clipped to the terrain so the pattern belongs to the world and
  // scrolls with it rather than sliding across the screen.
  ctx.save();
  groundPath();
  ctx.clip();
  checker(ctx, x0, cam.y, x1, floor, 16, PAL.dirtA, PAL.dirtB);
  ctx.fillStyle = PAL.dirtEdge;
  for (let x = x0; x <= x1; x++) {
    const g = Math.round(level.groundAt(x));
    ctx.fillRect(x, g + 22, 1, 1);
    if ((x >> 3) % 3 === 0) ctx.fillRect(x, g + 40, 1, 1);
  }
  ctx.restore();

  // The grass cap: bright top, solid body, dark under-edge.
  for (let x = x0; x <= x1; x++) {
    const g = Math.round(level.groundAt(x));
    rect(x, g, 1, 9, PAL.grass);
    rect(x, g, 1, 2, PAL.grassLit);
    rect(x, g + 9, 1, 2, PAL.grassDark);
  }

  for (const l of level.loops) {
    if (l.x < x0 - l.outer || l.x > x1 + l.outer) continue;
    loopArt(l);
  }
}

function loopArt(l) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(l.x, l.y, l.outer, 0, Math.PI * 2);
  ctx.arc(l.x, l.y, l.inner, 0, Math.PI * 2, true); // reverse winding cuts the hole
  ctx.clip();
  checker(ctx, l.x - l.outer, l.y - l.outer, l.x + l.outer, l.y + l.outer, 16, PAL.dirtA, PAL.dirtB);
  ctx.restore();

  // The running surface is the inside face, so that is where the grass goes.
  for (let a = 0; a < 360; a += 0.4) {
    const rad = (a * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    for (let d = 0; d < 9; d++) {
      ctx.fillStyle = d < 2 ? PAL.grassLit : d < 8 ? PAL.grass : PAL.grassDark;
      ctx.fillRect(Math.round(l.x + cos * (l.inner + d)), Math.round(l.y + sin * (l.inner + d)), 1, 1);
    }
    ctx.fillStyle = PAL.dirtEdge;
    ctx.fillRect(Math.round(l.x + cos * (l.outer - 1)), Math.round(l.y + sin * (l.outer - 1)), 1, 1);
  }
}

function drawRing(x, y, phase) {
  const rx = Math.max(2, Math.round(7 * Math.abs(Math.cos(phase))));
  pixelRingEllipse(ctx, x, y, rx, 8, 2, PAL.ring);
  pixelRingEllipse(ctx, x, y - 1, Math.max(1, rx - 1), 6, 1, PAL.ringLit);
  ctx.fillStyle = PAL.ringDark;
  ctx.fillRect(Math.round(x) + rx - 2, Math.round(y) + 2, 2, 3);
}

function objects() {
  const t = frames * 0.11;
  for (const r of level.rings) if (!r.got) drawRing(r.x, r.y, t);
  for (const l of loose) if (l.life > 20 || Math.floor(l.life / 3) % 2) drawRing(l.x, l.y, t * 1.6);

  for (const s of level.spikes) {
    rect(s.x - 12, s.y - 4, 24, 5, PAL.metalDark);
    for (let k = -1; k <= 1; k++) {
      for (let row = 0; row < 11; row++) {
        const half = Math.max(1, Math.round((11 - row) * 0.32));
        rect(s.x + k * 8 - half, s.y - 4 - row, half * 2, 1, row < 6 ? PAL.metal : PAL.metalDark);
      }
    }
  }

  for (const s of level.springs) {
    const squash = s.squash > 0 ? 5 : 0;
    rect(s.x - 11, s.y - 6 + squash, 22, 6, md(6, 1, 1));
    for (let k = 0; k < 3; k++) rect(s.x - 8, s.y - 9 - k * 3 + squash, 16, 2, PAL.metal);
    rect(s.x - 13, s.y - 17 + squash, 26, 5, PAL.hudGold);
    rect(s.x - 13, s.y - 17 + squash, 26, 2, PAL.ringLit);
  }

  for (const e of level.enemies) {
    if (e.dead) continue;
    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(e.y));
    ctx.scale(e.dir, 1);
    rect(-11, -18, 22, 9, md(6, 1, 1));
    rect(-11, -18, 22, 2, md(7, 3, 2));
    rect(-9, -22, 15, 5, PAL.metalDark);
    rect(6, -21, 3, 3, PAL.hudGold);
    rect(-7, -27, 2, 6, PAL.metalDark);
    pixelDisc(ctx, -6, -21, 2, md(6, 1, 1));
    pixelDisc(ctx, -6, -5, 5, PAL.metalDark);
    pixelDisc(ctx, 6, -5, 5, PAL.metalDark);
    pixelDisc(ctx, -6, -5, 2, PAL.metal);
    pixelDisc(ctx, 6, -5, 2, PAL.metal);
    ctx.restore();
  }

  if (boss && !boss.gone) {
    const a = level.arena;
    for (const x of [a.x0 + 8, a.x1 - 8]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 9, a.floor - 110, 18, 110);
      ctx.clip();
      checker(ctx, x - 9, a.floor - 110, x + 9, a.floor, 16, PAL.dirtA, PAL.dirtB);
      ctx.restore();
      rect(x - 9, a.floor - 110, 2, 110, PAL.dirtEdge);
      rect(x + 7, a.floor - 110, 2, 110, PAL.dirtEdge);
      rect(x - 9, a.floor - 112, 18, 3, PAL.grass);
    }
  }

  const g = level.goal;
  if (!g.shown) return;
  rect(g.x - 1, g.y - 52, 3, 52, PAL.metal);
  const spin = Math.max(0.12, Math.abs(Math.cos(g.spin)));
  const w = Math.round(20 * spin);
  rect(g.x - w, g.y - 44, w * 2, 26, PAL.white);
  rect(g.x - w, g.y - 44, w * 2, 2, PAL.metal);
  pixelDisc(ctx, g.x, g.y - 31, Math.max(2, Math.round(9 * spin)), g.hit ? PAL.blue : md(6, 1, 1));
  if (spin > 0.5) drawText(ctx, g.hit ? 'OK' : 'GO', g.x, g.y - 35, { colour: PAL.white, align: 'centre' });
}

/* ------------------------------------------------------------------- the hero */

function drawBall(spin) {
  pixelDisc(ctx, 0, 0, 13, PAL.blue);
  ctx.save();
  ctx.rotate(spin);
  ctx.fillStyle = PAL.blueLit;
  for (let k = 0; k < 3; k++) {
    const a = k * 2.09;
    for (let s = 0; s < 7; s++) {
      const r = 4 + s;
      ctx.fillRect(Math.round(Math.cos(a + s * 0.16) * r), Math.round(Math.sin(a + s * 0.16) * r), 2, 2);
    }
  }
  ctx.restore();
  pixelDisc(ctx, 8, 2, 4, PAL.shoe);
  pixelDisc(ctx, 8, 2, 2, PAL.shoeLit);
}

const drawStanding = (speed, flip) => drawSprite(ctx, speed > 0.7 ? HERO_RUN : HERO_IDLE, flip);

function hero() {
  if (invuln > 0 && Math.floor(frames / 4) % 2) return;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  if (p.ground) ctx.rotate(-Math.round((p.angle * 8) / Math.PI) * (Math.PI / 8)); // snapped, like a sprite
  if (p.charging) {
    drawBall(frames * 0.9);
    ctx.fillStyle = PAL.white;
    for (let k = 0; k < 3; k++) ctx.fillRect(-18 - k * 6, 8 - k * 2, 4 - k, 2);
  } else if (p.roll || !p.ground) {
    const spd = p.ground ? p.gsp : p.xsp;
    drawBall(frames * (0.18 + Math.abs(spd) * 0.05) * (spd < 0 ? -1 : 1));
  } else {
    drawStanding(Math.abs(p.gsp), p.face);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------- HUD */

function hud() {
  const rows = [
    ['ANILLOS', String(rings), rings === 0 && Math.floor(frames / 8) % 2 ? md(7, 2, 2) : PAL.hudGold],
    ['TIEMPO', fmtTime((frames / 60) * 1000), PAL.white],
    ['PUNTOS', String(score), PAL.white],
  ];
  rows.forEach(([k, v, colour], i) => {
    drawText(ctx, k, 8, 8 + i * 10, { colour: PAL.hudGold, shadow: PAL.hudShadow });
    drawText(ctx, v, 56, 8 + i * 10, { colour, shadow: PAL.hudShadow });
  });

  const w = 84;
  rect(VW - w - 8, 8, w, 5, PAL.hudShadow);
  rect(VW - w - 8, 8, Math.max(3, Math.min(w, (w * p.x) / level.goal.x)), 5, PAL.hudGold);

  if (boss && !boss.gone && boss.state !== 'enter') {
    drawText(ctx, 'EGGMOBILE', VW / 2, VH - 26, { colour: PAL.hudGold, shadow: PAL.hudShadow, align: 'centre' });
    drawBossBar(ctx, boss, VW / 2 - 52, VH - 16, 104);
  }
}

function panel(lines) {
  ctx.fillStyle = 'rgba(8,12,32,.72)';
  ctx.fillRect(0, 0, VW, VH);
  const gap = (l) => (l.big ? 16 : 11);
  const total = lines.reduce((sum, l) => sum + gap(l), 0);
  let y = Math.round(VH / 2 - total / 2);
  for (const l of lines) {
    drawText(ctx, l.text, VW / 2, y, {
      colour: l.colour ?? PAL.white,
      scale: l.big ? 2 : 1,
      shadow: PAL.hudShadow,
      align: 'centre',
    });
    y += gap(l);
  }
}

function overlay() {
  if (state === 'title') {
    panel([
      { text: 'BLUE BLUR', big: true, colour: PAL.hudGold },
      { text: '', },
      { text: 'ACTO 1 · COLINAS' },
      { text: '' },
      { text: 'FLECHAS CORRER · ESPACIO SALTAR' },
      { text: 'ABAJO RODAR · ABAJO+SALTO RULO' },
      { text: '' },
      { text: 'PULSA SALTAR PARA EMPEZAR', colour: md(4, 6, 7) },
    ]);
  } else if (state === 'dead') {
    panel([
      { text: 'GAME OVER', big: true, colour: md(7, 2, 2) },
      { text: '' },
      { text: 'SIN ANILLOS NO HAY SEGUNDA VEZ' },
      { text: 'SALTAR O R PARA REINTENTAR', colour: md(4, 6, 7) },
    ]);
  } else if (state === 'clear' && bonus) {
    panel([
      { text: 'ACTO SUPERADO', big: true, colour: PAL.hudGold },
      { text: '' },
      { text: `TIEMPO ${fmtTime((frames / 60) * 1000)}  BONUS ${bonus.time}` },
      { text: `ANILLOS ${rings}  BONUS ${bonus.rings}` },
      { text: '' },
      { text: `PUNTAJE ${score}`, colour: md(4, 6, 7) },
      { text: 'R PARA VOLVER A CORRER' },
    ]);
  }
}

function render() {
  backdrop();
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  terrain();
  objects();
  if (boss) drawBoss(ctx, boss);
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
