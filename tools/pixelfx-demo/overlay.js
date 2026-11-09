// pixelfx overlay (https://github.com/patch-gg/pixelfx, MIT, vendored in ./vendor). One transparent canvas of (viewport / 4)
// art pixels, drawn 4x with hard pixels over the whole page; window.__pfx.play(id, opts) starts an effect, all live effects share one frame.
// Injected by run.mjs through Playwright; nothing here ships with the site.
import { createFrame, clearFrame, createFx, composite } from '/__pfx/core/index.js';

const SCALE = 4; // screen pixels per art pixel: the effects are drawn for this, whatever the viewport
const W = Math.ceil(innerWidth / SCALE), H = Math.ceil(innerHeight / SCALE);
// The site's palette (ui/abyss/retro-pixel.css --p0..--p8), dark to bright: every effect that takes a palette is recoloured to it.
const OCEAN = ['#07162a', '#12405d', '#1d6a82', '#35a0ac', '#6fe0d4', '#b9f4ea', '#effcf8'];
const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;image-rendering:pixelated';
document.documentElement.append(canvas);
const ctx = canvas.getContext('2d');
const frame = createFrame(W, H), img = new ImageData(W, H);
const live = new Set();
let last = performance.now(), acc = 0;
const STEP = 1 / 30;

// startAt: seconds to skip, so a transition that began on the previous page carries on from where it was.
// 'own/blocked' is an effect of ours (./fx/blocked.js); anything else is a pixelfx effect by its path.
const urlOf = id => (id.startsWith('own/') ? `/__pfx/${id}.js` : `/__pfx/fx/${id}.js`);

async function play(id, { x = W / 2, y = H / 2, palette, startAt = 0, follow = null, ...rest } = {}) {
  const mod = await import(urlOf(id));
  const fx = createFx(mod, { x, y, ...(palette ? { palette } : {}), ...rest });
  for (let t = 0; t < startAt; t += STEP) fx.update(STEP);
  fx.follow = follow; // () => { x, y, w, h } of what the effect is on, in art pixels, or null once it is gone
  live.add(fx);
  return fx;
}

// A one-line label saying which pixelfx effect is playing and why (not part of pixelfx).
const label = document.createElement('div');
label.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:46ch;padding:6px 10px;border:2px solid #6fe0d4;background:#07162acc;color:#effcf8;font:600 14px/1.3 ui-monospace,Consolas,monospace;pointer-events:none;opacity:0;transition:opacity .25s';
document.documentElement.append(label);
const caption = text => { label.textContent = text; label.style.opacity = text ? '1' : '0'; };

function tick(now) {
  acc = Math.min(acc + (now - last) / 1000, 0.25);
  last = now;
  let moved = false;
  while (acc >= STEP) {
    acc -= STEP;
    for (const fx of live) {
      if (fx.follow) { const at = fx.follow(); if (at) Object.assign(fx.options, at); else { live.delete(fx); continue; } }
      fx.update(STEP);
      if (fx.done()) live.delete(fx);
    }
    moved = true;
  }
  if (moved) {
    clearFrame(frame);
    for (const fx of live) fx.draw(frame, 'back');
    for (const fx of live) fx.draw(frame, 'front');
    composite(frame, img.data, null);
    ctx.putImageData(img, 0, 0);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Preview: one effect at several times over a flat background, as data URLs (for the contact sheet).
async function still(id, times, opts = {}) {
  const mod = await import(urlOf(id));
  const m = mod.meta, [w, h] = m.size, [ox, oy] = m.origin;
  const f = createFrame(w, h), out = new ImageData(w, h), cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const fx = createFx(mod, { x: ox, y: oy, ...opts });
  const shots = []; let t = 0;
  for (const target of times) {
    while (t < target - 1e-6) { fx.update(STEP); t += STEP; }
    clearFrame(f); fx.draw(f, 'back'); fx.draw(f, 'front');
    composite(f, out.data, 0xff2a1607); // #07162a as ABGR
    cv.getContext('2d').putImageData(out, 0, 0);
    shots.push(cv.toDataURL('image/png'));
  }
  return { size: [w, h], duration: m.duration, shots };
}

window.__pfx = { play, still, caption, clear: () => live.clear(), W, H, OCEAN };
