// Synced app stores (SYNC-AUDIT.md §4–5): data.browser, media, photos, whiteboard, calculator, clock,
// terminal and stickies. Apps read them with useSynced(store) (an absent store means empty) and change
// them only with syncedOp(store, op, item), a world `data` intent. Times (`time`, `at`, `modified`)
// are stamped by the parent.
import { useWorldPart, emit } from "./world-helpers";

export const SYNCED_EMPTY = {
  browser: { tabs: [], activeTabId: null, bookmarks: [], history: [] },
  media: { tracks: [], playlists: [], shuffle: false, repeat: "off", nowPlaying: null },
  photos: { items: [], albums: [] },
  whiteboard: { boards: [], activeId: null },
  calculator: { mode: "basic", angle: "deg", base: 10, memory: 0, history: [] },
  clock: { worldClocks: [], timer: null, stopwatch: { running: false, elapsedMs: 0, at: null, laps: [] } },
  terminal: { cwd: "home", history: [] },
  stickies: [],
};

export const useSynced = (store) => useWorldPart((w) => w.data[store] || SYNCED_EMPTY[store]);

export const syncedOp = (store, op, item) => emit({ kind: "data", store, op, item });

// Running clocks: the stored value is true at `at`; while running add (now - at).
export const sinceAt = (at, now = Date.now()) => (at ? Math.max(0, now - Date.parse(at)) : 0);
