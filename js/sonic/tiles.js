// Tile collision with sensors, the way the 16-bit games actually did it.
//
// A height map can only hold one ground height per x, which rules out loops, ceilings
// and overlapping routes. This replaces it with a grid of 16×16 tiles, each holding a
// solidity bitmask, and sensors that cast into the grid to find surfaces. Because a
// sensor can point down, up, left or right, the same code carries the player around the
// inside of a loop.
//
// Levels are authored as signed distance fields — maths, not hand-placed tiles — and
// rasterised once at build time. The field is negative inside solid ground, so unions
// are `Math.min` and the gradient gives an exact surface normal for free.
export const TILE = 16;

// Which way is "down" for each sensor mode, and which way is "right" alongside it.
// 0 floor · 1 right wall · 2 ceiling · 3 left wall
export const MODES = [
  { down: [0, 1], right: [1, 0] },
  { down: [1, 0], right: [0, -1] },
  { down: [0, -1], right: [-1, 0] },
  { down: [-1, 0], right: [0, 1] },
];

/** Which wall the player is walking on, from their surface angle. */
export function modeFor(angle) {
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (deg <= 45 || deg >= 315) return 0;
  if (deg < 135) return 1;
  if (deg <= 225) return 2;
  return 3;
}

/* ------------------------------------------------------------- authoring */

/** Ground from a height function: solid everywhere below it. */
export const groundField = (heightAt) => (x, y) => heightAt(x) - y;

/** A ring of solid material. The player runs around the inside of it — that is a loop. */
export const ringField = (cx, cy, inner, outer) => (x, y) => {
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(inner - d, d - outer);
};

/** A solid box, for walls and ledges. */
export const boxField = (x0, y0, x1, y1) => (x, y) =>
  Math.max(x0 - x, x - x1, y0 - y, y - y1);

/** Everything solid in any of them. */
export const union = (...fields) => (x, y) => Math.min(...fields.map((f) => f(x, y)));

/** Cuts `hole` out of `solid`, for opening a doorway into a loop. */
export const subtract = (solid, hole) => (x, y) => Math.max(solid(x, y), -hole(x, y));

/* ---------------------------------------------------------- rasterising */

const bit = (shapes, shape, x, y) => (shapes[shape * TILE + y] >> x) & 1;

/**
 * Surface angle of a tile, from the field's gradient at its solid edge.
 * Maths convention: 0 is flat ground, positive climbs to the right, 90° is a wall
 * whose surface runs straight up, 180° is a ceiling.
 */
function angleOfTile(field, px, py) {
  let nx = 0, ny = 0, found = 0;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const wx = px + x, wy = py + y;
      if (field(wx, wy) > 0) continue;
      // Only the pixels actually on the surface. Averaging over the whole solid is
      // wrong for anything with two faces — inside a loop's ring the inner and outer
      // normals point opposite ways and cancel out to nothing.
      const exposed = field(wx + 1, wy) > 0 || field(wx - 1, wy) > 0
        || field(wx, wy + 1) > 0 || field(wx, wy - 1) > 0;
      if (!exposed) continue;
      const gx = field(wx + 1, wy) - field(wx - 1, wy);
      const gy = field(wx, wy + 1) - field(wx, wy - 1);
      const len = Math.hypot(gx, gy);
      if (len < 1e-9) continue;
      nx += gx / len;
      ny += gy / len;
      found++;
    }
  }
  if (!found) return 0;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  return Math.atan2(-nx, -ny);
}

/**
 * Rasterises fields into a tile world. One entry per layer; a layer is a whole
 * separate solid map, which is how a loop's two halves stop colliding with each other.
 */
export function buildWorld(fields, cols, rows) {
  const shapes = [];        // 16 rows of bitmask per shape, shape 0 is empty
  const angles = [0];
  const seen = new Map();
  shapes.push(...new Array(TILE).fill(0));

  const layers = fields.map((field) => {
    const grid = new Int32Array(cols * rows);
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const px = tx * TILE, py = ty * TILE;
        const mask = new Array(TILE).fill(0);
        let solid = 0;
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            if (field(px + x, py + y) <= 0) { mask[y] |= 1 << x; solid++; }
          }
        }
        if (solid === 0) continue; // stays shape 0
        const angle = angleOfTile(field, px, py);
        // Quantise the angle before keying so near-identical tiles share one shape.
        const key = mask.join(',') + '|' + Math.round(angle * 64);
        let index = seen.get(key);
        if (index === undefined) {
          index = angles.length;
          seen.set(key, index);
          shapes.push(...mask);
          angles.push(angle);
        }
        grid[ty * cols + tx] = index;
      }
    }
    return grid;
  });

  return { cols, rows, layers, shapes: Uint16Array.from(shapes), angles: Float32Array.from(angles) };
}

/* ------------------------------------------------------------- querying */

export function solidAt(world, layer, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= world.cols || ty >= world.rows) return false;
  const shape = world.layers[layer][ty * world.cols + tx];
  if (shape === 0) return false;
  return bit(world.shapes, shape, x - tx * TILE, y - ty * TILE) === 1;
}

function angleAt(world, layer, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= world.cols || ty >= world.rows) return 0;
  return world.angles[world.layers[layer][ty * world.cols + tx]];
}

/**
 * Casts a sensor from (x, y) along the mode's "down" axis.
 *
 * `distance` is how far the player must move along that axis to stand exactly on the
 * surface: positive means the surface is that far ahead (a gap to fall or snap down),
 * zero or negative means the sensor is already that deep inside solid ground.
 *
 * @returns {{hit: boolean, distance: number, angle: number}}
 */
export function cast(world, layer, x, y, mode, reach = 32) {
  const [dx, dy] = MODES[mode].down;
  const px = Math.round(x), py = Math.round(y);

  if (solidAt(world, layer, px, py)) {
    // Embedded: back out along the sensor until the first empty pixel.
    for (let i = 1; i <= reach; i++) {
      if (!solidAt(world, layer, px - dx * i, py - dy * i)) {
        const sx = px - dx * (i - 1), sy = py - dy * (i - 1);
        // `1 - i` rather than `-(i - 1)`: the latter hands back -0 when i is 1, and -0
        // fails a strict comparison against 0.
        return { hit: true, distance: 1 - i, angle: angleAt(world, layer, sx, sy) };
      }
    }
    return { hit: true, distance: -reach, angle: angleAt(world, layer, px, py) };
  }

  for (let i = 1; i <= reach; i++) {
    const sx = px + dx * i, sy = py + dy * i;
    if (solidAt(world, layer, sx, sy)) {
      return { hit: true, distance: i, angle: angleAt(world, layer, sx, sy) };
    }
  }
  return { hit: false, distance: reach + 1, angle: 0 };
}

/**
 * The pair of foot sensors, offset either side of the player's centre. The winner is
 * whichever finds the higher ground, exactly as the originals resolved it.
 */
export function groundSensors(world, layer, x, y, mode, halfWidth = 9, reach = 32) {
  const { down, right } = MODES[mode];
  const results = [-1, 1].map((side) => {
    const ox = x + right[0] * side * halfWidth, oy = y + right[1] * side * halfWidth;
    return cast(world, layer, ox, oy, mode, reach);
  });
  const [a, b] = results;
  if (!a.hit) return b;
  if (!b.hit) return a;
  return a.distance <= b.distance ? a : b;
}
