// Canonical app list for the shell, from the win-apps registry (src/ocean/appRegistry.js).
// Entries: { id, name, icon, iconSrc, size, component }. Culled apps never appear.
import { appRegistry, CANONICAL_APPS } from "../ocean/appRegistry";

export { CANONICAL_APPS };

export const oceanApps = appRegistry.filter((app) => CANONICAL_APPS.includes(app.id));

export const appById = (id) => oceanApps.find((app) => app.id == id) || null;

// Legacy default export (upstream code imported the app list as default).
export default oceanApps;
