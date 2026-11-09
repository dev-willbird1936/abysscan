# World contract v3: one state, two shells

> **Scenario authors never write sync code.** A scenario only writes world data: the seed, a profile overlay, the scene projection (`scene-world.js`) or backend events. Both shells render any valid world identically through generic code: neither shell nor the parent contains code for a particular scenario. The proof is mechanical: after applying a world, each shell's `OceanWorldAdapter.snapshot()` equals `OceanWorldModel.normalise(world)` (§3.1). If a scenario needs something the world cannot express, extend the world model and both adapters generically, never the scenario.

The parent page owns a **world state**. Each shell (final macOS, final Windows) is a native renderer in a `sandbox="allow-scripts"` iframe. A shell renders the world and reports user gestures as **world intents**. The parent validates each intent, applies it, bumps `revision`, and pushes the new world to the active shell. The scene state machine (CONTRACT-V2, `ui/desktop/desktop-model.js`) keeps running beside it and writes scene content into the world, such as a lure email in `data.mail` or a lure file in `fs`.

## 1. World state

All ids match `^[a-z0-9-]{1,40}$`. All text is synthetic. Bounds are in a virtual 1000×600 work area, and each shell scales to its own pixels.

```js
{
  v: 3, revision: 0,
  phase: 'boot' | 'lock' | 'desktop' | 'sleep' | 'off',
  user: { id: 'trainee', name: 'Alex Rivera', short: 'alex', email: 'alex.rivera@northwind.example', avatar: 'initials' },
  sys: {
    theme: 'light' | 'dark', accent: 'blue'|'purple'|'pink'|'red'|'orange'|'yellow'|'green'|'graphite',
    wallpaper: 'depth-sunlight'|'depth-twilight'|'depth-midnight'|'depth-abyss'|'depth-trench'|'stock',
    volume: 0..100, muted: bool, brightness: 20..100, nightLight: bool,
    wifi: bool, bluetooth: bool, focus: bool, lowPower: bool, battery: 0..100,
    reduceMotion: bool, reduceTransparency: bool,
    // optional, synced from macOS (SYNC-AUDIT.md §2):
    dockAutohide?: bool, showBatteryPercent?: bool, increaseContrast?: bool, wifiNetwork?: line≤40,
    locationServices?: bool, shareAnalytics?: bool, personalizedAds?: bool
  },
  fs: { nodes: { [id]: { id, parentId, name, kind: 'folder'|'file'|'app', mime, size, modified, trashed, appId?, contentId?, desktopPos?: {x,y} } } },
  // Fixed folder ids: root, home, desktop, documents, downloads, pictures, music, trash.
  windows: [ { id, app, title, rect: {x,y,w,h}, mode: 'normal'|'minimized'|'maximized'|'fullscreen', tile: null|'left'|'right'|'top'|'bottom'|'tl'|'tr'|'bl'|'br', payload } ],
  order: [windowId...], focusedId: null | windowId,
  overlays: { launcher: bool, search: bool, quick: bool, centre: bool, taskView: bool, switcher: bool },
  notifications: { banners: [notification], history: [notification] },   // notification: { id, app, title, body, time, ref? }
  dock: { pins: [appId...], badges: { [appId]: n } },
  installed: [appId...],
  data: {
    mail:      { folders: [...], messages: [{ id, folder, from, to, subject, body, time, read, flagged, attachments: [fileId], link? }] },
    messages:  { threads: [{ id, with, items: [{ id, from, text, time }], pinned? }] },
    notes:     [{ id, folder, title, body, modified, pinned }],
    calendar:  [{ id, title, start, end, location, invite?, allDay?, notes? }],
    reminders: [{ id, list, title, due, done, flagged?, priority?: 0–3, notes? }],
    contacts:  [{ id, name, email, phone, org, favorite? }],
    contents:  { [contentId]: { text } | { asset } },     // file bodies, image refs
    // optional stores: alarms, updates, mfa, processes, web (below), and the synced app stores browser, media, photos,
    // whiteboard, calculator, clock, terminal, stickies (§2.1)
  },
  scene: { phase, stepId, highlight: null | { app, ref } }   // read-only mirror of the V2 scene, for dimming and focus
}
```

Canonical app ids: `files browser mail messages mfa updates settings terminal notes texteditor calendar reminders contacts photos media calculator clock store taskmanager stickies whiteboard`. Culled apps never appear, either in the registry or as an intent value.

## 2. Intents (shell → parent)

Envelope: `{ type: 'world-intent', version: 3, revision, seq, intent }`. Exact keys only. The parent rejects anything unknown.

The validator and reducer is `ui/desktop/world-model.js` (`OceanWorldModel`; ESM: `ui/desktop/world-model.mjs`), shared by the parent and both shells: `applyIntent(world, intent, nowMs) → { ok, changed, world, reason, forward }`. A changed world has `revision + 1`. `forward` is `{ kind: 'choose', choiceId }` when the intent is also a CONTRACT-V2 scene choice, otherwise `null`. Every intent object is `{ kind, ...fields }` with exactly the keys below; `?` marks an optional key. Ids match `^[a-z0-9-]{1,40}$`; times are ISO `…Z` strings; email addresses must use `.example` or `.invalid`.

Only `set-phase`, `set-sys`, `notify-dismiss` and `notify-clear` are accepted outside `phase: 'desktop'` (reason `not-desktop`). A culled app id anywhere in an intent is refused with reason `culled-app`.

| Kind | Exact fields | Effect and refusals |
|---|---|---|
| `open-app` | `app`, `payload?`: one of `{folderId}`, `{fileId}`, `{messageId}`, `{url: 'scene:<id>'}`, or for `settings` only `{pane: 'startup'|'privacy'|'network'}` (Windows: Apps › Startup, Privacy & security, Network & internet; macOS: Login Items, Privacy, Network) | Opens window `w-<app>-<n>` (default rect, cascaded) and focuses it. Single-instance apps focus their window instead; `files`, `texteditor`, `stickies` open one window per payload. `not-installed`, `no-such-folder`, `no-such-file`, `no-such-message`, `too-many-windows` (24) |
| `close-window`, `focus-window`, `minimize`, `restore`, `maximize`, `fullscreen` | `id` | `restore` also clears `tile`. `no-such-window` |
| `set-rect` | `id`, `rect: {x,y,w,h}` (finite numbers) | Rounded and clamped into 1000×600, minimum 200×120; mode becomes `normal`, `tile` null. Send at drag or resize end only |
| `tile` | `id`, `tile`: `left` `right` `top` `bottom` `tl` `tr` `bl` `br` or `null` | Sets the half or quarter rect; `null` only clears the tile |
| `set-sys` | `patch`: non-empty subset of `sys` | Every key checked: `theme` `light`/`dark`; `accent` 8 names; `wallpaper` depth ids or `stock`; `wallpaperUrl` `null`, a root-relative path or a base64 `data:image/` URL (png, jpeg, webp or svg+xml); `volume`, `battery` 0–100; `brightness` 20–100; the rest booleans |
| `set-phase` | `phase` | Allowed moves: boot→lock; lock→desktop/sleep/off; desktop→lock/sleep/off; sleep→lock; off→boot. Closes overlays; `off` also closes windows and banners. `phase-transition` |
| `toggle-overlay` | `name`: `launcher` `search` `quick` `centre` `taskView` `switcher`, `open` | Overlays are exclusive: opening one closes the others |
| `fs` | `op` plus: `mkdir {parentId, name, id?}`, `touch {parentId, name, id?, mime?, text?}`, `rename {id, name}`, `move {id, parentId}`, `trash {id}`, `restore {id}`, `empty-trash {}`, `write {id, text}`, `set-desktop-pos {id, pos: {x,y}}` | Names: 1–120 chars, no `/` or `\`, unique among live siblings (`name-taken`). New ids default to `u-<n>`; `touch` creates content `c-<id>`. `trash` sets `trashed` (the node keeps its `parentId`); `empty-trash` deletes trashed nodes, their descendants and contents, and closes their windows. The 8 fixed folders cannot be renamed, moved or trashed (`no-such-node`); `move` into its own subtree is `fs-cycle`; `write` to an asset is `read-only` |
| `data` | `store`, `op`, `item` (table below) | `no-such-item`, `store-full` (400) |
| `notify-dismiss` | `id?` | Removes that banner, or all banners |
| `notify-clear` | `id?` | Removes that notification from banners and history, or everything |
| `dock` | `op: 'pin'` `app` `index?`; `op: 'unpin'` `app`; `op: 'move'` `app` `index` | Pins stay inside `installed` (`not-installed`); `move` needs a pinned app (`not-pinned`) |
| `install` | `app` | Adds a canonical app to `installed` (kept in canonical order) |
| `uninstall` | `app` | Removes the app from `installed`, `dock.pins` and `dock.badges`, closes its windows and drops its notifications. `files` and `settings` are core apps (`core-app`) |
| `scene-choice` | `choiceId` | Never edits the world; returned as `forward: {kind: 'choose', choiceId}` |

`data` items (exact keys):

| Store | Op | `item` |
|---|---|---|
| `mail` | `mark-read` | `{id, read}` |
| `mail` | `flag` | `{id, flagged}` |
| `mail` | `move` | `{id, folder}` (an existing folder) |
| `mail` | `save-draft` | `{id, to, subject, body}`: creates or updates a message in `drafts` from the world user. There is no send |
| `messages` | `append` | `{threadId, id, text}`: appends from the world user, stamped with `now` |
| `messages` | `pin` | `{threadId, pinned}` |
| `notes` | `upsert` / `delete` | `{id, folder, title, body, pinned}` (`modified` = now) / `{id}` |
| `calendar` | `upsert` / `delete` | `{id, title, start, end, location, allDay?, notes?}` / `{id}` |
| `reminders` | `toggle` / `upsert` / `delete` | `{id, done}` / `{id, list, title, due, flagged?, priority?, notes?}` / `{id}` |
| `contacts` | `upsert` / `delete` | `{id, name, email, phone, org, favorite?}` / `{id}` |

On `calendar`, `reminders` and `contacts` upserts an omitted optional field keeps its stored value; `notes` are ≤ 2000 characters.
| `alarms` | `upsert` / `delete` | `{id, time: 'HH:MM', label, enabled}` (label ≤ 60) / `{id}` |
| `updates` | `upsert` / `delete` | `{id, title, kb, size, status, choiceId?}` with status `available` or `installed` / `{id}`. `choiceId` is read-only: it may be repeated or omitted (the stored value is kept), never set or changed (`read-only`) |
| `mfa` | `delete` | `{id}`: removes an answered prompt (else an account). Approve and Deny are `scene-choice` `approve` / `deny` intents sent first |

Optional world stores, absent in the seed (shapes agreed with the Windows apps in `requests/win-apps-to-mac.md`):

| Key | Shape | Writable |
|---|---|---|
| `data.alarms` | `[{id, time: 'HH:MM', label, enabled}]` | `alarms` upsert/delete |
| `data.updates` | `[{id, title (≤160), kb (≤20), size (≤20), status: 'available' or 'installed', choiceId?}]` | `updates` upsert/delete |
| `data.mfa` | `{accounts: [{id, issuer, label}], prompts: [{id, app, account, location, device, time, number: 0–999 or null}]}` | `mfa` delete |
| `data.processes` | `[{id, name, cpu?: 0–100, mem?: MB, publisher?, suspicious?: bool, endChoice?: choiceId}]` | read-only, scene-provided |
| `data.web` | `{pages: {[pageId]: {title, url, brand?, heading?, body (≤4000, paragraphs split by blank lines), choices: [{label, choiceId, style?: 'primary' or 'secondary'}] (≤6), insecure?: bool}}, favorites?: [{title, url: 'scene:<pageId>'}]}`. `url` is display only: a `.example` or `.invalid` host, with or without `http(s)://` | read-only, scene-provided |

Choice ids (`choiceId`, `endChoice`) are format-checked here; the CONTRACT-V2 model decides whether a forwarded choice applies to the current step.

### 2.1 Synced app stores

App content that must look the same after an OS switch, with macOS as the standard. The audit of every macOS store field (synced or local, and why) is [`SYNC-AUDIT.md`](SYNC-AUDIT.md). All eight stores are optional (**absent means empty**) and present in the seed. Shells never send `time`, `at` or `modified`: the parent stamps them (`at` with millisecond precision). A running value is true at `at`: while `playing` or `running`, add `now − at` (media position, stopwatch) or subtract it (timer remainder). Asset ids are logical; each shell maps them to its own media.

| Key | Shape (caps) |
|---|---|
| `data.browser` | `{tabs: [{id, url, title}] (16), activeTabId (a tab; null only with no tabs), bookmarks: [{id, title, url: 'scene:<id>'}] (50), history: [{id, url: 'scene:<id>', title, time}] (100, newest first, one per url)}`. Tab `url` is `start:`, `history:`, `unavailable:` (any address that is not a scene page; the text is not kept) or `scene:<id>` |
| `data.media` | `{tracks: [{id, title, artist, album, genre, asset, cover?, duration (s, 0 = unknown), loved}] (200), playlists: [{id, name, trackIds}] (50), shuffle, repeat: 'off'\|'all'\|'one', nowPlaying: null \| {trackId, queue (200, includes trackId), positionSec, playing, at}}`; every id must name a track |
| `data.photos` | `{items: [{id, name (file name), asset, taken, favorite, trashed}] (400), albums: [{id, name, photoIds (unique, known)}] (50)}`; `trashed` is Recently Deleted |
| `data.whiteboard` | `{boards: [{id, name, modified, items}] (20), activeId: boardId \| null}`; item `{id, type: 'text'\|'sticky'\|'shape'\|'pen', x, y, w, h, text? (not pen, ≤ 2000), color? ('#rrggbb[aa]' or a lower-case name), shape? ('rect'\|'ellipse'\|'arrow', shape only), points? (pen only, 4–2000 numbers), width? (pen only, 1–40)}` (300 per board) |
| `data.calculator` | `{mode: 'basic'\|'scientific'\|'programmer', angle: 'deg'\|'rad', base: 2\|8\|10\|16, memory, history: [{id, expr, result, time}] (100, newest first)}` |
| `data.clock` | `{worldClocks: [{id, name, tz: 'local' or an IANA zone}] (24), timer: null \| {label, durationMs (1 s–24 h), remainingMs, running, at}, stopwatch: {running, elapsedMs, at (null only if it never ran), laps: [total ms, ascending] (100)}}` |
| `data.terminal` | `{cwd: a live fs folder id, history: [line ≤ 500] (100, oldest first)}` |
| `data.stickies` | `[{id, text (≤ 4000), color: 'yellow'\|'pink'\|'blue'\|'green'\|'purple'\|'gray', x, y (0–2000), w, h (60–2000), collapsed}]` (50); list order is stacking order |

Intents are `data` intents with exact item keys:

| Store | Op | `item` |
|---|---|---|
| `browser` | `set-tabs` / `visit` / `history-delete` / `clear-history` / `bookmark-upsert` / `bookmark-delete` | `{tabs, activeTabId}` (whole strip) / `{id, url, title}` (first in history, drops the older entry of that url) / `{id}` / `{}` / `{id, title, url}` / `{id}` |
| `media` | `set-playback` / `set-mode` / `track-upsert` / `playlist-upsert` / `playlist-delete` | `{trackId, queue, positionSec, playing}` (`trackId: null` with `queue: []`, `positionSec: 0`, `playing: false` clears it; send on play, pause, seek, skip, not while playing) / `{shuffle, repeat}` / full track / `{id, name, trackIds}` / `{id}` |
| `photos` | `photo-upsert` / `photo-delete` / `album-upsert` / `album-delete` | full item / `{id}` (also leaves every album) / `{id, name, photoIds}` / `{id}` |
| `whiteboard` | `board-upsert` / `board-delete` / `set-active` | `{id, name, items}` (a new board becomes active) / `{id}` (the first remaining board becomes active) / `{id or null}` |
| `calculator` | `set` / `record` / `clear-history` | `{mode, angle, base, memory}` / `{id, expr, result}` / `{}` |
| `clock` | `city-upsert` / `city-delete` / `set-timer` / `set-stopwatch` | `{id, name, tz}` / `{id}` / `{timer: null or {label, durationMs, remainingMs, running}}` / `{running, elapsedMs, laps}` |
| `terminal` | `cd` / `record` / `clear-history` | `{cwd}` (`no-such-folder` unless live) / `{line}` (skips a repeat of the last line) / `{}` |
| `stickies` | `upsert` / `delete` | full sticky / `{id}` |

Refusals: `no-such-item` (an unknown id, or a playlist, album, queue or active board naming one), `store-full` at a cap. Side effects: `open-app browser {url: 'scene:<id>'}` activates the tab showing that url or appends one (when 16 tabs are open it reuses the active one). The tabs belong to the open browser window and the working directory to the open terminal, as on macOS: when no browser window is left (closed, `set-phase off`, uninstalled) `tabs` empties, and when no terminal window is left or its folder is gone `cwd` returns to `home`. Only the visible shell plays audio: a shell receiving `world-active: false` pauses locally without an intent and resumes from `nowPlaying` when shown again.

**Scene gating (both shells).** An ordinary gesture also sends a `scene-choice` only while `world.scene.highlight` points at it; the gesture itself always happens.

| Gesture | Condition | Choice |
|---|---|---|
| Mail link (`message.link` = `scene:<id>`) | highlight `{app: 'mail', ref: message.id}` | `follow-link`, and the page opens |
| Mail attachment open | same | `download`, and the file opens |
| Mail Report (macOS: Junk) / Delete | same | `report` / `delete` |
| File manager open file / delete | highlight `{app: 'files', ref: node.id}` | `run-file` / `delete` |
| Browser: close a tab or window showing a `scene:` page | highlight `{app: 'browser'}` | `close-tab` |
| Updates "Check for updates" | highlight `{app: 'updates'}` | `check-updates` |
| Updates Install | always | `updates` upsert status `installed`, then `scene-choice choiceId` if the item has one |
| Authenticator Approve / Deny | always | `scene-choice approve` / `deny`, then `mfa delete {id}` |
| Task manager end task on a `data.processes` row | always | `scene-choice endChoice`; without one, "Access is denied" and no intent |
| Browser `scene:<pageId>` page buttons | always | `scene-choice choiceId` (pages have no inputs and no frames) |

Rules. Sending email, following links and opening attachments never leave the iframe. They resolve to scene choices or no-ops. Shells keep ephemeral UI such as hover, menus open and drag in progress, and commit only the final result.

## 3. Shell adapter (inside each iframe)

Each shell build contains one adapter script that defines:

```js
window.OceanWorldAdapter = {
  shell: 'macos' | 'windows',
  apps: [...canonicalIds],              // must equal the canonical list
  apply(world, prevWorld),               // world → native stores/DOM; idempotent; must not echo intents
  onIntent(callback),                    // native gesture → callback(intent)
  ready: Promise<void>,                  // resolves when native stores are reachable
  snapshot()                             // what the shell shows now, read from its native stores, as normalise() output
};
```

- **macOS:** maps to the Zustand stores exposed by the hooks build (`window.__macos27`: `wins, sys, phase, apps, notify, ui, fs` plus per-app stores). Use `subscribe` to detect native changes and turn them into intents. Use a guard flag while `apply` runs.
- **Windows:** maps to the Redux store of the Win11React build. The build exposes `window.__win11 = { store, dispatch }`. New parity apps read `data.*` and `fs` from the world (through Redux) and never keep private copies.
- Canonical ↔ native id maps live in each adapter (for example `files ↔ finder` and `files ↔ explorer`).

### 3.1 Canonical projection and the round-trip check

`OceanWorldModel.normalise(world)` is the OS-neutral form of what a trainee sees: phase, user, every `sys` setting (an absent optional key takes `SYS_DEFAULTS`), installed apps, dock pins and badges, overlays, open windows bottom to top as `{app, payload, mode}` plus the focused index, fs nodes `{id, parentId, name, kind, trashed, text?}`, banners and history, every data store (absent = empty), and `scene.highlight`. It leaves out what each OS draws its own way or what changes by itself: window rects and ids, desktop icon positions, tab titles, track durations, `at` stamps, and the remainder or position of a running timer, stopwatch or track. Times compare as instants; a normal window covering the whole work area counts as maximized. `normaliseStore(store, value)` gives the same form for one synced store, and `emptyStore(store)` its empty value.

`snapshot()` must be computed from the shell's native state (what it actually renders), not copied from the world, except for content the shell renders straight from the world (`data.updates`, `data.mfa`, `scene.highlight`). The parent's invariant, per shell: after a world is applied (and any intents the shell sent meanwhile are applied), `snapshot()` deep-equals `normalise(world)`. macOS proves it with `previews/macos-final/check/roundtrip.mjs`, which pushes seeded generated worlds (`check/world-gen.mjs`: random intents the model accepts, plus notifications and highlights) and compares; any shell can reuse both files.

## 4. Transport

The existing bridge handshake applies: the parent creates a `MessageChannel`, then posts `{type:'ocean-shell-attach', version: 3}` with the port. The parent sends `{ type: 'world', version: 3, revision, world }` (full snapshot; the cap is 256 KB, so keep bodies short) and `{ type: 'world-active', active: bool }` when the OS is swapped. The shell replies `{type:'ready', shell, apps}` and then `world-intent` messages.

## 5. Safety (unchanged rules)

No network, camera, microphone, geolocation, clipboard-read, popups, forms, downloads or top navigation. CSP is `connect-src 'self'; frame-src 'none'`. All people, domains (`.example`) and content are fictional. Culled apps stay out of both builds.

## 6. Seed

`data/desktop-world-seed.json` holds the initial world: user, sys defaults, fs tree, mailbox, threads, notes, calendar, reminders and contacts, plus the synced app stores (four tracks and two playlists, eight photos and two albums, one whiteboard, four world clocks, two stickies, empty browser, calculator and terminal history). Both shells must render it identically at the data level.

## 7. Dynamic configuration (backend-served)

Everything a scene or operator may change is data. Nothing about it is hard-coded in a shell.

| What | Where in the world | Who changes it |
|---|---|---|
| Theme, accent, wallpaper (including depth wallpapers or any image URL or data URL from the backend) | `sys.theme`, `sys.accent`, `sys.wallpaper`, `sys.wallpaperUrl?` | profile config or scene |
| Enabled apps (visible in dock/taskbar, launcher, search, desktop) | `installed` (enabled set) and `dock.pins` (order) | profile config; the store `install` intent adds to it |
| User identity | `user` | profile config |
| Hosted data (mail, messages, notes, calendar, reminders, contacts, files, file bodies) | `data.*`, `fs.nodes`, `data.contents` | backend; scene injects lure items |
| Notifications | `notifications` | scene or backend push |

Loading path:

1. The parent fetches `GET /api/desktop/world?profile=<family-depth>` from the local `server.mjs`. Later the Vultr controller serves the same route.
2. The server builds the world as the seed, plus the profile overlay `data/desktop-profiles/<profile>.json` (a deep-merge patch, which may be absent), plus scene injections.
3. The parent validates and holds the world, then pushes it to the shells. The parent can also take a live replacement through `world-replace` from the backend, for example from a Vultr sandbox event stream.

Shells must handle any subset of canonical apps in `installed`. An app not in `installed` must not appear anywhere: dock or taskbar, launcher, search, file-open handlers or desktop. Shells must re-render when `sys.wallpaper`, `sys.theme`, `installed` or `data.*` change at runtime, without a reload.
