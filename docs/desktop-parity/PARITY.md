# Desktop parity: final macOS and Windows shells

Both shells render one parent-owned world state (see [`WORLD-CONTRACT.md`](WORLD-CONTRACT.md)). Switching OS is a visual swap: same apps, windows, files, settings, notifications and scene step.

## Decisions

| Item | Decision | Why |
|---|---|---|
| One desktop per OS | Exactly one Windows 11 shell (`previews/win11-final`) and one macOS shell (`previews/macos-final`). The comparison page, v2 bridge/skins and alternative shells are moved to `desktop-comparison/archive/` and not served | One world, one look per OS; nothing to choose between |
| Final macOS | `macos27.kimi.page` mirror (`desktop-comparison/sources/kimi-macos27/`, private build input, not served), store-hooked build, with the culls below | Reference quality 8.2; every service is a Zustand store, so two-way sync is direct |
| Final Windows | Win11React rebuilt from CC0 source (`desktop-comparison/win11-final/` → `previews/win11-final/`) plus ported features and new apps | Strongest Windows shell with editable source and a Redux store; licence is clean; already embedded today |
| Feature donors | `win11.kimi.page` (visuals, quick settings, search flyout, Photos, ja/en), `windows11.kimi.page` (task view, show desktop, notification list, brightness/night overlays), daedalOS (window manager and file-system ideas, MIT) | Kimi sites have no licence: port behaviour and look, do not copy code |
| Rejected bases | `win11.kimi.page` (minified, state lost on Sleep), `windows11.kimi.page` (shallow, no resize/snap), daedalOS (Next.js, BrowserFS, emulators: too large) | See per-site docs |
| Licence | The macOS shell is owned by the project owner; the Win11React artwork is not cleared and is withheld from the public repository | See THIRD-PARTY.md |

## Shell feature matrix

Status: **Y** works, **P** partial, **N** missing. Action: **keep**, **fix**, **add**, **port** (from donor), **cull**.

| Feature | macOS now | Win11React now | Final (both) | Mac action | Win action |
|---|---|---|---|---|---|
| Boot screen | Y | Y | Y, parent-driven | keep | keep |
| Lock screen | Y | Y | Y, depth wallpaper | keep, rename user | port photo lock look (win11-kimi) |
| Sign-in | P (click) | P (click) | Fixed training user, no password field | rename `kimi` → training user | rename |
| Sleep / restart / shut down | Y | P | Y, windows kept across sleep | keep | add sleep + off screens |
| Desktop icons | P (overlay bug) | Y | Y, from shared `Desktop` folder | **fix overlay bug** | bind to shared fs |
| Icon drag / arrange | P | P | Y, positions in shared state | fix | add |
| Desktop context menu | P (bug) | Y | Y: New folder, Sort, View, Wallpaper/Personalize, Terminal here | fix | keep |
| Wallpaper switching | Y | Y | Y, parent sets live depth wallpaper | keep | keep |
| Light / dark | Y | Y | Y | keep | keep |
| Accent colour | Y | P | Y, 8 accents | keep | add |
| Dock / taskbar | Y | Y | pins, running dots, badges, right-click | keep | add badges, jump-list menu |
| Launchpad / Start | Y | Y | search, pinned, all apps, recommended | keep | keep |
| Global search | Y (Spotlight: apps/files/actions/clipboard, math) | P (apps) | apps, files, settings, actions, math | keep | **add** files/actions/math |
| Menu bar | Y | n/a | mac only | keep | n/a |
| Quick settings / Control Center | Y | Y | Wi-Fi, Bluetooth, focus, brightness, volume, dark, night light, battery saver | keep | keep, bind to `sys` |
| Notification centre | Y | N | banners, history, focus suppression, calendar | keep | **add** (windows11-kimi pattern) |
| Widgets | Y | Y | calendar, weather (offline static), tasks, stocks | keep, freeze weather offline | keep, remove live news/weather fetch |
| Calendar flyout | Y | Y | Y | keep | keep |
| Window open/close/min/max | Y | Y | Y | keep | keep |
| Drag / resize | Y (8 handles) | Y | Y | keep | keep |
| Snap layouts | Y (edge + tile menu) | Y (snap menu) | edge snap + preset menu | keep | keep |
| Fullscreen | Y | N | Y | keep | add |
| Task view / Mission Control | P (shortcut dead) | N | all-windows grid via button + shortcut | **fix** shortcut | **port** task view |
| App switcher | Y (⌘Tab) | N | ⌘Tab / Alt+Tab equivalent (Ctrl+Tab inside iframe) | keep | **add** |
| Show desktop | Y (F11) | P | Y | keep | port corner sliver |
| Keyboard shortcuts | P (lock, emoji shadowed) | P | launcher, search, switcher, close, minimise, lock, show desktop | **fix** shadowing | add |
| Right-click in apps | Y | P | Files, mail, notes at minimum | keep | add in Explorer/Mail |
| File drag-drop | P | N | move between folders and to desktop | keep | add in Explorer |
| Sounds | Y (synth) | N | chime, unlock, error, trash; muted by volume | keep | add (Web Audio synth) |
| Multi-language | N | Y (i18n) | English only for training | n/a | **cull** language switch |
| Responsive / mobile | N | P | desktop-only (min 1024 wide) | n/a | n/a |
| Screenshot / Snipping | Y | P | cull | **cull** (html-to-image capture not needed) | cull |
| Siri / Cortana / Copilot pill | Y | Y | cull | **cull** | **cull** |
| Stage Manager | Y | n/a | mac only, off by default | keep (off) | n/a |
| Clipboard history | Y | N | internal only | keep | nice-to-have |
| External network (weather, maps, fonts, analytics) | blocked | blocked | none: CSP `connect-src 'self'`, `frame-src 'none'` | keep blocked | strip firebase, sentry, i18n HTTP backend, analytics |

## App matrix

Canonical id is the shared world id. Scene-critical apps come first.

| Canonical id | macOS app | Windows app | Scene role | Mac action | Win action |
|---|---|---|---|---|---|
| `files` | Finder (rich) | File Explorer (functional) | lure files, run-file | keep | **upgrade**: views, Get Info/Properties, rename, trash, drag-drop; bind to shared fs |
| `browser` | Safari (rich, mock sites) | Edge (basic iframe) | phishing pages, OAuth consent | keep mock sites; **cull external iframe** | **rebuild** with tabs + scene pages, no real URLs |
| `mail` | Mail (rich) | Outlook/Mail (stub) | primary lure | keep; seed shared mailbox | **add** Outlook-style mail |
| `messages` | Messages (rich) | Teams chat (stub) | smishing/chat lure | keep | **add** chat app |
| `mfa` | — | — | MFA push / code | **add** Authenticator window | **add** Authenticator window |
| `updates` | Settings ▸ Software Update | Settings ▸ Windows Update | fake update lure | add pane | add page |
| `settings` | System Settings (24 panes) | Settings (functional) | wallpaper, accounts | keep; hide Apple Intelligence, Time Machine | upgrade: Accounts, Privacy, Update, Personalization bound to `sys` |
| `terminal` | Terminal (rich, fs-backed) | Terminal (functional) | attack visual | keep | **upgrade**: commands over shared fs |
| `notes` | Notes | OneNote-style Notes | password-in-notes scenes | keep | **add** |
| `texteditor` | TextEdit (rich view for documents) | Notepad; WordPad view for .doc/.docx/.docm/.rtf/.odt | open .txt lures and macro-document lures | keep | upgrade: open/save shared fs; WordPad view for documents |
| `calendar` | Calendar | Calendar | invite lures | keep | **add** app (flyout exists) |
| `reminders` | Reminders | To Do | — | keep | **add** |
| `contacts` | Contacts | People | worm contact list | keep | **add** |
| `photos` | Photos + Preview | Photos | image attachments | keep | **add** (win11-kimi gallery pattern) |
| `media` | Music + QuickTime | Media Player | — | keep Music, keep QuickTime (local files only) | **add** (replace Spotify embed) |
| `calculator` | Calculator | Calculator | — | keep | keep |
| `clock` | Clock | Clock | — | keep | **add** |
| `store` | App Store | Microsoft Store | fake app installs | keep | keep, bind installs to shared state |
| `taskmanager` | Activity Monitor | Task Manager | show malicious process | keep | upgrade: process list from shared state |
| `stickies` | Stickies | Sticky Notes | — | keep | **add** |
| `whiteboard` | Freeform | Whiteboard | — | keep | keep |
| `stocks` | Stocks | widget only | — | keep (simulated) | widget only |
| — | Photo Booth, FaceTime, Voice Memos | Camera, Voice Recorder | — | **cull** (camera/mic) | **cull** |
| — | Phone | Your Phone | — | **cull** | **cull** |
| — | Weather, Maps, Dictionary | Weather, Maps | — | **cull** apps (network-only); keep offline weather widget | **cull** |
| — | Podcasts, TV, News, Home, Chess, Games | Movies, News, Xbox | — | **cull** | **cull** |
| — | Disk Utility | — | — | **cull** | n/a |
| — | — | Spotify, Discord, GitHub, VS Code, Get Started, Buy me a coffee, Twitter, Pinterest, Skype, Yammer, Office links | — | n/a | **cull** (external embeds or placeholders) |

Result: 21 canonical apps on both sides (mac 36 → 21, Windows ~15 real → 21).

## Phases

1. **Done:** inventories and mirrors (`docs/desktop-parity/*.md`).
2. **Done:** shells. macOS is built by `desktop-comparison/make-macos-final.mjs` into `previews/macos-final` (see its README). Windows is built from `desktop-comparison/win11-final` into `previews/win11-final` (`npm run build`, `npm run verify`). Both expose the `OceanWorldAdapter`.
3. **Done:** integration. The parent world store, bridge v3, OS swap and scene projection (`ui/desktop/scene-world.js`) are in place. Start building demos from [`SCENE-AUTHORING.md`](SCENE-AUTHORING.md).

Verification on the final builds: `node --test tests/*.test.mjs` passes 276/276. `node tools/e2e/desktops-e2e.mjs` passes 67/67: three detailed scenes on both OSes, with a mid-scene swap and zero external requests. `node tools/e2e/all-scenes-e2e.mjs` passes 60/60: all 30 scenes, attack path with a swap plus safe path, with patched replay for trench. `node tests/desktop-world-stream-e2e.mjs` passes 12/12: backend live push into both shells. Windows `npm run verify` passes all suites. macOS `check/world-ab.mjs`, `check/standalone.mjs` and `check/polish.mjs` all pass. One limit is known: `check/standalone.mjs` failed one check in 1 of 14 worker runs, while 3 later runs all passed.


## macOS-standard gap table

Owner: `win-parity`. macOS (`previews/macos-final`) defines the apps, features and behaviour; Windows matches them in Windows idiom. Audit: both shells standalone in headless Chromium at 1440×900, every canonical app opened and maximised, plus the shell surfaces below; macOS store shapes read from `window.__macos27` and `macos27-kimi.md` §3–4. Synced stores and shapes: [`SYNC-AUDIT.md`](SYNC-AUDIT.md) §4–5. Status: **closed** (Windows now matches; evidence is the `desktop-comparison/win11-final/verify/sync.mjs` check named in the row unless stated), **justified** (difference kept on purpose, reason given).

Every Windows app reads the synced stores from `world.data` (an absent store is empty) and changes them only with `data` intents (`src/ocean/synced.js`); no app keeps a private copy. View state (open tab, selection, view mode, scroll, Explorer tabs, Immersive Reader) stays local, as SYNC-AUDIT classifies it.

### Apps

| App | macOS has | Windows had | Windows now (Windows idiom) | Status |
|---|---|---|---|---|
| `files` | 4 views, tabs, preview pane, Get Info, Quick Look | Large icons / List / Details, Properties, rename, cut/paste, drag-drop, Recycle Bin | Explorer tabs (Ctrl+T, Ctrl+W, "Open in new tab"), Preview pane (Alt+P; text and images), Space-bar preview dialog with Open (Quick Look equivalent), Medium icons view; Properties = Get Info. Column and gallery views are not built: Windows has no column view, and Photos is the gallery | closed ("explorer new tab", "Preview pane", "Space opens the preview dialog") |
| `browser` | Safari tabs, bookmarks, history, reader view, scene pages only | Edge with local tabs, a Windows-only Intranet page and search page | tabs, favourites (star) and history bound to `data.browser`; `edge://history` page with delete and Clear browsing data; Immersive Reader on scene pages; typed addresses open a matching scene page or the unavailable page. Intranet and search pages removed (macOS has no built-in sites). A window's `{url}` payload is shown until the world has its tab | closed ("browser visit recorded", "star", "new tab", "favourites bar", "History page", "close tab"; `winpol.mjs` scene page) |
| `mail` | mailboxes, flag, junk, drafts | Outlook-style, flag, report, drafts | no gap | closed |
| `messages` | conversations, pin | Teams chat | Pinned / Recent groups; pin from the chat header or right-click ↔ `threads[].pinned` | closed ("chat pin") |
| `mfa` | Authenticator | Authenticator | no gap | closed |
| `updates` | Software Update | Windows Update | no gap | closed |
| `settings` | 16 panes bound to `sys` | Personalisation, Accounts, System, Bluetooth, Network, Accessibility, Update | Taskbar behaviours (auto-hide), Battery percentage, Contrast themes, Wi-Fi network name, Privacy: advertising ID, diagnostics, location ↔ `sys.dockAutohide`, `showBatteryPercent`, `increaseContrast`, `wifiNetwork`, `personalizedAds`, `shareAnalytics`, `locationServices` | closed ("settings … toggles sys.*", "Wi-Fi network") |
| `terminal` | shell over fs, history, cwd | commands over shared fs, local history and cwd | `cd` and ↑/↓ history bound to `data.terminal`; `doskey /history` | closed ("terminal cd", "history recorded", "↑ recalls") |
| `notes` | folders, pin, rich text, search | sections, pin, search, plain text | sections (= folders, from `note.folder`), pin, search; the body stays plain text because the model keeps `notes[].body` plain (sync-model-ready: the markup proposal was not adopted), so a formatting ribbon would show differently on macOS | justified ("notes edit → plain-text body") |
| `texteditor` | TextEdit rich/plain | Notepad, WordPad view for documents | rich text and the WordPad ribbon are view chrome (SYNC-AUDIT §3: local); the document text is shared | justified |
| `calendar` | Day/Week/Month, all-day, notes | Month grid and agenda, create/edit | All-day switch and description on new and existing events ↔ `allDay`, `notes`. Week/Day views are view chrome (local) | closed ("calendar all-day event with notes") |
| `reminders` | smart lists, flagged, priority, notes | To Do lists | Important list and star ↔ `flagged`; priority (! marks, details pane, right-click) ↔ `priority`; details pane note ↔ `notes` | closed ("to do star", "details → priority 3 and notes") |
| `contacts` | favourites | People | Favourites group and star ↔ `contacts[].favorite` | closed ("people favourite") |
| `photos` | library by month, favourites, albums, Recently Deleted | gallery over fs images | library by month, Favourites, albums (create, rename, delete, add, remove) and Recently deleted (restore, delete permanently) bound to `data.photos`; opening an image file still shows that file | closed ("photos favourite", "add to album", "delete → trashed", "restore") |
| `media` | library, playlists, loved, queue, now playing | one list from fs, local player | Music library, Albums, Artists, Liked songs, Play queue, playlists, shuffle/repeat and now playing bound to `data.media` (position from `at`); only the visible shell advances tracks; opening a media file imports it as a track. Playback stays simulated (no audio files on Windows) | closed ("media double-click plays", "pause", "like", "repeat", "new playlist", "add to playlist", "now playing from the world") |
| `calculator` | Basic, Scientific, Programmer, history tape | Standard + local history | Standard, Scientific (DEG/RAD, trig, log, powers, parentheses) and Programmer (HEX/DEC/OCT/BIN, AND/OR/XOR/NOT, shifts); mode, angle, base, memory and history bound to `data.calculator` | closed ("Scientific mode", "2^10", "history recorded", "DEG → RAD", "Programmer FF", "mode + history from the world") |
| `clock` | world clock, alarms, stopwatch, timers | alarms shared; timer, stopwatch and fixed world clock local | world clocks (add, remove), timer and stopwatch with laps bound to `data.clock`; a running timer or stopwatch keeps counting across an OS switch | closed ("add world clock", "stopwatch start + lap", "timer start") |
| `store` | App Store, installs | Store, installs | no gap | closed |
| `taskmanager` | Activity Monitor | Task Manager over `data.processes` | no gap | closed |
| `stickies` | coloured floating notes, size, collapse | list of notes in `data.notes` folder `stickies` | Sticky Notes over `data.stickies`: hub list plus floating notes with plain text, colour, position, size, collapse (double-click title), stacking order | closed ("sticky new", "drag → x/y saved", "colour", "collapsed") |
| `whiteboard` | Freeform boards, stickies, shapes, text, pen | one canvas, pen only, not saved | boards (new, rename, delete, switch) with sticky notes, text, rectangles, ellipses, arrows, pen strokes, eraser, move, sticky colours, bound to `data.whiteboard` | closed ("sticky added with text", "pen stroke", "new board becomes active") |

### Shell features

| Feature | macOS has | Windows had | Windows now | Status |
|---|---|---|---|---|
| Launcher / search | Spotlight: apps, files, actions, math, unit conversion | Start + search: apps, files, settings, actions, math | adds unit conversion (length, mass, volume, data, time, temperature) and the Spotlight quick actions: new note, event, reminder, 5-minute timer, email, message, play/pause music | closed ("search unit conversion", "search action New note") |
| Quick settings | Control Center incl. network name | Quick settings bound to `sys` | Wi-Fi tile shows `sys.wifiNetwork` | closed ("quick settings shows the Wi-Fi network name") |
| Notification centre + widgets | NC with widgets | notification centre + calendar; widgets board | no gap (the widgets board is the Windows idiom) | closed |
| Task view / Mission Control | icon grid | icon cards | both shells show app icons, not live thumbnails; live thumbnails need a DOM capture the iframe sandbox does not offer cheaply | justified |
| App switcher | ⌘Tab | Alt/Ctrl+` | no gap | closed |
| Snap / tile presets | halves, quarters, fill | snap layouts, edge snap | no gap | closed |
| Desktop icons + context menu | New Folder, Get Info, wallpaper, sort, Terminal here | same set | no gap | closed |
| Dock / taskbar pins + badges | pins, badges, auto-hide, battery % | pins, badges | taskbar auto-hide ↔ `sys.dockAutohide` (maximised windows take the full height); battery percentage ↔ `sys.showBatteryPercent` | closed ("taskbar auto-hides", "full height") |
| Settings panes bound to `sys` | see `settings` | see `settings` | see `settings` | closed |
