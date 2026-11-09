# Training desktops: start here

Read this file before building an attack or exploit simulation. It describes what exists, what to build on, and what must not change.

## What exists

There is exactly **one Windows 11 desktop and one macOS desktop**; there are no alternative shells or skins. Superseded shells, the old comparison page and the v2 bridge are in `desktop-comparison/archive/` and are not served. The two desktops render **one shared world**. Switching OS mid-scene is a visual swap only: the windows, files, mail and scene step stay the same.

| Desktop | Built output (what runs) | Source (what you edit) | Build command | Checks |
|---|---|---|---|---|
| Windows 11 | `desktop-comparison/previews/win11-final/` | `desktop-comparison/win11-final/` (Win11React, CC0, React 18 + Redux, Vite) | `cd desktop-comparison/win11-final && npm run build` | `npm run verify` |
| macOS | `desktop-comparison/previews/macos-final/` | `desktop-comparison/make-macos-final.mjs` (fail-closed patches over the private mirror `desktop-comparison/sources/kimi-macos27`, not served) plus `previews/macos-final/src/` | `node desktop-comparison/make-macos-final.mjs` | `previews/macos-final/check/*.mjs <port>` |

## The standard: macOS leads, Windows matches

**`macos-final` is the reference desktop.** Its apps, features and behaviour define what both desktops must do. Windows implements the same capability in Windows 11 idiom: a Finder feature becomes the matching File Explorer feature, and Spotlight becomes Search. Rules for every session:

- **Spec from macOS.** To decide what an app or shell feature must do, check `macos-final` first. If Windows lacks it, Windows gets it. If macOS lacks it, add it to macOS first, or not at all.
- **One capability, both shells, same change.** Never ship a feature, app or world field to one OS only. The macOS-standard gap table in [`PARITY.md`](PARITY.md) tracks the remaining differences.
- **Synced by default.** Anything a trainee or scene can see or change must live in the world and survive an OS switch: windows, files, app content, browser tabs, media, settings, dock or taskbar pins and notifications. Only transient UI stays local: hover, open menus, drag in progress, scroll and selection highlight. The field-by-field list is [`SYNC-AUDIT.md`](SYNC-AUDIT.md).
- **Culled stays culled.** Photo Booth, FaceTime, Voice Memos, Maps, Weather, Podcasts, TV, Chess and the other apps in the PARITY culls are not restored, even though the macOS reference had them.

## Where to work

| You are building | Edit here | Do not edit |
|---|---|---|
| A new attack or exploit simulation | `desktop-comparison/previews/ocean-scenes.js` (family scenes) or `desktop-comparison/previews/ocean-scenarios/<depth>.js` (the 60 scenarios), and `ui/desktop/scene-world.js` only for a new step kind | Shell code |
| The desktop setup for a scene (theme, wallpaper, apps, user, mailbox, files) | `data/desktop-profiles/<family-depth>.json` or `data/desktop-profiles/<scenario-id>.json` | Shell code, the seed |
| Live results from a Vultr sandbox | Controller pushes to `/api/desktop/events` ([`BACKEND.md`](BACKEND.md)) | The shells |
| A new attack animation | `desktop-comparison/previews/ocean-fx.js` | — |
| A new world field or intent | `ui/desktop/world-model.js` + `tests/world-model.test.mjs`, then bind it in **both** shells | One shell only |
| A macOS app or feature | `desktop-comparison/make-macos-final.mjs`, `desktop-comparison/previews/macos-final/src/` | `previews/macos-final/assets/` (built), `sources/kimi-macos27/` (mirror) |
| A Windows app or feature | `desktop-comparison/win11-final/src/` | `previews/win11-final/` (built) |
| Anything in `desktop-comparison/archive/` | Nothing: it is superseded and not served | — |

After any change, rebuild the shell you touched, then run `node --test tests/*.test.mjs` and `node tools/e2e/desktops-e2e.mjs`. If you change shared behaviour, also run `node tools/e2e/sync-e2e.mjs`, the cross-OS sync round trips (in progress).

## Parent state

The parent page owns the state:

| File | Role |
|---|---|
| `ui/desktop/world-model.js` | **The world contract in code.** It validates every world and intent, and both shells vendor it. Change it here only; Windows re-syncs with `npm run build` (prebuild). |
| `ui/desktop/desktop-model.js` | CONTRACT-V2 scene state machine: steps, choices, delays, attack, debrief. |
| `ui/desktop/scene-world.js` | Projects scene steps into the world (lure mail, pages, files, MFA prompts, processes) and maps shell gestures back to scene choices. |
| `ui/desktop/desktop.js` | World store, bridge v3 to both iframes, OS swap, attack overlay, debrief, and `window.OceanDesktop` (`replaceWorld`, `patchWorld`, `getWorld`, `getScene`). |
| `desktop-comparison/previews/ocean-scenes.js` | The 30 authored family scenes and the loader for the 60 scenarios: **this is where simulations are written**. |
| `desktop-comparison/previews/ocean-scenarios/<depth>.js` | The 60 scenario entries (`globalThis.OceanScenarioData`), one file per depth. |
| `ui/desktop/scenario-profile.js` | Maps a scenario id to the creature profile of its family and depth. |
| `desktop-comparison/previews/ocean-fx.js` | Attack animations drawn over the active desktop. |
| `data/desktop-world-seed.json` | Default world: user, settings, files, mail, contacts. |
| `data/desktop-profiles/<family-depth>.json` | Per-scene overlay for theme, wallpaper, enabled apps, user and hosted data. |
| `server.mjs` | `GET /api/desktop/world?profile=…` (seed + overlay). The Vultr controller will serve the same route. |

## How to build a simulation

For an easy guided illustration, start with **[Scene Studio](SCENE-STUDIO.md)**: `start-scene-studio.bat` opens a local script editor with examples, validation, import/export and previews on both full desktop forks. No shell editing or catalogue registration is needed. For branching victim-choice scenarios, use the existing workflow below.

1. **Write the scene** as data in `ocean-scenes.js`. Follow [`SCENE-AUTHORING.md`](SCENE-AUTHORING.md) §3: step fields, choice ids, and what each step writes into the world.
2. **Configure the desktop** for it, if needed, with `data/desktop-profiles/<family-depth>.json`: theme, wallpaper, which of the 21 apps are enabled, user, mailbox, files. No shell code changes.
3. **Use the existing apps and gestures.** Lures work through the gating table (SCENE-AUTHORING §3.4): a highlighted mail, file, page, MFA prompt, update or process turns an ordinary click into a scene choice in **both** shells.
4. **Push live sandbox results** (Vultr): the controller POSTs `{type:'patch', patch}` or `{type:'replace', world}` to `/api/desktop/events?run=<id>`. The parent receives the event over Server-Sent Events, applies it with `patchWorld` / `replaceWorld`, and shows it in both shells. The world itself can come from `DESKTOP_WORLD_DIR` or an upstream `DESKTOP_WORLD_URL`. Routes, validation, curl examples and limits: [`BACKEND.md`](BACKEND.md).
5. **Test:** `node --test tests/*.test.mjs` covers every scene's projection. `node tools/e2e/desktops-e2e.mjs` covers real clicks in both shells with an OS swap. `node tools/e2e/all-scenes-e2e.mjs` plays all 30 scenes with real clicks in both shells: the attack path with an OS swap, and the safe path on the other OS (the patched replay for trench scenes, which have no safe path). Last run: 60/60 passed, zero non-loopback requests, about 25 minutes. The coverage table is in `tools/e2e/README.md`.

## The 60 scenarios

All 60 scenarios in `data/ocean-selection.json` play on both desktops at `/desktop.html?profile=<scenario-id>` (the matrix has a "Play this scenario" link per card). Each one adds, on top of a family scene: the victim's login (`data/desktop-profiles/<id>.json`), an intro card after sign-in (with a Brief button), dimming of apps off the attack path (`world.scene.focusApps`), the creature in the wallpaper (`world.scene.creature`), a breakthrough and attack animation (`OceanFx.playAttack`), a debrief, and a sandbox run whose events and receipt arrive as `world.sandbox`. The field shapes are in `requests/engine-core-ready.md`, the interfaces in [`SCENARIOS-60-CONTRACT.md`](SCENARIOS-60-CONTRACT.md).

### Add scenario 61 (short form; full walkthrough in [`SCENE-AUTHORING.md`](SCENE-AUTHORING.md) §8)

1. Add `S['<id>'] = { depth, family, year, attackTitle, os, card, focusApps, attackKind, …AUTHORED fields }` to `desktop-comparison/previews/ocean-scenarios/<depth>.js`.
2. Add `data/desktop-profiles/<id>.json` (victim `user`, `sys`, `installed`, `dock`, seeded `data`) and the avatar under `data/desktop-profiles/avatars/`.
3. Add the entry to `data/ocean-selection.json`. The catalog is fixed at 12 per depth and 60 in total: a 61st also needs the count constants in `backend/ocean-profiles.mjs`, `ui/desktop/ocean-profiles.js` and the count tests changed (list in SCENE-AUTHORING §8).
4. Pick the `attackKind` from the 17 in the contract; a new kind also needs a sandbox runner and an `ocean-fx.js` animation.
5. `OceanScenes.scenarioProblem('<id>')` must be `null`; run `node --test tests/*.test.mjs`, then play it on both OSes.

## The 21 apps (same on both OSes)

`files browser mail messages mfa updates settings terminal notes texteditor calendar reminders contacts photos media calculator clock store taskmanager stickies whiteboard`

Apps that need the camera, mic or a live network, and filler apps, are **culled** and refused by the model ([`PARITY.md`](PARITY.md)). A simulation that needs a new app must add it to `CANONICAL_APPS` in `world-model.js` **and** build it in both shells. Do not add it to only one.

## Rules a simulation must keep

- **Fictional only:** people, brands and `.example` / `.invalid` domains. Wallpaper URLs must be same-origin or `data:`.
- **No network from the shells.** CSP is `connect-src 'self'`, `frame-src 'none'`. The browser app renders `data.web` pages only.
- **No camera, mic or real credentials.** Lure sign-in pages have no input fields; choices are buttons.
- **Shells never own state.** Every mutation is a world intent validated by `world-model.js`. Do not keep private copies in an app.
- **`docs/safety.md` applies to everything.**

## Run it

```sh
node tools/start-desktops.mjs   # or start-hackathon-demo.bat; app on 127.0.0.1:4173, shells on 127.0.0.1:4189
```

Open `http://127.0.0.1:4173/ocean-profiles.html`, pick a cell, tick the opt-in, and click the lock screen. The flagship scene is at `/desktop.html?profile=network-abuse-abyss`.

**If nothing shows,** run the launcher again and hard-refresh the page (Ctrl+Shift+R). It restarts a stale server from this project (its `/api/health` buildId differs from the files on disk), refuses and stops nothing if another program holds the ports, then smoke-checks both shells and the world and prints the URLs. Details: [`RUNNING.md`](RUNNING.md).

## Document map

| Doc | Read it for |
|---|---|
| [`RUNNING.md`](RUNNING.md) | Running, ports, stale servers, troubleshooting, shell rebuilds |
| [`SCENE-AUTHORING.md`](SCENE-AUTHORING.md) | Building scenes: architecture, step data, gating, profiles, backend contract |
| [`WORLD-CONTRACT.md`](WORLD-CONTRACT.md) | World shape, intents, adapter API, dynamic configuration |
| [`BACKEND.md`](BACKEND.md) | World source (`DESKTOP_WORLD_DIR` / `DESKTOP_WORLD_URL`), live event stream, `/api/health` buildId, curl examples |
| [`PARITY.md`](PARITY.md) | Feature and app parity, culls, decisions |
| `EVIDENCE.md` | What is verified and how |
| `previews/macos-final/README.md`, `win11-final/verify/README.md`, `tools/e2e/README.md` | Per-shell build and check details |
| [`SCENE-STUDIO.md`](SCENE-STUDIO.md) | Local script editor, starter examples, validation and dual-OS preview |
| [`FISH-SCENES.md`](FISH-SCENES.md) | The short script language for the ocean's famous fish (`data/fish-scenes/*.scene`), played from the creature panel |
| `FORK-REPLACEMENT.md` | Standalone macOS/Windows replacement candidates and the rights/parity checks before integration |
| [`SCENARIOS-60-CONTRACT.md`](SCENARIOS-60-CONTRACT.md) | The 60-scenario interfaces, world fields, attack kinds and file ownership |
| `requests/` | Open and closed cross-owner requests |

## Known limits

- The macOS mirror's original provenance contains no independently verified licence. The operator subsequently specified **0BSD** and authorized reuse for the full local forks; original source notices remain intact. See `FORK-REPLACEMENT.md` for the fork outputs, tested local compatibility and retained source records. This work does not authorize a deployment or withdraw the existing service.
  The live site serves both shells when `DESKTOP_SHELLS_PUBLIC=true` (`deploy/vultr-vm/README.md` 5a): at an unguessable `/s/<token>/` path, behind the site's own login for everything but those files. Unsetting the variable withdraws them; no such live change was performed.
- Task view / Mission Control show icons, not live window previews. The debrief is a parent window, not an in-shell app.
- Testing so far has been in headless Chromium only, and GPU performance has not been measured.
