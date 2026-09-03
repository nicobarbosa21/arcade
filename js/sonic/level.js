// The act is a heightmap plus a list of things sitting on it.
// A heightmap can't do loops (one ground height per x) — hills, ramps and
// launch curves only.
// ponytail: heightmap terrain, swap for tile/sensor collision if loops are ever wanted.
import { heightAt } from './physics.js';

const shapeAt = (s, t, y) => {
  switch (s.type) {
    case 'hill': return y - s.amp * Math.sin(Math.PI * t);
    case 'valley': return y + s.amp * Math.sin(Math.PI * t);
    case 'bumps': return y - (s.amp * (1 - Math.cos(2 * Math.PI * (s.n || 2) * t))) / 2;
    case 'slope': return y + (s.dy * (1 - Math.cos(Math.PI * t))) / 2;
    case 'ramp': return y - s.amp * t * t;
    default: return y;
  }
};

const endY = (s, y) => (s.type === 'slope' ? y + s.dy : s.type === 'ramp' ? y - s.amp : y);

export function buildGround(segments, y0 = 380, step = 8) {
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

// Descents can be as steep as they like — they are the fun part. Climbs cannot:
// past ~22° the slope drains speed faster than running adds it, so a player who
// arrives with no momentum is stuck for good. See the walkability test.
const SEGMENTS = [
  { type: 'flat', len: 620 },
  { type: 'bumps', len: 1000, amp: 45, n: 2 },
  { type: 'valley', len: 760, amp: 76 },
  { type: 'hill', len: 1100, amp: 110 },
  { type: 'slope', len: 360, dy: 150 },
  { type: 'flat', len: 460 },
  { type: 'slope', len: 620, dy: -120 },
  { type: 'slope', len: 200, dy: 300 },
  { type: 'bumps', len: 900, amp: 40, n: 2 },
  { type: 'valley', len: 800, amp: 80 },
  { type: 'slope', len: 640, dy: -110 },
  { type: 'hill', len: 1200, amp: 120 },
  { type: 'flat', len: 640 },
];

export function buildLevel(step = 8) {
  const ground = buildGround(SEGMENTS, 380, step);
  const level = { step, ground, length: (ground.length - 1) * step };
  const gy = (x) => heightAt(level, x);

  const rings = [];
  const line = (x0, n, gap, lift) => {
    for (let i = 0; i < n; i++) rings.push({ x: x0 + i * gap, y: gy(x0 + i * gap) - lift, got: false });
  };
  const arc = (x0, n, gap, lift, height) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      rings.push({ x, y: gy(x) - lift - Math.sin((i / (n - 1)) * Math.PI) * height, got: false });
    }
  };

  line(300, 5, 46, 46);
  arc(760, 7, 44, 44, 100);
  line(1700, 6, 44, 50);
  arc(1900, 6, 44, 40, 90);
  line(2500, 6, 44, 60);
  arc(2820, 7, 46, 44, 120);
  line(3520, 6, 42, 60);
  arc(3900, 8, 46, 50, 140);
  line(4400, 6, 44, 50);
  arc(4960, 9, 50, 80, 200);   // the big drop — collected mid-air
  line(5400, 6, 44, 46);
  arc(5700, 7, 44, 44, 110);
  line(6100, 6, 44, 50);
  arc(6320, 7, 44, 40, 100);
  line(6900, 6, 44, 50);
  arc(7600, 8, 46, 44, 160);
  line(8100, 6, 44, 60);
  arc(8700, 8, 46, 44, 120);

  const springs = [
    { x: 2000, y: gy(2000), power: 11 },
    { x: 6420, y: gy(6420), power: 13 },
    { x: 8820, y: gy(8820), power: 11 },
  ];

  const enemies = [
    { x: 900, y: gy(900), home: 900, range: 110, dir: -1, speed: 0.9, dead: false },
    { x: 2600, y: gy(2600), home: 2600, range: 140, dir: 1, speed: 1.1, dead: false },
    { x: 4150, y: gy(4150), home: 4150, range: 130, dir: -1, speed: 1.0, dead: false },
    { x: 5600, y: gy(5600), home: 5600, range: 150, dir: 1, speed: 1.2, dead: false },
    { x: 7050, y: gy(7050), home: 7050, range: 120, dir: -1, speed: 1.0, dead: false },
    { x: 8760, y: gy(8760), home: 8760, range: 130, dir: 1, speed: 1.1, dead: false },
  ];

  const spikes = [
    { x: 1450, y: gy(1450) },
    { x: 1486, y: gy(1486) },
    { x: 4060, y: gy(4060) },
    { x: 6240, y: gy(6240) },
    { x: 6276, y: gy(6276) },
    { x: 8480, y: gy(8480) },
  ];

  const goal = { x: level.length - 260, y: gy(level.length - 260), spin: 0, hit: false };
  const start = { x: 90, y: gy(90) };

  return { ...level, rings, springs, enemies, spikes, goal, start };
}
