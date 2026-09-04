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
  hurtTime: 48, sweepSpeed: 1.15, margin: 130,
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
export const rage = (b) => 1 + (BOSS.maxHp - b.hp) * 0.14;

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
    if (b.x <= arena.x1 - 190) b.state = 'sweep';
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

const disc = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };

export function drawBoss(ctx, b) {
  for (const puff of b.puffs) {
    const k = 1 - puff.t / 40;
    ctx.fillStyle = `rgba(${255},${140 + k * 90},${40},${k})`;
    disc(ctx, puff.x, puff.y, 4 + (1 - k) * 14);
  }
  if (b.gone) return;

  const ball = ballPos(b);
  const flashing = b.hurt > 0 && Math.floor(b.hurt / 4) % 2 === 1;

  ctx.strokeStyle = '#9aa2ad';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + 8);
  ctx.lineTo(ball.x, ball.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#4a5058';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + b.swing * 0.5;
    ctx.beginPath();
    ctx.moveTo(ball.x + Math.cos(a) * BOSS.ballR * 0.8, ball.y + Math.sin(a) * BOSS.ballR * 0.8);
    ctx.lineTo(ball.x + Math.cos(a + 0.28) * BOSS.ballR * 0.8, ball.y + Math.sin(a + 0.28) * BOSS.ballR * 0.8);
    ctx.lineTo(ball.x + Math.cos(a + 0.14) * BOSS.ballR * 1.45, ball.y + Math.sin(a + 0.14) * BOSS.ballR * 1.45);
    ctx.fill();
  }
  ctx.fillStyle = '#3a4049';
  disc(ctx, ball.x, ball.y, BOSS.ballR);
  ctx.fillStyle = '#6d757f';
  disc(ctx, ball.x - 5, ball.y - 5, 5);

  ctx.save();
  ctx.translate(b.x, b.y);

  ctx.fillStyle = 'rgba(120,190,255,.5)';
  for (let i = 0; i < 3; i++) disc(ctx, -14 + i * 14, 22 + Math.sin(b.t * 0.4 + i) * 3, 6 - i * 0.6);

  ctx.fillStyle = flashing ? '#ffffff' : '#c8ced6';
  ctx.beginPath();
  ctx.ellipse(0, 8, BOSS.podW / 2, 15, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = flashing ? '#ffffff' : '#9aa2ad';
  ctx.beginPath();
  ctx.ellipse(0, 12, BOSS.podW / 2 - 4, 8, 0, 0, 7);
  ctx.fill();

  ctx.fillStyle = flashing ? '#ffd0d0' : '#d94b3a';
  ctx.beginPath();
  ctx.ellipse(0, -2, 24, 20, 0, Math.PI, 0);
  ctx.fill();

  // The pilot, behind the glass.
  ctx.save();
  ctx.scale(b.dir < 0 ? 1 : -1, 1);
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.ellipse(0, -6, 13, 11, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath();
  ctx.ellipse(-3, -11, 11, 4, -0.15, 0, 7);
  ctx.fill();
  ctx.fillStyle = flashing ? '#ffffff' : '#8b6a4a';
  ctx.beginPath();
  ctx.ellipse(-9, -2, 8, 4, 0.3, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(3, -1, 7, 3.5, -0.25, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#1b2138';
  disc(ctx, -6, -9, 2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(180,225,255,.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, -2, 24, 20, 0, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -2, 17, Math.PI * 1.15, Math.PI * 1.45);
  ctx.stroke();

  ctx.restore();
}

/** Eight pips, one per hit left. */
export function drawBossBar(ctx, b, x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 6, w + 12, 20, 6);
  ctx.fill();
  const step = w / BOSS.maxHp;
  for (let i = 0; i < BOSS.maxHp; i++) {
    ctx.fillStyle = i < b.hp ? '#e8503a' : 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.roundRect(x + i * step, y, step - 5, 8, 3);
    ctx.fill();
  }
}
