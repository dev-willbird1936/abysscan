// Selectors over the parent-owned world and the single mutation path, emit(intent).
// Apps read world state only through these helpers and mutate only through emit.
import { useSelector } from "react-redux";
import worldReducer, { OCEAN_WORLD_APPLY } from "../reducers/world";
import { CANONICAL_APPS } from "./appRegistry";
import "./world-model.js"; // defines window.OceanWorldModel
import "./program-ui.js"; // defines window.OceanProgramUI (views, dialogs, file icons; shared with macOS)

export const FIXED_FOLDERS = ["root", "home", "desktop", "documents", "downloads", "pictures", "music", "trash"];

// ---------- hooks ----------
// Falls back to the seed if the store has no world slice yet (reducer not registered).
const SEED = worldReducer(undefined, { type: "@@ocean/init" });
export const useWorld = () => useSelector((state) => state.world || SEED);
export const useWorldPart = (pick) => useSelector((state) => pick(state.world || SEED));

// ---------- ids, time ----------
export const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 40);
export const nowIso = () => new Date().toISOString();

export const fmtTime = (iso, opts) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("en-US", opts || { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
export const fmtSize = (n) => (!n ? "0 KB" : n < 1024 ? `${n} B` : `${Math.ceil(n / 1024)} KB`);

// ---------- apps ----------
export const isInstalled = (world, app) => CANONICAL_APPS.includes(app) && (world.installed || []).includes(app);

// ---------- file system ----------
export const getNode = (world, id) => (world.fs && world.fs.nodes[id]) || null;

const byFolderThenName = (a, b) =>
  (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || a.name.localeCompare(b.name);

export const childrenOf = (world, folderId) =>
  Object.values(world.fs.nodes)
    .filter((n) => n.parentId === folderId && !n.trashed && n.id !== "trash")
    .sort(byFolderThenName);

// Top-level trashed items: trashed nodes whose parent is not itself trashed.
export const trashedItems = (world) =>
  Object.values(world.fs.nodes)
    .filter((n) => n.trashed && !(getNode(world, n.parentId) || {}).trashed)
    .sort(byFolderThenName);

export const ancestry = (world, id) => {
  const chain = [];
  for (let n = getNode(world, id); n; n = getNode(world, n.parentId)) {
    chain.unshift(n);
    if (chain.length > 64) break;
  }
  return chain;
};

export const isInside = (world, id, ancestorId) => ancestry(world, id).some((n) => n.id === ancestorId);

// Windows display path. root is shown as C:\Users so home is C:\Users\<short>.
export const winPath = (world, id) => {
  if (id === "trash") return "Recycle Bin";
  const names = ancestry(world, id)
    .filter((n) => n.id !== "root")
    .map((n) => n.name);
  return ["C:\\Users", ...names].join("\\");
};

// Resolve a Windows-style path (absolute, ~, %USERPROFILE%, or relative to cwdId).
export const resolveWinPath = (world, cwdId, input) => {
  let p = String(input || "").trim().replace(/^"|"$/g, "").replace(/\//g, "\\");
  let cur = cwdId;
  if (/^(~|%userprofile%)/i.test(p)) {
    cur = "home";
    p = p.replace(/^(~|%userprofile%)/i, "");
  } else if (/^[a-z]:/i.test(p)) {
    cur = "root";
    p = p.replace(/^[a-z]:\\?/i, "").replace(/^users(\\|$)/i, "");
  } else if (p.startsWith("\\")) {
    cur = "root";
    p = p.replace(/^\\(users(\\|$))?/i, "");
  }
  for (const seg of p.split("\\").filter(Boolean)) {
    if (seg === ".") continue;
    if (seg === "..") {
      const n = getNode(world, cur);
      cur = (n && n.parentId) || cur;
      continue;
    }
    const next = childrenOf(world, cur).find((c) => c.name.toLowerCase() === seg.toLowerCase());
    if (!next) return null;
    cur = next.id;
  }
  return cur;
};

export const fileText = (world, node) => {
  const c = node && node.contentId && world.data.contents[node.contentId];
  return (c && typeof c.text === "string" && c.text) || "";
};
export const fileAsset = (world, node) => {
  const c = node && node.contentId && world.data.contents[node.contentId];
  return (c && c.asset) || null;
};

export const mimeFor = (name) => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (["mp3", "wav", "m4a", "ogg"].includes(ext)) return "audio/mpeg";
  if (["mp4", "mov", "webm"].includes(ext)) return "video/mp4";
  return "text/plain";
};

export const isImage = (n) => !!n && n.kind === "file" && String(n.mime || "").startsWith("image/");
export const isMedia = (n) =>
  !!n && n.kind === "file" && (/^(audio|video)\//.test(n.mime || "") || n.parentId === "music");

// File types (PROGRAMS.md §1): Windows hides known extensions, so invoice.pdf.exe shows as invoice.pdf with its icon.
// Known extensions are hidden unless the trainee turned on File name extensions (world.sys.showExtensions).
export const shownName = (node, world) => (node && node.kind !== "app" ? window.OceanWorldModel.displayName(node, "windows", !!world?.sys?.showExtensions) : node ? node.name : "");
export const fileIconSrc = (node) => window.OceanProgramUI.fileIcon(window.OceanWorldModel.iconTypeOf(node), "windows", { encrypted: !!node.encrypted });
export const fileTypeLabel = (node) => window.OceanWorldModel.fileTypeOf(node).label;

// Default handler for a node, limited to installed apps.
export const openWithApp = (world, node) => {
  if (!node) return null;
  const pick = node.kind === "folder" ? "files" : node.kind === "app" ? node.appId : isImage(node) ? "photos" : /^(audio|video)\//.test(node.mime || "") ? "media" : "texteditor";
  return isInstalled(world, pick) ? pick : null;
};

export const openNode = (world, node, app) => {
  if (node && node.kind === "file" && !app) {
    emit({ kind: "open-file", fileId: node.id });
    return true;
  }
  const target = app || openWithApp(world, node);
  if (!target || !isInstalled(world, target)) return false;
  if (node.kind === "app") emit({ kind: "open-app", app: target });
  // A double-click on a file goes through the OS (the parent's model): programs prompt and run, PDFs open read-only,
  // locked or unknown files cannot open. "Open with" (an explicit app) still opens that app.
  else if (node.kind === "file" && !app) emit({ kind: "open-file", fileId: node.id });
  else emit({ kind: "open-app", app: target, payload: node.kind === "folder" ? { folderId: node.id } : { fileId: node.id } });
  return true;
};

export const uniqueName = (world, parentId, name) => {
  const taken = new Set(childrenOf(world, parentId).map((c) => c.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 2; ; i++) if (!taken.has(`${base} (${i})${ext}`.toLowerCase())) return `${base} (${i})${ext}`;
};

// ---------- data ----------
export const mailIn = (world, folder) =>
  world.data.mail.messages.filter((m) => m.folder === folder).sort((a, b) => (a.time < b.time ? 1 : -1));
export const unreadIn = (world, folder) => mailIn(world, folder).filter((m) => !m.read).length;
export const senderName = (from) => String(from || "").replace(/\s*<.*>\s*$/, "") || from;
export const senderEmail = (from) => (String(from || "").match(/<([^>]+)>/) || [null, from])[1];
export const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export const notesIn = (world, folder) =>
  (world.data.notes || [])
    .filter((n) => !folder || n.folder === folder)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.modified < b.modified ? 1 : -1));

// ---------- data intents (exact item shapes of the parent model, ITEM_SHAPES) ----------
// Required keys always; optional keys (SYNC-AUDIT §4) only when present, so the stored value is kept otherwise.
const pick = (obj, keys, optional = []) =>
  Object.fromEntries([...keys.map((k) => [k, obj[k]]), ...optional.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]])]);
export const dataOp = (store, op, item) => emit({ kind: "data", store, op, item });
export const deleteItem = (store, id) => dataOp(store, "delete", { id });
// Full-item upserts: merge the patch over the current item, then send only the allowed keys.
export const saveNote = (note, patch = {}) => dataOp("notes", "upsert", pick({ pinned: false, ...note, ...patch }, ["id", "folder", "title", "body", "pinned"]));
export const saveEvent = (ev) => dataOp("calendar", "upsert", pick({ location: "", ...ev }, ["id", "title", "start", "end", "location"], ["allDay", "notes"]));
export const saveReminder = (r, patch = {}) =>
  dataOp("reminders", "upsert", pick({ due: null, ...r, ...patch }, ["id", "list", "title", "due"], ["flagged", "priority", "notes"]));
export const toggleReminder = (id, done) => dataOp("reminders", "toggle", { id, done });
export const saveContact = (c) => dataOp("contacts", "upsert", pick({ email: "", phone: "", org: "", ...c }, ["id", "name", "email", "phone", "org"], ["favorite"]));
export const pinThread = (threadId, pinned) => dataOp("messages", "pin", { threadId, pinned });
// Scene choices (V2 CHOICE_IDS) fire from ordinary gestures only on the item the scene highlights.
// ref null in the highlight means the whole app is highlighted.
export const isHighlighted = (world, app, ref) => {
  const h = world.scene && world.scene.highlight;
  return !!h && h.app === app && (h.ref == null || ref === undefined || h.ref === ref);
};
export const sceneChoice = (world, app, ref, choiceId) => {
  if (!isHighlighted(world, app, ref)) return false;
  emit({ kind: "scene-choice", choiceId });
  return true;
};
export const isFictionalEmail = (s) => /^[^@\s]+@[A-Za-z0-9.-]+\.(example|invalid)$/i.test(s || "");

// ---------- emit ----------
// Standalone mode applies intents with the parent's own model (vendored by sync-world-model.mjs),
// so both shells and the parent share one implementation of every intent.
const model = () => window.OceanWorldModel;
let boundStore = null;
export const bindWorldStore = (store) => {
  boundStore = store;
};
const localStore = () => boundStore || (window.__win11 && window.__win11.store) || null;

// Parent present: hand the intent to the shell bridge. Standalone: apply locally.
// Returns the model result ({ ok, changed, reason, forward }) in standalone mode.
export const emit = (intent) => {
  if (typeof window.__oceanEmit === "function") return window.__oceanEmit(intent);
  const store = localStore();
  if (!store || !model()) return null;
  const world = store.getState().world;
  const result = model().applyIntent(world, intent, Date.now());
  if (result.changed) store.dispatch({ type: OCEAN_WORLD_APPLY, world: result.world });
  else if (!result.ok && typeof console !== "undefined") console.warn("[ocean] intent rejected:", result.reason, intent);
  return result;
};
