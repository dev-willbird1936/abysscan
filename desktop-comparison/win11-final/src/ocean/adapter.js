// OceanWorldAdapter for the Windows shell (WORLD-CONTRACT §3).
// apply(): world → Redux (`world` key) + body theme/accent/brightness/night light + native
// flyouts. Windows render straight from world.windows (components/ocean/windows.jsx).
// Native flyout changes (Start, search, quick settings) become toggle-overlay intents in the
// middleware; every other gesture is emitted by shell components through window.__oceanEmit.
import seed from "../containers/applications/apps/ocean/world-seed.json";
import { CANONICAL_APPS } from "./appRegistry";
import "./world-helpers"; // bundles the vendored shared world model (window.OceanWorldModel)
import { settingFromWorld } from "../reducers/settings";

const VERSION = 3;

export const ACCENTS = {
  blue: ["#0067c0", "#4cc2ff"],
  purple: ["#744da9", "#c5a3ff"],
  pink: ["#bf0077", "#ff8ad8"],
  red: ["#c42b1c", "#ff99a4"],
  orange: ["#ca5010", "#ffb27a"],
  yellow: ["#9d5d00", "#ffd75e"],
  green: ["#0f7b0f", "#6ccb5f"],
  graphite: ["#5d5a58", "#b8b8b8"],
};

let store = null;
let world = null;
let applying = false;
let port = null;
let seq = 0;
let flyoutBase = null;
const listeners = new Set();
let resolveReady;
const ready = new Promise((resolve) => (resolveReady = resolve));
const embedded = new URLSearchParams(location.search).get("oceanShell") === "1";

// ---------- world → native ----------

const applyLook = (w) => {
  const body = document.body;
  const sys = w.sys;
  const [light, dark] = ACCENTS[sys.accent] || ACCENTS.blue;
  body.dataset.theme = sys.theme;
  body.style.setProperty("--clrPrm", sys.theme == "dark" ? dark : light);
  body.style.setProperty("--accent-light", light);
  body.style.setProperty("--accent-dark", dark);
  body.dataset.nightlight = !!sys.nightLight;
  body.dataset.reduceMotion = !!sys.reduceMotion;
  body.dataset.reduceTransparency = !!sys.reduceTransparency;
  body.dataset.lowpower = !!sys.lowPower;
  body.dataset.contrast = !!sys.increaseContrast;
  body.dataset.autohide = !!sys.dockAutohide;
  const overlay = document.getElementById("brightoverlay");
  if (overlay) overlay.style.opacity = ((100 - sys.brightness) / 100) * 0.85;
};

const flyouts = (s) => ({
  launcher: !s.startmenu.hide && s.startmenu.menu,
  search: !s.startmenu.hide && !s.startmenu.menu,
  quick: !s.sidepane.hide,
});

const applyOverlays = (next, prev) => {
  const o = next.overlays || {};
  const p = (prev && prev.overlays) || {};
  const s = store.getState();
  if (o.launcher !== p.launcher || o.search !== p.search) {
    if (o.launcher) store.dispatch({ type: "STARTSHW" });
    else if (o.search) store.dispatch({ type: "SEARCHSHW" });
    else if (!s.startmenu.hide) store.dispatch({ type: "STARTHID" });
  }
  if (o.quick !== p.quick && !!o.quick == s.sidepane.hide)
    store.dispatch({ type: o.quick ? "PANETOGG" : "PANEHIDE" });
};

// The quest overlay (program-ui.js mountOverlay): what an ocean key is on this screen. Most keys are on the elements
// themselves (data-ocean-key in the apps); these are the ones found here.
let overlay = null;
const questOverlay = () =>
  (overlay =
    overlay ||
    window.OceanProgramUI.mountOverlay(document, {
      emit,
      locate: (key) => {
        const [kind, ref] = [key.slice(0, key.indexOf(":") < 0 ? key.length : key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        if (kind == "app") return document.querySelector(`[data-testid="task-${ref}"]`);
        if (kind == "file") return document.querySelector(`.fx-item[data-node="${ref}"], [data-node="${ref}"]`);
        if (kind == "net") return document.querySelector("[data-testid=tray-quick]");
        if (kind == "view")
          return [...document.querySelectorAll('.oceanWin[data-app="program"]')].find((el) => (JSON.parse(el.dataset.payload || "{}") || {}).view == ref) || null;
        return null;
      },
    }));

function apply(next, prev = world) {
  if (!next || next.v !== VERSION || !store) return;
  applying = true;
  try {
    world = next;
    const lookChanged = !prev || prev.sys !== next.sys || prev.user !== next.user;
    // Body data attributes first: window frames read the work area (taskbar auto-hide) while rendering.
    if (lookChanged) applyLook(next);
    store.dispatch({ type: "OCEAN_WORLD_APPLY", world: next });
    if (lookChanged) store.dispatch({ type: "SETTLOAD", payload: settingFromWorld(next) });
    applyOverlays(next, prev);
    questOverlay().update(next, "windows");
  } finally {
    flyoutBase = flyouts(store.getState());
    applying = false;
  }
}

// ---------- native flyouts → intents ----------

export const oceanMiddleware = (api) => (next) => (action) => {
  const result = next(action);
  if (!applying && flyoutBase && world) {
    const after = flyouts(api.getState());
    const before = flyoutBase;
    flyoutBase = after;
    for (const name of Object.keys(after)) {
      if (before[name] != after[name] && !!world.overlays[name] != after[name])
        emit({ kind: "toggle-overlay", name, open: after[name] });
    }
  }
  return result;
};

// ---------- snapshot (WORLD-CONTRACT §3.1) ----------
// What this shell shows, as OceanWorldModel.normalise output. Window frames (order, mode, focus, payload) are read
// from the rendered DOM, overlays from the native flyout reducers and the rendered centre / task view / switcher,
// phase and theme from the rendered root. Every other part comes from the Redux `world` slice, which is the store
// the Windows apps render from (there is no second copy to read). Generic: nothing here knows a store or scenario.
const TASKBAR_PX = 48;
function renderedWindows() {
  const w = window.innerWidth;
  const h = Math.max(200, window.innerHeight - (document.body.dataset.autohide == "true" ? 0 : TASKBAR_PX));
  return [...document.querySelectorAll(".oceanWin[data-win-id]")]
    .map((el) => {
      const box = el.getBoundingClientRect();
      return {
        id: el.dataset.winId,
        app: el.dataset.app,
        payload: JSON.parse(el.dataset.payload || "null"),
        mode: el.dataset.mode,
        focused: el.dataset.focused == "true",
        z: Number(el.style.zIndex) || 0,
        rect: { x: Math.round((box.left / w) * 1000), y: Math.round((box.top / h) * 600), w: Math.round((box.width / w) * 1000), h: Math.round((box.height / h) * 600) },
      };
    })
    .sort((a, b) => a.z - b.z);
}

function snapshot() {
  if (!store || !window.OceanWorldModel) return null;
  const state = store.getState();
  const shown = state.world;
  const wins = renderedWindows();
  const native = flyouts(state);
  const centre = document.querySelector("[data-testid=centre]");
  const root = document.querySelector(".App[data-phase]");
  return window.OceanWorldModel.normalise({
    ...shown,
    phase: root ? root.dataset.phase : shown.phase,
    sys: { ...shown.sys, theme: document.body.dataset.theme || shown.sys.theme },
    windows: wins.map(({ id, app, payload, mode, rect }) => ({ id, app, payload, mode, rect })),
    order: wins.map((win) => win.id),
    focusedId: (wins.find((win) => win.focused) || {}).id || null,
    overlays: {
      launcher: !!native.launcher,
      search: !!native.search,
      quick: !!native.quick,
      centre: !!centre && centre.dataset.hide == "false",
      taskView: !!document.querySelector("[data-testid=task-view]"),
      switcher: !!document.querySelector("[data-testid=switcher]"),
    },
  });
}

// ---------- intents out ----------

function emit(intent) {
  if (!intent || typeof intent.kind != "string") return;
  if ("app" in intent && !CANONICAL_APPS.includes(intent.app)) return;
  for (const cb of listeners) cb(intent);
  if (port) {
    port.postMessage({
      type: "world-intent",
      version: VERSION,
      revision: world ? world.revision : 0,
      seq: ++seq,
      intent,
    });
    return;
  }
  if (embedded || !world || !window.OceanWorldModel) return;
  // Standalone: the parent's own model (ui/desktop/world-model.js), so both modes agree.
  const result = window.OceanWorldModel.applyIntent(world, intent, Date.now());
  if (result.changed) apply(result.world, world);
  else if (!result.ok) console.warn("[ocean] intent rejected:", result.reason, intent);
  return result;
}

// ---------- transport (bridge v3) ----------

const onPortMessage = (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type == "world" && data.version === VERSION && data.world && data.world.v === VERSION) apply(data.world, world);
  else if (data.type == "world-active" && typeof data.active == "boolean") document.body.dataset.oceanActive = data.active;
};

const listen = () => {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.type !== "ocean-shell-attach" ||
        data.version !== VERSION || event.ports.length !== 1) return;
    if (port) port.close();
    port = event.ports[0];
    port.onmessage = onPortMessage;
    port.start();
    port.postMessage({ type: "ready", version: VERSION, shell: "windows", apps: [...CANONICAL_APPS] });
  });
  window.addEventListener("pagehide", () => port && port.close(), { once: true });
};

export function attachStore(reduxStore) {
  store = reduxStore;
  window.__win11 = { store, dispatch: store.dispatch };
  window.__oceanEmit = emit;
  window.OceanWorldAdapter = {
    shell: "windows",
    apps: [...CANONICAL_APPS],
    apply: (next, prev) => apply(next, prev === undefined ? world : prev),
    snapshot,
    onIntent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    ready,
    get world() {
      return world;
    },
  };
  // Embedded shells show the boot screen on the seed until the parent pushes its world.
  const initial = JSON.parse(JSON.stringify(seed));
  if (embedded) initial.phase = "boot";
  apply(initial, null);
  if (embedded) listen();
  resolveReady();
}
