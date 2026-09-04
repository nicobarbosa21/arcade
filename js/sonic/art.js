// The look: a real low-resolution framebuffer, a period-correct palette, and a bitmap
// font. Everything is drawn at 448×252 and blown up with nearest-neighbour, so shapes
// land on actual pixels instead of being smooth vector curves that never read as 16-bit.

// A Mega Drive colour channel is 3 bits, so there are only eight values per channel and
// 512 colours in total. Snapping every colour to that ramp is most of why the palette
// below feels like the era rather than like a modern flat-design swatch.
const RAMP = [0, 36, 73, 109, 146, 182, 219, 255];
const hex2 = (v) => v.toString(16).padStart(2, '0');
export const md = (r, g, b) => `#${hex2(RAMP[r])}${hex2(RAMP[g])}${hex2(RAMP[b])}`;

export const PAL = {
  skyTop: md(1, 3, 7),
  skyMid: md(3, 5, 7),
  skyLow: md(5, 6, 7),
  cloud: md(7, 7, 7),
  cloudShade: md(5, 6, 7),

  farHill: md(2, 5, 4),
  farHillLit: md(3, 6, 5),
  midHill: md(1, 4, 2),
  midHillLit: md(2, 5, 3),

  grass: md(1, 6, 2),
  grassLit: md(4, 7, 3),
  grassDark: md(0, 4, 1),
  dirtA: md(5, 3, 1),
  dirtB: md(4, 2, 1),
  dirtEdge: md(3, 2, 0),

  ring: md(7, 6, 0),
  ringLit: md(7, 7, 4),
  ringDark: md(6, 4, 0),

  skin: md(7, 6, 4),
  blue: md(2, 3, 7),
  blueLit: md(4, 6, 7),
  blueDark: md(1, 1, 5),
  shoe: md(7, 1, 1),
  shoeLit: md(7, 4, 3),
  white: md(7, 7, 7),
  eye: md(0, 0, 2),

  metal: md(5, 5, 6),
  metalDark: md(3, 3, 4),
  hudText: md(7, 7, 7),
  hudGold: md(7, 6, 1),
  hudShadow: md(1, 1, 3),
  ink: md(0, 0, 1),
};

/* ------------------------------------------------------------------- the font */

// 5×7 glyphs. Uppercase only, which is what the era's HUDs used anyway, and it halves
// the amount of hand-drawn data.
const FONT = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '####./....#/....#/.###./....#/....#/####.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../..#../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..',
  ' ': '...../...../...../...../...../...../.....',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../.##../.#...',
  ':': '...../.##../.##../...../.##../.##../.....',
  '-': '...../...../...../.###./...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/..##./..#../...../..#..',
  '/': '....#/...#./...#./..#../.#.../.#.../#....',
  "'": '..#../..#../...../...../...../...../.....',
  '·': '...../...../...../.##../.##../...../.....',
  '×': '...../#...#/.#.#./..#../.#.#./#...#/.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
};

export const GLYPH_W = 5, GLYPH_H = 7;

// Accents have nowhere to live in a 5×7 cell, and dropping them is what Spanish signage
// of the period did too.
const PLAIN = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N', '¡': '!', '¿': '?' };

const normalise = (text) =>
  [...String(text).toUpperCase()].map((c) => PLAIN[c] ?? c).join('');

export const textWidth = (text, scale = 1, tracking = 1) =>
  normalise(text).length * (GLYPH_W + tracking) * scale - tracking * scale;

// Text is drawn as rectangles, so nothing downstream can tell what it said. The tests
// read the game's state through its HUD, so this is the seam that lets them.
let observer = null;
export const observeText = (fn) => { observer = fn; };

/**
 * Draws text as pixels. `align` is 'left' or 'centre'; x is the left edge or the centre
 * accordingly. Nothing here touches ctx.font, so it looks identical everywhere.
 */
export function drawText(ctx, text, x, y, { colour = PAL.hudText, scale = 1, shadow = null, align = 'left', tracking = 1 } = {}) {
  const chars = normalise(text);
  if (observer) observer(chars);
  let left = align === 'centre' ? Math.round(x - textWidth(chars, scale, tracking) / 2) : Math.round(x);
  const top = Math.round(y);

  const paint = (dx, dy, fill) => {
    ctx.fillStyle = fill;
    let cx = left + dx;
    for (const ch of chars) {
      const glyph = FONT[ch] ?? FONT['?'];
      const rows = glyph.split('/');
      for (let r = 0; r < GLYPH_H; r++) {
        for (let c = 0; c < GLYPH_W; c++) {
          if (rows[r][c] === '#') ctx.fillRect(cx + c * scale, top + dy + r * scale, scale, scale);
        }
      }
      cx += (GLYPH_W + tracking) * scale;
    }
  };

  if (shadow) paint(scale, scale, shadow);
  paint(0, 0, colour);
}

/* ------------------------------------------------------------------- sprites */

// Sprites are authored as pixel rows, one character per pixel, which is the only way to
// get a silhouette that reads. Stacking ellipses gives you a blob no matter how much you
// tweak it.
//
//   . transparent   K outline   B blue   L blue highlight   D blue shadow
//   S skin          W white     E eye    R shoe             H shoe highlight
//   G gold buckle
const INK = {
  K: PAL.ink, B: PAL.blue, L: PAL.blueLit, D: PAL.blueDark,
  S: PAL.skin, W: PAL.white, E: PAL.eye, R: PAL.shoe, H: PAL.shoeLit, G: PAL.hudGold,
};

/** Parses a sprite into {w, h, pixels:[x,y,colour][]} once, at module load. */
function sprite(rows, originX, originY) {
  const w = rows[0].length;
  rows.forEach((row, i) => {
    // Miscounting a row shifts everything below it and is invisible in the source.
    if (row.length !== w) throw new Error(`sprite row ${i} is ${row.length} wide, expected ${w}`);
    for (const ch of row) if (ch !== '.' && !INK[ch]) throw new Error(`sprite row ${i} has unknown ink "${ch}"`);
  });
  const pixels = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const colour = INK[ch];
      if (colour) pixels.push([x - originX, y - originY, colour]);
    });
  });
  return { w, h: rows.length, pixels };
}

export function drawSprite(ctx, spr, flip = 1) {
  for (const [x, y, colour] of spr.pixels) {
    ctx.fillStyle = colour;
    ctx.fillRect(flip < 0 ? -x - 1 : x, y, 1, 1);
  }
}

// Facing right, 30×37, origin at the body centre so the feet land on BODY.half.
export const HERO_IDLE = sprite([
  '..........KKKKKKK.............',
  '........KKBBBBBBBKK...........',
  '.......KBBBBBBBBBBBK..........',
  '......KBBBLLLLLLLBBBK.........',
  '.....KBBBLLLLLLLLLBBBK........',
  '....KBBBBLLLLLLLLLBBBBK.......',
  '..KKBBBBBLLLLLLLBBBBBBK.......',
  'KKKDBBBBBBBBBBBBBBBBBBK.......',
  'KDDDDBBBBBKKKKKKKKKKBBK.......',
  '.KDDDBBBBKWWWWWWWWWWWBK.......',
  '..KKDBBBKWWWWWWWWWWWWWK.......',
  'KKKDDBBBKWWWEEWKWWWWEEK.......',
  'KDDDDBBBKWWWEEWKWWWWEEK.......',
  '.KDDDBBBKWWWEEWKWWWWEEK.......',
  '..KKDBBBKWWWWWWKWWWWWWK.......',
  'KKKDDBBBBKWWWWKKWWWWWKKSSSK...',
  'KDDDDBBBBBKKKKKKKKKKSSSSSSSK..',
  '.KDDDBBBBBBBBBBBBBBKSSSSSSSK..',
  '..KKDBBBBBBBBBBBBBBKSSSSKEEK..',
  '...KDDBBBBBBBBBBBBBKSSSSKEEK..',
  '....KDBBBBBBBBBBBBBKSSSSKKKK..',
  '.....KBBBBBBBBBBBBBKSSSSSK....',
  '.....KBBBBSSSSSBBBBBKSSSSK....',
  '.....KBBBSSSSSSSBBBBKKKKK.....',
  '......KBBSSSSSSSSBBBK.........',
  '......KBBSSSSSSSSBBBK.........',
  '.......KBBSSSSSSBBBK..........',
  '.......KBBBSSSSBBWWK..........',
  '........KBBBBBBWWWWK..........',
  '........KWWWKKKWWWWK..........',
  '.......KWWWWKKWWWWWWK.........',
  '......KRRRRRKKRRRRRRRK........',
  '.....KRRRRRRKKRRRRRRRRK.......',
  '.....KRHHHHRKKRHHHHHRRK.......',
  '.....KRRRRRRKKRRRRRRRRK.......',
  '.....KWWWWWWKKWWWWWWWWK.......',
  '.....KKKKKKK..KKKKKKKKK.......',
], 13, 17);

// Mid-stride: the legs blur into the classic figure of eight rather than animating.
export const HERO_RUN = sprite([
  '..........KKKKKKK.............',
  '........KKBBBBBBBKK...........',
  '.......KBBBBBBBBBBBK..........',
  '......KBBBLLLLLLLBBBK.........',
  '.....KBBBLLLLLLLLLBBBK........',
  '....KBBBBLLLLLLLLLBBBBK.......',
  '..KKBBBBBLLLLLLLBBBBBBK.......',
  'KKKDBBBBBBBBBBBBBBBBBBK.......',
  'KDDDDBBBBBKKKKKKKKKKBBK.......',
  '.KDDDBBBBKWWWWWWWWWWWBK.......',
  '..KKDBBBKWWWWWWWWWWWWWK.......',
  'KKKDDBBBKWWWEEWKWWWWEEK.......',
  'KDDDDBBBKWWWEEWKWWWWEEK.......',
  '.KDDDBBBKWWWEEWKWWWWEEK.......',
  '..KKDBBBKWWWWWWKWWWWWWK.......',
  'KKKDDBBBBKWWWWKKWWWWWKKSSSK...',
  'KDDDDBBBBBKKKKKKKKKKSSSSSSSK..',
  '.KDDDBBBBBBBBBBBBBBKSSSSSSSK..',
  '..KKDBBBBBBBBBBBBBBKSSSSKEEK..',
  '...KDDBBBBBBBBBBBBBKSSSSKEEK..',
  '....KDBBBBBBBBBBBBBKSSSSKKKK..',
  '.....KBBBBBBBBBBBBBKSSSSSK....',
  '.....KBBBBSSSSSBBBBBKSSSSK....',
  '.....KBBBSSSSSSSBBBBKKKKK.....',
  '......KBBSSSSSSSSBBBK.........',
  '......KBBSSSSSSSSBBBK.........',
  '.......KBBSSSSSSBBBK..........',
  '.......KBBBSSSSBBWWK..........',
  '........KBBBBBBWWWWK..........',
  '......KKKKKKKKKKKKKK..........',
  '...KKRRRRRRRRRRRRRRRRKK.......',
  '..KRRRHHHHRRRRRRHHHHRRRK......',
  '.KRRRRRRRRRRRRRRRRRRRRRRK.....',
  '.KWWWWWWWWWWWWWWWWWWWWWWK.....',
  '..KRRRRRRRRRRRRRRRRRRRRK......',
  '...KKRRRRRRRRRRRRRRRRKK.......',
  '......KKKKKKKKKKKKKK..........',
], 13, 17);

/* --------------------------------------------------------------- pixel helpers */

/** A filled circle drawn on the pixel grid — no antialiased edge. */
export function pixelDisc(ctx, cx, cy, r, colour) {
  ctx.fillStyle = colour;
  const x0 = Math.round(cx), y0 = Math.round(cy), rr = r * r;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    const span = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
    if (span < 0) continue;
    ctx.fillRect(x0 - span, y0 + dy, span * 2 + 1, 1);
  }
}

/** A hollow ring one pixel thick, for collectibles and highlights. */
export function pixelRing(ctx, cx, cy, r, thickness, colour) {
  ctx.fillStyle = colour;
  const x0 = Math.round(cx), y0 = Math.round(cy);
  const outer = r * r, inner = (r - thickness) * (r - thickness);
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    const o = Math.floor(Math.sqrt(Math.max(0, outer - dy * dy)));
    const i = dy * dy >= inner ? -1 : Math.floor(Math.sqrt(inner - dy * dy));
    if (i < 0) { ctx.fillRect(x0 - o, y0 + dy, o * 2 + 1, 1); continue; }
    ctx.fillRect(x0 - o, y0 + dy, o - i, 1);
    ctx.fillRect(x0 + i + 1, y0 + dy, o - i, 1);
  }
}

/** A hollow ellipse ring — a ring seen edge-on as it spins. */
export function pixelRingEllipse(ctx, cx, cy, rx, ry, thickness, colour) {
  ctx.fillStyle = colour;
  const x0 = Math.round(cx), y0 = Math.round(cy);
  const ix = rx - thickness, iy = ry - thickness;
  for (let dy = -ry; dy <= ry; dy++) {
    const o = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    const inside = ix > 0 && iy > 0 && Math.abs(dy) <= iy;
    const i = inside ? Math.floor(ix * Math.sqrt(Math.max(0, 1 - (dy / iy) ** 2))) : -1;
    if (i < 0) { ctx.fillRect(x0 - o, y0 + dy, o * 2 + 1, 1); continue; }
    ctx.fillRect(x0 - o, y0 + dy, o - i, 1);
    ctx.fillRect(x0 + i + 1, y0 + dy, o - i, 1);
  }
}

/**
 * A vertical ramp of flat bands with a dithered seam between each. Eight-step channels
 * cannot hold a smooth gradient, so this is how the era faked one.
 */
export function ditherBands(ctx, w, y0, y1, colours) {
  const span = (y1 - y0) / colours.length;
  colours.forEach((colour, i) => {
    const top = Math.round(y0 + i * span);
    ctx.fillStyle = colour;
    ctx.fillRect(0, top, w, Math.ceil(span) + 1);
  });
  for (let i = 1; i < colours.length; i++) {
    const seam = Math.round(y0 + i * span);
    ctx.fillStyle = colours[i - 1];
    for (let r = 0; r < 3; r++) {
      for (let x = (r % 2); x < w; x += r === 0 ? 2 : r === 1 ? 3 : 5) {
        ctx.fillRect(x, seam + r, 1, 1);
      }
    }
  }
}

/**
 * The checkerboard that fills the ground. Drawn in world coordinates and clipped to the
 * terrain, which is what makes it scroll with the level instead of sliding on the screen.
 */
export function checker(ctx, x0, y0, x1, y1, size, a, b) {
  const tx0 = Math.floor(x0 / size), ty0 = Math.floor(y0 / size);
  const tx1 = Math.ceil(x1 / size), ty1 = Math.ceil(y1 / size);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      ctx.fillStyle = (tx + ty) % 2 === 0 ? a : b;
      ctx.fillRect(tx * size, ty * size, size, size);
    }
  }
}
