// Encryption: the tag's text is eaten by pixel noise that flickers in colour, thickest in the middle, then dies away.
// o.w, o.h: the tag's size in art pixels; the origin is its left edge, vertically centred.
import { fit, seg, bump } from "../core/index.js";

export const meta = {
  name: "Scramble", desc: "Pixel noise over text: the content was encrypted.", tags: ["ui", "encrypted"],
  size: [160, 24], origin: [0, 12], duration: 1.4, loop: false, fps: 30, bg: "dark",
  options: { palette: ["#3a0714", "#8a1030", "#d81c4a", "#ff4d6a", "#ffd0d8", "#ffffff"], w: 80, h: 8, seed: 1 },
};

const hash = (a, b, c) => { let n = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
export function draw(p, t, o) {
  const C = fit(o.palette, 6), w = Math.min(150, o.w), h = Math.min(10, Math.max(4, o.h)), step = Math.floor(t * 14);
  const cover = 0.75 * bump(t, 0, 1.4); // up, then away
  for (let x = 2; x < w - 2; x += 2) for (let y = -h / 2 + 1; y < h / 2 - 1; y += 2) {
    // The wave front sweeps left to right, so the text goes in order, as a file is encrypted.
    const reached = seg(t, 0, 0.7) * (w + 12) > x;
    if (!reached || hash(x, y, step) > cover) continue;
    const r = hash(y, x, step + 7);
    // The tag's own colours, mostly dark: the text is corrupted in place, not covered with a bright mosaic.
    p.rect(x, y, 2, 2, r < 0.06 ? C[4] : r < 0.3 ? C[2] : C[0], 0.92);
  }
}
