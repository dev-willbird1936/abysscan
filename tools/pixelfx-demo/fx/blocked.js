// A blocked connection: a dashed line leaves the tag, runs into a wall and spits sparks back; the wall holds, then fades.
// The origin is the tag's right edge, vertically centred.
import { fit, seg, smooth, TAU } from "../core/index.js";

export const meta = {
  name: "Blocked", desc: "A dashed line that hits a wall: the connection never left.", tags: ["ui", "blocked"],
  size: [96, 40], origin: [4, 20], duration: 1.8, loop: false, fps: 30, bg: "dark",
  options: { palette: ["#3a0714", "#8a1030", "#d81c4a", "#ff4d6a", "#ffd0d8", "#ffffff"], seed: 1 },
};

const WALL = 15;
export function draw(p, t, o) {
  const C = fit(o.palette, 6), run = seg(t, 0, 0.45), fade = 1 - seg(t, 1.4, 1.8);
  const head = WALL * (1 - (1 - run) ** 2);
  for (let x = 2; x < head; x += 5) p.line(x, 0, Math.min(x + 2, head), 0, C[4], fade); // dashes, 3 px on and 2 off
  const hit = seg(t, 0.45, 0.7);
  const wallA = (run >= 1 ? 1 : 0) * fade;
  if (wallA > 0) {
    p.rect(WALL, -6, 2, 13, C[3], wallA * 0.85);
    p.line(WALL + 2, -6, WALL + 2, 6, C[1], wallA * 0.85);
    if (t < 0.7) p.glow(WALL, 0, 14, C[3], 0.7 * (1 - seg(t, 0.45, 0.7)));
  }
  if (hit > 0 && hit < 1) { // sparks thrown back off the wall
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6 - 0.5) * 2.2, d = 3 + 14 * smooth(0, 1, hit);
      p.dot(WALL + Math.cos(a) * d, Math.sin(a) * d, i % 2 ? C[5] : C[4], 1 - hit);
    }
  }
}
