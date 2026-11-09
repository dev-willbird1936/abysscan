# Sync audit: macOS state that must survive an OS switch

> **Scenario authors never write sync code.** A scenario only writes world data (seed, profile overlay, scene projection, backend events). Both shells render any valid world identically through generic code; there is no scenario-specific code in either shell or the parent. Each adapter's `snapshot()` must equal `OceanWorldModel.normalise(world)` after an apply ([`WORLD-CONTRACT.md`](WORLD-CONTRACT.md) §3.1), and `check/roundtrip.mjs` proves it on generated worlds. A scenario that needs something new extends the model and both adapters generically.

GOAL: every piece of state a trainee or scene can see or change in one shell looks the same after switching OS. macOS (`previews/macos-final`) is the standard for apps, features and behaviour.

DONE WHEN: every macOS store field below is classified; each synced field has a world key validated by `ui/desktop/world-model.js` (strict shape, caps, fictional content, tests); the macOS adapter binds it both ways; `check/world-ab.mjs` covers it; `WORLD-CONTRACT.md` documents it.

Owner: `sync-model-mac`. Windows binding request: `requests/sync-model-ready.md`.

## Policy

| Class | Meaning | Examples |
|---|---|---|
| **synced** | Content or a setting a trainee would expect to find again on the other OS. Lives in the world; both shells read it and send intents | tabs, library, boards, history, alarms, timers, settings |
| **local** | Transient UI, or chrome that exists on one OS only. Stays inside that shell. The hidden shell keeps its own value while the other OS is shown, so it is still there when the trainee switches back | hover, open menus, drag in progress, scroll, selection, view mode, dock magnification |
| **exists** | Already in the world before this audit | windows, fs, mail, notes … |

Rules for every new store: optional key (old worlds stay valid), **absent means empty** (as `data.alarms` already does), exact keys, ids `^[a-z0-9-]{1,40}$`, size caps, `.example`/`.invalid` for any address in text, no URLs except `scene:<id>` and the browser placeholders below. The parent clock stamps times (`time`, `at`); shells never send them.

## 1. Shell services

| macOS store ▸ field | World key | Class | Reason |
|---|---|---|---|
| `phase` | `phase` | exists | |
| `wins` windows, zOrder, focusedId, rect, minimized, fullscreen, tile | `windows`, `order`, `focusedId` | exists | |
| `wins` missionControl, appSwitcher | `overlays.taskView`, `overlays.switcher` | exists | |
| `wins` showDesktop, exposeAppId, hidden | — | local | transient Exposé / show-desktop gesture |
| `ui` spotlightOpen/Tab, ccOpen | `overlays.launcher`/`search`/`quick` | exists | |
| `ui` spotlightQuery, contextMenu, confirm, hud, quickLookId, infoNodeId, emojiOpen, helpOpen, aboutOpen, forceQuitOpen | — | local | transient UI |
| `notify` banners, history, ncOpen | `notifications`, `overlays.centre` | exists | |
| `apps` dockPins, badges, installedExtraApps | `dock.pins`, `dock.badges`, `installed` | exists | |
| `apps` recentApps, launching, openAtLogin | — | local | derived from launches; launch animation; the adapter forces no open-at-login (windows belong to the world) |
| `fs` nodes, desktopPositions | `fs.nodes`, `fs.nodes[].desktopPos` | exists | |
| `clipboard` history | — | local | clipboard stays inside the shell (safety policy) |

## 2. Settings (`sys` store, Settings app store)

| macOS field | World key | Class | Reason |
|---|---|---|---|
| theme, accent, wallpaper, volume, muted, brightness, nightShift, wifi, bluetooth, focus, lowPowerMode, battery, reduceMotion, reduceTransparency | `sys.*` | exists | |
| `dockAutohide` | `sys.dockAutohide` (optional bool) | **synced** | Windows: "Automatically hide the taskbar" |
| `showBatteryPercent` | `sys.showBatteryPercent` (optional bool) | **synced** | Windows: battery percentage in the tray |
| `increaseContrast` | `sys.increaseContrast` (optional bool) | **synced** | Windows: contrast theme on/off |
| `wifiNetwork` | `sys.wifiNetwork` (optional line ≤ 40) | **synced** | name of the joined network, shown in both quick-settings panels |
| Settings ▸ Privacy: `privacy.locationServices`, `analytics`, `personalizedAds` | `sys.locationServices`, `sys.shareAnalytics`, `sys.personalizedAds` (optional bools) | **synced** | Windows Settings ▸ Privacy has the same three switches |
| dockSize, dockMagnify, dockPosition, minimizeEffect, minimizeIntoAppIcon, dblClickTitlebar, animateOpening, showIndicators, showRecentInDock, iconStyle, menubarSolid, stageManager, airdrop, focusUntil, ccExtra, ccRemoved, menubarPins, widgets, highlightColor, sidebarIconSize, trueTone, nightShiftSchedule, alertSound, uiSounds, volumeFeedback, outputDevice | — | local | macOS-only chrome; the Windows taskbar has no size, magnification or side position |
| recentFiles | — | local | derived history; Windows "Recommended" builds its own |
| user, skipBoot, openAtLogin | `user` | exists / local | the adapter writes them from the world |
| Settings `notifPrefs` (per-app allow/style/sounds/badge) | — | local | world banners come from the scene or backend and are not gated by either shell's per-app setting; syncing them would show a switch that does nothing on Windows |
| Settings keyRepeat, trackpad*, mouse*, siriEnabled, screenSaver, vpnConnected, tmDisk, swUpdateDone, btDevices | — | local | panes culled (PARITY.md) or no Windows counterpart |

## 3. Apps

| App ▸ macOS store field | World key | Class | Reason |
|---|---|---|---|
| **Safari** tabs per window (`ys.byWin[win].tabs`, `activeId`) | `data.browser.tabs`, `data.browser.activeTabId` | **synced** | open tabs are content. Cleared when the browser window closes (as on macOS, a new window starts with one start tab) |
| Safari `bookmarks` | `data.browser.bookmarks` (user) + `data.web.favorites` (scene, read-only) | **synced** | |
| Safari `history` | `data.browser.history` | **synced** | only `scene:` pages are recorded (start, history and unavailable pages are not, as on macOS) |
| Safari readingList, downloads, showFavoritesBar, trackersBlocked, tab overview, sidebar, reader, find bar, loading progress | — | local | sample list / transient download progress (files land in `fs`) / view chrome |
| **Music** tracks, playlists, loved | `data.media.tracks` (`loved` flag), `data.media.playlists` | **synced** | library content |
| Music queue, qIndex, shuffle, repeat; player owner, src, playing, position | `data.media.nowPlaying`, `data.media.shuffle`, `data.media.repeat` | **synced** | now playing resumes on the other OS. Only the visible shell makes sound |
| Music view, upNextOpen, lyricsOpen, mini, radioLive | — | local | view state |
| **Photos** items (name, takenAt, favorite, deletedAt), albums | `data.photos.items`, `data.photos.albums` | **synced** | library content; `trashed` = Recently Deleted |
| Photos edits (crop, filters), zoom, view, selection, slideshow | — | local | edits render a canvas data URL inside the shell; view state |
| **Freeform** boards (name, items), activeBoardId | `data.whiteboard.boards`, `data.whiteboard.activeId` | **synced** | board content and the open board |
| Freeform zoom, pan, tool, selection, undo stack | — | local | view and edit state |
| **Calculator** mode, angleDeg, base, memory, tape | `data.calculator` | **synced** | mode and history |
| Calculator tapeOpen, wordSize, current entry | — | local | view state / programmer detail |
| **Clock** cities | `data.clock.worldClocks` | **synced** | |
| Clock alarms | `data.alarms` | exists | |
| Clock timer | `data.clock.timer` | **synced** | a running timer keeps counting on the other OS |
| Clock stopwatch (swRunning, swStartAt, swAccum, swLaps) | `data.clock.stopwatch` | **synced** | |
| Clock tab, recentTimers | — | local | view state / derived list |
| **Terminal** history | `data.terminal.history` | **synced** | ↑ recalls the same commands |
| Terminal session cwd | `data.terminal.cwd` (folder id) | **synced** | a folder id, not a path, so each OS shows its own path form. Reset to `home` when the terminal window closes |
| Terminal themeId, fontSize, scrollback | — | local | profile chrome / transient output |
| **Stickies** stickies (html, color, x, y, w, h, collapsed, z) | `data.stickies` | **synced** | text, colour, size, position, collapsed; list order is the stacking order. Windows today keeps stickies in `data.notes` folder `stickies`: see the request |
| **Messages** convs[].pinned | `data.messages.threads[].pinned` (optional) | **synced** | |
| Messages unread, hideAlerts, typing indicator, auto-replies | — | local | badges come from `dock.badges`; the rest is transient |
| **Reminders** flagged, priority, notes | `data.reminders[].flagged`, `.priority`, `.notes` (optional) | **synced** | today the adapter resets them on every apply |
| Reminders lists (name, colour) | — | local | derived from `item.list` ids |
| **Calendar** allDay, notes | `data.calendar[].allDay`, `.notes` (optional) | **synced** | |
| Calendar calendars, colours, alert, repeat, view | — | local | one work calendar in the world |
| **Contacts** favorite | `data.contacts[].favorite` (optional) | **synced** | |
| Contacts address, birthday, url, note, My Card | — | local | My Card is `user`; other fields are not in the world contract |
| **Mail** messages, mailboxes, drafts | `data.mail` | exists | |
| Mail vipSenders, junkSenders, account selection | — | local | the adapter clears VIP/junk lists; view state |
| **Notes** notes | `data.notes` | exists | |
| Notes tags, locked, folders list, rich formatting | — | local | folders derive from `note.folder`; formatting is kept while text matches |
| **Finder** showSidebar, showPathBar, showPreview, defaults, folderOpts (view mode), iconPositions, sidebarFavs | — | local | view chrome; desktop icon positions are `fs.nodes[].desktopPos` |
| **TextEdit** document text | `data.contents` via `fs write` | exists | |
| TextEdit rich/plain toggle, font, ruler | — | local | view chrome |
| **App Store** updatesDone, purchasedFictional | `installed` | exists / local | installs are `installed`; the Updates tab is static sample content (software updates are `data.updates`) |
| **Activity Monitor** simulated processes, speed, tab | `data.processes` (scene) | exists / local | the simulation is decoration |
| **Authenticator**, **Software Update** | `data.mfa`, `data.updates` | exists | |
| **Finder / File Explorer** locked icon | `fs.nodes[].encrypted` (replay) | exists | padlock badge on the file icon in both shells |
| **Login Items** (Settings) / **Startup apps** (Task Manager) | `data.startup` (replay, read-only) | exists | |
| **Safari / Edge** homepage | `data.web.homepage` (replay) | exists | a new tab and Edge's Home button open it |
| **"What the program showed"** window | `data.screenshots` (replay, read-only) | exists | parent-drawn above the active shell, like the debrief |

## 4. New world shapes

All keys are optional under `data` unless noted. Caps in brackets.

```js
sys: { ...existing,
  dockAutohide?: bool, showBatteryPercent?: bool, increaseContrast?: bool, wifiNetwork?: line≤40,
  locationServices?: bool, shareAnalytics?: bool, personalizedAds?: bool }

data.browser: {
  tabs: [{ id, url: BrowserUrl, title: line≤120 }],            // [16]
  activeTabId: id | null,                                      // must name a tab; null only when tabs is empty
  bookmarks: [{ id, title: line≤80, url: 'scene:<id>' }],      // [50]
  history: [{ id, url: 'scene:<id>', title: line≤120, time }]  // [100], newest first, one entry per url
}
// BrowserUrl = 'start:' | 'history:' | 'unavailable:' | 'scene:<pageId>'
//   'unavailable:' is any typed address that is not a scene page (the neutral "This Page Isn't Available" page);
//   the typed text is not stored, so no real address enters the world.

data.media: {
  tracks: [{ id, title: line≤120, artist: line≤80, album: line≤120, genre: line≤40, asset: id, cover?: id,
             duration: int 0–86400 s, loved: bool }],          // [200]
  playlists: [{ id, name: line≤80, trackIds: [trackId] }],    // [50], ≤200 ids each, ids must be tracks
  shuffle: bool, repeat: 'off' | 'all' | 'one',
  nowPlaying: null | { trackId, queue: [trackId] (≤200, includes trackId), positionSec: number 0–86400,
                       playing: bool, at: time }               // position at `at`; while playing add (now − at)
}

data.photos: {
  items: [{ id, name: file name ≤120, asset: id, taken: time, favorite: bool, trashed: bool }],  // [400]
  albums: [{ id, name: line≤80, photoIds: [photoId] }]        // [50], ids must be items
}

data.whiteboard: {
  boards: [{ id, name: line≤80, modified: time, items: [BoardItem] }],   // [20] boards, [300] items each
  activeId: boardId | null
}
// BoardItem = { id, type: 'text'|'sticky'|'shape'|'pen', x, y, w, h (finite, |v| ≤ 100000),
//               text?: ≤2000 (not pen), color?: '#rrggbb' | '#rrggbbaa' | name (a–z, 3–12),
//               shape?: 'rect'|'ellipse'|'arrow' (shape only), points?: [x, y, …] (pen only, 4–2000 numbers),
//               width?: 1–40 (pen only) }

data.calculator: {
  mode: 'basic' | 'scientific' | 'programmer', angle: 'deg' | 'rad', base: 2 | 8 | 10 | 16, memory: finite number,
  history: [{ id, expr: line≤200, result: line≤80, time }]    // [100], newest first
}

data.clock: {
  worldClocks: [{ id, name: line≤60, tz: 'local' | IANA zone }],          // [24]; 'local' = the device's zone
  timer: null | { label: line≤60, durationMs: int 1000–86400000, remainingMs: int 0–durationMs, running: bool, at: time },
  stopwatch: { running: bool, elapsedMs: int ≥0, at: time | null, laps: [int ms total] (≤100, ascending) }
}
// timer: remaining at `at`; while running the remainder is remainingMs − (now − at).
// stopwatch: elapsed at `at`; while running add (now − at). `at` is null only when nothing ever ran.

data.terminal: { cwd: folderId (a live fs folder), history: [line≤500] }    // [100], oldest first

data.stickies: [{ id, text: ≤4000, color: 'yellow'|'pink'|'blue'|'green'|'purple'|'gray',
                  x, y: int 0–2000, w, h: int 60–2000, collapsed: bool }]     // [50], last = on top

// Detonation replay (SPEC §9.1; written by backend/detonation/replay.mjs, read-only in the shells):
data.startup: [{ id, name: line≤80, command: line≤200 }]                   // Windows Startup apps / macOS Login items
data.screenshots: [{ id, caption: line≤160, image: same-origin path | data:image URL }]   // [8]; "What the program showed"
data.web.homepage?: 'scene:<pageId>'                                        // must name a page in data.web.pages
fs.nodes[].encrypted?: bool                                                 // files only: locked icon

// New optional fields on existing items:
data.messages.threads[].pinned?: bool
data.reminders[].flagged?: bool, .priority?: 0–3, .notes?: ≤2000
data.calendar[].allDay?: bool, .notes?: ≤2000
data.contacts[].favorite?: bool
```

Asset ids (`asset`, `cover`) are logical: each shell maps them to its own bundled media. macOS maps `photo-1…8`, `track-1…4`, `cover-1…4` to its files, and `offsite` to a photo. A shell without a file for an id shows a neutral placeholder; names, order and flags must still match.

## 5. New intents

All are `{kind: 'data', store, op, item}` with exact keys. `time`, `at` and `modified` are stamped by the parent.

| Store | Op | `item` | Effect |
|---|---|---|---|
| `browser` | `set-tabs` | `{tabs, activeTabId}` | replaces the tab strip (the whole list, so drag-reorder is one intent) |
| `browser` | `visit` | `{id, url: 'scene:<id>', title}` | puts the page first in history (drops an older entry with the same url), stamped `time` |
| `browser` | `history-delete` / `clear-history` | `{id}` / `{}` | |
| `browser` | `bookmark-upsert` / `bookmark-delete` | `{id, title, url}` / `{id}` | |
| `media` | `set-playback` | `{trackId: id or null, queue, positionSec, playing}` | `trackId: null` (with `queue: []`, `positionSec: 0`, `playing: false`) clears now playing; otherwise sets it, stamped `at`. Send on play, pause, seek end, track change; not while playing |
| `media` | `set-mode` | `{shuffle, repeat}` | |
| `media` | `track-upsert` | full track | add (import) or change (`loved`, tags) |
| `media` | `playlist-upsert` / `playlist-delete` | `{id, name, trackIds}` / `{id}` | |
| `photos` | `photo-upsert` / `photo-delete` | full item / `{id}` | delete = purge from Recently Deleted (also drops it from albums) |
| `photos` | `album-upsert` / `album-delete` | `{id, name, photoIds}` / `{id}` | |
| `whiteboard` | `board-upsert` | `{id, name, items}` | whole board, stamped `modified`. Send at the end of an edit (debounced), not per pointer move |
| `whiteboard` | `board-delete` / `set-active` | `{id}` / `{id: boardId or null}` | deleting the active board makes the first remaining board active |
| `calculator` | `set` | `{mode, angle, base, memory}` | |
| `calculator` | `record` / `clear-history` | `{id, expr, result}` / `{}` | record puts the line first, stamped `time` |
| `clock` | `city-upsert` / `city-delete` | `{id, name, tz}` / `{id}` | |
| `clock` | `set-timer` | `{timer: null or {label, durationMs, remainingMs, running}}` | stamped `at` |
| `clock` | `set-stopwatch` | `{running, elapsedMs, laps}` | stamped `at` |
| `terminal` | `cd` | `{cwd: folderId}` | `no-such-folder` unless a live folder |
| `terminal` | `record` / `clear-history` | `{line}` / `{}` | record appends (skips a repeat of the last line), keeps the newest 100 |
| `stickies` | `upsert` / `delete` | full sticky / `{id}` | |
| `messages` | `pin` | `{threadId, pinned}` | |
| `reminders`, `calendar`, `contacts` | `upsert` | existing fields plus the optional fields above | an omitted optional field keeps its stored value |
| — | `set-sys` | any of the new `sys` keys | |

Reducer side effects: `open-app browser {url: 'scene:<id>'}` activates the tab showing that url, or appends one. Closing the browser window (or `set-phase off`, or uninstalling the browser) clears `tabs`; closing the terminal window resets `cwd` to `home`. Emptying the trash resets `cwd` to `home` when its folder is deleted.

## 6. Status

How macOS binds them: one table, `BINDINGS` in `previews/macos-final/src/adapter.js`. Each row names the native store and gives `toNative` (world → native), `fromNative` (native → world shape) and `parts` (how a difference becomes intents: `list`, `set` or `log`). Generic code applies a row when its world value changes, diffs `normaliseStore` of native against world on every native change (so its own apply never echoes), and builds `snapshot()`. Three paths stay hand-written because they are not plain data: Safari tabs (they belong to a window), Music playback (only trainee actions report; only the visible shell plays) and the Terminal working directory (reported by bundle patches).

Contract text: [`WORLD-CONTRACT.md`](WORLD-CONTRACT.md) §1, §2.1 and §3.1. Tests: `tests/world-model.test.mjs` (the eleven `synced` / `browser` / `media` / … tests). Mac checks: `previews/macos-final/check/world-ab.mjs` section "synced app stores".

| Store | Model + tests | Seed | macOS world → native | macOS native → intent | `world-ab` |
|---|---|---|---|---|---|
| sys additions + privacy | done | done | Dock auto-hide, battery %, contrast, Wi-Fi name; Settings ▸ Privacy | `set-sys` | both ways |
| browser | done | empty | tab strip of the browser window, bookmarks (after the scene favourites), history | `set-tabs`, `visit`, `history-delete`, `clear-history`, `bookmark-*` | both ways |
| media | done | 4 tracks, 2 playlists | library, playlists, loved, shuffle, repeat, queue, player track and play/pause | `track-upsert`, `playlist-*`, `set-mode`, `set-playback` (trainee actions only) | both ways + OS-switch pause/resume |
| photos | done | 8 photos, 2 albums | items, favourites, Recently Deleted, albums | `photo-*`, `album-*` | both ways |
| whiteboard | done | 1 board | boards, items, open board | `board-*`, `set-active` (debounced 400 ms) | both ways |
| calculator | done | defaults | mode, angle, base, memory, tape | `set`, `record`, `clear-history` | both ways |
| clock | done | 4 world clocks | cities, timer, stopwatch | `city-*`, `set-timer`, `set-stopwatch` | both ways |
| terminal | done | home, no history | ↑ history; new and open sessions' cwd (bundle patches 71–73) | `record`, `clear-history`, `cd` (real typing in the check) | both ways |
| stickies | done | 2 stickies | text, colour, geometry, collapsed | `upsert`, `delete` (debounced 400 ms) | both ways |
| item fields (pinned, flagged, priority, notes, allDay, favorite) | done | — | Messages pin, Reminders flag/priority/notes, Calendar all-day/notes, Contacts favourite | `messages pin`, `upsert` with the fields | pin, flag, favourite |

Round trip: `node desktop-comparison/previews/macos-final/check/roundtrip.mjs <port> 30 1` passes 33/33 (30 generated worlds, fresh and continued, with profile overlays). It found and fixed four shell bugs: a root-relative `wallpaperUrl` read back as none, a stopped track still reported as current, a reused window keeping its old page when its payload became empty, and native badge counters (Mail, Messages, Reminders, App Store) overwriting `dock.badges`.

## 7. Known limits

- Playback position needs byte-range support on the shell server (added by engine-core, `requests/sync-model-mac-to-engine-core.md`). A server started before that change cannot seek, so the track restarts at 0 until it is restarted.
- Terminal: a cwd changed on the other OS moves the open macOS session, but its prompt redraws on the next key. The `~` abbreviation follows the seed user, so another world user sees the full `/Users/<name>` path (existing identity limit).
- Photos edits (crop, filters), Freeform zoom and tool, Stickies stacking after a click-to-front, Safari reading list and downloads stay local (§3).
- Photos imported from a blob (not a bundled asset) and Safari bookmarks or tabs of a non-scene address cannot enter the world: there is no fictional, same-origin way to store them. A typed address becomes `unavailable:`.
- The Freeform board shown when the world has none is local until something is drawn on it.
