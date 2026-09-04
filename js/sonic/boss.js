// The act finale: a hovering pod dragging a wrecking ball on a chain, in the style of
// the very first boss of the 16-bit games. The pod sweeps the arena, the ball swings
// underneath it, and the only safe way in is from above while curled up.
//
// Geometry is tuned against the jump the physics actually gives you: a full jump lifts
// the feet 96px (jump² / 2·gravity), so the pod hovers at 128 and the ball hangs to 38 —
// head height for someone standing still. Move either number and the fight breaks.
export const BOSS = {
  maxHp: 8, hoverY: 128, chain: 90, swingAmp: 1.3,
  podW: 64, podH: 34, ballR: 17,
  hurtTime: 48, sweepSpeed: 1.15, margin: 96,
};

export const createBoss = (arena) => ({
  x: arena.x1 + 140,
  y: arena.floor - BOSS.hoverY,
  dir: -1,
  hp: BOSS.maxHp,
  state: 'enter',
  t: 0,
  swing: 0,
  hurt: 0,
  fall: 0,
  gone: false,
  puffs: [],
});

/** Where the wrecking ball is right now. */
export function ballPos(b) {
  const a = Math.sin(b.swing) * BOSS.swingAmp;
  return { x: b.x + Math.sin(a) * BOSS.chain, y: b.y + Math.cos(a) * BOSS.chain };
}

/** How much faster it gets as it takes damage — the classic difficulty ramp. */
export const rage = (b) => 1 + (BOSS.maxHp - b.hp) * 0.10;

export function updateBoss(b, arena) {
  b.t++;
  for (const puff of b.puffs) { puff.t++; puff.x += puff.vx; puff.y += puff.vy; puff.vy += 0.12; }
  b.puffs = b.puffs.filter((puff) => puff.t < 40);

  if (b.state === 'dying') {
    b.fall += 0.3;
    b.y += b.fall;
    b.x += 1.4;
    if (b.t % 9 === 0) {
      b.puffs.push({
        x: b.x + (Math.random() - 0.5) * 60, y: b.y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, t: 0,
      });
    }
    if (b.t > 140) b.gone = true;
    return b;
  }

  if (b.hurt > 0) b.hurt--;

  if (b.state === 'enter') {
    b.x -= 3.4;
    if (b.x <= arena.x1 - 150) b.state = 'sweep';
  } else {
    b.x += b.dir * BOSS.sweepSpeed * rage(b);
    if (b.x < arena.x0 + BOSS.margin) { b.x = arena.x0 + BOSS.margin; b.dir = 1; }
    if (b.x > arena.x1 - BOSS.margin) { b.x = arena.x1 - BOSS.margin; b.dir = -1; }
  }
  b.y = arena.floor - BOSS.hoverY + Math.sin(b.t * 0.028) * 12;
  b.swing += 0.036 * rage(b);
  return b;
}

/** @returns true if the hit landed (it is ignored while flashing, arriving or dying). */
export function hitBoss(b) {
  if (b.hurt > 0 || b.state !== 'sweep') return false;
  b.hp--;
  b.hurt = BOSS.hurtTime;
  for (let i = 0; i < 6; i++) {
    b.puffs.push({
      x: b.x, y: b.y, t: 0,
      vx: Math.cos((i / 6) * Math.PI * 2) * 2.4,
      vy: Math.sin((i / 6) * Math.PI * 2) * 2.4,
    });
  }
  if (b.hp <= 0) { b.state = 'dying'; b.t = 0; b.fall = -2.5; }
  return true;
}

export const podHit = (b, cx, cy, r) =>
  Math.abs(cx - b.x) < BOSS.podW / 2 + r && Math.abs(cy - b.y) < BOSS.podH / 2 + r;

export function ballHit(b, cx, cy, r) {
  const ball = ballPos(b);
  return (ball.x - cx) ** 2 + (ball.y - cy) ** 2 < (BOSS.ballR + r) ** 2;
}

/* ------------------------------------------------------------------ drawing */

import { PAL, md, pixelDisc } from './art.js';

const rect = (ctx, x, y, w, h, colour) => {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

export function drawBoss(ctx, b) {
  for (const puff of b.puffs) {
    const k = 1 - puff.t / 40;
    pixelDisc(ctx, puff.x, puff.y, 2 + (1 - k) * 8, k > 0.6 ? md(7, 7, 4) : k > 0.3 ? md(7, 4, 0) : md(5, 1, 0));
  }
  if (b.gone) return;

  const ball = ballPos(b);
  const flashing = b.hurt > 0 && Math.floor(b.hurt / 4) % 2 === 1;

  // Chain: discrete links, not a dashed line.
  const links = 7;
  for (let i = 1; i < links; i++) {
    const t = i / links;
    rect(ctx, b.x + (ball.x - b.x) * t - 1, b.y + 6 + (ball.y - b.y - 6) * t - 1, 3, 3, PAL.metal);
  }

  // The wrecking ball, with blunt spikes around it.
  ctx.fillStyle = PAL.metalDark;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + b.swing * 0.5;
    for (let s = 0; s < 6; s++) {
      const w = Math.max(1, 4 - Math.round(s * 0.6));
      ctx.fillRect(
        Math.round(ball.x + Math.cos(a) * (BOSS.ballR - 2 + s) - w / 2),
        Math.round(ball.y + Math.sin(a) * (BOSS.ballR - 2 + s) - w / 2), w, w,
      );
    }
  }
  pixelDisc(ctx, ball.x, ball.y, BOSS.ballR - 2, md(2, 2, 3));
  pixelDisc(ctx, ball.x - 4, ball.y - 4, 4, PAL.metalDark);
  pixelDisc(ctx, ball.x - 5, ball.y - 5, 2, PAL.metal);

  ctx.save();
  ctx.translate(Math.round(b.x), Math.round(b.y));

  // Thruster flame under the pod.
  for (let i = 0; i < 3; i++) {
    const h = 3 + ((b.t + i * 3) % 4);
    rect(ctx, -9 + i * 8, 15, 4, h, md(4, 6, 7));
    rect(ctx, -9 + i * 8, 15, 4, 2, PAL.white);
  }

  const shell = flashing ? PAL.white : PAL.metal;
  const shellDark = flashing ? PAL.white : PAL.metalDark;
  rect(ctx, -30, 2, 60, 8, shell);
  rect(ctx, -30, 2, 60, 2, PAL.white);
  rect(ctx, -24, 10, 48, 5, shellDark);
  rect(ctx, -16, 15, 32, 2, shellDark);

  // The glass dome, and the pilot behind it.
  const hull = flashing ? md(7, 6, 6) : md(6, 1, 1);
  for (let dy = 0; dy < 18; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (dy / 18) ** 2)) * 21);
    rect(ctx, -w, -dy + 2, w * 2, 1, dy > 14 ? hull : 'rgba(150,205,255,.30)');
  }

  ctx.save();
  ctx.scale(b.dir < 0 ? 1 : -1, 1);
  pixelDisc(ctx, 0, -6, 10, PAL.skin);
  rect(ctx, -11, -13, 20, 4, md(2, 2, 3));      // goggles strap
  rect(ctx, -9, -11, 7, 4, md(4, 5, 6));        // lens
  rect(ctx, -1, -11, 7, 4, md(4, 5, 6));
  rect(ctx, -12, -3, 10, 4, flashing ? PAL.white : md(5, 4, 2)); // moustache
  rect(ctx, 1, -3, 9, 3, flashing ? PAL.white : md(5, 4, 2));
  ctx.restore();

  // Dome outline last so it reads as glass in front of the pilot.
  ctx.fillStyle = 'rgba(210,240,255,.55)';
  for (let dy = 0; dy < 18; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (dy / 18) ** 2)) * 21);
    ctx.fillRect(-w, -dy + 2, 1, 1);
    ctx.fillRect(w - 1, -dy + 2, 1, 1);
  }
  rect(ctx, -13, -14, 5, 1, PAL.white);

  ctx.restore();
}

/** Eight pips, one per hit left. */
export function drawBossBar(ctx, b, x, y, w) {
  rect(ctx, x - 2, y - 2, w + 4, 9, md(1, 1, 2));
  const step = w / BOSS.maxHp;
  for (let i = 0; i < BOSS.maxHp; i++) {
    rect(ctx, x + i * step, y, step - 2, 5, i < b.hp ? md(7, 2, 1) : md(2, 2, 3));
    if (i < b.hp) rect(ctx, x + i * step, y, step - 2, 1, md(7, 5, 3));
  }
}
