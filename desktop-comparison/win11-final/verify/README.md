# Verification of the production build

All suites load `../previews/win11-final/` inside `<iframe sandbox="allow-scripts">` from a loopback server they start themselves, abort every non-loopback request and fail on console or page errors.

```sh
cd desktop-comparison/win11-final
npm run build      # prebuild refreshes src/ocean/world-model.js and the seed copy
npm run verify     # world-model/seed --check, shell.mjs, taskbar.mjs, apps.mjs, sync.mjs, winpol.mjs (see all.mjs)
npm run verify:polish   # fidelity screenshots → docs/desktop-parity/screens/final-winfin-*.png
```

| Script | Checks | Screenshots |
|---|---|---|
| `shell.mjs [all\|standalone\|embedded]` | lock, sign-in, desktop icons, menus, Start, search, quick settings, notifications, Settings, task view, switcher, snap, fullscreen, power phases, bridge v3, runtime theme/accent/wallpaper/installed changes, installed-only Start/desktop/search | `final-win-shell-*` |
| `taskbar.mjs` | taskbar overflow with 21 pinned apps at 1024–1920, centred and left | `final-win-shell-40/41-*` |
| `apps.mjs [app,app]` | every canonical app renders world data, UI mutations change the world, world swap without reload, Store library | `final-win-apps-*`, report in `last-apps-report.json` |
| `sync.mjs` | macOS-standard features and their synced world stores (`PARITY.md` "macOS-standard gap table"): Calculator modes/history, Clock world clocks/timer/stopwatch, Terminal cwd/history, Edge tabs/favourites/history, Media Player library/playback, Photos favourites/albums/Recently deleted, Whiteboard boards, Sticky Notes, Notes markup, To Do/Chat/People/Calendar optional fields, Explorer tabs/preview, Settings and taskbar `sys` keys, search conversion and actions, a world from the other OS rendering | `final-winsync-*` |
| `roundtrip.mjs [worlds] [seed]` | generic sync proof (WORLD-CONTRACT §3.1): worlds from `previews/macos-final/check/world-gen.mjs` are pushed through a v3 parent; `OceanWorldAdapter.snapshot()` must deep-equal `OceanWorldModel.normalise(parent world)`; a detached window frame must change the snapshot | none |
| `winpol.mjs` | toast and notification-centre clicks emit valid `open-app` (`{messageId}` for mail refs) + `notify-dismiss`, scene pages keep single line breaks, Start pinned paging reaches every installed app, desktop label shadow on light/dark/depth wallpapers, Settings scroll area at 1280x800 | `final-winpol-*` |
| `polish.mjs [view,view]` | 11 views × light/dark × 1440/1280, no errors | `final-winfin-<view>-<theme>-<width>.png` |

Environment:

| Variable | Default |
|---|---|
| `PLAYWRIGHT_CORE` | `C:/Temp/pw-kimi/node_modules/playwright-core` (any playwright-core ≥ 1.40 path or package name) |
| `CHROME_PATH` | `C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`; if missing, playwright's own Chromium |
| `VERIFY_PORT` | `4380` |
| `WIN_BUILD` | `../previews/win11-final` |
| `SHOTS_DIR` | `docs/desktop-parity/screens` |
