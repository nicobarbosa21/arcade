/**
 * A real low-resolution framebuffer, blown up with nearest-neighbour.
 *
 * The backing store is exactly the size the game draws in, so every shape lands on a
 * whole pixel. Scaling happens in CSS with smoothing off, which is what gives the
 * chunky look of the era instead of smooth vector curves.
 */
export function setup(canvas, w, h, scale = 2) {
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
