import { oceanApps } from "./apps";

// Enabled apps (world.installed), in canonical order. Anything not installed must not
// appear in the taskbar, Start, search, desktop or file-open handlers.
export const installedApps = (world) => {
  const installed = (world && world.installed) || [];
  return oceanApps.filter((app) => installed.includes(app.id));
};

// Taskbar pins (world.dock.pins order), installed only.
export const pinnedApps = (world) => {
  const installed = installedApps(world);
  return ((world && world.dock && world.dock.pins) || [])
    .map((id) => installed.find((app) => app.id === id))
    .filter(Boolean);
};

export const badgeOf = (world, id) =>
  (world && world.dock && world.dock.badges && world.dock.badges[id]) || 0;
