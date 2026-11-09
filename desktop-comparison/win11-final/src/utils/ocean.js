import { useSelector } from "react-redux";
import { APP_META } from "../ocean/appRegistry";

// Shell helpers over the parent-owned world (state.world).
export const useWorld = () => useSelector((state) => state.world);

export const emit = (intent) => window.__oceanEmit && window.__oceanEmit(intent);

export const setSys = (patch) => emit({ kind: "set-sys", patch });
export const setPhase = (phase) => emit({ kind: "set-phase", phase });
export const toggleOverlay = (name, open) => emit({ kind: "toggle-overlay", name, open });

export const DEPTH_WALLPAPERS = [
  { id: "depth-sunlight", name: "Sunlight zone" },
  { id: "depth-twilight", name: "Twilight zone" },
  { id: "depth-midnight", name: "Midnight zone" },
  { id: "depth-abyss", name: "Abyss" },
  { id: "depth-trench", name: "Trench" },
  { id: "stock", name: "Windows" },
];

export const wallpaperOf = (sys) => {
  if (sys.wallpaperUrl) return sys.wallpaperUrl;
  if (sys.wallpaper && sys.wallpaper.startsWith("depth-"))
    return `img/wallpaper/depth/${sys.wallpaper.slice(6)}.svg`;
  return sys.theme == "dark" ? "img/wallpaper/dark/img0.jpg" : "img/wallpaper/default/img0.jpg";
};

export const cssUrl = (url) => `url("${String(url).replace(/["\\\n]/g, "")}")`;

export const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

export const formatTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// Fixed fs folder ids from the contract.
export const SYSTEM_FOLDERS = ["root", "home", "desktop", "documents", "downloads", "pictures", "music", "trash"];

// App shortcuts of apps that are not installed stay hidden (WORLD-CONTRACT §7).
export const childrenOf = (world, parentId) =>
  Object.values(world.fs.nodes).filter(
    (node) => node.parentId == parentId && !node.trashed && (node.kind != "app" || (world.installed || []).includes(node.appId)),
  );

export const fileIcon = (node) => {
  if (node.kind == "file" || node.archive) return window.OceanProgramUI.fileIcon(window.OceanWorldModel.iconTypeOf(node), "windows", { encrypted: !!node.encrypted });
  if (node.kind == "folder") return "win/folder";
  if (node.kind == "app") return (APP_META[node.appId] && APP_META[node.appId].icon) || "win/info";
  if ((node.mime || "").startsWith("image/")) return "photos";
  if (/^(audio|video)\//.test(node.mime || "")) return "groove";
  return "notepad";
};

// Which canonical app opens a file node, limited to installed apps.
export const openerOf = (world, node) => {
  const installed = world.installed || [];
  const pick = (...ids) => ids.find((id) => installed.includes(id)) || null;
  if (node.kind == "folder") return pick("files");
  if (node.kind == "app") return pick(node.appId);
  if ((node.mime || "").startsWith("image/")) return pick("photos", "files");
  return pick("texteditor", "notes", "files");
};

// Focus dimming (SCENARIOS-60 contract §3): world.scene.focusApps lists the bright app ids;
// absent or [] means nothing dims. Dimmed items stay clickable.
export const isDimmed = (world, appId) => {
  const focus = world.scene && world.scene.focusApps;
  return Array.isArray(focus) && focus.length > 0 && !focus.includes(appId);
};

export const isFocusApp = (world, appId) => {
  const focus = world.scene && world.scene.focusApps;
  return Array.isArray(focus) && focus.includes(appId);
};

// Only app shortcuts carry an app id; files and folders (and the Recycle Bin) never dim.
export const isNodeDimmed = (world, node) => node.kind == "app" && isDimmed(world, node.appId);
