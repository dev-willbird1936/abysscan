# Sandbox runs for the 60 scenarios

> This file holds the section written by engine-core: how a desktop page starts a run. The sandbox worker's sections on the runner, the kinds, Docker isolation, the receipt and Vultr belong here too.

## Starting a run from the desktop page

When a scenario reaches its attack (the final forward choice), `ui/desktop/desktop.js` asks the server to run it:

```
POST /api/desktop/sandbox/run?run=<runId>      {"scenarioId": "mydoom-2004"}
202 {"ok": true, "runId": "demo-1", "scenarioId": "mydoom-2004", "attackKind": "mass-mail-worm", "mode": "simulated"}
```

`<runId>` is the page's `?run=` value (`local` without one), the same id the page subscribes to for events. The server then:

1. Looks up the attack kind from the scenario data (`loadScenarioKinds`). The page never sends a kind or a mode.
2. Takes the mode from `DESKTOP_SANDBOX_MODE`: `simulated` (default), `docker` or `vultr`. `vultr` runs only when `vultrGateReport` says every gate variable passes; otherwise the route answers 503 `SANDBOX_GATE_CLOSED` and starts nothing. There is no second path around the gates: `runScenario` checks them again.
3. Calls `runScenario` with `baseUrl` set to its own origin (and `DESKTOP_EVENTS_TOKEN` when set). The run posts `world.sandbox` patches to `/api/desktop/events?run=<runId>`: `provisioning`, `running` with one event per step, `done`, then `destroyed` (or `failed`) with the receipt.
4. Answers 202 without waiting. The page sees the events over its event stream, so the same events drive `OceanFx.playAttack` and the debrief's receipt panel.

Rules:

- Loopback peer and local origin only (same check as the events route). The body is exactly `{scenarioId}`.
- One active run per run id: a second start answers 409 `SANDBOX_BUSY` until the first run has torn down. At most 4 runs are active at once (429 `SANDBOX_LIMIT`).
- The page clears a stale `world.sandbox` before it starts a run, so a replay never shows the last run's events.
- A failure never breaks the scene. If the route answers anything but 202 (or the request fails), `OceanFx` falls back to its simulated sequence after about 4 s and the debrief says "Sandbox unavailable" instead of the receipt. A late receipt replaces that note.
- `server.sandboxRunsIdle()` resolves when every page-started run has finished (used by tests).

Tests: `tests/desktop-sandbox-route.test.mjs` (access rules, validation, 409/429, mode and gates, a simulated run reaching `done` then `destroyed` with a confirmed receipt through the events stream) and the sandbox cases in `tests/desktop-ui.test.mjs`.
