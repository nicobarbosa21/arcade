// The act: a height profile for the running, plus rings of solid for the loops, all
// rasterised into a tile world at build time. See tiles.js for how the fields work.
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

// Descents can be as steep as they like — they are the fun part. Climbs cannot: past
// ~22° the slope drains speed faster than running adds it, so a player who arrives with
// no momentum is stuck for good. See the walkability test.
//
// The two flat stretches are deliberate: a loop needs level ground to sit tangent to,
// with a run-up long enough to reach the speed that carries you round.
const SEGMENTS = [
  { type: 'flat', len: 620 },
  { type: 'bumps', len: 1000, amp: 45, n: 2 },
  { type: 'valley', len: 760, amp: 76 },
  { type: 'hill', len: 1100, amp: 110 },
  { type: 'slope', len: 360, dy: 150 },
  { type: 'flat', len: 900 },            // loop 1 sits here
  { type: 'slope', len: 620, dy: -120 },
  { type: 'slope', len: 200, dy: 300 },
  { type: 'bumps', len: 900, amp: 40, n: 2 },
  { type: 'flat', len: 800 },            // loop 2
  { type: 'slope', len: 640, dy: -110 },
  { type: 'hill', len: 1200, amp: 120 },
  { type: 'flat', len: 1800 },           // the tail of this is the boss arena
];

const LOOPS = [{ x: 4290 }, { x: 6860 }];
const LOOP_INNER = 84, LOOP_OUTER = 132;

// The fight happens in exactly one screen, camera locked, the way the originals framed it.
export const ARENA_WIDTH = 448;

export function buildLevel() {
  const step = 4;
  const heights = buildGround(SEGMENTS, 380, step);
  const groundAt = sampler(heights, step);
  const length = (heights.length - 1) * step;

  const loops = LOOPS.map(({ x }) => ({
    x,
    y: groundAt(x) - LOOP_INNER,
    inner: LOOP_INNER,
    outer: LOOP_OUTER,
  }));

  // Layer 0 is bare ground: without it the run-up would walk straight into the outside
  // of a loop's ring. Layer 1 adds the rings, and a switcher at each tangent point moves
  // the player between the two.
  const ground = groundField(groundAt);
  const rings = loops.map((l) => ringField(l.x, l.y, l.inner, l.outer));
  const cols = Math.ceil(length / TILE) + 1;
  const rows = 54;

  const level = {
    world: buildWorld([ground, union(ground, ...rings)], cols, rows),
    length,
    groundAt,
    loops,
    switchers: loops.map((l) => ({ x: l.x, y: l.y, radius: l.outer + 12, layer: 1, needSpeed: 6 })),
  };

  /* --------------------------------------------------------------- the objects */

  const coins = [];
  const line = (x0, n, gap, lift) => {
    for (let i = 0; i < n; i++) coins.push({ x: x0 + i * gap, y: groundAt(x0 + i * gap) - lift, got: false });
  };
  const arc = (x0, n, gap, lift, height) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      coins.push({ x, y: groundAt(x) - lift - Math.sin((i / (n - 1)) * Math.PI) * height, got: false });
    }
  };
  // Rings hugging the inside of a loop, the reward for taking it fast enough.
  const around = (loop, from, to, count) => {
    for (let i = 0; i < count; i++) {
      const a = from + ((to - from) * i) / (count - 1);
      coins.push({
        x: loop.x + Math.cos(a) * (loop.inner - 22),
        y: loop.y + Math.sin(a) * (loop.inner - 22),
        got: false,
      });
    }
  };

  line(300, 5, 46, 40);
  arc(760, 7, 44, 40, 100);
  line(1700, 6, 44, 44);
  arc(1900, 6, 44, 36, 90);
  line(2500, 6, 44, 54);
  arc(2820, 7, 46, 40, 120);
  line(3520, 6, 42, 54);
  line(3900, 7, 46, 40);
  around(loops[0], -Math.PI * 0.9, Math.PI * 0.4, 9);
  line(4800, 6, 44, 44);
  arc(5180, 9, 50, 70, 180);   // the big drop
  line(5600, 6, 44, 40);
  arc(5900, 7, 44, 40, 110);
  line(6500, 6, 44, 44);
  around(loops[1], -Math.PI * 0.9, Math.PI * 0.4, 9);
  line(7400, 6, 44, 44);
  arc(7900, 8, 46, 40, 150);
  line(8400, 6, 44, 54);
  arc(9000, 8, 46, 40, 110);

  const springs = [
    { x: 2000, y: groundAt(2000), power: 11 },
    { x: 5900, y: groundAt(5900), power: 13 },
    { x: 9200, y: groundAt(9200), power: 11 },
  ];

  // Enemies and spikes go on flat or gently rolling ground only. On a climb you arrive
  // with no speed and no room to react, which reads as unfair rather than hard.
  const enemies = [900, 2600, 5650, 8300, 9700].map((x, i) => ({
    x, y: groundAt(x), home: x, range: 110 + i * 10,
    dir: i % 2 ? 1 : -1, speed: 0.9 + i * 0.08, dead: false,
  }));

  const spikes = [1450, 1486, 6000, 6036, 9400].map((x) => ({ x, y: groundAt(x) }));

  const arenaX0 = length - 600;
  const arena = {
    x0: arenaX0,
    x1: arenaX0 + ARENA_WIDTH,
    floor: groundAt(arenaX0 + ARENA_WIDTH / 2),
    trigger: arenaX0 + 120,
  };
  // A handful of rings on the arena floor: without them one mistake ends the run.
  for (let i = 0; i < 8; i++) {
    const x = arena.x0 + 60 + i * 42;
    coins.push({ x, y: groundAt(x) - 30, got: false });
  }

  // The goal post only drops once the boss is scrap.
  const goalX = (arena.x0 + arena.x1) / 2;
  const goal = { x: goalX, y: groundAt(goalX), spin: 0, hit: false, shown: false };

  return {
    ...level,
    rings: coins,
    springs,
    enemies,
    spikes,
    arena,
    goal,
    start: { x: 90, y: groundAt(90) - BODY.half },
  };
}
