import React, { useLayoutEffect, useRef, useState } from "react";
import { useWorld } from "../../utils/ocean";

// Creature in the wallpaper layer (SCENARIOS-60 contract §3), the Windows twin of the macOS
// scene-fx.js: above the wallpaper, below windows and icons, never takes pointer events. The world
// owns state and target; only the animation clock and the smoothed pose are local. The sprite is a
// same-origin GIF; if it cannot load, the layer stays empty. Pose maths mirrors macOS state for state.
const SPRITE = /^\/ocean-creatures\/[a-z-]+\/(sunlight|twilight|midnight|abyss|trench)\.gif$/;
const MOVE_RATE = 2.2; // per second
const GROW_RATE = 2.6;
const ANCHOR_MS = 400;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isHidden = (creature) => !creature || creature.state == "breakthrough" || !SPRITE.test(String(creature.sprite));
const prefersReducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Where the creature heads for: the target app's frontmost visible window, else its taskbar icon,
// else its desktop icon.
const targetRect = (app) => {
  if (!app) return null;
  const wins = [...document.querySelectorAll(`.oceanWin[data-app="${app}"]:not([data-mode="minimized"])`)].sort(
    (a, b) => Number(b.style.zIndex) - Number(a.style.zIndex),
  );
  const el = wins[0] || document.querySelector(`[data-testid="task-${app}"]`) || document.querySelector(`.dskItem[data-app="${app}"]`);
  const rect = el && el.getBoundingClientRect();
  return rect && rect.width > 0 ? rect : null;
};

// Where the creature rests: the free spot (least covered by windows) of a coarse grid over the open
// desktop, so it shows when there is room. `from` is the previous spot, which damps flicker.
const pickAnchor = (from) => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const s = Math.min(W, H) * 0.13;
  const covers = [...document.querySelectorAll(".oceanWin:not([data-mode='minimized'])")].map((el) => el.getBoundingClientRect());
  const overlap = (x, y) =>
    covers.reduce(
      (sum, r) =>
        sum +
        Math.max(0, Math.min(x + s / 2, r.right) - Math.max(x - s / 2, r.left)) *
          Math.max(0, Math.min(y + s / 2, r.bottom) - Math.max(y - s / 2, r.top)),
      0,
    );
  let best = null;
  for (let column = 1; column <= 7; column += 1) {
    for (let row = 1; row <= 4; row += 1) {
      const x = (W * column) / 8;
      const y = 60 + ((H - 200) * row) / 5;
      const score = overlap(x, y) + Math.hypot(x - from.x, y - from.y) * 4 + Math.abs(x - W / 2) * 2;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return { x: best.x, y: best.y };
};

// The pose a state asks for at time t (seconds). x, y: centre; s: edge length; rot: degrees; sx, sy: squash.
// A window target is approached and circled along its edge, because the creature is drawn behind every window.
const goalPose = (state, targetApp, t, anchor) => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const V = Math.min(W, H);
  const rect = targetRect(targetApp);
  const target = rect
    ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, extent: Math.max(rect.width, rect.height) }
    : { x: W / 2, y: H / 2, extent: V * 0.5 };
  const drift = (ax, ay) => ({ x: ax + Math.sin(t * 0.23) * W * 0.05, y: ay + Math.sin(t * 0.17 + 1) * H * 0.035 });
  let pose;
  if (state == "notice") {
    pose = { ...drift(lerp(anchor.x, W / 2, 0.25), lerp(anchor.y, H / 2, 0.25)), s: V * 0.17, rot: -10, sx: 1, sy: 1 };
  } else if (state == "approach") {
    const edge = rect ? { x: clamp(anchor.x, rect.left, rect.right), y: clamp(anchor.y, rect.top, rect.bottom) } : target;
    pose = {
      x: lerp(anchor.x, edge.x, 0.8) + Math.sin(t * 0.4) * W * 0.015,
      y: lerp(anchor.y, edge.y, 0.8) + Math.sin(t * 0.3) * H * 0.01,
      s: V * 0.26, rot: -6, sx: 1, sy: 1 };
  } else if (state == "circle") {
    const s = V * 0.22;
    const angle = t * 0.7;
    const rx = (rect ? rect.width / 2 : V * 0.1) + s * 0.3;
    const ry = (rect ? rect.height / 2 : V * 0.1) + s * 0.3;
    pose = { x: target.x + Math.cos(angle) * rx, y: target.y + Math.sin(angle) * ry, s, rot: Math.sin(angle) * 10, sx: 1, sy: 1 };
  } else if (state == "press") {
    const pulse = Math.sin(t * 1.1) * 0.02;
    pose = { x: target.x, y: target.y, s: clamp(rect ? target.extent * 1.5 : V * 0.7, V * 0.6, V * 1.4), rot: 0, sx: 1.12 + pulse, sy: 0.88 - pulse };
  } else {
    pose = { ...drift(anchor.x, anchor.y), s: V * 0.13, rot: Math.sin(t * 0.3) * 4, sx: 1, sy: 1 };
  }
  return { ...pose, x: clamp(pose.x, 0, W), y: clamp(pose.y, 0, H) };
};

export const Creature = () => {
  const world = useWorld();
  const creature = (world.scene && world.scene.creature) || null;
  const [failed, setFailed] = useState(null);
  const imgRef = useRef(null);
  const run = useRef({ pose: null, clock: 0, anchor: null }); // survives state changes, so states ease into each other
  const hidden = isHidden(creature);
  const state = hidden ? null : creature.state;
  const sprite = hidden ? null : creature.sprite;
  const target = hidden ? null : creature.targetApp || null;
  const reduced = !!world.sys.reduceMotion || prefersReducedMotion();
  const live = !hidden && failed != sprite;

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!live || !img) return;
    const r = run.current;
    if (!r.anchor) r.anchor = { x: window.innerWidth * 0.64, y: window.innerHeight * 0.52 };
    const draw = () => {
      const p = r.pose;
      img.style.width = img.style.height = `${p.s}px`;
      img.style.transform = `translate(${p.x - p.s / 2}px, ${p.y - p.s / 2}px) rotate(${p.rot}deg) scale(${p.sx}, ${p.sy})`;
    };
    r.anchor = pickAnchor(r.anchor);

    if (reduced) {
      // No movement: the state shows in size and position only, at a fixed time so nothing drifts.
      const place = () => {
        r.anchor = pickAnchor(r.anchor);
        r.pose = goalPose(state, target, 0, r.anchor);
        draw();
      };
      place();
      window.addEventListener("resize", place);
      return () => window.removeEventListener("resize", place);
    }

    let frame = 0;
    let last = performance.now();
    let anchored = last;
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000 || 0);
      last = now;
      r.clock += dt;
      if (now - anchored > ANCHOR_MS) {
        r.anchor = pickAnchor(r.anchor);
        anchored = now;
      }
      const goal = goalPose(state, target, r.clock, r.anchor);
      if (!r.pose) r.pose = goal;
      else {
        const move = 1 - Math.exp(-dt * MOVE_RATE);
        const grow = 1 - Math.exp(-dt * GROW_RATE);
        const p = r.pose;
        r.pose = { x: lerp(p.x, goal.x, move), y: lerp(p.y, goal.y, move), s: lerp(p.s, goal.s, grow), rot: lerp(p.rot, goal.rot, move), sx: lerp(p.sx, goal.sx, grow), sy: lerp(p.sy, goal.sy, grow) };
      }
      draw();
      frame = requestAnimationFrame(step);
    };
    step(last); // place before first paint
    return () => cancelAnimationFrame(frame);
  }, [live, state, target, reduced, world.windows, world.order]);

  // The next appearance starts from its own goal, like a fresh shell after an OS switch.
  useLayoutEffect(
    () => () => {
      run.current.pose = null;
      run.current.clock = 0;
    },
    [live],
  );

  if (!live) return null;
  return (
    <div className="oceanCreatureLayer" aria-hidden="true" data-testid="creature-layer" data-state={state} data-target={target || ""} data-family={creature.family}>
      <img ref={imgRef} className="creatureSprite" data-testid="creature" data-state={state} src={sprite} alt="" draggable="false" onError={() => setFailed(sprite)} />
      <div className="creatureVignette" />
    </div>
  );
};
