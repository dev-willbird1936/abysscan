# Final macOS shell (`macos-final`)

The training macOS desktop for the world contract v3 ([`docs/desktop-parity/WORLD-CONTRACT.md`](../../../docs/desktop-parity/WORLD-CONTRACT.md)). It is the Kimi macOS 27 mirror plus fail-closed patches, a bundle hook and the `OceanWorldAdapter`. It renders one parent-owned world and reports gestures as world intents.

**Licence:** the macOS shell is owned by the project owner and is published with this repository (MIT, see the top-level `LICENSE`). The build input `sources/kimi-macos27/` is not in this repository.

## Progress

GOAL: a high-quality macOS desktop that renders the shared world (theme, wallpaper, enabled apps, user, hosted data), changes at runtime without a reload, has the same 21 canonical apps as Windows, and runs offline in `sandbox="allow-scripts"`.

DONE WHEN: world-model tests pass; existing tests still pass; `/api/desktop/world` returns seed + overlay; macos-final renders offline sandboxed with the enabled subset of the 21 canonical apps and reacts to world changes without reload; screenshots inspected.

Status: met. `node --test tests/*.test.mjs` passes (256/256); `check/standalone.mjs` 22/22, `check/world-ab.mjs` 27/27 and `check/polish.mjs` 28/28 passed with zero non-loopback requests in `sandbox="allow-scripts"`. Screenshots inspected: `docs/desktop-parity/screens/final-mac-*.png` and `final-macfin-*.png` (light and dark, 1440×900 and 1280×800).

## Files

| Path | Kind | Purpose |
|---|---|---|
| `src/adapter.js` | authored | `window.OceanWorldAdapter`: world → stores, native changes → intents, transport, standalone mode, scene gating |
| `src/bundle-hook.js` | authored | Appended to the bundle: culls registry, Settings panes and App Store items; adds Authenticator and Software Update; exposes the stores as `window.__macos27` |
| `src/wallpapers/depth-*.svg` | authored | Five depth wallpapers, sunlight → trench |
| `check/roundtrip.mjs`, `check/world-gen.mjs` | authored | Generic sync proof: seeded generated worlds must give `OceanWorldAdapter.snapshot()` equal to `OceanWorldModel.normalise(world)`. The generator is shell-neutral |
| `check/standalone.mjs`, `check/world-ab.mjs`, `check/polish.mjs` | authored | Browser checks (playwright-core, headless Chromium). `polish.mjs` tours every shell surface with real input, scans visible text for real brands and measures the low-effects frame rate |
| `index.html`, `assets/macos-final.js`, `world-model.js`, `world-seed.js`, media, fonts, `generated.json` | generated | Written by `desktop-comparison/make-macos-final.mjs`; never edit by hand |

## Build and run

```sh
node desktop-comparison/make-macos-final.mjs        # rebuild (also after ui/desktop/world-model.js or the seed change)
node desktop-comparison/server.mjs --no-browser     # http://127.0.0.1:4189/previews/macos-final/index.html
node desktop-comparison/previews/macos-final/check/standalone.mjs 4343
node desktop-comparison/previews/macos-final/check/world-ab.mjs 4342
node desktop-comparison/previews/macos-final/check/polish.mjs 4344
node desktop-comparison/previews/macos-final/check/roundtrip.mjs 4345 30 1   # worlds, first seed
```

The build verifies the SHA-256 of every Kimi source file against `provenance.json` and applies every string patch listed in the script (75 today), each with an exact expected match count. Any mismatch stops the build. It refuses to finish if any `kimi` text survives. Only files listed in `generated.json` are removed on rebuild; `src/` is never touched.

## What the build changes

- Window wrapper no longer blocks the desktop (icons, desktop menu, drag); window frames opt back in to pointer events.
- Shortcuts: ⌃⌘Q lock, ⌃⌘Space emoji, ⌃↑/⌃↓ Mission Control and F3 now fire.
- Culled: Weather, Maps, Stocks app, Podcasts, TV, Photo Booth, Voice Memos, Disk Utility, FaceTime, Phone, Chess, Dictionary, Home, News, Games (registry, dock, launcher, Spotlight, App Store, Finder Applications, file-open handlers); Siri (pill, menu bar button, Settings pane); screenshots (⇧⌘3/4, Spotlight action, help). Settings keeps 16 panes (Account, Wi-Fi, Bluetooth, Network, Battery, General, Accessibility, Appearance, Desktop & Dock, Displays, Wallpaper, Notifications, Focus, Sound, Privacy & Security, Users & Groups); Time Machine, VPN, Menu Bar, Screen Saver, Keyboard, Trackpad and Mouse are gone.
- Safari never frames an external site and has no built-in sites. `scene:<id>` opens the scene page from `data.web`; a typed address that matches a page's `url` opens that page; every other address or search shows the neutral "This Page Isn’t Available" page. Favourites, bookmarks, address-bar suggestions and the start page list only `data.web` pages (the Favorites section hides when there are none); sample history and reading list are dropped.
- Branding: no real brand, company, account or place reaches the screen. Stocks widget tickers are fictional (NWND Northwind Traders, FBRK Fabrikam, CNTS Contoso …) and the stock news is empty; iCloud → Cloud / Cloud Drive; Apple Account → Account; the weather and world-clock home city is "Harbor City" on the Mac's own time zone; Wi-Fi networks, Bluetooth devices, App Store developer, Music heading and Settings privacy text are generic. The Apple-like chrome (menu bar logo, AirDrop, AirPlay, MacBook labels, Liquid Glass) stays.
- Identity: every `kimi` label, path, prompt and process owner follows `world.user`; the mail accounts are "Work" (the world user's address) and a fictional archive.
- Weather widget shows a fixed forecast and makes no request. Finder no longer opens by itself at login.
- Software Update entry points (Settings ▸ General, About This Mac) open the world-driven Software Update app.
- Spotlight: ⌘Space and the menu bar magnifier open the search (Files) tab; F4 opens Apps; an Apps search without a match says "No Results"; switching to Actions or Clipboard is no longer reset by the adapter.
- Notification Center: medium widgets span both columns and grouped notifications fit the panel.
- Mail selects the payload message of its window (on open, on a payload change, and when the message arrives later); the link chip shows the page's display address.
- Desktop icons and window frames follow the work area when the frame resizes (the first apply can run before a sandboxed frame has a size; icons used to stack at the top left).
- Low-effects mode: `sys.reduceTransparency: true` (world, profile overlay or Settings ▸ Accessibility) gives glass surfaces solid fills and removes every `backdrop-filter`, so the SVG refraction filter is never evaluated.
- `index.html`: CSP (`connect-src 'self'`, `frame-src 'none'`), memory-only storage, no `getUserMedia`, geolocation, `MediaRecorder`, WebSocket, popups or cross-origin `fetch`.

## Mapping

| Canonical | Native | Canonical | Native |
|---|---|---|---|
| files | finder | calendar | calendar |
| browser | safari | reminders | reminders |
| mail | mail | contacts | contacts |
| messages | messages | photos | photos (+ preview) |
| mfa | authenticator (new) | media | music (+ quicktime) |
| updates | softwareupdate (new) | calculator | calculator |
| settings | settings | clock | clock |
| terminal | terminal | store | appstore |
| notes | notes | taskmanager | activitymonitor |
| texteditor | textedit | stickies | stickies |
|  |  | whiteboard | freeform |

Window rects scale between the 1000×600 virtual area and the macOS work area. World → native covers phase, sys, user, installed apps and dock, fs, windows, overlays, notifications, mail, messages, notes, reminders, calendar, contacts, alarms, processes and web pages, and the synced app stores of [`SYNC-AUDIT.md`](../../../docs/desktop-parity/SYNC-AUDIT.md): Safari tabs, bookmarks and history; Music library, playlists and now playing; Photos; Freeform boards; Calculator; Clock world clocks, timer and stopwatch; Terminal history and working directory; Stickies; Settings ▸ Privacy and the optional `sys` settings. Native gestures become intents with an echo guard; in parent mode an unanswered intent rolls its section back to the parent's world after 1.5 s. The synced stores are bound by one table (`BINDINGS`), and `OceanWorldAdapter.snapshot()` returns what the shell shows as `OceanWorldModel.normalise` output. The apps' own Dock badge counters are switched off: badges are world data. Only the visible shell plays audio: `world-active: false` pauses Music locally and `true` resumes it from the world.

The bundle hook also exposes `newSafariTab`, `music`, `player`, `audio`, `playMusicTrack`, `photos`, `photoEdits`, `freeform`, `calculator`, `stickies`, `terminal` and `settingsStore`. Three Terminal patches start a session in `data.terminal.cwd` and report every `cd`.

## Low-effects frame rate

`check/polish.mjs` counts `requestAnimationFrame` callbacks for 4 s while dragging the Notes window with four windows open, at 1440×900, first with full effects and then with `sys.reduceTransparency: true`. Three runs on this machine (headless Chromium 1243, software compositing, Windows 11):

| Mode | `backdrop-filter` elements | rAF rate |
|---|---|---|
| Full effects | 28 | 110, 158, 167 fps |
| `reduceTransparency` | 0 | 214, 218, 227 fps |

Headless Chromium does not cap rAF at the display rate, so these numbers show the relative cost only. They are not the frame rate a trainee sees, and they were not measured on a GPU or in a headed browser.

## Known limits

- The bundle still contains the code and text of culled apps and of Safari's old mock sites (Apple, Wikipedia, Hacker News, GitHub, search results). It is unreachable: no registry entry, and the Safari address resolver returns only scene, start, history or the neutral page.
- The Apps panel lists "Apps" itself, and Mission Control shows app icons instead of live window thumbnails (both as in the Kimi original).
- A root-relative `sys.wallpaperUrl` resolves against the shell's own origin (127.0.0.1:4189), not the parent's.
- Measured only in headless Chromium (software rendering); not on a GPU, Firefox or Safari.
- `check/standalone.mjs` failed one check once in 14 runs during this pass (21/22; the failing check was not captured) and passed the other 13 runs; treat a single timing failure as a flake only after a rerun passes.
