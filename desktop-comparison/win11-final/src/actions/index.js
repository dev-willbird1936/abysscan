import store from "../reducers";
import { appById } from "../utils/apps";
import {
  childrenOf,
  DEPTH_WALLPAPERS,
  emit,
  openerOf,
  setPhase,
  setSys,
  toggleOverlay,
} from "../utils/ocean";
import { playSound } from "../utils/sounds";
import { newId, uniqueName } from "../ocean/world-helpers";
import { sortedDesktopPositions, toVirtual } from "../components/start";

const world = () => store.getState().world;

export const dispatchAction = (event) => {
  const action = { type: event.target.dataset.action, payload: event.target.dataset.payload };
  if (action.type) store.dispatch(action);
};

// Opens (or focuses) a canonical app window.
export const openApp = (id, payload) => {
  if (!appById(id) || !world().installed.includes(id)) {
    playSound("error", world().sys);
    return false;
  }
  emit(payload ? { kind: "open-app", app: id, payload } : { kind: "open-app", app: id });
  return true;
};

// Win11 "show desktop": minimise everything; a second press restores what it hid.
let hiddenByShowDesktop = [];
export const showDesktop = () => {
  const open = world().windows.filter((w) => w.mode != "minimized");
  if (open.length) {
    hiddenByShowDesktop = open.map((w) => w.id);
    open.forEach((w) => emit({ kind: "minimize", id: w.id }));
  } else {
    hiddenByShowDesktop.forEach((id) => world().windows.some((w) => w.id == id) && emit({ kind: "focus-window", id }));
    hiddenByShowDesktop = [];
  }
};

export const openNode = (id) => {
  const node = world().fs.nodes[id];
  if (!node) return;
  // Files open the way Windows opens them (the parent's model decides: prompt, run, viewer or "can't open").
  if (node.kind == "file") return emit({ kind: "open-file", fileId: node.id });
  const app = openerOf(world(), node);
  if (!app) {
    playSound("error", world().sys);
    return;
  }
  openApp(app, node.kind == "folder" ? { folderId: node.id } : node.kind == "app" ? undefined : { fileId: node.id });
};

export const openSettings = (page) => {
  if (page) store.dispatch({ type: "SETTINGSPAGE", payload: page });
  openApp("settings");
};

// ---------- desktop menu ----------

const setMenuDots = (menu, group, index) => {
  const tmpMenu = { ...menu };
  tmpMenu.menus.desk[group].opts.forEach((opt, i) => {
    if (opt.type != "hr" && opt.check == null) opt.dot = i == index;
  });
  store.dispatch({ type: "MENUCHNG", payload: tmpMenu });
};

export const refresh = () => {
  store.dispatch({ type: "DESKHIDE" });
  setTimeout(() => store.dispatch({ type: "DESKSHOW" }), 100);
};

export const changeIconSize = (size, menu) => {
  const sizes = { large: 1.5, medium: 1.2, small: 1 };
  setMenuDots(menu, 0, ["large", "medium", "small"].indexOf(size));
  store.dispatch({ type: "DESKSIZE", payload: sizes[size] || 1 });
};

export const deskHide = (payload, menu) => {
  const tmpMenu = { ...menu };
  tmpMenu.menus.desk[0].opts[4].check = !tmpMenu.menus.desk[0].opts[4].check;
  store.dispatch({ type: "DESKTOGG" });
  store.dispatch({ type: "MENUCHNG", payload: tmpMenu });
};

export const changeSort = (sort, menu) => {
  setMenuDots(menu, 1, ["name", "size", "date"].indexOf(sort));
  store.dispatch({ type: "DESKSORT", payload: sort });
  const key = {
    name: (a, b) => a.name.localeCompare(b.name),
    size: (a, b) => (b.size || 0) - (a.size || 0),
    date: (a, b) => String(b.modified).localeCompare(String(a.modified)),
  }[sort];
  const nodes = childrenOf(world(), "desktop").sort(key);
  for (const { id, pos } of sortedDesktopPositions(nodes)) emit({ kind: "fs", op: "set-desktop-pos", id, pos });
};

export const newItem = (kind, menu) => {
  const folder = kind == "folder";
  const id = newId(folder ? "d" : "f");
  const name = uniqueName(world(), "desktop", folder ? "New folder" : "New Text Document.txt");
  emit(folder ? { kind: "fs", op: "mkdir", id, parentId: "desktop", name } : { kind: "fs", op: "touch", id, parentId: "desktop", name, mime: "text/plain" });
  emit({ kind: "fs", op: "set-desktop-pos", id, pos: toVirtual(menu.left || 120, menu.top || 120) });
  store.dispatch({ type: "DESKRENAME", payload: id });
};

export const personalize = () => openSettings("Personalisation");
export const displaySettings = () => openSettings("System");

export const nextWallpaper = () => {
  const ids = DEPTH_WALLPAPERS.map((w) => w.id);
  const current = ids.indexOf(world().sys.wallpaper);
  setSys({ wallpaper: ids[(current + 1) % ids.length], wallpaperUrl: null });
};

export const terminalHere = () => openApp("terminal", { folderId: "desktop" });

// ---------- desktop icon / recycle bin menus ----------

export const fileOpen = (p, menu) => openNode(menu.dataset.id);
export const fileRename = (p, menu) => store.dispatch({ type: "DESKRENAME", payload: menu.dataset.id });
export const fileTrash = (p, menu) => {
  emit({ kind: "fs", op: "trash", id: menu.dataset.id });
  playSound("trash", world().sys);
};
export const binOpen = () => openApp("files", { folderId: "trash" });
export const binEmpty = () => {
  emit({ kind: "fs", op: "empty-trash" });
  playSound("trash", world().sys);
};

// ---------- taskbar app menu ----------

const windowOf = (id) => world().windows.find((w) => w.app == id);
export const taskOpen = (p, menu) => openApp(menu.dataset.app);
export const taskPin = (p, menu) => emit({ kind: "dock", op: "pin", app: menu.dataset.app });
export const taskUnpin = (p, menu) => emit({ kind: "dock", op: "unpin", app: menu.dataset.app });
export const taskClose = (p, menu) => {
  const win = windowOf(menu.dataset.app);
  if (win) emit({ kind: "close-window", id: win.id });
};
export const taskFullscreen = (p, menu) => {
  const win = windowOf(menu.dataset.app);
  if (win) emit({ kind: win.mode == "fullscreen" ? "restore" : "fullscreen", id: win.id });
};

export const taskView = () => toggleOverlay("taskView", true);

export const changeTaskAlign = (align, menu) => {
  const tmpMenu = { ...menu };
  tmpMenu.menus.task[0].opts[0].dot = align == "left";
  tmpMenu.menus.task[0].opts[1].dot = align != "left";
  store.dispatch({ type: align == "left" ? "TASKLEF" : "TASKCEN" });
  store.dispatch({ type: "MENUCHNG", payload: tmpMenu });
};

// ---------- power ----------

export const powerLock = () => setPhase("lock");
export const powerSleep = () => setPhase("sleep");
export const powerOff = () => setPhase("off");
// The world model allows desktop → off → boot, so a restart is a short power cycle.
export const powerRestart = () => {
  setPhase("off");
  setTimeout(() => setPhase("boot"), 900);
};
