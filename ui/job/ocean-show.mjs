// The ocean show: after an upload the job plays out in the ocean menu itself. The agent octopus stretches one long arm to
// catch the file, seals it in the giant clam, prises the clam open to reveal the file's fish, runs and analyses it, then
// carries the fish down while the real ocean scrolls to the verdict depth. In a harmful depth the creature for the worst
// finding comes out of the dark to eat it.
// The octopus body is a one-arm pose sheet (ui/abyss/pixel/creatures/octopus-poses.json) with that arm erased; the arm is
// drawn in code (tentacle.mjs), so it reaches whatever the octopus works on and wraps round what it holds. Every sprite is
// relit each frame with its normal map (pixel-lit.js relight): the light follows the depth, from wavering sunlight above
// to near darkness in the Trench; in the dark the pointer is a torch, and a fish marked as food glows in its tier's colour
// and lights whatever comes for it.
// drop-panel.js opens it after POST /api/jobs answers 202. It folds the job's event stream with the job view's state machine,
// and every step waits (Next stays disabled) until the events it shows have arrived. All event text goes in via textContent.
import { append, el } from './dom.mjs';
import { applyEvent, createJobState, deepestFinding, DEPTH_INFO, DEPTHS, executionText, isDeepDepth, pathText, receiptView, resultSummary, verdictHeading } from './state.mjs';
import { fishSprite, findingFacts, signalLabel, spriteFacesRight } from './creatures.mjs';
import { drawFish, drawSilhouette } from './pixel.mjs';
import { createNetworkSource } from './sse.mjs';
import { cleanName, generateName, nameFor, otherNames, saveName } from './fish-names.mjs';
import { ARMS, armless, armSkin, drawTentacle, pickArm } from './tentacle.mjs';

// The ocean stage (data-st) for each verdict depth.
const ZONE = { sunlight: 1, twilight: 2, midnight: 3, abyss: 4, trench: 5 };
const STEPS = [
  { key: 'catch', label: 'Catch', ready: () => true },
  { key: 'reveal', label: 'Your fish', ready: s => s.typed !== null },
  { key: 'run', label: 'Checks', ready: s => s.rank >= 2 },
  { key: 'analyse', label: 'Analysing', ready: s => s.rank >= 4 || s.verdict !== null },
  { key: 'dive', label: 'The dive', ready: s => s.verdict !== null },
  { key: 'verdict', label: 'Verdict', ready: s => s.verdict !== null },
  { key: 'done', label: 'Done', ready: s => s.receipt !== null || s.finished || s.failed },
];
// Severity colours (the verdict badge's), the "marked as food" stamps, and the glow of a fish marked as food.
const TIER_COLOUR = { sunlight: '#f4f8fc', twilight: '#8fd3ff', midnight: '#ffd166', abyss: '#ff9a5a', trench: '#ff4f6d' }; // the site's severity scale: white, light blue, yellow, orange, red
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const PIX = '/ui/abyss/pixel/creatures/';
const MARK = depth => `/ui/abyss/pixel/marks/mark-${depth}.png`;
const FRONT = id => `${PIX}front/${id}.png`;
const LUNGE = id => `${PIX}front/${id}-lunge.png`;
const EYES = { 'system-wipe': 'jormungandr', encrypt: 'kraken', 'destroy-files': 'leviathan', spread: 'hydra' };
const CLAM = `${PIX}giant-clam-spritesheet.png`;
const IDLE = `${PIX}octopus-sunlight-spritesheet.png`;
// Light by zone (1 Sunlight .. 5 Trench): ambient and key light per colour channel, and the water colour things fade into
// with distance. The key light comes from above left, as painted on the sprites; it wavers with the caustics near the top.
const LIGHTS = [null,
  { ambient: [0.3, 0.31, 0.33], key: [1.32, 1.3, 1.22], water: [29, 111, 134] },
  { ambient: [0.23, 0.27, 0.35], key: [0.8, 0.92, 1.12], water: [18, 62, 102] },
  { ambient: [0.18, 0.2, 0.29], key: [0.38, 0.44, 0.64], water: [10, 26, 58] },
  { ambient: [0.16, 0.17, 0.25], key: [0.22, 0.25, 0.4], water: [6, 13, 34] },
  { ambient: [0.15, 0.15, 0.21], key: [0.14, 0.14, 0.24], water: [3, 5, 12] },
];
const EMISSIVE = { ambient: [1, 1, 1], key: [0, 0, 0], dir: [0, 0, 1], point: null }; // glowing art (Trench eyes) keeps its colours
// Life that streams past during the dive, by zone: file-fish swim sheets (64 px cells) and small deep-sea fish (128 px).
const PASSERS = {
  1: ['mackerel', 'jack', 'butterflyfish', 'flying-fish', 'boxfish'].map(s => `/ui/abyss/pixel/fish/${s}-swim.png`),
  2: ['barracuda', 'ribbonfish', 'pilot-fish', 'sea-bass'].map(s => `/ui/abyss/pixel/fish/${s}-swim.png`),
  3: ['lanternfish', 'hatchetfish'].map(s => `${PIX}${s}-spritesheet.png`),
  4: ['hatchetfish', 'lanternfish'].map(s => `${PIX}${s}-spritesheet.png`),
  5: [],
};
// How alarming one evidence item looks while the file runs, before the rules have judged anything: a quick read of the
// item's own fields (docs/detonation/EVIDENCE.md), shown as the bubble's colour. The verdict stays with the rule engine.
const HONEY = /\/(\.aws\/credentials|\.ssh\/id_|\.env$|wallet|login data|cookies)/i;
const PERSIST = /\/(\.config\/(autostart|systemd)|etc\/(cron|systemd|init\.d|rc\.local|passwd|shadow)|var\/spool\/cron|start menu\/programs\/startup)/i;
const SYSTEM = /^(\/(bin|etc|usr|boot|lib)(\/|$)|[a-z]:\\windows)/i;
const RANSOM = /ransom|decrypt|restore|recover|locked/i;
export function traceSeverity(item) {
  const path = String(item?.path ?? item?.to ?? '');
  switch (item?.kind) {
    case 'unlink': case 'rmdir': return SYSTEM.test(path) ? 'trench' : 'twilight';
    case 'deleted': case 'renamed': return item.seeded ? 'trench' : 'twilight';
    case 'changed': return item.seeded && (item.entropyAfter >= 7.5 || item.sizeAfter === 0) ? 'trench' : item.seeded ? 'abyss' : 'twilight';
    case 'added': return RANSOM.test(path.split('/').pop()) ? 'trench' : item.executable || item.copyOfSample ? 'abyss' : PERSIST.test(path) ? 'abyss' : 'sunlight';
    case 'mail-send': return 'trench';
    case 'file-read': return HONEY.test(path) ? 'midnight' : 'sunlight';
    case 'file-write': case 'rename': return PERSIST.test(path) ? 'abyss' : SYSTEM.test(path) ? 'abyss' : 'sunlight';
    case 'connect': case 'sendto': return item.payloadPreview ? 'midnight' : 'twilight';
    case 'request-blocked': case 'form-submit': return 'midnight';
    case 'setuid': case 'capability': case 'listen': case 'dll-hijack': case 'clone-eagain': return 'abyss';
    case 'key-added': case 'key-changed': case 'key-deleted': return /\\(Run|RunOnce|Winlogon|Services)\\?/i.test(String(item.key)) ? 'abyss' : 'twilight';
    case 'sleep': case 'api-call': return 'twilight';
    default: return 'sunlight';
  }
}
const SEV_RANK = { sunlight: 0, twilight: 1, midnight: 2, abyss: 3, trench: 4 };

const titleCase = slug => String(slug).replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = k => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = k => 1 - (1 - k) ** 3;
const overshoot = k => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // ease out with a small overshoot: an arm snapping to length
const PL = () => window.PixelLit;
// Pixel sprites as colour and normal data, relit each time they are drawn (pixel-lit.js).
const loadSheet = src => (src ? PL().sheet(src).catch(() => null) : Promise.resolve(null));
// A code-drawn canvas as a lit sheet: its normal map comes from its silhouette.
function flat(cv) {
  const data = c => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  return { w: cv.width, h: cv.height, color: data(cv), normal: data(PL().normalFromAlpha(cv)) };
}

function loadStyles(doc) {
  return new Promise(done => {
    if (doc.querySelector('link[data-os]')) return done();
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/ui/job/ocean-show.css';
    link.dataset.os = '';
    link.onload = link.onerror = () => done();
    doc.head.append(link);
    setTimeout(done, 3000);
  });
}

// ---- pixel art drawn in code ------------------------------------------------------------------------------------
function makeCanvas(doc, w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }

// The uploaded file as a paper icon with a folded corner and a gold label band. 12 x 15.
function drawFile(doc) {
  const rows = ['ooooooooo...', 'oppppppppo..', 'opllllllpoo.', 'oppppppppoco', 'opllllllpooo', 'oppppppppppo', 'opllllllllpo',
    'oppppppppppo', 'opllllllllpo', 'oppppppppppo', 'oggggggggggo', 'oggggggggggo', 'oppppppppppo', 'opllllllllpo', 'oooooooooooo'];
  const pal = { o: '#06182a', p: '#effcf8', l: '#9fb4c4', g: '#f4d06a', c: '#c7d6e2' };
  const c = makeCanvas(doc, 12, 15), g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((k, x) => { if (pal[k]) { g.fillStyle = pal[k]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

// Leaving for the report remembers the show in this page's history entry, so Back brings it back where it was
// (drop-panel.js, resume). Never in web storage: the token stays only where the job URL's #hash already keeps it, in this
// tab's history, and goes with the tab.
const RESUME_KEY = 'oceanShow';
export function savedShow(win = window) {
  const s = win.history.state?.[RESUME_KEY];
  return typeof s?.jobId === 'string' && /^[\w-]+$/.test(s.jobId) && typeof s.token === 'string' && s.token ? s : null;
}

/**
 * @param {{jobId: string, token: string, fileName?: string, onFail?: () => void, onClose?: () => void, doc?: Document, storage?: Storage, source?: object, resume?: boolean}} options
 * storage: where fish names are kept (the menu page passes its web storage); names last for the visit without it.
 * source: an event source to play instead of the job's network stream (the localhost-only ?oceanshow= fixture, ui/job/mock.mjs).
 * resume: jump straight to the furthest step the job's events allow (coming back from the report), without the animations.
 * story: the words for a show that is not an upload (threat search, ui/job/threat-source.mjs): { anchor, catch, sealed, reveal(state),
 *   run(state), count(n), analyse(state), verdict(state), done(state), waiting(state), failed(state), play }. No report, no resume.
 */
export async function openOceanShow({ jobId, token, fileName = 'your file', onFail, onClose, doc = document, storage = null, source = createNetworkSource({ jobId, token }), resume = false, story = null } = {}) {
  await loadStyles(doc);
  const win = doc.defaultView;
  const prefersReduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let reduced = prefersReduced || resume; // while resuming, every step plays as it does with reduced motion: at once
  const remember = () => { if (!story) win.history.replaceState({ ...win.history.state, [RESUME_KEY]: { jobId, token, fileName } }, ''); };
  const forget = () => { if (win.history.state?.[RESUME_KEY]) win.history.replaceState({ ...win.history.state, [RESUME_KEY]: null }, ''); };
  const lenis = win.__lenis;
  const state = createJobState();
  const reportUrl = `/job/${jobId}?seen#${token}`; // ?seen: the job view skips the dive this show already told (main.mjs)
  // The Windows and macOS training desktops are private local assets: the server says whether it serves them (never on the
  // public site). Where it does, an eaten fish can be replayed there: /desktop.html?job=<replayId> plays the job's evidence.
  const desktops = fetch('/api/desktop-templates/status', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).then(s => s?.enabled === true).catch(() => false);
  let eatenFish = false;
  const controller = new AbortController();
  const name = String(fileName).slice(0, 60);

  // ---- layers ---------------------------------------------------------------------------------------------------
  const root = el(doc, 'div', 'os');
  const canvas = el(doc, 'canvas', 'os-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const labels = el(doc, 'div', 'os-labels');
  const fileTag = el(doc, 'p', 'os-tag os-file-tag', name);
  const fishTag = el(doc, 'p', 'os-tag os-fish-tag');
  const zoneBanner = el(doc, 'p', 'os-zone'); // names each zone as the dive passes into it
  const term = el(doc, 'div', 'os-term');
  const termHead = el(doc, 'p', 'os-term-head', 'octopus@sandbox');
  const termBody = el(doc, 'ol', 'os-term-body');
  append(term, termHead, termBody);
  // The revealed fish is a real button: pointing at it makes it turn and drift toward you, pressing it makes it hop.
  const fishHit = el(doc, 'button', 'os-fish-hit');
  fishHit.type = 'button';
  for (const node of [fileTag, fishTag, term, fishHit, zoneBanner]) node.hidden = true;
  append(labels, fishHit, fileTag, fishTag, term, zoneBanner);

  const flash = el(doc, 'div', 'os-flash');
  flash.setAttribute('aria-hidden', 'true');
  const bar = el(doc, 'section', 'os-bar');
  bar.setAttribute('aria-labelledby', 'os-title');
  bar.setAttribute('role', 'region');
  const pips = el(doc, 'ol', 'os-pips');
  for (const step of STEPS) pips.append(el(doc, 'li', 'os-pip', step.label));
  const title = el(doc, 'h2', 'os-title');
  title.id = 'os-title';
  const text = el(doc, 'div', 'os-text');
  text.setAttribute('aria-live', 'polite');
  const status = el(doc, 'span', 'os-status');
  const next = el(doc, 'button', 'os-btn os-next', 'Next ▶');
  next.type = 'button';
  const nav = el(doc, 'div', 'os-nav');
  append(nav, status, next);
  const skip = el(doc, 'a', 'os-btn os-skip', 'Open full report →');
  skip.href = reportUrl;
  skip.addEventListener('click', remember);
  append(bar, pips, title, text, nav, skip);
  append(root, canvas, flash, labels, bar);

  // ---- art --------------------------------------------------------------------------------------------------------
  const OCT = 64; // drawn size of the 128 px octopus cell, in art pixels
  const paper = flat(drawFile(doc));
  const [clamSheet, clamIndex, poseIndex, idleSheet, swimSheet] = await Promise.all([
    loadSheet(CLAM),
    fetch(`${PIX}giant-clam.json`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${PIX}octopus-poses.json`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    loadSheet(IDLE),
    loadSheet(`${PIX}octopus-swim-pose-spritesheet.png`),
  ]);
  const bodies = {};
  let skin = null; // the drawn arm's pixels, sampled from the left pose's own arm (tentacle.mjs armSkin)
  await Promise.all(Object.entries(ARMS).map(async ([key, a]) => {
    const entry = poseIndex?.poses?.[a.pose], sheet = await loadSheet(entry?.sheet);
    if (key === 'left') skin = armSkin(sheet, 128 / OCT);
    bodies[key] = armless(sheet, entry?.anchors?.tip);
  }));
  const clamAnchors = clamIndex?.anchors ?? [];
  let fishSheet = null, fishPlain = null, markSheet = null;
  let creatureSheet = null, creatureFlip = false, creaturePlain = null, frontImg = null, lungeSheet = null, eyesSheet = null;
  const passerSheets = new Map();

  // ---- canvas at the theme's pixel size --------------------------------------------------------------------------
  const P = Math.max(3, Math.round(1.5 * (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--u')) || 4))); // 1.5x the theme pixel: the show is the main subject
  const g = canvas.getContext('2d');
  let W = 0, H = 0;
  function resize() {
    const w = Math.ceil(win.innerWidth / P), h = Math.ceil(win.innerHeight / P);
    if (W && H) for (const o of [oct, clam, file, fish, creature, eyes]) { o.x *= w / W; o.y *= h / H; }
    W = canvas.width = w;
    H = canvas.height = h;
    canvas.style.width = `${w * P}px`;
    canvas.style.height = `${h * P}px`;
    g.imageSmoothingEnabled = false;
  }
  // Stage centre: right of the caption bar (bottom left) and clear of the depth gauge (right).
  const cx = () => W * 0.6;
  const cy = () => H * 0.36;
  // Highest point anything may reach: just under the nav bar.
  const topLimit = () => (doc.querySelector('.bar')?.getBoundingClientRect().bottom ?? 48) / P + 2;
  // Furthest right anything may reach: just left of the depth gauge and its zone names (right edge).
  const rightLimit = () => {
    const r = doc.querySelector('.gauge')?.getBoundingClientRect();
    return r?.width && r.left > win.innerWidth / 2 ? r.left / P - 4 : W - 8;
  };

  // ---- scene objects (art pixels) -------------------------------------------------------------------------------
  // body: the arm in use (ARMS key) and whether the body is mirrored; prev/fade cross-fade the body when the arm changes.
  const oct = { x: -60, y: -60, visible: false, body: 'left', mirror: false, prev: null, fade: 1, swim: false };
  // The drawn arm. out: 0 curled at rest beside the body, 1 at aim(). from/blend: moving an outstretched tip to a new aim.
  // hold: the object it carries in its curl (that object follows the tip); wrap: an object it curls round without moving it.
  const arm = { out: 0, aim: null, from: null, blend: 1, hold: null, wrap: null, side: 1, hidden: false };
  const clam = { x: 0, y: 0, f: 7, visible: false, a: 1, shake: false, jolt: 0, front: false };
  const file = { x: 0, y: 0, visible: false, s: 1, a: 1, r: 6, ox: 0, oy: 0 };
  // free: the fish is idle and answers the pointer (ox, oy: its drift; hop: when it was last pressed).
  // tilt: nose-down angle while it sinks; rim: outline colour (the tier's colour once it is marked as food); mark: stamp scale.
  const fish = { x: 0, y: 0, visible: false, s: 1, a: 1, r: 6, dir: -1, free: false, ox: 0, oy: 0, hop: -1e9, tilt: 0, rim: '#b9f4ea', mark: 0, shake: false };
  const pointer = { x: 0, y: 0, in: false };
  let fishName = '';
  // a: alpha, s: scale, fog: how far into the dark water it still is (0 close and lit, 1 a dim shape). view: 'side' (swim
  // sheet), 'front' (facing the viewer) or 'lunge' (the bite sheet, frame f); squash: horizontal scale while it turns.
  // anim: the swim sheet's frame, which keeps counting as it speeds up (swim); mix: its light as the background creature was
  // lit (from), blending into the show's light (k 0 .. 1). No outline: it is the ocean's own sprite, drawn as the ocean draws it.
  const creature = { x: 0, y: 0, visible: false, dir: -1, a: 1, s: 1, fog: 0, view: 'side', f: 0, squash: 1, swim: 1, anim: 0, mix: null };
  const eyes = { x: 0, y: 0, visible: false, a: 0, s: 1, phase: 0 };
  let hiddenEnt = null; // the ocean's own copy of the creature, kept out of sight while the show draws it
  const scene = { depth: 1 }; // light depth: 1 Sunlight .. 5 Trench, fractional during the dive
  let glow = null; // { o, colour }: a glowing object that lights its surroundings
  const bubbles = [];
  const sparks = [];
  const passers = [];
  const snow = [];
  let scrollV = 0, lastScroll = win.scrollY;

  // ---- the frame loop and tweens --------------------------------------------------------------------------------
  const tasks = new Set();
  let raf = 0;
  let closed = false;
  function tween(ms, fn, curve = ease) {
    if (reduced || ms <= 0) { fn(1); return Promise.resolve(); }
    return new Promise(done => {
      let t0 = null;
      tasks.add(t => { t0 ??= t; const k = Math.min(1, (t - t0) / ms); fn(curve(k)); if (k < 1) return true; done(); return false; });
    });
  }
  const wait = ms => tween(ms, () => {});
  const moveTo = (o, x, y, ms, curve) => { const x0 = o.x, y0 = o.y; return tween(ms, k => { o.x = lerp(x0, x, k); o.y = lerp(y0, y, k); }, curve); };
  const clamTo = (f, ms) => { const f0 = clam.f; return tween(ms, k => { clam.f = lerp(f0, f, k); }); };
  function puff(x, y, n = 8) { for (let i = 0; i < n; i += 1) bubbles.push({ x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 6, vy: 0.25 + Math.random() * 0.5, life: 60 + Math.random() * 60, r: Math.random() < 0.3 ? 2 : 1 }); }
  function sparkle(x, y, n = 10, colour = '#f4d06a', speed = 0.9) { for (let i = 0; i < n; i += 1) { const a = (i / n) * Math.PI * 2; sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 34, colour }); } }
  const sparkleIn = (x, y, colour, n) => sparkle(x, y, n, colour, 0.6);

  // ---- light ----------------------------------------------------------------------------------------------------
  const rig = { ambient: [0, 0, 0], key: [0, 0, 0], dir: [0, 0, 1], point: null };
  const water = [0, 0, 0];
  function updateLight(t) {
    const d = clamp(scene.depth, 1, 5), i = Math.min(4, Math.floor(d)), k = d - i, A = LIGHTS[i], B = LIGHTS[i + 1];
    for (let c = 0; c < 3; c++) {
      rig.ambient[c] = lerp(A.ambient[c], B.ambient[c], k); rig.key[c] = lerp(A.key[c], B.key[c], k); water[c] = lerp(A.water[c], B.water[c], k);
    }
    const sun = Math.max(0, 2 - d); // 1 at the surface, 0 from Twilight down
    const x = -0.45 + 0.16 * sun * Math.sin(t / 700), y = 0.6 + 0.08 * sun * Math.sin(t / 1100 + 1), z = 0.66, l = Math.hypot(x, y, z);
    rig.dir = [x / l, y / l, z / l];
    rig.point = null;
    if (glow?.o.visible) rig.point = { x: glow.o.x + (glow.o.ox ?? 0), y: glow.o.y + (glow.o.oy ?? 0), z: 12, range: 56, colour: glow.colour };
    else if (pointer.in && d >= 2.5) rig.point = { x: pointer.x, y: pointer.y, z: 16, range: 44, colour: [1.15, 1.02, 0.85] };
  }
  const waterCss = (a = 1) => `rgb(${water.map(Math.round).join(' ')} / ${a})`;

  // ---- drawing ------------------------------------------------------------------------------------------------
  // Draws region (sx, sy, sw, sh) of a lit sheet into the w x h box at (x, y) under the scene light.
  // mirror: flipped (and lit as flipped); rim: a one-pixel outline colour; fog: 0..1 towards the water colour (distance);
  // rot: radians about the centre; squash: horizontal scale (a sprite turning); light: another rig (EMISSIVE).
  const rimCanvas = makeCanvas(doc, 8, 8), rimG = rimCanvas.getContext('2d');
  function lit(sheet, sx, sy, sw, sh, x, y, w, h, { mirror = false, alpha = 1, rim = null, fog = 0, rot = 0, squash = 1, light = rig } = {}) {
    if (!sheet || alpha <= 0.01) return;
    x = Math.round(x); y = Math.round(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const local = light.point ? { ...light, point: { ...light.point, x: light.point.x - x, y: light.point.y - y } } : light;
    const img = PL().relight(sheet, sx, sy, sw, sh, w, h, local, mirror);
    if (fog > 0.01) {
      const c = img.getContext('2d');
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = waterCss(Math.min(1, fog)); c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.globalAlpha = alpha;
    g.translate(x + w / 2, y + h / 2);
    if (rot) g.rotate(rot);
    if (squash !== 1) g.scale(Math.max(0.02, squash), 1);
    if (rim) {
      rimCanvas.width = w; rimCanvas.height = h;
      rimG.drawImage(img, 0, 0);
      rimG.globalCompositeOperation = 'source-in'; rimG.fillStyle = rim; rimG.fillRect(0, 0, w, h); rimG.globalCompositeOperation = 'source-over';
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(rimCanvas, -w / 2 + ox, -h / 2 + oy);
    }
    g.drawImage(img, -w / 2, -h / 2);
    g.restore();
  }

  // The clam's anchors (128 px cell) on the canvas, interpolated between frames so an arm on the lid moves smoothly.
  function clamPoint(name) {
    const f = clamp(clam.f, 0, 7), a = clamAnchors[Math.floor(f)]?.[name], b = clamAnchors[Math.ceil(f)]?.[name] ?? a;
    if (!a) return { x: clam.x, y: clam.y + (name === 'lip' ? lerp(-18, 0, f / 7) : 4) };
    const k = f - Math.floor(f);
    return { x: clam.x + (lerp(a[0], b[0], k) / 128 - 0.5) * 64, y: clam.y + (lerp(a[1], b[1], k) / 128 - 0.5) * 64 };
  }
  const lipOf = () => clamPoint('lip');
  const mouthOf = () => clamPoint('gape');

  // Where the arm leaves the body, its heading, its resting tip and its current tip.
  function armGeometry(t) {
    const a = ARMS[oct.body], m = oct.mirror ? -1 : 1, bob = Math.sin(t * 0.003);
    const root = { x: oct.x + m * (a.root[0] / 128 - 0.5) * OCT, y: oct.y + bob + (a.root[1] / 128 - 0.5) * OCT };
    const dir = { x: m * a.dir[0], y: a.dir[1] };
    const rest = { x: root.x + dir.x * 11 - dir.y * m * 2, y: root.y + dir.y * 11 + 3 };
    const aim = arm.aim?.() ?? rest;
    const tip = arm.from ? { x: lerp(arm.from.x, aim.x, arm.blend), y: lerp(arm.from.y, aim.y, arm.blend) }
      : { x: lerp(rest.x, aim.x, arm.out), y: lerp(rest.y, aim.y, arm.out) };
    return { root, dir, rest, tip };
  }
  const armTip = () => armGeometry(performance.now()).tip;

  function drawArm(t) {
    const { root, dir, tip } = armGeometry(t);
    const held = arm.hold ?? arm.wrap;
    let end = tip, hold = null;
    if (held) {
      // The tip meets the object on the side facing the body, then the curl wraps round it.
      const r = held.r * (held.s ?? 1) + 1, dx = tip.x - root.x, dy = tip.y - root.y, l = Math.hypot(dx, dy) || 1;
      const c = { x: held.x + (held.ox ?? 0), y: held.y + (held.oy ?? 0) };
      end = { x: c.x - (dx / l) * r, y: c.y - (dy / l) * r };
      hold = { x: c.x, y: c.y, r };
    }
    const reachK = clamp(Math.hypot(end.x - root.x, end.y - root.y) / 60, 0, 1);
    const tent = drawTentacle({ root, dir, tip: end, side: arm.side, width: 1.9, hold, skin,
      wave: { amp: held ? 0.6 : 1.5 - 0.6 * reachK, phase: t * 0.005, curl: 1 - 0.35 * reachK } });
    lit(tent.sheet, 0, 0, tent.sheet.w, tent.sheet.h, tent.x, tent.y, tent.sheet.w, tent.sheet.h);
  }

  function drawOctopus(t, tick) {
    if (!oct.visible) return;
    const x = oct.x - OCT / 2, y = oct.y - OCT / 2 + Math.sin(t * 0.003);
    if (oct.swim) { lit(swimSheet, tick * 128, 0, 128, 128, x, y, OCT, OCT, { mirror: oct.mirror }); return; }
    if (!arm.hidden) drawArm(t); // the arm first: its root tucks under the body
    // Two-phase blend when the arm changes: the new body fades in over the old one, then the old fades out.
    const now = bodies[oct.body] ?? idleSheet;
    if (oct.prev && oct.fade < 1) {
      const was = bodies[oct.prev.body] ?? idleSheet;
      const [under, uMirror, over, oMirror, a] = oct.fade < 0.5 ? [was, oct.prev.mirror, now, oct.mirror, oct.fade * 2] : [now, oct.mirror, was, oct.prev.mirror, (1 - oct.fade) * 2];
      lit(under, tick * 128, 0, 128, 128, x, y, OCT, OCT, { mirror: uMirror });
      lit(over, tick * 128, 0, 128, 128, x, y, OCT, OCT, { mirror: oMirror, alpha: a });
    } else lit(now, tick * 128, 0, 128, 128, x, y, OCT, OCT, { mirror: oct.mirror });
  }

  function drawClam(front = false) {
    if (!clam.visible || !clamSheet) return;
    const shake = clam.shake && !reduced ? (Math.floor(performance.now() / 70) % 2 ? 1 : -1) * (1 + clam.jolt) : 0;
    const x = clam.x - 32 + shake, y = clam.y - 32;
    if (!front) { lit(clamSheet, Math.round(clamp(clam.f, 0, 13)) * 128, 0, 128, 128, x, y, 64, 64, { alpha: clam.a }); return; }
    // The lower valve again, over whatever is going in or coming out of the gape.
    const cut = Math.round(mouthOf().y + 1);
    g.save();
    g.beginPath(); g.rect(Math.round(x) - 1, cut, 66, Math.round(y) + 66 - cut); g.clip();
    lit(clamSheet, Math.round(clamp(clam.f, 0, 13)) * 128, 0, 128, 128, x, y, 64, 64);
    g.restore();
  }

  function drawFishNow(t, tick) {
    if (!fish.visible || fish.s <= 0) return;
    const hop = Math.max(0, 1 - (t - fish.hop) / 600);
    const jolt = fish.shake && !reduced ? (Math.floor(t / 60) % 2 ? 1 : -1) : 0;
    const fx = fish.x + fish.ox + jolt, fy = fish.y + fish.oy - Math.sin(hop * Math.PI) * 10;
    const rot = fish.tilt * (fish.dir > 0 ? -1 : 1);
    // A glowing fish lights its surroundings, not itself: its own glow only tints it, so its sprite keeps its detail.
    const light = glow?.o === fish && rig.point ? { ...rig, point: { ...rig.point, colour: rig.point.colour.map(v => v * 0.3) } } : rig;
    if (fishSheet) { const size = 48 * fish.s; lit(fishSheet, tick * 64, 0, 64, 64, fx - size / 2, fy - size / 2, size, size, { mirror: fish.dir > 0, alpha: fish.a, rim: fish.rim, rot, light }); }
    else if (fishPlain) lit(fishPlain, 0, 0, 24, 12, fx - 12 * fish.s, fy - 6 * fish.s, 24 * fish.s, 12 * fish.s, { mirror: fish.dir < 0, alpha: fish.a, rim: fish.rim, rot, light });
    // The "marked as food" stamp sits on the fish's body (its name tag is above it), pulsing in the tier's colour.
    if (markSheet && fish.mark > 0) {
      const m = 14 * fish.mark * (1 + 0.08 * Math.sin(t * 0.008));
      lit(markSheet, 0, 0, markSheet.w, markSheet.h, fx - m / 2, fy - m / 2, m, m, { alpha: 0.92, light: EMISSIVE });
    }
  }

  function drawCreature(t) {
    if (eyes.visible && eyesSheet && eyes.a > 0) {
      const e = 110 * eyes.s;
      lit(eyesSheet, (Math.floor(t / 150 + eyes.phase) % 14) * 128, 0, 128, 128, eyes.x - e / 2, eyes.y - e / 2, e, e, { alpha: eyes.a, light: mixRig(EMISSIVE, { x: eyes.x - e / 2, y: eyes.y - e / 2, size: e }) });
    }
    if (!creature.visible || creature.a <= 0) return;
    const c = 80 * creature.s, x = creature.x - c / 2, y = creature.y - c / 2;
    const opts = { alpha: creature.a, fog: creature.fog, squash: creature.squash, light: mixRig(rig, { x, y, size: c }) };
    if (creature.view === 'lunge' && lungeSheet) lit(lungeSheet, Math.min(7, creature.f) * 128, 0, 128, 128, x, y, c, c, opts);
    else if (creature.view !== 'side' && frontImg) lit(frontImg, 0, 0, 128, 128, x, y, c, c, opts);
    else if (creatureSheet) {
      lit(creatureSheet, (Math.floor(creature.anim) % 14) * 128, 0, 128, 128, x, y, c, c, { ...opts, mirror: (creature.dir > 0) !== creatureFlip });
    } else if (creaturePlain) lit(creaturePlain, 0, 0, 16, 12, creature.x - 16 * creature.s, creature.y - 12 * creature.s, 32 * creature.s, 24 * creature.s, opts);
  }

  // The light the background creature was drawn with, easing into `target` as the creature comes forward. box: where it is drawn
  // ({ x, y, size }, art pixels), which places the torch light it was lit by.
  function mixRig(target, box) {
    const m = creature.mix;
    if (!m) return target;
    const blend = (a, b) => a.map((v, i) => lerp(v, b[i], m.k));
    const dir = blend(m.from.dir, target.dir), l = Math.hypot(...dir), p = m.from.point;
    const point = p && m.k < 1 ? { x: box.x + (0.5 + p.x) * box.size, y: box.y + (0.5 - p.y) * box.size, z: p.z * box.size, range: p.range * box.size, colour: p.colour.map(v => v * (1 - m.k)) } : target.point;
    return { ambient: blend(m.from.ambient, target.ambient), key: blend(m.from.key, target.key), dir: dir.map(v => v / l), point };
  }

  // Life passing in the water while the fish is carried down: far schools behind everything, near fish in front.
  function drawPassers(t, near) {
    for (const p of passers) {
      if (p.near !== near) continue;
      const cell = p.sheet.h, f = (Math.floor(t / 130) + p.phase) % 14;
      for (let i = 0; i < p.n; i++) {
        const ox = (i % 3) * p.size * 0.7 - p.size * 0.7 + (i > 2 ? p.size * 0.35 : 0), oy = Math.floor(i / 3) * p.size * 0.45 + Math.sin(t / 400 + i) * 1.5;
        lit(p.sheet, ((f + i * 3) % 14) * cell, 0, cell, cell, p.x + ox - p.size / 2, p.y + oy - p.size / 2, p.size, p.size,
          { mirror: p.vx > 0, alpha: (near ? 0.9 : 0.75) * p.a, fog: near ? 0.35 : 0.6 });
      }
    }
  }

  function drawFrame(t) {
    g.clearRect(0, 0, W, H);
    const tick = Math.floor(t / 150) % 14;
    // Marine snow: still motes that streak upward as the camera falls past them.
    g.fillStyle = '#d9f2f2';
    for (const s of snow) { g.globalAlpha = 0.2 + 0.4 * s.z; g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1 + Math.min(4, Math.abs(scrollV) * s.z * 0.6)); }
    g.globalAlpha = 1;
    drawPassers(t, false);
    drawClam();
    if (file.visible && file.a > 0) lit(paper, 0, 0, 12, 15, file.x - 6 * file.s, file.y - 7.5 * file.s, 12 * file.s, 15 * file.s, { alpha: file.a });
    drawFishNow(t, tick);
    drawOctopus(t, tick);
    if (clam.front) drawClam(true);
    drawCreature(t);
    g.fillStyle = '#b9f4ea';
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i];
      b.y -= b.vy + scrollV; b.x += Math.sin((b.y + i) * 0.2) * 0.15; b.life -= 1;
      if (b.life <= 0 || b.y < -4) { bubbles.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, b.life / 30) * 0.8;
      g.fillRect(Math.round(b.x), Math.round(b.y), b.r, b.r);
    }
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      g.fillStyle = s.colour ?? '#f4d06a';
      s.x += s.vx; s.y += s.vy; s.life -= 1;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      g.globalAlpha = s.life / 34;
      g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    g.globalAlpha = 1;
    drawPassers(t, true);
  }

  // DOM labels follow their objects (art pixels times P).
  function place(node, x, y) { node.style.transform = `translate(${Math.round(x * P)}px, ${Math.round(y * P)}px)`; }
  function drawLabels() {
    if (!fileTag.hidden) place(fileTag, file.x, file.y - 12);
    if (!fishTag.hidden) place(fishTag, Math.min(fish.x + fish.ox, rightLimit() - fishTag.offsetWidth / P / 2), Math.max(fish.y + fish.oy - 26 * fish.s, topLimit() + 6));
    fishHit.hidden = !(fish.free && fish.visible);
    if (!fishHit.hidden) { place(fishHit, fish.x + fish.ox, fish.y + fish.oy); fishHit.style.width = fishHit.style.height = `${Math.round(40 * fish.s * P)}px`; }
    if (!term.hidden) { const tip = armTip(); place(term, tip.x - 2, tip.y - 4); }
  }

  let lastT = 0;
  function frame(t) {
    if (closed) return;
    creature.anim += (t - lastT) / 150 * creature.swim; // the sheet plays faster while the creature is moving in
    lastT = t;
    scrollV = (win.scrollY - lastScroll) / P;
    lastScroll = win.scrollY;
    for (const task of [...tasks]) if (!task(t)) tasks.delete(task);
    if (arm.hold) { const tip = armGeometry(t).tip; arm.hold.x = tip.x; arm.hold.y = tip.y; }
    // A free fish turns to a nearby pointer and drifts up to 10 art pixels toward it; otherwise the drift eases back to a bob.
    const near = fish.free && pointer.in && Math.hypot(pointer.x - fish.x, pointer.y - fish.y) < 60;
    const dx = near ? Math.max(-10, Math.min(10, (pointer.x - fish.x) * 0.25)) : 0, dy = near ? Math.max(-6, Math.min(6, (pointer.y - fish.y) * 0.2)) : 0;
    fish.ox = lerp(fish.ox, dx, 0.06); fish.oy = lerp(fish.oy, dy + (fish.free ? Math.sin(t * 0.002) * 2 : 0), 0.06);
    if (near && Math.abs(pointer.x - fish.x) > 4) fish.dir = pointer.x > fish.x ? 1 : -1;
    if (clam.shake && !reduced && Math.random() < 0.15) puff(clam.x + (Math.random() - 0.5) * 20, clam.y - 10, 1);
    if (clam.jolt) clam.jolt = Math.max(0, clam.jolt - 0.05);
    for (let i = passers.length - 1; i >= 0; i--) {
      const p = passers[i];
      p.y -= scrollV * p.par; p.x += p.vx * (p.leave ? 4 : 1);
      if (p.leave) p.a -= 0.015;
      if (p.a <= 0 || p.y < -p.size * 2 || p.x < -p.size * 3 || p.x > W + p.size * 3) passers.splice(i, 1);
    }
    for (const s of snow) {
      s.y -= scrollV * (0.35 + 0.9 * s.z) - 0.04; s.x += Math.sin(t / 900 + s.z * 9) * 0.03;
      if (s.y < -10) { s.y += H + 20; s.x = Math.random() * W; } else if (s.y > H + 10) s.y -= H + 20;
    }
    updateLight(t);
    drawFrame(t);
    drawLabels();
    raf = win.requestAnimationFrame(frame);
  }

  // ---- the arm ------------------------------------------------------------------------------------------------
  const asAim = aim => (typeof aim === 'function' ? aim : () => aim);
  // The arm whose heading points most nearly at p; the body swaps to it (cross-fade) after the old arm has curled back.
  async function turnTo(p) {
    const { body, mirror, side } = pickArm(p.x - oct.x, p.y - (oct.y + 4));
    if (body === oct.body && mirror === oct.mirror) { arm.side = side; return; }
    if (arm.out > 0.05 || arm.from) await armIn(240);
    oct.prev = { body: oct.body, mirror: oct.mirror };
    oct.body = body; oct.mirror = mirror; oct.fade = 0; arm.side = side;
    await tween(200, k => { oct.fade = k; }, k => k);
    oct.prev = null;
  }
  // Stretch the arm from its rest curl to `aim` (a point, or a function for a moving target).
  async function reach(aim, ms = 560) {
    const at = asAim(aim);
    await turnTo(at());
    const from = arm.out > 0.05 ? armTip() : null;
    arm.aim = at;
    if (from) { arm.from = from; arm.blend = 0; arm.out = 1; await tween(ms, k => { arm.blend = k; }); arm.from = null; return; }
    await tween(ms, k => { arm.out = k; }, overshoot);
  }
  // Move the outstretched tip to a new aim without curling back first.
  async function armTo(aim, ms = 500, curve = ease) {
    arm.from = armTip(); arm.blend = 0; arm.aim = asAim(aim); arm.out = 1;
    await tween(ms, k => { arm.blend = k; }, curve);
    arm.from = null;
  }
  // Curl the arm back to rest beside the body (anything it holds comes along).
  async function armIn(ms = 420) {
    if (arm.from) { const at = armTip(); arm.aim = () => at; arm.from = null; }
    const o0 = arm.out;
    await tween(ms, k => { arm.out = lerp(o0, 0, k); });
  }
  // Where a held thing is carried: just out from the body, on the arm's side.
  const carryAim = () => { const a = ARMS[oct.body]; return { x: oct.x + (oct.mirror ? -1 : 1) * a.dir[0] * 24, y: oct.y + 14 + a.dir[1] * 8 }; };

  // ---- story beats ------------------------------------------------------------------------------------------------
  const facts = () => { const f = deepestFinding(state.findings); return f ? findingFacts(f) : null; };
  const speciesName = () => titleCase(state.typed?.species ?? 'fish');
  const para = (value, className = '') => el(doc, 'p', className, value);
  const setText = (...nodes) => text.replaceChildren(...nodes.filter(Boolean));
  let evidenceShown = 0;
  let runCount = null;
  // Where the octopus waits while it works the clam: up and to the left of it, the clam in easy reach of one arm.
  const station = () => ({ x: clam.x - 44, y: Math.max(clam.y - 34, topLimit() + OCT / 2) });
  const present = () => ({ x: clam.x + 4, y: clam.y - 30 }); // where a fish is shown, above the clam

  // One arm hooks the lip of the upper valve and heaves it up (or pushes it shut), riding the valve as it moves.
  async function prise(open, ms = 800) {
    if (Math.hypot(oct.x - station().x, oct.y - station().y) > 3) await moveTo(oct, station().x, station().y, 500);
    await reach(() => { const p = lipOf(); return { x: p.x - 3, y: p.y - 1 }; }, 480);
    await clamTo(open ? 0 : 7, ms);
    puff(clam.x, clam.y - 4, open ? 10 : 6);
    await armIn(360);
  }
  // Something held goes into the gape: the lower valve is drawn over it as the arm lowers it in.
  async function dipIn(o) {
    clam.front = true;
    await armTo(() => { const p = mouthOf(); return { x: p.x, y: p.y + 7 }; }, 560);
    const s0 = o.s;
    await tween(260, k => { o.s = lerp(s0, s0 * 0.7, k); });
    arm.hold = null; o.visible = false; o.s = s0;
    await armIn(420);
    clam.front = false;
  }
  // The arm reaches into the gape and comes up with `o` (the fish) curled in its tip.
  async function dipOut(o) {
    clam.front = true;
    await reach(() => { const p = mouthOf(); return { x: p.x, y: p.y + 7 }; }, 560);
    o.visible = true; arm.hold = o;
    puff(mouthOf().x, mouthOf().y, 6);
    await armTo(present, 700, easeOut);
    clam.front = false;
  }

  // Stamped as food for its depth: the fish shudders, takes the tier's colour, glows in it and gets the tier's mark.
  async function markAsFood(depth) {
    markSheet = await loadSheet(MARK(depth));
    fish.rim = TIER_COLOUR[depth] ?? TIER_COLOUR.abyss;
    glow = { o: fish, colour: rgbOf(fish.rim).map(v => v * 1.6) };
    fish.shake = true;
    react(depth);
    sparkle(fish.x, fish.y, 10 + 4 * SEV_RANK[depth], fish.rim, 1.1);
    await tween(450, k => { fish.mark = k < 0.7 ? k / 0.7 * 1.3 : 1.3 - (k - 0.7) / 0.3 * 0.3; }, k => k);
    await wait(900);
    fish.shake = false;
  }

  // A screen-wide reaction scaled to severity: a soft glow for clean, an amber pulse for risky, then a flash in the
  // tier's colour with a screen shake that grows with depth (the bite adds a harder one).
  function react(depth, bite = false) {
    const rank = SEV_RANK[depth] ?? 0;
    flash.dataset.sev = depth;
    flash.classList.remove('on');
    void flash.offsetWidth; // restart the animation
    flash.classList.add('on');
    if (rank >= 2 && !reduced) {
      root.style.setProperty('--shake', `${(rank - 1) * (bite ? 4 : 2)}px`);
      root.classList.remove('os-shake');
      void root.offsetWidth;
      root.classList.add('os-shake');
    }
  }
  const showFishTag = (suffix = '') => { fishTag.textContent = `${fishName} · ${speciesName()}${suffix}`; fishTag.hidden = false; };

  function pet() {
    if (!fish.free) return;
    fish.hop = performance.now();
    fish.dir = -fish.dir;
    sparkle(fish.x + fish.ox, fish.y + fish.oy, 10);
    puff(fish.x + fish.ox, fish.y + fish.oy - 4, 6);
  }
  fishHit.addEventListener('click', pet);
  const onPointer = event => { pointer.x = event.clientX / P; pointer.y = event.clientY / P; pointer.in = true; };
  const onLeave = () => { pointer.in = false; };
  win.addEventListener('pointermove', onPointer);
  doc.documentElement.addEventListener('pointerleave', onLeave);

  // Name the fish: a generated two-word name until the visitor types one. Stored in this browser only.
  function nameRow() {
    const row = el(doc, 'div', 'os-name');
    const label = el(doc, 'label', 'os-name-label', 'Name your fish');
    const input = el(doc, 'input', 'os-name-input');
    input.id = `os-name-${jobId}`;
    label.htmlFor = input.id;
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = fishName;
    const reroll = el(doc, 'button', 'os-btn os-name-new', '↻ New name');
    reroll.type = 'button';
    let turn = 0;
    const commit = value => { fishName = value; saveName(jobId, value, storage); fishHit.setAttribute('aria-label', `${value} the ${speciesName()}: press to make it hop`); showFishTag(); };
    input.addEventListener('input', () => { const value = cleanName(input.value); if (value) commit(value); });
    input.addEventListener('change', () => { const value = cleanName(input.value) || generateName(jobId, state.typed?.species, otherNames(jobId, storage)); input.value = value; commit(value); });
    reroll.addEventListener('click', () => { turn += 1; const value = generateName(jobId, state.typed?.species, otherNames(jobId, storage), turn); input.value = value; commit(value); });
    append(row, label, input, reroll);
    return row;
  }

  // Where the fish's own school sits on screen (art pixels), from the renderer's school records; null if it has none yet.
  function schoolSpot(depth) {
    const ocean = win.__ocean;
    const ent = ocean?.ents?.find(e => e.a?.id === `school-${state.typed?.species}-${depth}`);
    if (!ent?.pos?.clone || !ocean.camera) return null;
    const v = ent.pos.clone().project(ocean.camera);
    if (!(v.z < 1)) return null;
    return { x: Math.max(-20, Math.min(W + 20, (v.x + 1) / 2 * win.innerWidth / P)), y: Math.max(-20, Math.min(H + 20, (1 - v.y) / 2 * win.innerHeight / P)) };
  }

  // The creature the ocean itself draws for a finding, as the renderer has it now (retro-pixel.js): where its sprite is on screen
  // and how wide (art pixels), whether it faces the other way, its animation frame and the light it is drawn with. null when
  // the ocean has none of it on screen.
  function backdrop(findingId) {
    const ocean = win.__ocean;
    const ent = ocean?.ents?.find(e => e.a?.anchor === findingId);
    const body = ent?.__sprite, group = ent?.c?.group;
    if (!body?.ready || !group || !ocean.camera || ent.out >= 0.985) return null;
    const at = group.position.clone().project(ocean.camera);
    const side = new group.position.constructor().setFromMatrixColumn(ocean.camera.matrixWorld, 0).multiplyScalar(ent.c.L * body.art.k).add(group.position).project(ocean.camera);
    const size = Math.abs(side.x - at.x) / 2 * win.innerWidth / P;
    const x = (at.x + 1) / 2 * win.innerWidth / P, y = (1 - at.y) / 2 * win.innerHeight / P;
    if (!(at.z < 1) || x < -size / 4 || y < -size / 4 || x > W + size / 4 || y > H + size / 4) return null;
    const u = body.material.uniforms, tint = u.uTint.value[0], v = u.uPoint.value, col = u.uPointCol.value;
    // The torch light, in sprite widths from the sprite's centre (x right, y up, z towards the viewer).
    const view = group.position.clone().applyMatrix4(ocean.camera.matrixWorldInverse), world = ent.c.L * body.art.k;
    const point = col[0] + col[1] + col[2] > 0 ? { x: (v[0] - view.x) / world, y: (v[1] - view.y) / world, z: (v[2] - view.z) / world, range: v[3] / world, colour: col.map(c => c * tint) } : null;
    return { ent, x, y, size, mirrored: u.uUv.value[0] < 0, eyes: Boolean(body.eyes), phase: body.phase, alpha: u.uOpacity.value,
      rig: { ambient: u.uAmbient.value.map(v => v * tint), key: u.uKey.value.map(v => v * tint), dir: u.uLight.value.slice(), point } };
  }

  async function loadFish() {
    if (fishSheet || fishPlain) return;
    const url = fishSprite(state.typed?.species);
    fishSheet = url ? await loadSheet(url) : null;
    if (!fishSheet) fishPlain = flat(drawFish(doc, state.typed?.species));
  }

  // A banner with the name, depth and meaning of the zone the camera is passing into.
  function nameZone(z) {
    const info = DEPTH_INFO[DEPTHS[z - 1]];
    zoneBanner.replaceChildren(el(doc, 'b', '', info.name), el(doc, 'span', '', `${info.range} · ${info.meaning}`));
    zoneBanner.hidden = false;
    zoneBanner.classList.remove('on');
    void zoneBanner.offsetWidth; // restart the animation
    zoneBanner.classList.add('on');
  }

  // A school or a lone fish of the zone at the current light depth, entering below the screen.
  function spawnPasser() {
    const zone = clamp(Math.round(scene.depth), 1, 5), list = (PASSERS[zone] ?? []).filter(url => passerSheets.get(url));
    if (!list.length) return;
    const sheet = passerSheets.get(list[Math.floor(Math.random() * list.length)]), near = Math.random() < 0.3;
    const size = (near ? 30 + Math.random() * 12 : 12 + Math.random() * 7) * (sheet.h === 128 ? 1.5 : 1);
    const side = Math.random() < 0.5;
    passers.push({ sheet, near, size, n: near ? 1 : 3 + Math.floor(Math.random() * 4), par: near ? 1.35 : 0.45 + Math.random() * 0.2, a: 1, leave: false,
      x: side ? Math.random() * W * 0.45 : W * 0.55 + Math.random() * W * 0.45, y: H + size * 1.5, vx: (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.12), phase: Math.floor(Math.random() * 14) });
  }

  const beats = {
    async catch() {
      title.textContent = story?.catch?.title ?? 'The octopus takes the name';
      setText(para(story?.catch?.text ?? 'Nothing is downloaded or run: the octopus carries the name down to a giant clam that works as a sealed sandbox.'));
      // The name sits on the threat-search panel; the octopus comes near and stretches one arm to it.
      // The caption bar (bottom left, over the panel) waits until the octopus has the file, so the grab is in view.
      bar.classList.add('os-bar-late');
      const panel = doc.getElementById(story?.anchor ?? 'threat-search')?.getBoundingClientRect();
      file.x = clamp(panel ? (panel.left + panel.width * 0.3) / P : cx() - 60, 14, W - 14);
      file.y = clamp(panel ? (panel.top + panel.height * 0.4) / P : cy(), 14, H - 14);
      file.visible = true;
      fileTag.hidden = false;
      clam.x = cx(); clam.y = H + 40; clam.f = 7; clam.visible = true;
      // It starts where the menu octopus floats (or swims in from the right).
      const home = win.__menuOctopus?.at?.();
      if (home) { oct.x = home.x / P; oct.y = home.y / P; } else { oct.x = W + 40; oct.y = cy() - 40; }
      oct.visible = true;
      win.__menuOctopus?.hide?.();
      // Close enough for one long arm, never on top of the file.
      const near = { x: clamp(file.x + 66, OCT / 2, W - OCT / 2), y: clamp(file.y - 44, topLimit() + OCT / 2, H - OCT / 2) };
      await moveTo(oct, near.x, near.y, 1300);
      await reach(file, 650);
      // Caught: the tip curls round the paper and draws it in.
      arm.hold = file;
      puff(file.x, file.y, 5);
      await wait(150);
      await armTo(carryAim, 450);
      bar.classList.remove('os-bar-late');
      title.textContent = 'Into the giant clam';
      // The clam rises from the sand below while the octopus swims over to it.
      clam.x = cx(); clam.y = H + 40;
      await Promise.all([moveTo(clam, cx(), cy() + 30, 1300, easeOut), wait(250).then(() => moveTo(oct, cx() - 44, Math.max(cy() - 4, topLimit() + OCT / 2), 1400))]);
      // It sets the file down by the clam, prises the upper valve open, then lowers the file into the gape.
      await armTo({ x: clam.x - 38, y: clam.y }, 500);
      arm.hold = null;
      await armIn(300);
      await prise(true);
      await reach(file, 420);
      arm.hold = file;
      fileTag.hidden = true;
      await dipIn(file);
      await prise(false, 600);
      clam.shake = true;
      await wait(400);
      clam.shake = false;
      title.textContent = story?.sealed?.title ?? 'Sealed. Finding out what the file really is';
      setText(para(story?.sealed?.text ?? 'Inside the clam the server reads the file’s content, not its name, to find its real type.'));
    },

    async reveal() {
      const typed = state.typed;
      await loadFish();
      await prise(true, 900);
      // An arm reaches in and lifts the fish out.
      fish.s = 0.5; fish.dir = -1; fish.visible = false;
      await Promise.all([dipOut(fish), tween(1000, k => { fish.s = lerp(0.5, 1, k); })]);
      sparkle(fish.x, fish.y, 14);
      puff(fish.x, fish.y, 12);
      arm.hold = null;
      fish.free = true;
      await armIn(400);
      fishName = nameFor(jobId, typed.species, storage);
      fishHit.setAttribute('aria-label', `${fishName} the ${speciesName()}: press to make it hop`);
      showFishTag();
      if (story) {
        const told = story.reveal(state);
        title.textContent = told.title;
        setText(...told.text.map(line => para(line)), nameRow());
        return;
      }
      title.textContent = `Your file is a ${speciesName()}`;
      const lines = [
        para(`${name} is a ${typed.detectedType} file. Inside the clam every file is born as an innocent fish of its type: this one is a ${speciesName()}. What it does next decides where it ends up.`),
        nameRow(),
        para(pathText(typed, state.rank) || 'Waiting for a sandbox.', 'os-plan'),
      ];
      if (typed.recognitionUncertain) lines.push(para(`The .${typed.claimedExtension} script format could not be confirmed. Inspected only; script behaviour was not tested.`, 'os-warn'));
      if (typed.mismatch) lines.push(para(`Its name says .${typed.claimedExtension}, but its content is ${typed.detectedType}.`, 'os-warn'));
      setText(...lines);
    },

    async run() {
      const execution = story?.run?.(state) ?? executionText(state.typed);
      title.textContent = execution.title;
      runCount = para('', 'os-count');
      setText(para(execution.detail), runCount);
      fishTag.hidden = true;
      fish.free = false;
      fish.x += fish.ox; fish.y += fish.oy; fish.ox = fish.oy = 0;
      await reach(fish, 450);
      arm.hold = fish;
      await dipIn(fish);
      await prise(false, 600);
      clam.shake = true;
      pumpEvidence();
    },

    async analyse() {
      clam.shake = false;
      labels.querySelectorAll('.os-ev').forEach(node => node.remove());
      const told = story?.analyse?.(state);
      title.textContent = told?.title ?? 'The octopus reads the evidence';
      const n = state.attempts.length;
      if (told) setText(...told.text.map(line => para(line)));
      else setText(para(n
        ? `It wrote analysis code ${plural(n, 'time')}. Each script runs in a second sandbox; a failed one goes back for a fix.`
        : 'It checks everything the file did against the list of harmful behaviours.'),
      state.explanation?.modelAvailable === false ? para('The AI model was not available, so the verdict comes from the rules alone.', 'os-muted') : null);
      // It rises beside the clam (clear of the depth gauge) and taps out the analysis on a slate, one arm doing the typing.
      await moveTo(oct, Math.min(clam.x + 14, rightLimit() - OCT / 2), Math.max(cy() - 22, topLimit() + OCT / 2), 700);
      let typing = false;
      const key = () => ({ x: oct.x - 34, y: oct.y + 10 + (typing ? Math.abs(Math.sin(performance.now() / 85)) * 2.5 : 0) });
      await reach(key, 420);
      term.hidden = false;
      termBody.replaceChildren();
      typing = true;
      for (const [line, sev] of told?.lines ?? analysisLines()) {
        const li = el(doc, 'li', '', line);
        if (sev) li.dataset.sev = sev;
        termBody.append(li);
        await wait(380);
      }
      typing = false;
    },

    async dive() {
      term.hidden = true;
      const depth = state.depth ?? 'sunlight', st = ZONE[depth] ?? ZONE.sunlight;
      title.textContent = 'The dive';
      if (story) setText(para(story.dive?.(state) ?? 'Its depth is how much harm it did.'));
      else setText(para('Depth reflects the evidence. Sunlight means no harmful behaviour observed; Twilight means suspicious or inconclusive. The deepest tiers need evidence of harm.'),
        para(state.findings.length ? `${plural(state.findings.length, 'finding')} ${state.findings.length === 1 ? 'pulls' : 'pull'} it down.` : state.signals.length ? `${plural(state.signals.length, 'warning sign')} ${state.signals.length === 1 ? 'pulls' : 'pull'} it down a little.` : 'Nothing pulls it down.', 'os-muted'));
      await armIn(250);
      await prise(true, 700);
      fish.s = 0.5; fish.visible = false; fish.dir = -1;
      await Promise.all([dipOut(fish), tween(1000, k => { fish.s = lerp(0.5, 1, k); })]);
      // The life of each zone on the way down, ready before the fall starts.
      await Promise.all(Object.entries(PASSERS).filter(([z]) => +z <= st).flatMap(([, list]) => list)
        .map(async url => { if (!passerSheets.has(url)) passerSheets.set(url, await loadSheet(url)); }));
      if (isDeepDepth(depth)) {
        // The harm it did catches up with it: punished, marked as food for that depth, and taken down to it.
        title.textContent = 'Punished';
        setText(para(`Born innocent, but this ${speciesName()} did harm. It is marked as food for the ${DEPTH_INFO[depth].name} and taken down to it.`, 'os-warn'),
          para(state.findings.map(f => findingFacts(f).label).slice(0, 3).join(' · '), 'os-muted'));
        await markAsFood(depth);
        title.textContent = `Down to the ${DEPTH_INFO[depth].name}`;
      }
      // The fish leads and the octopus follows, one arm still wrapped round it. First they sink on screen, then the
      // ocean itself falls away: the clam is left behind, the light fades, and the life of each zone streams up past them.
      arm.hold = null; arm.wrap = fish;
      arm.aim = () => ({ x: fish.x, y: fish.y });
      const home = { x: fish.x, y: fish.y }, low = fish.y + 26;
      const lead = () => ({ x: fish.x - 44, y: Math.max(fish.y - 16, topLimit() + OCT / 2) });
      for (let i = 0; i < 80; i++) snow.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() });
      await Promise.all([tween(600, k => { fish.tilt = -0.5 * k; }), tween(1000, k => { fish.y = lerp(home.y, low, k); }, k => k * k),
        tween(1100, k => { const p = lead(); oct.x = lerp(oct.x, p.x, k * 0.25); oct.y = lerp(oct.y, p.y, k * 0.25); })]);
      const zone = doc.querySelector(`.zone[data-st="${st}"]`);
      const seconds = 4 + (st - 1) * 3.2; // a long fall: about three seconds for each zone it passes
      const range = doc.documentElement.scrollHeight - win.innerHeight;
      const anchor = win.__ocean?.anchors?.()[st];
      const top = Number.isFinite(anchor) ? anchor * range
        : zone ? zone.getBoundingClientRect().top + win.scrollY + Math.min(zone.offsetHeight, win.innerHeight) / 2 - win.innerHeight / 2 : win.scrollY;
      const y0 = win.scrollY, span = Math.max(1, top - y0);
      // The depth the camera has reached, read off its scroll position against the renderer's stops: the zones lie at uneven
      // distances, so the light changes and each zone is named exactly as the camera passes its stop.
      const stops = win.__ocean?.anchors?.() ?? [];
      const depthAt = y => {
        const f = y / range;
        let z = 1;
        while (z < 5 && f >= stops[z + 1]) z++;
        return z < 5 && Number.isFinite(stops[z]) && Number.isFinite(stops[z + 1]) ? z + clamp((f - stops[z]) / (stops[z + 1] - stops[z]), 0, 1) : z;
      };
      const scrolled = new Promise(done => {
        if (Math.abs(top - y0) < 2) return done();
        // The renderer's own camera stop for this stage, so the dive settles exactly where scrolling (and its snap) would.
        if (lenis) lenis.scrollTo(top, { duration: reduced ? 0 : seconds, easing: k => 0.5 - Math.cos(Math.PI * k) / 2, immediate: reduced, force: true, onComplete: done });
        else { win.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' }); setTimeout(done, reduced ? 0 : seconds * 1000); }
      });
      let diving = true, nextSpawn = 0, named = 1;
      const fx = fish.x;
      if (!reduced) tasks.add(t => {
        if (closed || !diving) return false;
        const k = clamp((win.scrollY - y0) / span, 0, 1);
        scene.depth = stops.length ? depthAt(win.scrollY) : lerp(1, st, k);
        while (named < st && scene.depth >= named + 1) nameZone(++named);
        clam.y -= scrollV; // the clam stays where it is in the ocean
        // The camera catches up with the sinking fish over the first part of the fall.
        fish.y = lerp(low, home.y, clamp(k / 0.12, 0, 1) ** 0.7);
        fish.x = fx + Math.sin(t * 0.006) * 3;
        const p = lead(); oct.x = lerp(oct.x, p.x, 0.08); oct.y = lerp(oct.y, p.y, 0.08);
        if (Math.random() < 0.5) bubbles.push({ x: fish.x + (Math.random() - 0.5) * 10, y: fish.y - 6, vy: 0.3 + Math.random() * 0.4, life: 50, r: 1 });
        if (t > nextSpawn && Math.abs(scrollV) > 0.3 && passers.length < 10) { spawnPasser(); nextSpawn = t + 150 + Math.random() * 250; }
        return true;
      });
      await scrolled;
      diving = false;
      zoneBanner.hidden = true;
      scene.depth = st;
      // What is still on screen swims off or fades into the water; the clam stays behind in the shallows.
      for (const p of passers) p.leave = true;
      tween(500, k => { clam.a = 1 - k; }).then(() => { clam.visible = false; clam.a = 1; });
      // Arrived: the fish levels out, the arm lets go, and the octopus swims back up to the surface.
      await tween(500, k => { fish.tilt = -0.5 * (1 - k); fish.x = lerp(fish.x, fx, k); fish.y = lerp(fish.y, home.y, k); });
      arm.wrap = null;
      await armIn(350);
      await reach(() => ({ x: oct.x + 18 * Math.sin(performance.now() / 120), y: oct.y - 36 }), 300); // a wave goodbye
      await wait(500);
      await armIn(250);
      oct.swim = true; oct.mirror = false;
      await moveTo(oct, oct.x + 30, -90, 1100, k => k * k);
      oct.visible = false; oct.swim = false;
      snow.length = 0;
      showFishTag(` · ${DEPTH_INFO[depth].name} · ${DEPTH_INFO[depth].range}`);
      fish.free = true;
    },

    async verdict() {
      const depth = state.depth ?? 'sunlight';
      const deep = isDeepDepth(depth);
      const finding = facts();
      const result = resultSummary(state);
      const badge = para(result.badge, 'os-badge');
      badge.dataset.depth = depth;
      const list = el(doc, 'ul', 'os-findings');
      for (const item of state.findings) { const f = findingFacts(item); list.append(el(doc, 'li', '', `${f.creature}: ${f.label}`)); }
      for (const signal of state.signals) list.append(el(doc, 'li', '', signalLabel(signal.id ?? signal)));
      const told = story?.verdict?.(state);
      if (told) badge.textContent = told.badge;
      title.textContent = told?.title ?? verdictHeading(state);
      if (told) setText(badge, ...told.text.map(line => para(line)), list.children.length ? list : null);
      else setText(badge, para(result.warning, 'os-result-warning'), para(state.verdict?.statement ?? (deep ? 'Harmful behaviour observed.' : 'No harmful behaviour observed in the checks run. This is not a guarantee.')), list.children.length ? list : null);
      react(depth);
      if (!deep) {
        showFishTag(' joins its school');
        if (depth === 'sunlight') { sparkle(fish.x, fish.y, 18, '#f4d06a', 1.3); sparkle(fish.x, fish.y, 10, '#b9f4ea', 0.7); fish.hop = performance.now(); }
        else { fish.rim = TIER_COLOUR.twilight; sparkle(fish.x, fish.y, 8, TIER_COLOUR.twilight, 0.6); }
        await wait(1600);
        fish.free = false;
        // It swims off into the background to its own school, shrinking to the school's size, and fades in among them.
        // A species with no school yet swims off into the distance instead.
        const x0 = fish.x + fish.ox, y0 = fish.y + fish.oy;
        fish.x = x0; fish.y = y0; fish.ox = fish.oy = 0;
        const target = () => schoolSpot(depth) ?? { x: -40, y: cy() - 10 };
        fish.dir = target().x > x0 ? 1 : -1;
        await tween(2600, k => {
          const at = target();
          fish.x = lerp(x0, at.x, k); fish.y = lerp(y0, at.y, k) - Math.sin(k * Math.PI) * 12;
          fish.s = lerp(1, 0.28, k); fish.a = k > 0.8 ? (1 - k) / 0.2 : 1;
        });
        if (schoolSpot(depth)) sparkle(fish.x, fish.y, 8);
        fish.visible = false;
        fishTag.hidden = true;
        return;
      }
      fish.free = false;
      text.prepend(para(`Born an innocent ${speciesName()}, punished for what it did: food for the ${finding?.creature ?? 'creature'} of the ${DEPTH_INFO[depth].name}.`, 'os-warn'));
      if (!fish.mark) await markAsFood(depth);
      const findingId = deepestFinding(state.findings)?.id;
      [creatureSheet, eyesSheet, frontImg, lungeSheet] = await Promise.all([
        loadSheet(finding?.sprite),
        depth === 'trench' && EYES[findingId] ? loadSheet(`${PIX}eyes-${EYES[findingId]}-spritesheet.png`) : null,
        findingId ? loadSheet(FRONT(findingId)) : null, findingId ? loadSheet(LUNGE(findingId)) : null,
      ]);
      creatureFlip = spriteFacesRight(finding?.sprite);
      creaturePlain = creatureSheet ? null : flat(drawSilhouette(doc));
      fishTag.textContent = `${finding?.creature ?? 'A creature'}: ${finding?.label ?? ''}`;
      fishTag.hidden = false;
      title.textContent = `The ${finding?.creature ?? 'creature'} comes for it`;
      // The fish settles where the strike will clear the caption bar (beside it on a wide screen, under it on a narrow
      // one), and low enough that the creature has room above it.
      const box = bar.getBoundingClientRect(), left = box.width < win.innerWidth * 0.8 ? box.right / P : 0, right = rightLimit();
      // Between the caption bar and the gauge; when that gap is narrow, in the middle of it.
      const fx = left + 46 <= right - 46 ? clamp(fish.x + fish.ox, left + 46, right - 46) : (left + right) / 2, fy = clamp(fish.y + fish.oy, topLimit() + 62, H - 30);
      fish.ox = fish.oy = 0;
      const sx0 = fish.x, sy0 = fish.y;
      await tween(600, k => { fish.x = lerp(sx0, fx, k); fish.y = lerp(sy0, fy, k); });
      const facing = Boolean(frontImg);
      // It is the creature swimming in the background, coming forward: it starts where the ocean draws it, at its size, in its
      // light and facing, and the ocean's own copy steps aside. Without one on screen it comes out of the dark from far behind
      // the fish, at about the size the ocean draws such a creature (0.7: a creature that has eaten one file), dim and lost in
      // the water at first. It grows as it swims closer, and the glow of the marked fish lights it through its normal maps as
      // it nears.
      const bg = backdrop(findingId);
      const far = bg ?? { x: fish.x + 22, y: topLimit() + 12 };
      const strike = { x: Math.min(fish.x + 20, right - 40), y: fish.y - 30 };
      const bend = { x: Math.min(fish.x + 64, right - 20), y: lerp(far.y, strike.y, 0.55) };
      const along = k => ({ x: (1 - k) ** 2 * far.x + 2 * k * (1 - k) * bend.x + k * k * strike.x, y: (1 - k) ** 2 * far.y + 2 * k * (1 - k) * bend.y + k * k * strike.y });
      if (bg) { hiddenEnt = bg.ent; hiddenEnt.hiddenByShow = true; creature.mix = { from: bg.rig, k: 0 }; }
      if (eyesSheet && facing) {
        // Trench: only two eyes in the dark at first. They draw nearer, and the face comes forward out of them.
        eyes.x = far.x; eyes.y = far.y; eyes.s = bg ? bg.size / 110 : 0.5; eyes.a = bg ? bg.alpha : 0; eyes.phase = bg?.phase ?? 0; eyes.visible = true;
        if (!bg) await tween(900, k => { eyes.a = k * 0.95; });
        const s0 = eyes.s, a0 = eyes.a;
        await tween(2200, k => { const p = along(k); eyes.x = p.x; eyes.y = p.y; eyes.s = lerp(s0, 0.76, k ** 1.4); eyes.a = lerp(a0, 0.95, k); if (creature.mix) creature.mix.k = k; }, k => k * k * (3 - 2 * k));
        creature.x = eyes.x; creature.y = eyes.y + 8; creature.s = eyes.s * 110 / 80; // the face has the eyes' cell size (84 art pixels) creature.a = 0; creature.fog = 1; creature.view = 'front'; creature.squash = 1; creature.visible = true;
        await tween(1100, k => { creature.a = Math.min(1, k * 2); creature.fog = 1 - k; eyes.a = 0.95 * (1 - k); });
        eyes.visible = false;
      } else {
        // Midnight and Abyss: it swims in side-on, then turns to face its prey.
        const s0 = bg ? bg.size / 80 : 0.7;
        creature.x = far.x; creature.y = far.y; creature.s = s0; creature.fog = bg ? 0 : 0.95; creature.a = bg ? bg.alpha : 0; creature.view = 'side'; creature.squash = 1; creature.swim = 1; creature.visible = true;
        creature.dir = bg ? ((bg.mirrored !== creatureFlip) ? 1 : -1) : -1;
        if (bg) creature.anim = performance.now() / 150 + bg.phase;
        // Facing away from the fish, it turns first: the side view narrows to nothing and widens the other way.
        if (bg && Math.abs(strike.x - far.x) > 6 && Math.sign(strike.x - far.x) !== creature.dir) {
          await tween(200, k => { creature.squash = 1 - k; });
          creature.dir = -creature.dir;
          await tween(240, k => { creature.squash = k; });
        }
        creature.swim = 1.8;
        await tween(2600, k => {
          const p = along(k);
          creature.x = p.x; creature.y = p.y + Math.sin(k * Math.PI * 3) * 2;
          creature.s = lerp(s0, 1, k ** 1.5); creature.fog = (bg ? 0 : 0.95) * (1 - k) ** 1.3; creature.a = bg ? lerp(bg.alpha, 1, k) : Math.min(1, k * 4);
          if (creature.mix) creature.mix.k = k;
        }, k => k * k * (3 - 2 * k));
        creature.swim = 1;
        await tween(700, k => { creature.y = strike.y + Math.sin(k * Math.PI * 2) * 2; });
        if (facing) {
          // The turn: the side view narrows to nothing, the face widens out of it.
          await tween(160, k => { creature.squash = 1 - k; });
          creature.view = 'front';
          await tween(200, k => { creature.squash = k; });
        }
      }
      // The strike, kept below the nav bar and left of the gauge: it surges over the fish and the bite closes on it.
      const x0 = creature.x, y0 = creature.y, s0 = creature.s, sMax = 1.2;
      const bite = { x: Math.min(fish.x, right - 40 * sMax), y: Math.max(fish.y - 10, topLimit() + 40 * sMax) };
      let eaten = false;
      const swallow = () => {
        if (eaten) return;
        eaten = true;
        fish.visible = false; fish.mark = 0; glow = null; fishTag.hidden = true;
        puff(fish.x, fish.y, 16);
        sparkle(fish.x, fish.y, 16, TIER_COLOUR[depth], 1.2);
        react(depth, true);
      };
      if (facing && lungeSheet) {
        creature.view = 'lunge';
        await tween(reduced ? 0 : 1100, k => {
          creature.f = Math.floor(k * 8);
          creature.x = lerp(x0, bite.x, Math.min(1, k * 1.6)); creature.y = lerp(y0, bite.y, Math.min(1, k * 1.6));
          creature.s = lerp(s0, sMax, Math.sin(Math.min(1, k * 1.3) * Math.PI / 2));
          if (k > 0.6) swallow();
        }, k => k);
        creature.f = 7;
      } else {
        await moveTo(creature, fish.x + 30, fish.y + 4, 260);
        await moveTo(creature, fish.x + 8, fish.y, 220, k => k * k);
      }
      swallow();
      title.textContent = `${finding?.creature ?? 'A creature'} ate ${fishName || 'your file'}`;
      await wait(600);
      // Back the way it came: smaller and dimmer into the dark, or, if the ocean had it on screen, to where it swims now. The
      // ocean's own copy comes back as this one fades out.
      const sx = creature.x, sy = creature.y, s1 = creature.s;
      await tween(1400, k => {
        const home = bg && backdrop(findingId);
        creature.x = lerp(sx, home?.x ?? far.x, k); creature.y = lerp(sy, home?.y ?? far.y, k);
        creature.s = lerp(s1, home ? home.size / 80 : 0.3, k); creature.fog = home ? 0 : k; creature.a = 1 - k * k;
        if (creature.mix && home) { creature.mix.k = 1 - k; creature.mix.from = home.rig; }
        if (hiddenEnt && k > 0.6) { hiddenEnt.hiddenByShow = false; hiddenEnt = null; }
      });
      creature.visible = false;
      creature.mix = null;
      if (hiddenEnt) { hiddenEnt.hiddenByShow = false; hiddenEnt = null; }
      eatenFish = true;
      const link = await desktopLink();
      if (link && !closed) text.append(link);
    },

    async done() {
      if (story) {
        const told = story.done(state);
        title.textContent = told.title;
        setText(...told.text.map(line => para(line, 'os-muted')), finalButtons());
        return;
      }
      const view = receiptView(state.receipt);
      title.textContent = state.receipt && !view.ok ? 'Integrity or cleanup not confirmed' : state.receipt?.teardownConfirmed === true ? 'Sandbox destroyed' : 'The job ended';
      setText(
        para(state.receipt ? view.headline : 'The job ended before the sandbox receipt was issued.', 'os-receipt'),
        state.receipt ? para('Only the canary file is checked; that is not proof the whole machine was untouched.', 'os-muted') : null,
        finalButtons(),
      );
    },
  };

  function analysisLines() {
    const lines = [];
    // exitCode null: the model sent no runnable script, so nothing ran (backend/detonation/analysis-loop.mjs).
    state.attempts.forEach(a => lines.push([`attempt ${a.n}: ${a.exitCode == null ? 'no script' : `exit ${a.exitCode}`}${a.exitCode === 0 ? ' ✓' : ' ✗'}`]));
    lines.push([`read ${plural(state.evidence.length, 'evidence item')}`]);
    for (const f of state.findings) lines.push([`match: ${findingFacts(f).label}`, findingFacts(f).depth === 'variable' ? state.depth : findingFacts(f).depth]);
    for (const s of state.signals) lines.push([`warn: ${signalLabel(s.id ?? s)}`, 'twilight']);
    if (!state.findings.length && !state.signals.length) lines.push(['no harmful pattern matched', 'sunlight']);
    if (state.verdict?.depth) lines.push([`verdict: ${DEPTH_INFO[state.verdict.depth]?.name ?? state.verdict.depth}`, state.verdict.depth]);
    return lines.slice(0, 9);
  }

  // Evidence comes out of the shaking clam as bubbles, one at a time, while the Running step is open.
  let pumping = false;
  let worst = 'sunlight';
  async function pumpEvidence() {
    if (pumping) return;
    pumping = true;
    while (!closed && index === 2 && evidenceShown < state.evidence.length) {
      const item = state.evidence[evidenceShown];
      evidenceShown += 1;
      const bubble = el(doc, 'p', 'os-ev', String(item.detail ?? item.kind ?? ''));
      bubble.dataset.src = String(item.source ?? 'evidence');
      // Its colour and weight follow how alarming it looks; the clam shudders harder for the worse ones.
      const sev = traceSeverity(item);
      bubble.dataset.sev = sev;
      worst = SEV_RANK[sev] > SEV_RANK[worst] ? sev : worst;
      clam.jolt = SEV_RANK[sev];
      if (SEV_RANK[sev] >= 2) sparkleIn(clam.x, clam.y - 14, TIER_COLOUR[sev], 4 + 2 * SEV_RANK[sev]);
      place(bubble, clam.x + (evidenceShown % 2 ? -16 : 16), clam.y - 22);
      labels.append(bubble);
      puff(clam.x, clam.y - 8, 4);
      setTimeout(() => bubble.remove(), reduced ? 2500 : 4200);
      if (runCount) runCount.textContent = story?.count?.(evidenceShown) ?? `${plural(evidenceShown, 'thing')} observed so far.`;
      await wait(900);
    }
    if (runCount && !evidenceShown) runCount.textContent = 'Nothing observed yet.';
    pumping = false;
  }

  // "Replay it on a simulated desktop", once the fish is eaten, the job has a replay and the desktops are served; else null.
  async function desktopLink() {
    const replayId = state.typed?.replayId;
    if (!(eatenFish || story) || typeof replayId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(replayId) || !(await desktops)) return null;
    if (story && !state.finished) return null; // a threat's scene plays once it is written
    const link = el(doc, 'a', 'os-btn os-desktop', story?.play ?? 'Replay it on a simulated desktop ▶');
    link.href = `/desktop.html?job=${replayId}${story ? '&os=windows' : ''}`;
    link.addEventListener('click', remember); // Back comes back to this show
    return link;
  }

  function finalButtons() {
    const row = el(doc, 'div', 'os-final');
    const back = el(doc, 'button', 'os-btn', 'Back to the surface');
    back.type = 'button';
    back.addEventListener('click', () => close(true));
    if (story) append(row, back);
    else {
      const open = el(doc, 'a', 'os-btn os-primary', 'Open the full report ▶');
      open.href = reportUrl;
      open.addEventListener('click', remember);
      append(row, open, back);
    }
    desktopLink().then(link => {
      if (link && row.isConnected) row.insertBefore(link, back);
      else if (!link && story?.noDesktop && state.finished && row.isConnected) row.before(para(story.noDesktop, 'os-muted'));
    });
    return row;
  }

  // ---- step control -----------------------------------------------------------------------------------------------
  let index = -1;
  let playing = false;
  async function play(at) {
    index = at;
    playing = true;
    pips.querySelectorAll('.os-pip').forEach((pip, i) => { pip.dataset.state = i < at ? 'done' : i === at ? 'now' : 'todo'; });
    sync();
    try { await beats[STEPS[at].key](); } catch (error) { if (!closed) console.error(`Ocean show step failed: ${error?.message ?? error}`); }
    playing = false;
    sync();
  }

  function sync() {
    if (closed) return;
    const last = index >= STEPS.length - 1;
    const ahead = STEPS[index + 1];
    const ok = !last && !playing && ahead.ready(state);
    next.hidden = last;
    next.disabled = !ok;
    skip.hidden = Boolean(story) || last || Boolean(text.querySelector('.os-final'));
    if (index === 5 && !story) {
      const result = resultSummary(state);
      title.textContent = result.heading;
      const badge = text.querySelector('.os-badge');
      if (badge) badge.textContent = result.badge;
      const warning = text.querySelector('.os-result-warning');
      if (warning) warning.textContent = result.warning;
    }
    status.textContent = last || ok ? '' : playing ? '' : state.failed && !state.verdict ? (story?.failed?.(state) ?? 'The job failed.') : (story?.waiting?.(state) ?? 'Waiting for the sandbox…');
    if (state.failed && !state.verdict && !playing && !text.querySelector('.os-final')) text.append(finalButtons());
    if (ok && (doc.activeElement === doc.body || !doc.activeElement)) next.focus({ preventScroll: true });
  }
  next.addEventListener('click', () => { if (!next.disabled) play(index + 1); });
  const onKey = event => { if (event.key === 'ArrowRight' && !event.target.closest?.('input, textarea') && !next.disabled && !next.hidden) { event.preventDefault(); play(index + 1); } };
  doc.addEventListener('keydown', onKey);

  // ---- events -----------------------------------------------------------------------------------------------------
  function handle(event) {
    if (closed || !applyEvent(state, event)) return;
    if (event.event === 'evidence' && index === 2) pumpEvidence();
    sync();
  }
  source.stream(handle, controller.signal, () => state.finished || state.failed, () => state.lastEventId).catch(() => {
    if (closed || controller.signal.aborted) return;
    if (state.typed) { status.textContent = 'Lost the connection. Open the full report to continue.'; return; }
    close(false);
    onFail?.();
  });

  // ---- open and close -------------------------------------------------------------------------------------------
  function close(toSurface) {
    if (closed) return;
    closed = true;
    forget();
    controller.abort();
    win.cancelAnimationFrame(raf);
    doc.removeEventListener('keydown', onKey);
    win.removeEventListener('pointermove', onPointer);
    doc.documentElement.removeEventListener('pointerleave', onLeave);
    win.removeEventListener('resize', resize);
    if (hiddenEnt) hiddenEnt.hiddenByShow = false;
    root.remove();
    doc.documentElement.classList.remove('os-on');
    lenis?.start?.();
    win.__menuOctopus?.show?.();
    if (toSurface) lenis ? lenis.scrollTo(0, { duration: reduced ? 0 : 2.4, immediate: reduced, force: true }) : win.scrollTo(0, 0);
    onClose?.();
  }

  doc.body.append(root);
  doc.documentElement.classList.add('os-on');
  lenis?.stop?.();
  resize();
  win.addEventListener('resize', resize);
  raf = win.requestAnimationFrame(frame);
  if (resume) fastForward(); else play(0);
  return { close: () => close(false) };

  // Plays every step at once as soon as the job's events allow it, from the surface (the browser restored the page's old
  // scroll), then hands back to Next. A finished job's events come in one burst; a job that ended without a step's events
  // stops there, where sync() offers the report.
  async function fastForward() {
    lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : win.scrollTo(0, 0);
    const until = ok => new Promise(done => { const check = () => (closed || ok() ? done() : win.setTimeout(check, 100)); check(); });
    for (let i = 0; !closed && i < STEPS.length; i++) {
      await until(() => STEPS[i].ready(state) || state.finished || state.failed);
      if (closed || !STEPS[i].ready(state)) break;
      await play(i);
    }
    reduced = prefersReduced;
    sync();
  }
}
