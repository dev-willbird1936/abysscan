# 60 scenarios: shared contract (orchestrator-owned)

This file fixes the interfaces between the parallel workers. Only the orchestrator edits it. A worker who needs a change writes `docs/desktop-parity/requests/<from>-to-<to>.md` and keeps working with the current contract.

Read first: `AGENTS.md`, `docs/desktop-parity/README.md`, `SCENE-AUTHORING.md`, `BACKEND.md`, `docs/VISION.md`, `docs/safety.md`. macOS is the standard; both shells get every capability in the same change. Never build on `desktop-comparison/archive/`.

## 1. Ids and routing

- The 60 scenario ids are the `id`s in `data/ocean-selection.json` (`depths.<depth>[]`). Example: `mydoom-2004` (sunlight). The 30 existing `<family>-<depth>` scenes stay working and tested.
- A scenario loads at `desktop.html?profile=<scenario-id>` (same parameter as today). `GET /api/desktop/world?profile=<scenario-id>` returns seed + `data/desktop-profiles/<scenario-id>.json`.
- Creature: anchor scenarios use their `family`. Free scenarios (`family: null`) get a family in their scene data (`family` field, §2). The creature sprite is `backend/ocean-profiles.mjs` family asset at the scenario depth: `/ocean-creatures/<family.asset>/<depth>.gif` (same-origin).

## 2. Scenario scene data (content workers)

One file per depth: `desktop-comparison/previews/ocean-scenarios/<depth>.js` (sunlight, twilight, midnight, abyss, trench). Each file is a plain script:

```js
(() => { 'use strict';
  const S = (globalThis.OceanScenarioData ||= {});
  S['mydoom-2004'] = { /* fields below */ };
})();
```

Fields per scenario (all strings plain text, fictional, `.example` / `.invalid` only):

| Field | Meaning |
|---|---|
| `depth`, `family` | Depth id; family id (required for free scenarios, must equal the selection for anchors). |
| `year`, `attackTitle` | Real attack name and year, for the intro card only ("Mydoom (2004)"). |
| `os` | `'windows'` or `'macos'`: the OS the real victim used; the scene starts on it. |
| `card` | `{ victim, software, firstAction, next }`: intro card text. Renders "The year is [year]. You are a [victim] using [software]. You [firstAction]..." plus `next`. |
| `focusApps` | Canonical app ids on the attack path (bright). All others dim. |
| `attackKind` | One of §4. Picks the sandbox runner and the ocean-fx animation. |
| everything else | The existing `AUTHORED` entry shape for that depth in `ocean-scenes.js` (`title`, `intro`, `via`, `from`, `subject`, `page`, `file`, `toast`, `caption`, `effect`, `targets`, `fell`, `safe`, …), so `buildSteps()` builds the steps unchanged. `fell`/`safe` debrief text names the safe step at each stage. |

Victim profile: `data/desktop-profiles/<scenario-id>.json` (overlay format of `deception-midnight.json`): fictional `user` (name, short, `.example` email, avatar), era-appropriate `sys` (theme, wallpaper same-origin), `installed`, `dock`, seeded `data` (mail, files, browser tabs, chats, notes) so the lure is reachable. No password fields anywhere.

## 3. World fields (engine worker adds them to `world-model.js`; both shells read them)

- `world.scene.focusApps`: `string[]` of canonical app ids, or `[]` (no dimming). Shells dim every app window, dock/taskbar icon and desktop icon not in the list: `filter: saturate(.25)` and `opacity: .55`; dimmed items stay fully clickable. Identical in both shells.
- `world.scene.creature`: `null` or `{ family, depth, sprite, state, targetApp }`. `state` ∈ `idle | notice | approach | circle | press | breakthrough`. `targetApp` is a canonical app id or `null`. Shells render the sprite in the wallpaper layer (behind every window and icon, above the wallpaper image) and animate per state: idle drift; notice turns toward the screen; approach grows/moves toward `targetApp`'s window or icon; circle orbits it; press is large, pressed against the glass; breakthrough is the parent's job (shell hides its creature when `state === 'breakthrough'`, the parent ocean-fx draws the burst). Respect `prefers-reduced-motion` (no movement, state shown by size/position only).
- `world.scene.intro`: `null` or `{ title, line, next }` (parent-rendered intro card text, derived from `card`).
- `world.sandbox`: top-level, `null` or `{ runId, scenario, attackKind, mode: 'docker'|'vultr'|'simulated', status: 'idle'|'provisioning'|'running'|'done'|'destroyed'|'failed', events: [{ seq, kind, label, count, total }], receipt: null | { provider, instance, startedAt, destroyedAt, teardownConfirmed, egress: 'none', dataset: 'synthetic' } }`. At most 64 events. Sandbox runners write it with `POST /api/desktop/events?run=<id>` `{type:'patch', patch:{sandbox:{…}}}` (arrays replace, so send the full `events` array).
- Creature state derivation (parent, `scene-world.js`): locked/intro → idle; first step shown → notice; each later step → approach, then circle on the step with the lure highlighted; the last forward step → press; the final forward choice → breakthrough.

## 4. Attack kinds (fixed list)

`scareware`, `credential-phish`, `mfa-fatigue`, `oauth-consent`, `mass-mail-worm`, `macro-dropper`, `ransomware-encrypt`, `data-exfil`, `money-transfer`, `wallet-drain`, `supply-chain-update`, `network-worm`, `botnet-ddos`, `account-takeover-post`, `sim-swap`, `spyware-surveillance`, `server-exploit-leak`.

Sandbox event kinds per run (all runners): `provisioned`, then attack-specific steps (for example `file-encrypted`, `credential-captured`, `mail-sent`, `transfer-posted`, `host-infected`, `record-exfiltrated`, `token-granted`, `post-published`), then `summary`, `destroyed`. `count`/`total` let the animation show progress (12/40 files encrypted).

## 5. Ownership

| Worker | Owns (only these) |
|---|---|
| engine-core | `ui/desktop/**`, `desktop-comparison/previews/ocean-scenes.js` (loader + builder only; never rewrite authored copy), `server.mjs`, `backend/desktop-world-*.mjs`, `tests/world-model.test.mjs`, `tests/scene-world.test.mjs`, `tests/desktop-*.test.mjs`, `tests/ocean-scenes.test.mjs`, `tests/browser-integration.test.mjs`, `desktop-comparison/server.mjs`, `docs/desktop-parity/SCENE-AUTHORING.md`, `README.md` (desktop-parity) |
| engine-mac | `desktop-comparison/make-macos-final.mjs`, `desktop-comparison/previews/macos-final/src/**` (+ rebuilt output) |
| engine-win | `desktop-comparison/win11-final/src/**` (+ rebuilt `previews/win11-final/`) |
| content-<depth> | `desktop-comparison/previews/ocean-scenarios/<depth>.js`, `data/desktop-profiles/<its 12 ids>.json`, `tests/scenarios-<depth>.test.mjs`, avatars under `data/desktop-profiles/avatars/<id>.*` |
| sandbox | `backend/sandbox/**`, `deploy/sandbox/**`, `tools/sandbox/**`, `tests/sandbox-*.test.mjs`, `docs/desktop-parity/SANDBOX.md`; `backend/vultr-adapter.mjs` only additively |
| fx | `desktop-comparison/previews/ocean-fx.js`, `tests/ocean-fx.test.mjs` |
| e2e | `tools/e2e/**` |

Concurrent session: another session is syncing macOS and Windows state (world-model, shells, `SYNC-AUDIT.md`). Keep edits additive and localized, re-read a file right before editing it, never revert or reformat changes you did not make, and if a build or test breaks from code you do not own, note it in your report instead of fixing it.

Shared rules: no real malware, exploit payloads, credentials, brands, public targets, camera or mic; `.example` domains only; no network from shells. Rebuild what you touch; run `node --test tests/*.test.mjs` before you report. Report blockers, do not hide failing checks.
