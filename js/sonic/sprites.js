// The player's sprite sheets.
//
// The art is Pixel Adventure by Pixel Frog, released CC0 — public domain, no attribution
// required. Frames are 32×32 and every sheet is a single horizontal strip.
//
// Loading is asynchronous and the game starts drawing immediately, so anything that asks
// for a frame before the sheets arrive gets null and the caller falls back to the
// hand-drawn sprite in art.js. That also covers the sheets failing to load at all.
export const FRAME = 32;

const SHEETS = {
  idle: { src: 'assets/hero/idle.png', frames: 11, rate: 0.12 },
  run: { src: 'assets/hero/run.png', frames: 12, rate: 0.35 },
  jump: { src: 'assets/hero/jump.png', frames: 1, rate: 0 },
  fall: { src: 'assets/hero/fall.png', frames: 1, rate: 0 },
};

// How an image gets made differs between a browser, the screenshot tool and the tests,
// so it is injectable rather than hard-coded to `new Image()`.
let makeImage = (src) => {
  const img = document.createElement('img');
  img.src = src;
  return img;
};
export const setImageLoader = (fn) => { makeImage = fn; };

let sheets = null;

/** Kicks off loading. Safe to call more than once; only the first does anything. */
export function loadHero() {
  if (sheets) return sheets;
  sheets = {};
  for (const [name, def] of Object.entries(SHEETS)) {
    sheets[name] = { ...def, img: makeImage(def.src) };
  }
  return sheets;
}

const ready = (sheet) => sheet?.img?.complete !== false && (sheet?.img?.width ?? sheet?.img?.naturalWidth ?? 0) > 0;

/**
 * Draws one frame centred on the current transform origin, with the feet at `footY`.
 * @returns false if the sheet is not usable yet, so the caller can fall back.
 */
export function drawHeroFrame(ctx, name, clock, flip, footY) {
  const sheet = sheets?.[name];
  if (!ready(sheet)) return false;
  const index = sheet.frames > 1 ? Math.floor(clock * sheet.rate) % sheet.frames : 0;
  ctx.save();
  ctx.scale(flip, 1);
  // The art sits on the bottom edge of its 32px cell, so aligning that to the feet is
  // what keeps the character standing on the ground rather than floating.
  ctx.drawImage(sheet.img, index * FRAME, 0, FRAME, FRAME, -FRAME / 2, footY - FRAME, FRAME, FRAME);
  ctx.restore();
  return true;
}
