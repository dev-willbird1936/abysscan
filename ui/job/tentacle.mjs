// An octopus arm drawn in code, so the octopus (the ocean show, ocean-show.mjs, and the menu, menu-octopus.js) can
// stretch one arm as far as it needs instead of moving its whole body. The arm leaves the body at `root` heading `dir`, bends smoothly to `tip`, and ends
// in a curl: a small free curl, or one wrapped round a held object. It is rasterised as a pixel sprite with a normal
// map (a round tube; sucker discs raised), so pixel-lit.js lights it with the same model as the drawn sprites. It is
// drawn on the show's pixel grid, the same size as the octopus sprite's pixels, and like the sheets' arms it has no
// outline: only the sucker side ends in a dark edge.
//
// Colours are the octopus sheets' own: teal skin, a cream and olive sucker band on the side it curls towards.

// Skin from lit side to shade, then the sucker band (cream and yellow discs with olive gaps) and the dark edge: the colours
// the octopus sheets' own arms use.
const SKIN = [[0x98, 0xc1, 0x97], [0x5d, 0xb5, 0xa0], [0x4e, 0xb0, 0x9f], [0x46, 0xa2, 0x98], [0x43, 0x8a, 0x7f], [0x20, 0x83, 0x8a], [0x0e, 0x6e, 0x7f]];
const DISC = [[0xcd, 0xc5, 0x69], [0xce, 0xce, 0xa2], [0xb2, 0xa9, 0x66]], OLIVE = [[0x83, 0x8d, 0x65], [0x55, 0x61, 0x49]], EDGE = [0x21, 0x2c, 0x29];
// 4 x 4 ordered dither, so the shading steps are ragged like the sheets' hand-placed pixels.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// The arms the code can draw, each in place of the reaching arm of a one-arm pose sheet (ui/abyss/pixel/creatures/
// octopus-poses.json): where the arm leaves the body on the 128 px cell and its heading there, measured on the sheets.
// Arms on the right are the left ones mirrored.
export const ARMS = {
  left: { pose: 'reach1-left-far', root: [46, 61], dir: [-0.98, 0.21] },
  upleft: { pose: 'reach1-upleft-far', root: [49, 50], dir: [-0.8, -0.6] },
  up: { pose: 'reach1-up-far', root: [64, 42], dir: [0, -1] },
  downleft: { pose: 'reach1-downleft-far', root: [54, 75], dir: [-0.59, 0.81] },
  down: { pose: 'reach1-down-far', root: [64, 78], dir: [-0.06, 1] },
};
const HEADINGS = Object.entries(ARMS).flatMap(([name, a]) => [[name, false, a.dir], ...(a.dir[0] < -0.2 ? [[name, true, [-a.dir[0], a.dir[1]]]] : [])]);

// The arm whose heading points most nearly along (dx, dy): { body, mirror, side }. side puts the suckers away from the
// light (down and right on screen).
export function pickArm(dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  let best = HEADINGS[0], score = -2;
  for (const h of HEADINGS) { const s = (h[2][0] * dx + h[2][1] * dy) / l; if (s > score) { score = s; best = h; } }
  const [body, mirror, d] = best;
  return { body, mirror, side: (-d[1] * 0.6 + d[0] * 0.8) >= 0 ? 1 : -1 };
}

// The pose sheet ({ w, color, normal } as PixelLit.sheet gives it) without its reaching arm: everything joined to the
// arm's tip once the body core (a disc round the mantle) is set aside, frame by frame. The drawn arm takes its place.
export function armless(sheet, tip) {
  if (!sheet || !tip) return sheet;
  const C = 128, { w } = sheet, color = sheet.color.slice();
  const opaque = (f, x, y) => x >= 0 && y >= 0 && x < C && y < C && sheet.color[(y * w + f * C + x) * 4 + 3] > 127 && (x - 64) ** 2 + (y - 60) ** 2 >= 324;
  for (let f = 0; f < w / C; f++) {
    let seed = null, near = 100;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const d = (x - tip[0]) ** 2 + (y - tip[1]) ** 2;
      if (d < near && opaque(f, x, y)) { near = d; seed = [x, y]; }
    }
    if (!seed) continue;
    const seen = new Uint8Array(C * C), stack = [seed];
    seen[seed[1] * C + seed[0]] = 1;
    while (stack.length) {
      const [x, y] = stack.pop();
      color[(y * w + f * C + x) * 4 + 3] = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (opaque(f, X, Y) && !seen[Y * C + X]) { seen[Y * C + X] = 1; stack.push([X, Y]); }
      }
    }
  }
  return { ...sheet, color };
}

// The arm's skin, taken from the octopus sheet itself so the drawn arm has the body's exact pixels and normals: the
// reaching arm of `reach1-left-far` (frame 0) runs almost straight left from x 32 to x 12, so each pixel column there is
// one cross-section, lit side at the top and suckers at the bottom. Returns { cols, scale }: cols[i] = rows of
// { c: [r, g, b], n: [x, y, z] } (normal decoded, y up), scale = sheet pixels per drawn pixel along the arm.
export function armSkin(sheet, scale = 2) {
  if (!sheet) return null;
  const { w, color, normal } = sheet, cols = [];
  const solid = (x, y) => color[(y * w + x) * 4 + 3] > 127;
  for (let x = 32; x >= 12; x--) {
    let y = 66;
    if (!solid(x, y)) { const d = [1, -1, 2, -2, 3, -3, 4, -4].find(o => solid(x, 66 + o)); if (d === undefined) continue; y = 66 + d; }
    let top = y, bot = y;
    while (top > 44 && solid(x, top - 1)) top--;
    while (bot < 84 && solid(x, bot + 1)) bot++;
    if (bot - top < 4 || bot - top > 14) continue;
    const rows = [];
    for (let r = top; r <= bot; r++) {
      const k = (r * w + x) * 4;
      rows.push({ c: [color[k], color[k + 1], color[k + 2]], n: [normal[k] / 127.5 - 1, normal[k + 1] / 127.5 - 1, normal[k + 2] / 127.5 - 1] });
    }
    cols.push(rows);
  }
  return cols.length ? { cols, scale } : null;
}

const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

// Centre line, one point every half pixel: {x, y} plus the running length s. side: +1 curls to the left of the travel
// direction (screen y down), -1 to the right. hold: {x, y, r} wraps the curl round that circle instead of a free curl.
function centreLine({ root, dir, tip, side, wave, hold }) {
  const L = Math.hypot(tip.x - root.x, tip.y - root.y);
  const reach = Math.max(L, 1);
  // Arrive at the tip turned a little towards the curl side, so the arm bends as one smooth sweep.
  let ax = (tip.x - root.x) / reach, ay = (tip.y - root.y) / reach;
  const turn = 0.35 * side;
  [ax, ay] = [ax * Math.cos(turn) - ay * Math.sin(turn), ax * Math.sin(turn) + ay * Math.cos(turn)];
  const c1 = { x: root.x + dir.x * reach * 0.4, y: root.y + dir.y * reach * 0.4 };
  const c2 = { x: tip.x - ax * reach * 0.32, y: tip.y - ay * reach * 0.32 };
  const n = Math.max(4, Math.ceil(reach * 2.2));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let x = bez(root.x, c1.x, c2.x, tip.x, t), y = bez(root.y, c1.y, c2.y, tip.y, t);
    // A travelling wave, zero at both ends, so a still arm still looks alive.
    if (i > 0 && i < n) {
      const tx = bez(root.x, c1.x, c2.x, tip.x, t + 1e-3) - x, ty = bez(root.y, c1.y, c2.y, tip.y, t + 1e-3) - y, tl = Math.hypot(tx, ty) || 1;
      const off = wave.amp * Math.sin(t * 7.5 - wave.phase) * Math.sin(Math.PI * t);
      x += (-ty / tl) * off; y += (tx / tl) * off;
    }
    pts.push({ x, y });
  }
  // The curl: a spiral that keeps turning towards `side`, or a wrap round the held object.
  const last = pts[pts.length - 1], prev = pts[Math.max(0, pts.length - 3)];
  let hx = last.x - prev.x, hy = last.y - prev.y;
  const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
  if (hold) {
    let a = Math.atan2(last.y - hold.y, last.x - hold.x);
    const r0 = Math.hypot(last.x - hold.x, last.y - hold.y) || hold.r;
    const steps = Math.ceil(hold.r * 2 * Math.PI * 0.8 * 2);
    for (let i = 1; i <= steps; i++) {
      a += (side * 2 * Math.PI * 0.8) / steps;
      const r = r0 + (hold.r - r0) * Math.min(1, i / 6);
      pts.push({ x: hold.x + Math.cos(a) * r, y: hold.y + Math.sin(a) * r });
    }
  } else {
    let x = last.x, y = last.y, a = Math.atan2(hy, hx);
    const len = 9 * wave.curl;
    for (let s = 0.5; s <= len; s += 0.5) {
      a += side * (0.12 + 0.5 * (s / Math.max(len, 1)) ** 2);
      x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5;
      pts.push({ x, y });
    }
  }
  let s = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s; }
  return pts;
}

/**
 * Rasterises one arm. Returns { x, y, sheet } where sheet = { w, h, color, normal } (RGBA arrays) is drawn at (x, y),
 * ready for PixelLit.relight. Lengths are in the show's art pixels.
 * @param {{root:{x:number,y:number}, dir:{x:number,y:number}, tip:{x:number,y:number}, side?:number,
 *   width?:number, wave?:{amp:number, phase:number, curl:number}, hold?:{x:number,y:number,r:number}|null,
 *   skin?:{cols:Array, scale:number}|null}} arm  skin: armSkin() of the pose sheet; without it, the built-in palette.
 */
export function drawTentacle({ root, dir, tip, side = 1, width = 2.2, wave = { amp: 1.6, phase: 0, curl: 1 }, hold = null, skin = null }) {
  const pts = centreLine({ root, dir, tip, side, wave, hold });
  const total = pts[pts.length - 1].s || 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = Math.ceil(width) + 2;
  x0 = Math.floor(x0) - pad; y0 = Math.floor(y0) - pad;
  const w = Math.ceil(x1) + pad - x0 + 1, h = Math.ceil(y1) + pad - y0 + 1;
  // Per pixel: which sample covers it (the later part of the arm lies on top of an earlier part it crosses).
  const best = new Float32Array(w * h).fill(Infinity), at = new Float32Array(w * h), across = new Float32Array(w * h);
  const nrm = new Float32Array(w * h * 2);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty * side, ny = tx * side; // points to the sucker side
    const hw = width * (1 - 0.7 * (p.s / total) ** 0.8) + 0.35;
    for (let u = -hw; u <= hw; u += 0.3) {
      const px = Math.round(p.x + nx * u - x0 - 0.5), py = Math.round(p.y + ny * u - y0 - 0.5);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const k = py * w + px, d = Math.abs(u) / hw;
      if (best[k] !== Infinity && !(p.s - at[k] > 2.5 * width || (Math.abs(p.s - at[k]) <= 2.5 * width && d < best[k]))) continue;
      best[k] = d; at[k] = p.s; across[k] = u / hw; nrm[k * 2] = nx; nrm[k * 2 + 1] = ny;
    }
  }
  const color = new Uint8ClampedArray(w * h * 4), normal = new Uint8ClampedArray(w * h * 4);
  const set = (k, c, n) => {
    color.set([c[0], c[1], c[2], 255], k * 4);
    normal.set([(n[0] * 0.5 + 0.5) * 255, (n[1] * 0.5 + 0.5) * 255, (n[2] * 0.5 + 0.5) * 255, 255], k * 4);
  };
  // Per pixel, by position across the arm (u: -1 on the lit side .. 1 on the sucker side) and along it (s).
  for (let k = 0; k < w * h; k++) {
    if (best[k] === Infinity) continue;
    if (skin) {
      // The sheet's cross-section at this length (body end first, repeating), its row at this point across, and its normal
      // turned from the sheet arm's frame (along: left, across: down) into this arm's (along: tangent, across: sucker side).
      const col = skin.cols[Math.floor(at[k] * skin.scale) % skin.cols.length];
      const px = col[Math.max(0, Math.min(col.length - 1, Math.round(((across[k] + 1) / 2) * (col.length - 1))))];
      const cx = nrm[k * 2], cy = nrm[k * 2 + 1], tx = cy * side, ty = -cx * side;
      const a = -px.n[0], b = -px.n[1], vx = a * tx + b * cx, vy = a * ty + b * cy;
      const l = Math.hypot(vx, vy, px.n[2]) || 1;
      set(k, px.c, [vx / l, -vy / l, px.n[2] / l]);
      continue;
    }
    const u = across[k], s = at[k], dither = (BAYER[((k / w | 0) + y0 & 3) * 4 + (k % w + x0 & 3)] + 0.5) / 16 - 0.5;
    // Round tube: the normal leans with the screen normal (y flipped to point up).
    const nx = nrm[k * 2], ny = -nrm[k * 2 + 1], z = Math.sqrt(Math.max(0, 1 - u * u));
    let n = [nx * u, ny * u, z];
    let c;
    // Across the arm: lit skin stepping down to deep teal, then a row of sucker discs on olive, and the dark edge.
    if (u > 0.88) c = EDGE;
    else if (u > 0.3) {
      const disc = (s % 2.4) < 1.4;
      c = disc ? DISC[(Math.floor(s / 2.4) + (dither > 0.2 ? 1 : 0)) % 3] : OLIVE[dither > 0 ? 0 : 1];
      if (disc) n = [n[0] * 0.5, n[1] * 0.5, Math.min(1, n[2] + 0.45)];
    } else c = SKIN[Math.max(0, Math.min(SKIN.length - 1, Math.round(((u + 1) / 1.3) * (SKIN.length - 1) + dither * 1.6 - 0.4)))];
    const l = Math.hypot(...n) || 1;
    set(k, c, n.map(v => v / l));
  }
  // Where a part of the arm crosses over an earlier part, the earlier one shows a dark edge.
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && best[y * w + x] !== Infinity;
  const under = (k, x, y) => filled(x, y) && at[k] - at[y * w + x] > 2.5 * width;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (best[k] !== Infinity && best[k] > 0.55 && (under(k, x - 1, y) || under(k, x + 1, y) || under(k, x, y - 1) || under(k, x, y + 1))) color.set(EDGE, k * 4);
  }
  return { x: x0, y: y0, sheet: { w, h, color, normal } };
}
