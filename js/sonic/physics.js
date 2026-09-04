// Genesis-style momentum physics: acceleration, slopes, rolling, spin dash.
// Constants are the classic ones (pixels per frame at 60fps).
//
// Screen y grows downward; `angle` uses the maths convention, so a positive angle means
// the ground climbs to the right, 90° is a wall running straight up and 180° is a ceiling.
//
// Collision is by sensors against a tile world (see tiles.js). The player carries a
// sensor `mode` telling it which way is down for them right now — that is the whole trick
// behind running around the inside of a loop: the movement code below never changes, only
// the direction its sensors point.
import { cast, groundSensors, modeFor, MODES } from './tiles.js';

export const P = {
  acc: 0.046875, dec: 0.5, frc: 0.046875, top: 6,
  air: 0.09375, grv: 0.21875, jump: 6.5, jumpCut: 4,
  slope: 0.125, slopeRollUp: 0.078125, slopeRollDown: 0.3125,
  rollFrc: 0.0234375, rollDec: 0.125, topRoll: 16,
  maxFall: 16, unroll: 0.5, slipSpeed: 2.5, slipAngle: 0.6,
};

/** Body metrics, in pixels from the centre. The originals used 19 and 9. */
export const BODY = { half: 19, width: 9, push: 11, snap: 14 };

export const createPlayer = (x, y) => ({
  x, y,               // the centre of the body, not the feet
  gsp: 0, xsp: 0, ysp: 0, angle: 0,
  ground: true, roll: false, jumping: false, face: 1,
  charge: 0, charging: false, ctrlLock: 0,
  mode: 0,            // which way is "down" for the sensors
  layer: 0,           // which solid map to collide against
});

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

const clampToLevel = (p, level) => {
  p.x = Math.max(0, Math.min(level.length, p.x));
};

/** Slides the player along their mode's down axis. */
function shift(p, mode, amount) {
  const { down } = MODES[mode];
  p.x += down[0] * amount;
  p.y += down[1] * amount;
}

/** The surface under the feet, measured from the centre. */
const findGround = (level, p, mode) =>
  groundSensors(level.world, p.layer, p.x, p.y, mode, BODY.width, BODY.half + 20);

/**
 * Layer switchers, the trick that makes loops possible at all.
 *
 * A loop's ring is solid material, so approaching it along the ground you would just
 * walk into its outer face. So the ground layer has no ring on it; crossing the
 * switcher — a vertical line at the point where the ring is tangent to the floor —
 * moves the player onto the layer that does, and they curve up its inside.
 *
 * Coming back round to the bottom crosses the same line and drops them back to the
 * ground layer, which is what lets them leave instead of looping for ever. The check
 * only fires upright and on the ground, so passing the line upside down at the top of
 * the loop is ignored.
 */
function applySwitchers(level, p, previousX) {
  if (!level.switchers) return;

  // A loop's layer only means anything near that loop. Anywhere else, drop back to the
  // ground: without this, jumping inside a ring could strand the player on a layer whose
  // solid walls surround them.
  if (p.layer !== 0) {
    const nearby = level.switchers.some(
      (s) => s.layer === p.layer && Math.hypot(p.x - s.x, p.y - s.y) <= s.radius,
    );
    if (!nearby) p.layer = 0;
  }

  if (!p.ground || p.mode !== 0) return;
  for (const s of level.switchers) {
    const crossed = (previousX < s.x && p.x >= s.x) || (previousX > s.x && p.x <= s.x);
    if (!crossed) continue;
    if (p.layer === s.layer) p.layer = 0;
    else if (Math.abs(p.gsp) >= (s.needSpeed ?? 0)) p.layer = s.layer;
  }
}

/** Stops the player walking into vertical faces. Only meaningful upright. */
function pushOffWalls(level, p) {
  if (p.mode !== 0) return;
  for (const [mode, dir] of [[1, 1], [3, -1]]) {
    const hit = cast(level.world, p.layer, p.x, p.y, mode, BODY.push);
    if (!hit.hit || hit.distance >= BODY.push) continue;
    shift(p, mode, hit.distance - BODY.push);
    if (p.ground) { if (sign(p.gsp) === dir) p.gsp = 0; }
    else if (sign(p.xsp) === dir) p.xsp = 0;
  }
}

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
        p.mode = 0;
      }
    }

    if (p.ground) {
      // Travel along the surface, then let the sensors say where that landed us.
      const previousX = p.x;
      p.x += p.gsp * Math.cos(p.angle);
      p.y -= p.gsp * Math.sin(p.angle);
      clampToLevel(p, level);
      applySwitchers(level, p, previousX);
      pushOffWalls(level, p);

      const hit = findGround(level, p, p.mode);
      const gap = hit.hit ? hit.distance - BODY.half : Infinity;
      if (gap > BODY.snap) {
        // The ground fell away faster than we could follow it — launch.
        p.xsp = p.gsp * Math.cos(p.angle);
        p.ysp = -p.gsp * Math.sin(p.angle);
        p.ground = false;
        p.mode = 0;
      } else {
        shift(p, p.mode, gap);
        p.angle = hit.angle;
        p.mode = modeFor(p.angle);
        // Too slow on a steep face: lose control and slide back down. Off the floor
        // entirely — up a wall or under a ceiling — losing speed drops you outright,
        // which is exactly why a loop has to be taken at pace.
        if (Math.abs(p.gsp) < P.slipSpeed) {
          if (p.mode !== 0) {
            p.ground = false;
            p.gsp = 0;
            p.mode = 0;
            p.ctrlLock = 30;
          } else if (Math.abs(p.angle) > P.slipAngle && p.ctrlLock === 0) {
            p.ctrlLock = 30;
          }
        }
      }
    }
  }

  if (!p.ground) {
    // Same one-sided clamp as on the ground: steering in the air must never shave off
    // speed you jumped in with. A plain Math.min here drops a 10px/frame run to 6 the
    // instant you leave the ground, which is enough to make a loop unenterable.
    if (left) { p.face = -1; if (p.xsp > -P.top) p.xsp = Math.max(-P.top, p.xsp - P.air); }
    else if (right) { p.face = 1; if (p.xsp < P.top) p.xsp = Math.min(P.top, p.xsp + P.air); }

    if (p.jumping && !input.jumpHeld && p.ysp < -P.jumpCut) p.ysp = -P.jumpCut;
    if (p.ysp < 0 && p.ysp > -4) p.xsp -= (p.xsp / 0.125) / 256; // classic air drag

    p.ysp = Math.min(P.maxFall, p.ysp + P.grv);
    p.x += p.xsp;
    p.y += p.ysp;
    clampToLevel(p, level);
    applySwitchers(level, p, p.x);
    pushOffWalls(level, p);

    if (p.ysp < 0) {
      const roof = cast(level.world, p.layer, p.x, p.y, 2, BODY.half + 4);
      if (roof.hit && roof.distance < BODY.half) {
        shift(p, 2, roof.distance - BODY.half);
        p.ysp = 0;
      }
    } else {
      const hit = findGround(level, p, 0);
      if (hit.hit && hit.distance <= BODY.half) {
        p.y += hit.distance - BODY.half;
        p.angle = hit.angle;
        p.mode = modeFor(p.angle);
        p.ground = true;
        p.jumping = false;
        p.roll = false;
        p.gsp = p.xsp * Math.cos(p.angle) - p.ysp * Math.sin(p.angle);
        p.ysp = 0;
      }
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
  p.mode = 0;
}
