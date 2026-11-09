# Scene authoring: build attack demos on the two desktops

> **Status: ready for demo building.** Both final desktops (Windows 11: `previews/win11-final`, macOS: `previews/macos-final`) share one parent-owned world. All 30 scenes play end to end with real clicks on both OSes: the attack path with a mid-scene OS swap, and the safe path (patched replay for trench). See `tools/e2e/all-scenes-e2e.mjs`. Live sandbox results can be pushed into both desktops through `/api/desktop/events` (`BACKEND.md`). The full test suite passes. Theme, wallpaper, enabled apps, user and hosted data are profile data served by `/api/desktop/world`. Remaining polish items are listed in §7 and in `requests/`. None of them blocks scene authoring.

This guide is the starting point for new attack demos. A demo is a scripted scene (lure, choice, attack, debrief) that plays inside a fictional Windows 11 or macOS desktop. The trainee can switch OS at any moment and the scene continues on the same apps, windows, files and mail.

You add a demo by writing **scene data**. You change a desktop's look, apps, user or mailbox by writing **profile data**. Neither needs a change to the shells.

## 1. Architecture

```
                         GET /api/desktop/world?profile=<family-depth>       (server.mjs today, Vultr controller later)
                                          │  seed + data/desktop-profiles/<profile>.json
                                          ▼
┌──────────────────────────── parent page: ui/desktop/desktop.js ─────────────────────────────┐
│                                                                                              │
│   world  (OceanWorldModel, world-model.js)        desk  (OceanDesktopModel, desktop-model.js) │
│   apps, windows, fs, mail, web pages, MFA,  ◄──── CONTRACT-V2 scene machine: auth, phase,     │
│   updates, processes, notifications, sys    proj- step, pending choice, attack, debrief       │
│        ▲            │                       ect    ▲                                          │
│        │            │                       (scene-world.js)                                  │
│   applyIntent   push `world`                       │ sceneIntents(): world intent → V2 intent │
│        │            │                              │                                          │
│        │            ▼                              │                                          │
│   ┌────┴─────────────────────┐     ┌───────────────┴──────────┐    OceanFx attack overlay     │
│   │ iframe: win11-final      │ or  │ iframe: macos-final      │    + caption + hint line      │
│   │ sandbox="allow-scripts"  │     │ sandbox="allow-scripts"  │    + debrief window           │
│   └──────────────────────────┘     └──────────────────────────┘    (parent DOM, above shells) │
│     world-intent ▲  world / world-active ▼   (one MessageChannel per shell, bridge v3)        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- The **world** is everything a shell draws. Both shells render the same world. The parent validates every change with `OceanWorldModel` (`ui/desktop/world-model.js`), bumps `revision`, and pushes the full world to the visible shell.
- The **desk** is the CONTRACT-V2 scene state (`ui/desktop/desktop-model.js`). It decides which step is live, which choices count, the forward delays, the attack and the debrief. It never touches the DOM.
- **`ui/desktop/scene-world.js`** joins them. `project()` writes the content of every reached step into the world. `sceneIntents()` turns shell gestures into V2 intents.
- **OS swap** sends the latest world to the other shell, sends `world-active` to both, and changes which iframe is visible. The scene clock, pending choices and the attack animation keep running in the parent, so nothing restarts.

### One gesture, end to end

The trainee clicks the link in the lure mail on Windows:

1. The Mail app checks `world.scene.highlight` (`{app: 'mail', ref: 'sc-mail'}`), then emits `scene-choice follow-link` and `open-app browser {url: 'scene:sc-consent'}`.
2. The parent applies both with `applyIntent`. The scene choice returns `forward: {kind: 'choose', choiceId: 'follow-link'}`.
3. `sceneIntents()` passes the choice to the V2 model. The model starts the 350 ms forward delay.
4. When the delay fires, the desk enters the `consent` step. `project()` mirrors `scene.stepId: 'consent'`, sets the highlight to `{app: 'browser', ref: null}` and opens the browser on `scene:sc-consent` (already open, so it is focused).
5. The parent pushes the new world. Swapping to macOS now shows the same consent page in Safari.

## 2. Files

| File | Role | Owner |
|---|---|---|
| `desktop-comparison/previews/ocean-scenes.js` | 30 authored scenes (`AUTHORED`), the step builder (`buildSteps`) and the loader for the 60 scenarios (`globalThis.OceanScenarioData`) | scene authors |
| `desktop-comparison/previews/ocean-scenarios/<depth>.js` | The 60 scenario entries, one file per depth (§8) | content |
| `ui/desktop/scenario-profile.js` | Resolves a scenario id to the profile of its family and depth | parent |
| `ui/desktop/desktop-model.js` | CONTRACT-V2 scene machine, `CHOICE_IDS`, `choicesFor()`, delays | parent |
| `ui/desktop/scene-world.js` | scene → world projection and world → scene intent mapping | parent |
| `ui/desktop/desktop.js` | world store, bridge v3, OS swap, overlay, debrief window, `window.OceanDesktop` | parent |
| `ui/desktop/world-model.js` | world validator and reducer, shared with both shells | mac worker |
| `data/desktop-world-seed.json` | default world: user, settings, files, mail, contacts | data |
| `data/desktop-profiles/<family-depth>.json` | per-profile overlay | data |
| `desktop-comparison/previews/ocean-fx.js` | attack animation over the active shell | fx |

## 3. Add or change a scene

### 3.1 Step data

A scene is `OceanScenes.get(profileId, anchor)` → `{ steps, attack, debrief, safePath, patched }`. Each step is plain JSON:

| Field | Meaning |
|---|---|
| `id` | Step id (`toast`, `mail`, `signin`, `consent`, `mfa`, `files`, `mailbox`, …). Unique in the scene. |
| `phase` | `lure` or `action` |
| `app` | `toast`, `mail`, `browser`, `files`, `mfa` or `updates` |
| `kind` | `notice` (lure), `victim` (the trainee's choice matters), `benign` (times out to the next step), `auto` (the event fires by itself) |
| `hint` | One line for the parent's hint line |
| content | `toast {app, title, body}`, `mail {from, subject, body, link?, attachment?}`, `page {type, url, brand, headline, …}`, `files {folder, target, items}`, `mfa {brand, number, …}`, `monitor {title, rows, flip, alert}`, `mailbox {…}`, `redirect {…}` |
| `choices?` | `{forward, safe, noop}` choice ids. Without it, `choicesFor()` derives them from `app` and `page.type`. |

Add a scene by adding an `AUTHORED['<family>-<depth>']` entry. `buildSteps()` turns the depth's fields into steps: sunlight is toast → mail or page → files (run a file); twilight adds a sign-in page and an MFA push or code page; midnight is a sign-in page; abyss is a consent page plus optional journey steps; trench is a passive toast → task → event. A new kind of step needs a new branch in `buildSteps()`, a matching case in `scene-world.js` and, if its choice is new, a `CHOICE_IDS` entry.

### 3.2 Choice ids (`CHOICE_IDS` in `desktop-model.js`)

`open follow-link download sign-in verify approve allow run-file delete report close-tab not-now cancel deny check-updates continue open-ledger release call-known second-approver`

- **forward** choices move the journey on; the last one starts the attack. Most have a forward delay (`FORWARD_DELAY_MS`), during which other choices are refused as `busy`.
- **safe** choices end the scene on the safe path (only when the scene has a `safePath`; trench scenes do not).
- A choice id that is not in `CHOICE_IDS` is refused by the V2 model. Add it there first, then give it a label in `CHOICE_LABELS` (`scene-world.js`).

### 3.3 What each step writes into the world

`project()` adds content once, when its step is reached, and never overwrites it, so the trainee's edits (read, moved to Junk, deleted) persist. Every scene id starts with `sc-`. A new run (Restart, Replay) strips every `sc-` item and closes windows that point at one.

| Step | World content | Window opened on entry | Highlight |
|---|---|---|---|
| `toast` | banner + history `sc-toast` (app from `toast.app`, else the next step's app); also delivers the next step's content (the lure mail is in the inbox) | none | the next step's highlight |
| `mail` (lure) | inbox message `sc-mail`; `link: scene:sc-<next page>` and that page; attachment → file `sc-file` in Downloads | Mail `{messageId: 'sc-mail'}` | `{app: 'mail', ref: 'sc-mail'}` |
| browser page (`download`, `signin`, `code`, `consent`, `payment`) | `data.web.pages['sc-<step>']` with title, display `url`, brand, heading, body, choice buttons | Browser `{url: 'scene:sc-<step>'}` | `{app: 'browser', ref: null}` |
| `code` page | also a Messages thread `sc-sms` with the code | — | — |
| `mfa` (push) | `data.mfa.prompts['sc-mfa']` (`{id, app, account, location, device, time, number}`) and account `sc-acct` | Authenticator | `{app: 'mfa', ref: 'sc-mfa'}` |
| `files` (victim) | `sc-file` (target) and `sc-item-N` in the named folder (Downloads, Desktop, Documents, …; any other name becomes folder `sc-folder` in home) | Files on that folder | `{app: 'files', ref: 'sc-file'}` |
| journey `mailbox` / `redirect` | inbox message `sc-<step>` linking to a status page `sc-<step>` with the step's choices; the worm also files `sc-sent-N` copies in Sent | Mail on that message | `{app: 'mail', ref: 'sc-<step>'}` |
| trench `task` | monitor rows → `data.updates` `sc-row-N`; file tasks → `sc-folder` with `sc-item-N` | the task app | `{app, ref: null}` |
| trench `event` | flipped rows (`status: 'available'`) and banner `sc-alert` | — | as the task |
| attack phase | `data.processes` `sc-proc` (suspicious, for Task Manager / Activity Monitor) | — | `null` |

All addresses must use `.example` or `.invalid`; the scene's `training.user@example.test` placeholder is replaced by the world user's email. `world.scene` always mirrors `{phase, stepId, highlight}` of the desk.

### 3.4 Gesture gating (shell → scene)

Ordinary gestures count as scene choices only while `world.scene.highlight` points at the item. Both shells implement this table (`requests/win-apps-to-mac.md`):

| Gesture | Highlight required | Choice sent |
|---|---|---|
| Mail: follow the message link | `{mail, message id}` | `follow-link` (and the browser opens the page) |
| Mail: open an attachment | same | `download` |
| Mail: Report / Move to Junk | same | `report` |
| Mail: Delete / Move to Trash | same | `delete` |
| Files: open the file | `{files, node id}` | `run-file` |
| Files: delete the file | same | `delete` |
| Browser: a page choice button | none (buttons are explicit) | the button's `choiceId` |
| Browser: close a tab showing a scene page | `{browser}` | `close-tab` |
| Authenticator: Approve / Deny | none | `approve` / `deny` |
| Updates: Install / Check for updates | `{updates}` | the update's `choiceId` / `check-updates` |
| Task Manager: end a scene process | none | the process's `endChoice`, if any |

The parent adds three mappings in `sceneIntents()`:

- The shell's sign-in (`set-phase desktop`) signs the V2 desk in (`show-sign-in`, `sign-in`).
- During a toast step, opening the announced app counts as `open`, and any other scene choice first opens the toast (so reporting the announced mail from the inbox works).
- Dismissing the `sc-toast` banner counts only for passive toasts (`dismissPassive`, the trench scenes). Shells auto-dismiss banners, so a dismissal is never treated as the safe path.

### 3.5 Debrief

The debrief window is drawn by the parent above the active shell (the shells have no debrief app). It reads `scene.debrief.fell` or `.safe`, the optional `journey` stages and the `anchorNote`. Its buttons send V2 intents: `replay safe` (or the patched replay for trench), `replay normal`, `pick-another`, `close`, and, for `deception-abyss` only, `request-proof`.

### 3.6 Test a scene

```sh
node --test tests/scene-world.test.mjs     # every scene, both paths, valid world at every step
node --test tests/desktop-ui.test.mjs      # the real parent against fake v3 shells
```

`tests/scene-world.test.mjs` plays all 30 scenes through the real V2 model and validates the projected world after every revision. A new scene is covered automatically; add a focused test when it introduces a new step kind.

## 4. Per-profile configuration

`GET /api/desktop/world?profile=<family-depth>` returns the seed deep-merged with `data/desktop-profiles/<family-depth>.json`. Objects merge key by key, arrays replace, and `null` removes an object. The result is validated by `createWorld()`; an invalid overlay returns 500 and the parent falls back to the plain seed.

| Change | Overlay keys | Rules |
|---|---|---|
| Theme, accent | `sys.theme`, `sys.accent` | `light`/`dark`; 8 accent names |
| Wallpaper | `sys.wallpaper`, `sys.wallpaperUrl` | Depth ids `depth-sunlight` … `depth-trench` or `stock`. `wallpaperUrl` is a root-relative path on the shell server (for example `/previews/win11-final/img/wallpaper/ThemeB/img2.jpg`) or a base64 `data:image/` URL; never an external URL. Without an overlay, the parent sets `depth-<scene depth>`. |
| Enabled apps | `installed`, `dock.pins`, `dock.badges` | Canonical ids only; `files` and `settings` always stay; culled apps are refused. Apps outside `installed` disappear from the dock, launcher, search and desktop. |
| User | `user` | `{id, name, short, email (.example/.invalid), avatar}`; also rename `fs.nodes.home.name` |
| Hosted data | `data.mail`, `data.messages`, `data.notes`, `data.calendar`, `data.reminders`, `data.contacts`, `data.contents`, `fs.nodes` | Fictional people and domains only; lists replace the seed list |

Example: `data/desktop-profiles/deception-midnight.json` (light theme, green accent, image wallpaper, 12 apps, user Sam Novak, own mailbox). Scene content is added on top of whatever the overlay provides.

## 5. Backend contract (what the Vultr controller serves)

The local `server.mjs` serves these routes. The world can come from another directory (`DESKTOP_WORLD_DIR`) or from an upstream controller (`DESKTOP_WORLD_URL`, loopback unless allowlisted), and a sandbox controller can change it live through the event stream. Configuration, validation, curl examples and limits: `BACKEND.md`.

| Route | Response |
|---|---|
| `GET /api/desktop/world?profile=<slug>` | 200: a World v3 object that passes `OceanWorldModel.validate`. Header `X-Desktop-Profile: applied` when an overlay was used, `none` otherwise. 400 for a bad slug, 500 for an invalid overlay, 502 when the upstream controller fails or answers with an invalid world. |
| `GET /api/desktop/world` | 200: the plain seed (the parent's fallback). |
| `GET /api/desktop/events?run=<id>` | Server-Sent Events for one run: `{type: 'patch', patch}` or `{type: 'replace', world}`. The parent subscribes to its page's `?run=` (default `local`). |
| `POST /api/desktop/events?run=<id>` | Publishes one event to that run's subscribers after validation. Loopback only, or `Authorization: Bearer $DESKTOP_EVENTS_TOKEN` when the token is set. 202 `{ok, id, delivered}`; 422 for an invalid event. |
| `GET /api/health` | `{ok, buildId}`: a hash of both shell builds and the parent and server files, taken at start-up, so a launcher can detect a stale server. |
| `GET /api/desktop-templates/status` | `{ enabled, source, osModes, shellOrigin }`. `shellOrigin` is `http://127.0.0.1:<port>`; the parent loads `<shellOrigin>/previews/win11-final/index.html?oceanShell=1` and `…/macos-final/index.html?oceanShell=1`. |

Live changes go through the parent API on `window.OceanDesktop`:

| Method | Effect |
|---|---|
| `replaceWorld(world)` | Validates and replaces the whole world, keeps the session's `phase`, re-applies the scene content for every reached step (for the new user), raises `revision`. Restart returns to this world. Returns `{ok, revision}` or `{ok: false, error}`. |
| `patchWorld(patch)` | Deep-merges a profile-style patch into the live world (same rules as an overlay), keeps scene content, raises `revision`. |
| `getWorld()`, `getScene()` | Copies of the current world and V2 desk (read-only). |

The event stream calls these methods in the parent page: a POSTed `{type: 'patch', patch: {data: {processes: [...]}}}` (a process observed in the sandbox) runs `patchWorld`, and `{type: 'replace', world}` (a reset) runs `replaceWorld`. A refused event is logged with `console.warn` and never applied. The shells never fetch anything themselves.

## 6. Run it

```sh
node server.mjs          # app on http://127.0.0.1:4173, final shells on http://127.0.0.1:4189
# open http://127.0.0.1:4173/ocean-profiles.html, pick a creature, opt in, sign in on the lock screen
node --test tests/*.test.mjs
```

`createAppServer({ templateShellsEnabled: true, shellOrigin })` runs the app against a shell server on another loopback port (tests use 4370 for the app and 4371 for the shells).

End-to-end verification (not part of the repo): `C:/Temp/pw-kimi/integrate-e2e.mjs` with `integrate-lib.mjs` starts both servers on 4370/4371 and drives headless Chromium with real clicks inside both shells. It aborts and counts every non-loopback request. The comparison server only lets `127.0.0.1:4173` frame the shells, so the harness widens `frame-ancestors` to 4370 in transit (headers only). Last run: 67/67 checks, zero external requests. Screenshots: `screens/final-integrate-*.png`.

## 7. Known limits

- macOS Mail does not select the message the parent opens, and its link button shows the page id (`requests/integrate-to-mac.md`). Windows page bodies collapse single line breaks, toasts cannot be clicked open, and the notification centre sends an invalid payload (`requests/integrate-to-win-apps.md`).
- Scene files use `text/plain` so both shells can open them; Finder shows generic icons for `.pdf` and `.png` names.
- Trench monitors (Phone & Plan, Home Devices) are shown as rows in the Updates app, which is an approximation.
- The debrief is a parent window, not an app inside the shells; it does not appear in the shell's window switcher.
- The lure does not raise the dock badge.
- Only the visible shell receives world updates; the hidden one is brought up to date on swap.
- The comparison server's `frame-ancestors` is fixed to `127.0.0.1:4173`; a parent on another origin needs that list widened.

## 8. The 60 scenarios, and adding scenario 61

The 60 scenarios in `data/ocean-selection.json` (12 per depth) are played on the same desktops with the same scene machine. A scenario is **data**: one entry in `desktop-comparison/previews/ocean-scenarios/<depth>.js`, one victim profile `data/desktop-profiles/<scenario-id>.json`, and (when it has a sandbox run) one attack kind. Play it at `/desktop.html?profile=<scenario-id>`; the matrix page (`/ocean-profiles.html`) has a "Play this scenario" link on every card. Interfaces and ownership: [`SCENARIOS-60-CONTRACT.md`](SCENARIOS-60-CONTRACT.md).

What a scenario adds on top of a family scene:

| Feature | Where it comes from | Where it shows |
|---|---|---|
| Victim login | `data/desktop-profiles/<id>.json` `user` (name, short, `.example` email, avatar id) | Lock screen of both shells: name, avatar, email, one click, no password field. Avatar: `data/desktop-profiles/avatars/<avatar-id>.<png\|jpg\|webp\|svg>`, served as `/avatars/<id>` |
| Intro card | `card {victim, software, firstAction, next}`, `attackTitle`, `year` | Parent overlay after sign-in: "[attackTitle] ([year])", "The year is [year]. You are a [victim] using [software]. You [firstAction]...", then `next`. Dismiss with the button or Esc; the **Brief** button reopens it |
| Focus dimming | `focusApps: [canonical app ids]` | `world.scene.focusApps`: every other app window, dock/taskbar icon and desktop icon is dimmed (`saturate(.25)`, `opacity: .55`) but stays clickable |
| Creature in the wallpaper | the scenario's `family` + `depth` (sprite `/ocean-creatures/<asset>/<depth>.gif`) | `world.scene.creature {family, depth, sprite, state, targetApp}`; the shells draw it behind windows |
| Starting OS | `os: 'windows' \| 'macos'` | The page starts on that shell; the trainee can still swap |
| Breakthrough and attack | `attackKind` (one of the 17) | Creature state `breakthrough`, then `OceanFx.playAttack({attackKind, getSandbox, subscribeSandbox, …})` |
| Sandbox run and receipt | a runner posts `{type:'patch', patch:{sandbox}}` to `/api/desktop/events?run=<id>` | `world.sandbox`: the animation follows its events; the debrief shows the receipt panel (provider, instance, teardown confirmed, egress none, synthetic data) |

The creature state follows the journey: idle while locked, `notice` on the first step, `approach` as steps advance, `circle` on the step before the last forward step, `press` on the last forward step, `breakthrough` once the attack runs (also in the debrief on the attack path). A safe exit leaves it `idle`. `scene-world.js` derives it; no scene data is needed.

### Add scenario 61 (or edit one of the 60)

Write the data first; no shell or parent code changes.

1. **Pick the id and depth.** An id is `a-z`, `0-9`, `-`, at most 40 characters. Decide the depth, the `family` (anchors must equal their selection family; free scenarios choose any of the six) and the `attackKind` from the fixed list (`SCENARIOS-60-CONTRACT.md` §4, `OceanWorldModel.ATTACK_KINDS`).
2. **Add the scene entry** to `desktop-comparison/previews/ocean-scenarios/<depth>.js`:
   ```js
   S['mydoom-2004'] = {
     depth: 'sunlight', family: 'network-abuse', year: 2004, attackTitle: 'Mydoom', os: 'windows',
     card: { victim: 'office clerk', software: 'a desktop mail client', firstAction: 'open a message that says your mail was returned', next: 'An attachment is about to appear.' },
     focusApps: ['mail', 'files'],        // canonical app ids on the attack path
     attackKind: 'mass-mail-worm',
     date: '2004-01-26T09:10:00Z',        // optional ISO start of the scene clock (the era); the lure is stamped from here
     // everything below is the existing AUTHORED shape for that depth (§3.1): title, intro, via/from/subject/body/link, toast,
     // page / signin / mfa / consent, file, caption, effect, targets, fell, safe
   };
   ```
   `year: null` is allowed for an attack without a single year: the card then shows the bare title and starts at "You are a …". `date` makes the scene clock start in the era and run in real time, so a 2010 lure sits after the 2010 mail (the profile's own mail must be dated earlier). Domains are `.example` or `.invalid`; brands, people and files are invented. `OceanScenes.scenarioProblem('<id>')` returns `null` for a complete entry and a reason (`depth`, `family`, `title`, `date`, `os`, `card`, `focusApps`, `attackKind`, `copy`) otherwise; an incomplete entry never loads.
3. **Add the victim profile** `data/desktop-profiles/<id>.json` (overlay format of `deception-midnight.json`, §4): `user`, `sys` (theme, same-origin `wallpaperUrl`), `installed`, `dock`, seeded `data` so the lure is reachable. Add the avatar image under `data/desktop-profiles/avatars/<avatar-id>.png`. No password fields.
4. **Add the selection entry** in `data/ocean-selection.json`. The catalog is fixed at 12 scenarios per depth and 60 in total, so a 61st also needs these constants changed: `backend/ocean-profiles.mjs` (`list.length !== 12`, `scenarios.length !== 60`), `ui/desktop/ocean-profiles.js` (`validScenarioCatalog`, the status line), and the count assertions in `tests/ocean-profiles.test.mjs`, `tests/browser-integration.test.mjs`, `tests/desktop-scenario-assets.test.mjs`, `tests/sandbox-controller.test.mjs` and `tests/scenarios-<depth>.test.mjs`. Replacing one of the 60 needs only the entry, the scene data and the profile.
5. **Sandbox runner (optional).** An attack kind has one runner (`backend/sandbox/`, `docs/desktop-parity/SANDBOX.md`). A new kind also goes into `ATTACK_KINDS` in `world-model.js` and `ocean-scenes.js`, the sandbox kinds table and `ocean-fx.js`.
6. **Test it.**
   ```sh
   node --test tests/ocean-scenes.test.mjs     # every authored scenario: in the selection, builds a scene, card and focusApps valid
   node --test tests/scene-world.test.mjs      # creature states, focusApps and intro projection
   node --test tests/scenarios-<depth>.test.mjs
   node --test tests/*.test.mjs
   ```
   Then play it: `node tools/start-desktops.mjs`, open `/desktop.html?profile=<id>`, sign in on the lock screen, and check the card, the dimming, the creature, the attack and the debrief on both OSes.
