// The acts: a height profile for the running, plus rings of solid for the loops, all
// rasterised into a tile world at build time. See tiles.js for how the fields work.
//
// Objects are placed by walking the segments and reacting to their shape rather than by
// hand-listing coordinates. That is what makes adding an act cheap: describe the terrain
// and the rings, springs and enemies arrange themselves around it.
import { BODY } from './physics.js';
import { buildWorld, groundField, ringField, union, TILE } from './tiles.js';

/* ------------------------------------------------------------ the ground profile */

const shapeAt = (s, t, y) => {
  switch (s.type) {
    case 'hill': return y - s.amp * Math.sin(Math.PI * t);
    case 'valley': return y + s.amp * Math.sin(Math.PI * t);
    case 'bumps': return y - (s.amp * (1 - Math.cos(2 * Math.PI * (s.n || 2) * t))) / 2;
    case 'slope': return y + (s.dy * (1 - Math.cos(Math.PI * t))) / 2;
    default: return y;
  }
};

const endY = (s, y) => (s.type === 'slope' ? y + s.dy : y);

export function buildGround(segments, y0 = 380, step = 4) {
  const out = [];
  let y = y0;
  for (const s of segments) {
    const count = Math.round(s.len / step);
    for (let i = 0; i < count; i++) out.push(shapeAt(s, i / count, y));
    y = endY(s, y);
  }
  out.push(y);
  return Float32Array.from(out);
}

/** Reads the profile back at any x, interpolating between samples. */
export const sampler = (heights, step) => (x) => {
  const last = heights.length - 1;
  const t = Math.min(Math.max(x / step, 0), last);
  const i = Math.min(Math.floor(t), last - 1);
  return heights[i] + (heights[i + 1] - heights[i]) * (t - i);
};

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ------------------------------------------------------------------- the acts */

// Descents can be as steep as they like — they are the fun part. Climbs cannot: past
// ~22° the slope drains speed faster than running adds it, so a player who arrives with
// no momentum is stuck for good. There is a test for it.
//
// `loops` are indices into `segments`: a loop needs level ground to sit tangent to, so it
// goes in the middle of a flat stretch with a run-up long enough to reach entry speed.
const ACTS = [
  {
    name: 'COLINAS',
    theme: 'colinas',
    seed: 11,
    boss: true,
    segments: [
      { type: 'flat', len: 620 },
      { type: 'bumps', len: 1000, amp: 45, n: 2 },
      { type: 'valley', len: 760, amp: 76 },
      { type: 'hill', len: 1100, amp: 110 },
      { type: 'slope', len: 360, dy: 150 },
      { type: 'flat', len: 900 },
      { type: 'slope', len: 620, dy: -120 },
      { type: 'slope', len: 200, dy: 300 },
      { type: 'bumps', len: 900, amp: 40, n: 2 },
      { type: 'flat', len: 800 },
      { type: 'slope', len: 640, dy: -110 },
      { type: 'hill', len: 1200, amp: 120 },
      { type: 'flat', len: 1800 },
    ],
    loops: [5, 9],
  },
  {
    name: 'CAVERNAS',
    theme: 'cavernas',
    seed: 23,
    boss: true,
    segments: [
      { type: 'flat', len: 520 },
      { type: 'slope', len: 420, dy: 180 },
      { type: 'bumps', len: 900, amp: 55, n: 3 },
      { type: 'valley', len: 700, amp: 70 },
      { type: 'flat', len: 820 },
      { type: 'slope', len: 260, dy: 260 },
      { type: 'bumps', len: 1000, amp: 60, n: 2 },
      { type: 'slope', len: 700, dy: -130 },
      { type: 'valley', len: 900, amp: 88 },
      { type: 'flat', len: 860 },
      { type: 'slope', len: 240, dy: 220 },
      { type: 'bumps', len: 1100, amp: 50, n: 3 },
      { type: 'slope', len: 820, dy: -150 },
      { type: 'flat', len: 1800 },
    ],
    loops: [4, 9],
  },
  {
    name: 'ATARDECER',
    theme: 'atardecer',
    seed: 37,
    boss: true,
    segments: [
      { type: 'flat', len: 700 },
      { type: 'slope', len: 300, dy: 240 },
      { type: 'flat', len: 880 },
      { type: 'hill', len: 1300, amp: 120 },
      { type: 'slope', len: 240, dy: 300 },
      { type: 'flat', len: 900 },
      { type: 'bumps', len: 1100, amp: 48, n: 2 },
      { type: 'slope', len: 900, dy: -170 },
      { type: 'valley', len: 800, amp: 78 },
      { type: 'flat', len: 860 },
      { type: 'slope', len: 260, dy: 280 },
      { type: 'bumps', len: 1200, amp: 55, n: 3 },
      { type: 'slope', len: 1000, dy: -190 },
      { type: 'flat', len: 1800 },
    ],
    loops: [2, 5, 9],
  },
];

export const ACT_COUNT = ACTS.length;
export const actName = (i) => ACTS[i % ACTS.length].name;

const LOOP_INNER = 84, LOOP_OUTER = 132;

// The fight happens in exactly one screen, camera locked, the way the originals framed it.
export const ARENA_WIDTH = 448;

/* ---------------------------------------------------------------- populating */

/**
 * Walks the segments and hangs objects off whatever shape it finds: rings arc over
 * hills and line the flats, springs sit at the bottom of valleys, enemies patrol level
 * ground. Hazards never go on a climb — you arrive there with no speed and no room to
 * react, which reads as unfair rather than hard.
 */
function populate(act, segments, groundAt, loops, arena) {
  const rand = rng(act.seed);
  const rings = [], springs = [], enemies = [], spikes = [];

  const line = (x0, n, gap, lift) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      rings.push({ x, y: groundAt(x) - lift, got: false });
    }
  };
  const arc = (x0, n, gap, lift, height) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      rings.push({ x, y: groundAt(x) - lift - Math.sin((i / (n - 1)) * Math.PI) * height, got: false });
    }
  };

  let at = 0;
  segments.forEach((s, i) => {
    const start = at, mid = at + s.len / 2, end = at + s.len;
    at = end;
    if (end > arena.x0 - 80) return; // the arena is furnished separately
    const isLoop = act.loops.includes(i);

    switch (s.type) {
      case 'flat': {
        if (isLoop) { line(start + 90, 5, 44, 42); break; }
        line(start + 120, 5 + Math.floor(rand() * 3), 44, 40);
        const count = s.len > 900 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const x = start + (s.len * (k + 1)) / (count + 1);
          enemies.push({ x, y: groundAt(x), home: x, range: 90 + rand() * 70, dir: rand() < 0.5 ? -1 : 1, speed: 0.9 + rand() * 0.5, dead: false });
        }
        if (s.len > 520) {
          const x = start + s.len * 0.8;
          spikes.push({ x, y: groundAt(x) }, { x: x + 36, y: groundAt(x + 36) });
        }
        break;
      }
      case 'hill': {
        arc(start + s.len * 0.25, 7, 46, 40, 110);
        const x = start + s.len * 0.5;
        enemies.push({ x, y: groundAt(x), home: x, range: 100, dir: 1, speed: 0.9 + rand() * 0.4, dead: false });
        break;
      }
      case 'valley':
        springs.push({ x: mid, y: groundAt(mid), power: 11 + Math.round(rand() * 2) });
        arc(start + s.len * 0.2, 6, 44, 36, 80);
        break;
      case 'bumps': {
        line(start + 140, 6, 44, 44);
        arc(start + s.len * 0.55, 6, 44, 40, 90);
        const x = start + s.len * 0.35;
        enemies.push({ x, y: groundAt(x), home: x, range: 110, dir: -1, speed: 1 + rand() * 0.4, dead: false });
        if (s.len > 950) {
          const sx = start + s.len * 0.82;
          spikes.push({ x: sx, y: groundAt(sx) });
        }
        break;
      }
      case 'slope':
        // Only the descents get rings — a climb is where you are slowest.
        if (s.dy > 0) arc(start + 60, 8, 48, 60, 150);
        break;
      default: break;
    }
  });

  // Rings hugging the inside of a loop, the reward for taking it fast enough.
  for (const loop of loops) {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.9 + (Math.PI * 1.3 * i) / 8;
      rings.push({
        x: loop.x + Math.cos(a) * (loop.inner - 22),
        y: loop.y + Math.sin(a) * (loop.inner - 22),
        got: false,
      });
    }
  }

  // A handful of rings on the arena floor: without them one mistake ends the run.
  for (let i = 0; i < 8; i++) {
    const x = arena.x0 + 60 + i * 42;
    rings.push({ x, y: groundAt(x) - 30, got: false });
  }

  return { rings, springs, enemies, spikes };
}

/* -------------------------------------------------------------------- building */

export function buildLevel(index = 0) {
  const act = ACTS[index % ACTS.length];
  const step = 4;
  const heights = buildGround(act.segments, 380, step);
  const groundAt = sampler(heights, step);
  const length = (heights.length - 1) * step;

  // A loop's x is the middle of the flat segment it was assigned to.
  const offsets = [];
  act.segments.reduce((sum, s) => { offsets.push(sum); return sum + s.len; }, 0);
  const loops = act.loops.map((i) => {
    const x = offsets[i] + act.segments[i].len / 2;
    return { x, y: groundAt(x) - LOOP_INNER, inner: LOOP_INNER, outer: LOOP_OUTER };
  });

  // Layer 0 is bare ground: without it the run-up would walk straight into the outside
  // of a loop's ring. Layer 1 adds the rings, and a switcher at each tangent point moves
  // the player between the two.
  const ground = groundField(groundAt);
  const cols = Math.ceil(length / TILE) + 1;

  const arenaX0 = length - 600;
  const arena = {
    x0: arenaX0,
    x1: arenaX0 + ARENA_WIDTH,
    floor: groundAt(arenaX0 + ARENA_WIDTH / 2),
    trigger: arenaX0 + 120,
  };

  const { rings, springs, enemies, spikes } = populate(act, act.segments, groundAt, loops, arena);

  // The goal post only drops once the boss is scrap.
  const goalX = (arena.x0 + arena.x1) / 2;

  return {
    index: index % ACTS.length,
    name: act.name,
    theme: act.theme,
    world: buildWorld([ground, union(ground, ...loops.map((l) => ringField(l.x, l.y, l.inner, l.outer)))], cols, 60),
    length,
    groundAt,
    loops,
    switchers: loops.map((l) => ({ x: l.x, y: l.y, radius: l.outer + 12, layer: 1, needSpeed: 6 })),
    rings,
    springs,
    enemies,
    spikes,
    arena,
    goal: { x: goalX, y: groundAt(goalX), spin: 0, hit: false, shown: false },
    start: { x: 90, y: groundAt(90) - BODY.half },
  };
}
