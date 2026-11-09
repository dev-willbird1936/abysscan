// The agent octopus floating beside the threat-search panel on the surface screen. While a pointer is dragged over the page it
// stretches ONE arm out to the file, as if to take it: the arm is drawn in code (ui/job/tentacle.mjs) in place of the
// reaching arm of the pose for that direction (octopus-poses.json; the right side is the left pose mirrored), so it can
// reach the file anywhere near; the body only leans a little. Decoration only: aria-hidden, no pointer events.
// window.__menuOctopus lets the ocean show start its octopus from this one and hide it.
(() => {
  'use strict';
  // It floats beside the menu's panel: the threat search (or a leftover #upload panel if one is still in the page).
  const panels = [document.getElementById('threat-search'), document.getElementById('upload')].filter(Boolean);
  if (!panels.length) return;
  const form = { getBoundingClientRect: () => (panels.find(panel => !panel.hidden) ?? panels[0]).getBoundingClientRect(), addEventListener: (...args) => panels.forEach(panel => panel.addEventListener(...args)) };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'menu-octopus';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const g = canvas.getContext('2d');

  const CELL = 128, ART = 48; // the 128 px pose cell drawn 48 art pixels wide: 3/4 of the ocean show's octopus, so it clears the HUD
  const REACH = 150; // longest arm, in art pixels
  const FADE = 220; // ms for the body to cross-fade when the arm changes
  // body: the arm in use (null: the idle octopus, all eight arms its own); out: 0 curled at rest, 1 at the file.
  const state = { x: 0, y: 0, dx: 0, dy: 0, drag: null, lastDrag: 0, hidden: false, body: null, mirror: false, side: 1, out: 0, prev: null, changed: 0 };
  let P = 4, W = 0, H = 0, arm = null, idle = null;
  const bodies = {};
let skin = null; // the drawn arm's pixels, sampled from the left pose's own arm (tentacle.mjs armSkin)

  function home() {
    const r = form.getBoundingClientRect();
    const size = ART * P;
    // To the right of the panel when there is room, otherwise above it.
    const right = r.right + size * 0.55;
    return right + size / 2 < innerWidth - 8 ? { x: right, y: r.top + r.height * 0.28 } : { x: r.left + r.width * 0.8, y: r.top - size * 0.42 };
  }

  const draw = (sheet, x, y, w, h, mirror, alpha, tick) => {
    if (!sheet) return;
    g.globalAlpha = alpha;
    g.drawImage(window.PixelLit.relight(sheet, tick * CELL, 0, CELL, CELL, w, h, window.PixelLit.RIG, mirror), Math.round(x), Math.round(y));
    g.globalAlpha = 1;
  };

  function frame(t) {
    requestAnimationFrame(frame);
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 4;
    P = Math.max(3, Math.round(1.5 * u));
    const w = Math.ceil(innerWidth / P), h = Math.ceil(innerHeight / P);
    if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; canvas.style.width = `${w * P}px`; canvas.style.height = `${h * P}px`; }
    const base = home();
    const dragging = Boolean(state.drag && t - state.lastDrag < 250 && arm);
    if (!dragging) state.drag = null;
    // The arm for the file's direction. A different arm means the old one curls back first, then the body swaps.
    let want = 0;
    if (dragging) {
      const pick = arm.pickArm(state.drag.x - state.x, state.drag.y - state.y);
      if (pick.body === state.body && pick.mirror === state.mirror) want = 1;
      else if (state.out < 0.05 && bodies[pick.body]) setBody(pick.body, pick.mirror, t, pick.side);
    } else if (state.out < 0.03 && state.body) setBody(null, false, t, 1);
    state.out += (want - state.out) * (reduced ? 1 : 0.16);
    // The body leans a little toward the file (at most 12 px) and otherwise bobs.
    const lean = dragging ? Math.min(1, 12 / Math.max(1, Math.hypot(state.drag.x - base.x, state.drag.y - base.y))) : 0;
    const tx = dragging ? (state.drag.x - base.x) * lean : 0, ty = dragging ? (state.drag.y - base.y) * lean : Math.sin(t * 0.0012) * 6;
    const ease = reduced ? 1 : 0.12;
    state.dx += (tx - state.dx) * ease; state.dy += (ty - state.dy) * ease;
    state.x = base.x + state.dx; state.y = base.y + state.dy;
    // Only on the surface screen, and never while the ocean show runs (it has its own octopus).
    const visible = !state.hidden && !document.documentElement.classList.contains('os-on') && scrollY < innerHeight * 0.6;
    canvas.style.opacity = visible ? String(Math.max(0, 1 - scrollY / (innerHeight * 0.6))) : '0';
    g.clearRect(0, 0, W, H);
    if (!idle || !visible) return;
    g.imageSmoothingEnabled = false;
    const tick = Math.floor(t / 150) % 14, bx = state.x / P - ART / 2, by = state.y / P - ART / 2;
    if (state.body) drawArm(t);
    // Two-phase blend: the new body fades in over the old one, then the old fades out, so the body never thins.
    const k = reduced ? 1 : Math.min(1, (t - state.changed) / FADE);
    const now = [bodies[state.body] ?? idle, state.mirror];
    if (state.prev && k < 1) {
      const was = [bodies[state.prev.body] ?? idle, state.prev.mirror];
      const [under, over, a] = k < 0.5 ? [was, now, k * 2] : [now, was, (1 - k) * 2];
      draw(under[0], bx, by, ART, ART, under[1], 1, tick);
      draw(over[0], bx, by, ART, ART, over[1], a, tick);
    } else draw(now[0], bx, by, ART, ART, now[1], 1, tick);
  }

  function setBody(body, mirror, t, side) {
    state.prev = { body: state.body, mirror: state.mirror };
    state.body = body; state.mirror = mirror; state.side = side; state.changed = t;
  }

  // The drawn arm, from where the erased arm left the body, out to the file (no farther than REACH).
  function drawArm(t) {
    const a = arm.ARMS[state.body], m = state.mirror ? -1 : 1, k = ART / CELL;
    const root = { x: state.x / P + m * (a.root[0] - 64) * k, y: state.y / P + (a.root[1] - 64) * k };
    const dir = { x: m * a.dir[0], y: a.dir[1] };
    const rest = { x: root.x + dir.x * 8, y: root.y + dir.y * 8 + 2 };
    let aim = rest;
    if (state.drag) {
      const dx = state.drag.x / P - root.x, dy = state.drag.y / P - root.y, l = Math.hypot(dx, dy) || 1, r = Math.min(l, REACH);
      aim = { x: root.x + (dx / l) * r, y: root.y + (dy / l) * r };
    }
    const tip = { x: rest.x + (aim.x - rest.x) * state.out, y: rest.y + (aim.y - rest.y) * state.out };
    const tent = arm.drawTentacle({ root, dir, tip, side: state.side, width: 1.6, skin, wave: { amp: 1.2, phase: t * 0.005, curl: 1 - 0.4 * state.out } });
    const { w, h } = tent.sheet;
    g.drawImage(window.PixelLit.relight(tent.sheet, 0, 0, w, h, w, h), tent.x, tent.y);
  }

  const onDrag = (event) => { state.drag = { x: event.clientX, y: event.clientY }; state.lastDrag = performance.now(); };
  addEventListener('dragover', onDrag);
  addEventListener('dragenter', onDrag);
  addEventListener('drop', () => { state.lastDrag = 0; });
  addEventListener('dragend', () => { state.lastDrag = 0; });
  form.addEventListener('submit', () => { state.lastDrag = 0; });

  // The idle sheet, then the one-arm poses with their reaching arm erased and the arm module (shared with the ocean show).
  const sheet = (url) => window.PixelLit.sheet(url).catch(() => null);
  sheet('/ui/abyss/pixel/creatures/octopus-sunlight-spritesheet.png').then((s) => { idle = s; });
  Promise.all([import('/ui/job/tentacle.mjs'), fetch('/ui/abyss/pixel/creatures/octopus-poses.json', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null))])
    .then(async ([mod, index]) => {
      await Promise.all(Object.entries(mod.ARMS).map(async ([key, a]) => {
        const entry = index?.poses?.[a.pose];
        const s = entry && await sheet(entry.sheet);
        if (key === 'left') skin = mod.armSkin(s, CELL / ART);
        if (s) bodies[key] = mod.armless(s, entry.anchors?.tip);
      }));
      arm = mod;
    }).catch(() => {});
  requestAnimationFrame(frame);

  window.__menuOctopus = {
    at: () => (state.hidden ? null : { x: state.x, y: state.y }),
    hide: () => { state.hidden = true; },
    show: () => { state.hidden = false; },
  };
})();
