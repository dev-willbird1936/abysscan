// Scene presentation for the final macOS shell, driven only by the world (world.scene.focusApps, world.scene.creature,
// world.user.avatar). Nothing here is state: it is re-derived from window.__oceanWorld on every world change, so an OS switch
// shows the same picture. The only local data are animation timers and the creature's smoothed pose.
//   - Focus dimming: windows, Dock icons, Apps panel icons and the frontmost app's menu bar items whose app is not in
//     focusApps get filter: saturate(.25) and opacity .55. They stay fully clickable. An empty list dims nothing.
//   - Creature: an <img> of the same-origin sprite in the desktop layer, above the wallpaper image and below the
//     widgets, icons and windows (pointer-events: none), animated per state. Reduced motion: no movement, size shows state.
(() => {
  'use strict';

  const M = window.__macos27;
  const adapter = window.OceanWorldAdapter;
  if (!M || !adapter) {
    console.error('scene-fx: the macOS stores or the world adapter are missing.');
    return;
  }

  const SPRITE = /^\/ocean-creatures\/[a-z-]+\/(sunlight|twilight|midnight|abyss|trench)\.gif$/;
  const AVATAR = /^[a-z0-9-]{1,40}$/;
  const FADE_MS = 350;

  // The lock screen patch (make-macos-final.mjs) asks for this: an avatar id other than 'initials' is a file the shells server serves.
  window.__oceanAvatarUrl = () => {
    const avatar = (adapter.world ?? window.__oceanWorld)?.user.avatar;
    return avatar && avatar !== 'initials' && AVATAR.test(avatar) ? `/avatars/${avatar}` : null;
  };

  const style = document.createElement('style');
  style.id = 'ocean-scene-fx';
  style.textContent = `
@keyframes ocean-dim-in { from { filter: none; opacity: 1; } }
@keyframes ocean-dim-out { from { filter: saturate(.25); opacity: .55; } }
[data-ocean-dim] { filter: saturate(.25); }
/* Windows and Dock icons set opacity inline (minimise, launch), so the dim wins unless the shell is fading the item out. */
[data-ocean-dim]:not([style*="opacity: 0"]) { opacity: .55 !important; animation: ocean-dim-in ${FADE_MS}ms ease; }
[data-ocean-undim] { animation: ocean-dim-out ${FADE_MS}ms ease; }
[data-ocean-focus][data-dock-app] { filter: drop-shadow(0 0 7px rgba(140, 210, 255, .75)); }
#ocean-creature { position: absolute; inset: 0; z-index: 1; overflow: hidden; pointer-events: none; }
#ocean-creature[hidden] { display: none; }
#ocean-creature img { position: absolute; left: 0; top: 0; pointer-events: none; user-select: none; image-rendering: pixelated;
  will-change: transform; filter: drop-shadow(0 0 16px rgba(120, 220, 255, .35)); }
#ocean-creature .ocean-vignette { position: absolute; inset: 0; opacity: 0; transition: opacity 900ms ease;
  background: radial-gradient(ellipse at 50% 50%, rgba(0, 0, 0, 0) 22%, rgba(0, 6, 20, .82) 100%); }
#ocean-creature[data-state=press] .ocean-vignette { opacity: 1; }`;
  document.head.append(style);

  // ---- focus dimming ----
  const setDim = (element, on) => {
    if (on === element.hasAttribute('data-ocean-dim')) return;
    if (on) {
      element.setAttribute('data-ocean-dim', '');
      element.removeAttribute('data-ocean-undim');
    } else {
      element.removeAttribute('data-ocean-dim');
      element.setAttribute('data-ocean-undim', '');
      setTimeout(() => element.removeAttribute('data-ocean-undim'), FADE_MS + 30);
    }
  };
  const setFocus = (element, on) => element.toggleAttribute('data-ocean-focus', on);

  // The app the menu bar belongs to: the focused, visible window's app, else Finder.
  function frontNative() {
    const { windows, focusedId } = M.wins.getState();
    const front = windows[focusedId];
    return front && !front.minimized && !front.hidden ? front.appId : 'finder';
  }

  function applyFocus(focus) {
    const active = focus.size > 0;
    const judge = (element, native) => {
      const app = adapter.canonicalOf(native);
      setDim(element, active && app !== null && !focus.has(app));
      setFocus(element, active && app !== null && focus.has(app));
    };
    for (const element of document.querySelectorAll('[data-native-app]')) judge(element, element.dataset.nativeApp);
    for (const element of document.querySelectorAll('[data-dock-app]')) judge(element, element.dataset.dockApp);
    const front = frontNative();
    for (const element of document.querySelectorAll('.glass-menubar > .menubar-item[data-menu-id]:not([data-menu-id=apple])')) judge(element, front);
  }

  // ---- creature ----
  const host = document.createElement('div');
  host.id = 'ocean-creature';
  host.hidden = true;
  host.setAttribute('aria-hidden', 'true');
  const sprite = document.createElement('img');
  sprite.alt = '';
  sprite.draggable = false;
  const vignette = document.createElement('div');
  vignette.className = 'ocean-vignette';
  host.append(sprite, vignette);
  sprite.addEventListener('error', () => { sprite.dataset.failed = sprite.getAttribute('src') ?? ''; refresh(); });

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(adapter.world?.sys.reduceMotion);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Where the creature heads for: the target app's frontmost visible window, else its Dock icon.
  function targetRect(app) {
    if (!app) return null;
    const windows = [...document.querySelectorAll('[role=dialog][data-native-app]')]
      .filter(element => adapter.canonicalOf(element.dataset.nativeApp) === app && element.style.display !== 'none')
      .sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    const element = windows[0] ?? [...document.querySelectorAll('[data-dock-app]')].find(item => adapter.canonicalOf(item.dataset.dockApp) === app);
    const rect = element?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect : null;
  }

  // Where the creature rests: the free spot (least covered by windows) of a coarse grid over the open desktop, so it is
  // visible when there is room. Recomputed when windows change; the smoothed pose glides to it.
  let anchor = { x: innerWidth * 0.64, y: innerHeight * 0.52 };
  function pickAnchor() {
    const W = innerWidth;
    const H = innerHeight;
    const s = Math.min(W, H) * 0.13;
    // The widget column sits above the creature too.
    const covers = [...document.querySelectorAll('[role=dialog][data-native-app], [code-path^="src/os/components/Desktop.tsx:263:"]')]
      .filter(element => element.style.display !== 'none').map(element => element.getBoundingClientRect());
    const overlap = (x, y) => covers.reduce((sum, rect) => sum + Math.max(0, Math.min(x + s / 2, rect.right) - Math.max(x - s / 2, rect.left)) * Math.max(0, Math.min(y + s / 2, rect.bottom) - Math.max(y - s / 2, rect.top)), 0);
    let best = null;
    for (let column = 1; column <= 7; column += 1) {
      for (let row = 1; row <= 4; row += 1) {
        const x = (W * column) / 8;
        const y = 60 + ((H - 200) * row) / 5;
        // Prefer the middle and the previous spot a little, so the choice does not flicker between equal candidates.
        const score = overlap(x, y) + Math.hypot(x - anchor.x, y - anchor.y) * 4 + Math.abs(x - W / 2) * 2;
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    anchor = { x: best.x, y: best.y };
  }

  // The pose the current state asks for at time t (seconds). x, y: centre; s: edge length; rot: degrees; sx, sy: squash.
  // A window target is approached and circled along its edge, because the creature is drawn behind every window.
  function goalPose(state, targetApp, t) {
    const W = innerWidth;
    const H = innerHeight;
    const V = Math.min(W, H);
    const rect = targetRect(targetApp);
    const target = rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, extent: Math.max(rect.width, rect.height) } : { x: W / 2, y: H / 2, extent: V * 0.5 };
    const drift = (ax, ay, scale = 1) => ({ x: ax + Math.sin(t * 0.23) * W * 0.05 * scale, y: ay + Math.sin(t * 0.17 + 1) * H * 0.035 * scale });
    let pose;
    if (state === 'notice') {
      pose = { ...drift(lerp(anchor.x, W / 2, 0.25), lerp(anchor.y, H / 2, 0.25)), s: V * 0.17, rot: -10, sx: 1, sy: 1 };
    } else if (state === 'approach') {
      const edge = rect ? { x: clamp(anchor.x, rect.left, rect.right), y: clamp(anchor.y, rect.top, rect.bottom) } : target;
      pose = { ...drift(lerp(anchor.x, edge.x, 0.8), lerp(anchor.y, edge.y, 0.8), 0.3), s: V * 0.26, rot: -6, sx: 1, sy: 1 };
    } else if (state === 'circle') {
      const s = V * 0.22;
      const angle = t * 0.7;
      const rx = (rect ? rect.width / 2 : V * 0.1) + s * 0.3;
      const ry = (rect ? rect.height / 2 : V * 0.1) + s * 0.3;
      pose = { x: target.x + Math.cos(angle) * rx, y: target.y + Math.sin(angle) * ry, s, rot: Math.sin(angle) * 10, sx: 1, sy: 1 };
    } else if (state === 'press') {
      const pulse = Math.sin(t * 1.1) * 0.02;
      pose = { x: target.x, y: target.y, s: clamp(rect ? target.extent * 1.5 : V * 0.7, V * 0.6, V * 1.4), rot: 0, sx: 1.12 + pulse, sy: 0.88 - pulse };
    } else {
      pose = { ...drift(anchor.x, anchor.y), s: V * 0.13, rot: Math.sin(t * 0.3) * 4, sx: 1, sy: 1 };
    }
    return { ...pose, x: clamp(pose.x, 0, W), y: clamp(pose.y, 0, H) };
  }

  let creature = null;      // the world's creature (state, targetApp), or null
  let pose = null;          // smoothed pose actually drawn
  let frame = 0;
  let clock = 0;
  let last = 0;

  function draw() {
    sprite.style.width = sprite.style.height = `${pose.s}px`;
    sprite.style.transform = `translate(${pose.x - pose.s / 2}px, ${pose.y - pose.s / 2}px) rotate(${pose.rot}deg) scale(${pose.sx}, ${pose.sy})`;
  }

  function step(now) {
    frame = 0;
    if (!creature || host.hidden || !host.isConnected) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    clock += dt;
    const goal = goalPose(creature.state, creature.targetApp, clock);
    if (!pose) pose = goal;
    else {
      const move = 1 - Math.exp(-dt * 2.2);
      const grow = 1 - Math.exp(-dt * 2.6);
      pose = { x: lerp(pose.x, goal.x, move), y: lerp(pose.y, goal.y, move), s: lerp(pose.s, goal.s, grow), rot: lerp(pose.rot, goal.rot, move), sx: lerp(pose.sx, goal.sx, grow), sy: lerp(pose.sy, goal.sy, grow) };
    }
    draw();
    frame = requestAnimationFrame(step);
  }

  // Put the host in the desktop layer: second child of the Desktop element, right after the wallpaper image and below its
  // widgets (z 2), icons (z-desktop-icons) and the window layer, which is a later sibling.
  function mount() {
    const layer = document.querySelector('[code-path^="src/os/components/Desktop.tsx:259:"]');
    if (!layer?.firstChild) return false;
    if (host.parentElement !== layer || host.previousSibling !== layer.firstChild) layer.insertBefore(host, layer.firstChild.nextSibling);
    return true;
  }

  function applyCreature(next) {
    const src = next && SPRITE.test(next.sprite ?? '') ? next.sprite : null;
    const visible = Boolean(src) && next.state !== 'breakthrough' && sprite.dataset.failed !== src;
    const was = creature;
    creature = visible ? next : null;
    if (!visible || !mount()) {
      host.hidden = true;
      return;
    }
    if (sprite.getAttribute('src') !== src) {
      delete sprite.dataset.failed;
      sprite.setAttribute('src', src);
    }
    pickAnchor();
    host.dataset.state = next.state;
    host.dataset.target = next.targetApp ?? '';
    if (host.hidden) {
      host.hidden = false;
      pose = null;
    }
    if (reducedMotion()) {
      // No movement: the state shows in size and position only, at a fixed time so nothing drifts.
      cancelAnimationFrame(frame);
      frame = 0;
      pose = goalPose(next.state, next.targetApp, 0);
      draw();
    } else if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
    if (!was) clock = 0;
  }

  // ---- wiring ----
  function refresh() {
    const scene = adapter.world?.scene;
    applyFocus(new Set(scene?.focusApps ?? []));
    applyCreature(scene?.creature ?? null);
  }
  let pending = 0;
  // A desktop without a scene (no focus list, no creature, nothing left to undim) does no work on DOM churn.
  const idle = () => {
    const scene = adapter.world?.scene;
    return !scene?.focusApps?.length && !scene?.creature && !host.isConnected && !document.querySelector('[data-ocean-dim], [data-ocean-undim], [data-ocean-focus]');
  };
  const schedule = () => {
    if (pending || idle()) return;
    pending = requestAnimationFrame(() => { pending = 0; refresh(); });
  };

  window.addEventListener('ocean-world', refresh);
  window.addEventListener('resize', schedule);
  M.wins.subscribe(schedule);
  // Windows, Dock icons and the Apps panel mount and unmount as the trainee works: dim and place them as they appear.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', schedule);
  refresh();
})();
