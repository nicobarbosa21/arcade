// Genesis-style momentum physics: acceleration, slopes, rolling, spin dash.
// Constants are the classic ones (pixels per frame at 60fps).
// Screen y grows downward; `angle` uses the maths convention, so a positive angle
// means the ground climbs to the right.
export const P = {
  acc: 0.046875, dec: 0.5, frc: 0.046875, top: 6,
  air: 0.09375, grv: 0.21875, jump: 6.5, jumpCut: 4,
  slope: 0.125, slopeRollUp: 0.078125, slopeRollDown: 0.3125,
  rollFrc: 0.0234375, rollDec: 0.125, topRoll: 16,
  maxFall: 16, unroll: 0.5, slipSpeed: 2.5, slipAngle: 0.6,
};

export const createPlayer = (x, y) => ({
  x, y, gsp: 0, xsp: 0, ysp: 0, angle: 0,
  ground: true, roll: false, jumping: false, face: 1,
  charge: 0, charging: false, ctrlLock: 0,
});

/** Ground height at `x`, linearly interpolated between heightmap samples. */
export function heightAt(level, x) {
  const g = level.ground, s = level.step, last = g.length - 1;
  const t = Math.min(Math.max(x / s, 0), last);
  const i = Math.min(Math.floor(t), last - 1);
  return g[i] + (g[i + 1] - g[i]) * (t - i);
}

/** Surface angle in radians; positive climbs to the right. */
export function angleAt(level, x, d = 8) {
  return Math.atan2(heightAt(level, x - d) - heightAt(level, x + d), 2 * d);
}

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Advances the player by one 60fps frame. Mutates and returns `p`. */
export function step(p, input, level) {
  if (p.ctrlLock > 0) p.ctrlLock--;
  const free = p.ctrlLock === 0;
  const left = free && input.left, right = free && input.right, down = free && input.down;

  if (p.ground) {
    if (p.charging) {
      // Spin dash: tap jump to wind up, release down to fire.
      p.charge -= (p.charge / 0.125) / 256;
      if (input.jumpPressed) p.charge = Math.min(8, p.charge + 2);
      if (!input.down) {
        p.gsp = (8 + Math.floor(p.charge) / 2) * p.face;
        p.charging = false;
        p.roll = true;
        p.charge = 0;
      }
    } else if (down && Math.abs(p.gsp) < 0.5 && input.jumpPressed) {
      p.charging = true;
      p.charge = 2;
      p.roll = false;
      p.gsp = 0;
    } else {
      const uphill = sign(p.gsp) === sign(Math.sin(p.angle));
      const factor = p.roll ? (uphill ? P.slopeRollUp : P.slopeRollDown) : P.slope;
      p.gsp -= factor * Math.sin(p.angle);

      if (p.roll) {
        if (left && p.gsp > 0) p.gsp -= P.rollDec;
        else if (right && p.gsp < 0) p.gsp += P.rollDec;
        p.gsp -= Math.min(Math.abs(p.gsp), P.rollFrc) * sign(p.gsp);
        if (Math.abs(p.gsp) < P.unroll) p.roll = false;
      } else {
        // Note the one-sided clamps: pressing forward must never *shave off* speed
        // picked up on a slope, it just stops adding to it past the top speed.
        if (left) {
          p.face = -1;
          if (p.gsp > 0) p.gsp = p.gsp - P.dec <= 0 ? -0.5 : p.gsp - P.dec;
          else if (p.gsp > -P.top) p.gsp = Math.max(-P.top, p.gsp - P.acc);
        } else if (right) {
          p.face = 1;
          if (p.gsp < 0) p.gsp = p.gsp + P.dec >= 0 ? 0.5 : p.gsp + P.dec;
          else if (p.gsp < P.top) p.gsp = Math.min(P.top, p.gsp + P.acc);
        } else {
          p.gsp -= Math.min(Math.abs(p.gsp), P.frc) * sign(p.gsp);
        }
        if (down && Math.abs(p.gsp) >= 1) p.roll = true;
      }
      p.gsp = Math.max(-P.topRoll, Math.min(P.topRoll, p.gsp));

      if (input.jumpPressed && free) {
        const a = p.angle;
        p.xsp = p.gsp * Math.cos(a) - P.jump * Math.sin(a);
        p.ysp = -p.gsp * Math.sin(a) - P.jump * Math.cos(a);
        p.ground = false;
        p.jumping = true;
        p.roll = true;
      }
    }

    if (p.ground) {
      // Too slow on a steep face: lose control and slide back down.
      if (Math.abs(p.gsp) < P.slipSpeed && Math.abs(p.angle) > P.slipAngle && p.ctrlLock === 0) {
        p.ctrlLock = 30;
      }
      const nx = Math.max(0, Math.min(level.length, p.x + p.gsp * Math.cos(p.angle)));
      const ny = heightAt(level, nx);
      // Ground dropped away faster than we could follow it — launch.
      if (ny - p.y > Math.max(4, Math.abs(p.gsp))) {
        p.xsp = p.gsp * Math.cos(p.angle);
        p.ysp = -p.gsp * Math.sin(p.angle);
        p.ground = false;
        p.x = nx;
      } else {
        p.x = nx;
        p.y = ny;
        p.angle = angleAt(level, nx);
      }
    }
  }

  if (!p.ground) {
    if (left) { p.face = -1; p.xsp = Math.max(-P.top, p.xsp - P.air); }
    else if (right) { p.face = 1; p.xsp = Math.min(P.top, p.xsp + P.air); }

    if (p.jumping && !input.jumpHeld && p.ysp < -P.jumpCut) p.ysp = -P.jumpCut;
    if (p.ysp < 0 && p.ysp > -4) p.xsp -= (p.xsp / 0.125) / 256; // classic air drag

    p.ysp = Math.min(P.maxFall, p.ysp + P.grv);
    p.x = Math.max(0, Math.min(level.length, p.x + p.xsp));
    p.y += p.ysp;

    const gy = heightAt(level, p.x);
    if (p.ysp >= 0 && p.y >= gy) {
      const a = angleAt(level, p.x);
      p.y = gy;
      p.angle = a;
      p.ground = true;
      p.jumping = false;
      p.roll = false;
      p.gsp = p.xsp * Math.cos(a) - p.ysp * Math.sin(a);
      p.ysp = 0;
    }
  }
  return p;
}

/** Bounce off a spring: straight up, control kept. */
export function launch(p, power) {
  p.ysp = -power;
  p.ground = false;
  p.jumping = false;
  p.roll = false;
}
