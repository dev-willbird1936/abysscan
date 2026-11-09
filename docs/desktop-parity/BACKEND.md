# Desktop backend: world source, live event stream, health

The two final desktops draw one parent-owned world (`WORLD-CONTRACT.md`). This page describes how a backend, such as the local `server.mjs` or a Vultr sandbox controller, hosts that world and changes it live. The parent page (`ui/desktop/desktop.js`) needs no change for any of it.

```
 sandbox controller ──POST /api/desktop/events?run=<id>──►  server.mjs  ──SSE──►  parent page (desktop.js)  ──►  visible shell
   (process seen,       {type:'patch', patch}                validates,          patchWorld / replaceWorld        (the hidden shell
    file encrypted,     {type:'replace', world}              fans out per run    validates again, logs refusals    catches up on swap)
    mail sent)
                     GET /api/desktop/world?profile=<slug>  ◄── DESKTOP_WORLD_DIR (seed + profiles)  or  DESKTOP_WORLD_URL (upstream)
```

All data stays fictional (`.example` / `.invalid` addresses). With the defaults nothing leaves loopback.

## 1. Configuration

| Variable (`createAppServer` option) | Default | Effect |
|---|---|---|
| `DESKTOP_WORLD_DIR` (`desktopWorldDir`) | `data/` | Directory with `desktop-world-seed.json` and `desktop-profiles/<slug>.json`. Read on every request. Start-up fails if the seed is missing. |
| `DESKTOP_WORLD_URL` (`desktopWorldUrl`) | unset | Base URL of an upstream controller that serves `GET <base>/api/desktop/world?profile=<slug>`. Replaces the directory; setting both fails at start-up. |
| `DESKTOP_WORLD_ALLOW_HOSTS` (`desktopWorldAllowHosts`) | empty | Comma-separated host names that `DESKTOP_WORLD_URL` may use besides loopback (`127.0.0.1`, `localhost`, `[::1]`). Put the Vultr controller host here, and nothing else. |
| `DESKTOP_SANDBOX_MODE` (`desktopSandboxMode`) | `simulated` | How `POST /api/desktop/sandbox/run` runs a scenario: `simulated` (in-process), `docker` (one isolated container) or `vultr` (one instance, only when every Vultr gate variable passes). Any other value fails at start-up. Never a request field. See [`SANDBOX.md`](SANDBOX.md). |
| `DESKTOP_EVENTS_TOKEN` (`desktopEventsToken`) | unset | When set (16+ characters), `POST /api/desktop/events` requires `Authorization: Bearer <token>`. When unset, only a loopback peer on the local origin may publish. |

`DESKTOP_WORLD_URL` rules:

- `http:` or `https:`, no user name or password, no query or fragment. The path may hold a base (`http://127.0.0.1:9000/controller`).
- A host that is not loopback and not in `DESKTOP_WORLD_ALLOW_HOSTS` fails at start-up.
- The upstream request sends only `Accept: application/json`. The trainee's cookies, `Authorization` and other headers are never forwarded. Redirects are refused, the timeout is 5 s and the answer is capped at 512 KB.
- The answer must pass `OceanWorldModel.createWorld` (the same strict validation as a profile overlay). Anything else returns 502 and the parent falls back to the plain world, then shows "The desktop world did not load". An upstream 400 is passed on as 400. `X-Desktop-Profile: applied` is passed on from the upstream; any other value becomes `none`.

## 2. Routes

| Route | Response |
|---|---|
| `GET /api/desktop/world?profile=<slug>` | 200 World v3 (`SCENE-AUTHORING.md` §4–5). 400 bad slug, 500 invalid local overlay, 502 upstream failure. |
| `GET /api/desktop/events?run=<id>` | `text/event-stream`. Each message is `id: <boot>-<seq>` plus `data: {"type":"patch","patch":{…}}` or `data: {"type":"replace","world":{…}}`. `retry: 2000`; a `: ping` comment every 15 s. Replays the events after `Last-Event-ID` (or `?last=<id>`) from the last 32 of the run (1 MB at most). A job's evidence replay (a 40-character replay id, or `mock-<fixture>` locally) is a finished recording: a first connection gets all of its kept events. 403 for a foreign `Origin`, 503 when the run has 8 subscribers. |
| `POST /api/desktop/events?run=<id>` | Body: exactly `{type:'patch', patch}` or `{type:'replace', world}`, `application/json`, at most 320 KB. 202 `{ok: true, id, delivered}` (`delivered` = open subscribers). 400 bad run or JSON, 401/403 not allowed, 413 too large, 415 wrong content type, 422 invalid event. |
| `POST /api/desktop/sandbox/run?run=<id>` | Body: exactly `{scenarioId}`, `application/json`. Starts one sandbox run for that run id and answers at once: 202 `{ok, runId, scenarioId, attackKind, mode}`. The run streams its events to `/api/desktop/events?run=<id>` as `world.sandbox` patches. Loopback peer and local origin only (403 otherwise). 400 bad run, body or `scenarioId`; 404 unknown scenario; 409 `SANDBOX_BUSY` while that run id has an active sandbox; 429 `SANDBOX_LIMIT` at 4 active runs; 503 when `DESKTOP_SANDBOX_MODE=vultr` and the gates are not satisfied, or in hackathon controller mode. |
| `GET /api/health` | `{ok: true, buildId}` |
| `GET /api/healthz` | Unchanged: execution mode (used by the parent). |

Run ids match `^[a-z0-9-]{1,40}$`. The parent subscribes to the `run` query parameter of its page (`desktop.html?profile=deception-twilight&run=demo-1`), or to `local` without one. One run is one trainee session; at most 64 runs are kept, and the oldest run without subscribers is dropped first.

### Event validation

The server checks each event before it is published:

- **patch**: a non-empty object without `v`, `revision` or `scene`, which must deep-merge into the plain seed world (from the configured source) as a valid world. Merge rules are those of a profile overlay: objects merge key by key, arrays replace, `null` removes an object.
- **replace**: a world that passes `OceanWorldModel.validate`.

The parent checks every event again against its live world through `patchWorld` / `replaceWorld`. A refused event is logged with `console.warn('Desktop world event <id> refused: <reason>')` and changes nothing. `replaceWorld` keeps the session phase, re-applies the scene content of the reached steps and becomes the world that Restart returns to.

### Reconnects

The browser's `EventSource` reconnects a dropped stream by itself and sends `Last-Event-ID`, so the parent receives every missed event once. If the server refuses the stream (for example while it restarts), the parent reopens it after 5 s with `?last=<id>`. Ids start with a per-process boot id, so a restarted server replays nothing stale. `body[data-world-stream]` is `open` or `reconnecting`.

### Build id

`buildId` is 16 hex characters of SHA-256 over the paths and contents of both shell builds (`desktop-comparison/previews/win11-final`, `…/macos-final`), the scene and fx scripts, `desktop-comparison/server.mjs`, `ui/desktop/`, `server.mjs` and `backend/desktop-world-*.mjs`. It is taken once when the server starts. A launcher compares it with `computeDesktopBuildId(projectRoot)` from `backend/desktop-world-build.mjs`; a mismatch means the running server predates the files on disk and must be restarted.

## 3. Examples

Use `127.0.0.1` rather than `localhost`: without a token the server accepts only `Host: 127.0.0.1:<port>`.

```sh
node server.mjs   # app on 4173, shells on 4189
# open http://127.0.0.1:4173/desktop.html?profile=deception-midnight&run=demo-1, opt in, sign in

# a process observed in the sandbox (shows in Task Manager and Activity Monitor)
curl -s -X POST 'http://127.0.0.1:4173/api/desktop/events?run=demo-1' -H 'Content-Type: application/json' \
  -d '{"type":"patch","patch":{"data":{"processes":[{"id":"ev-proc","name":"LedgerSync Helper (simulated)","cpu":63,"mem":212,"publisher":"Unknown publisher","suspicious":true}]}}}'
# {"ok":true,"id":"3f9c01aa-1","delivered":1}

# a file encrypted in the sandbox (a new file in Downloads and its body)
curl -s -X POST 'http://127.0.0.1:4173/api/desktop/events?run=demo-1' -H 'Content-Type: application/json' \
  -d '{"type":"patch","patch":{"fs":{"nodes":{"ev-file":{"id":"ev-file","parentId":"downloads","name":"Q4-ledger.xlsx.locked","kind":"file","mime":"text/plain","size":52,"modified":"2026-11-02T09:41:00Z","trashed":false,"contentId":"c-ev-file"}}},"data":{"contents":{"c-ev-file":{"text":"Fictional: encrypted in the sandbox."}}}}}'

# a banner (for example "a mail was sent from your account")
curl -s -X POST 'http://127.0.0.1:4173/api/desktop/events?run=demo-1' -H 'Content-Type: application/json' \
  -d '{"type":"patch","patch":{"notifications":{"banners":[{"id":"ev-sent","app":"mail","title":"Message sent","body":"Invoice copy sent to 40 contacts (simulated).","time":"2026-11-02T09:42:00Z"}]}}}'

# a reset: replace the whole world
curl -s 'http://127.0.0.1:4173/api/desktop/world' > world.json
node -e "const w = require('./world.json'); w.user.name = 'Dana Okafor'; process.stdout.write(JSON.stringify({type: 'replace', world: w}))" > replace.json
curl -s -X POST 'http://127.0.0.1:4173/api/desktop/events?run=demo-1' -H 'Content-Type: application/json' --data-binary @replace.json

# refused: an external wallpaper -> 422 {"error":"The patch is invalid: sys"}
curl -s -X POST 'http://127.0.0.1:4173/api/desktop/events?run=demo-1' -H 'Content-Type: application/json' \
  -d '{"type":"patch","patch":{"sys":{"wallpaperUrl":"https://cdn.example/x.png"}}}'

# watch the stream yourself
curl -N 'http://127.0.0.1:4173/api/desktop/events?run=demo-1'

# with a token (DESKTOP_EVENTS_TOKEN=fictional-token-0123456789 node server.mjs)
curl -s -X POST 'http://127.0.0.1:4173/api/desktop/events?run=demo-1' -H 'Authorization: Bearer fictional-token-0123456789' \
  -H 'Content-Type: application/json' -d '{"type":"patch","patch":{"sys":{"theme":"light"}}}'

# stale-server check
curl -s http://127.0.0.1:4173/api/health      # {"ok":true,"buildId":"…"}
node -e "import('./backend/desktop-world-build.mjs').then(m => console.log(m.computeDesktopBuildId('.')))"

# serve the world from a controller instead of data/
DESKTOP_WORLD_URL=http://127.0.0.1:9000 node server.mjs
DESKTOP_WORLD_URL=https://controller.vultr.example DESKTOP_WORLD_ALLOW_HOSTS=controller.vultr.example node server.mjs
```

### Detonation replay

`backend/detonation/replay.mjs` is a controller of this stream (SPEC §9.1). `evidenceToPatches(evidence, {path, label})` returns the patches for one job: a first patch with the seeded user (Dana) and files, then one patch per evidence item that changes the desktop, merged down to at most 30 so the hub's 32-event history keeps the whole replay. `publish(jobId, patches, {hub | baseUrl, token})` posts them in order to `run=<jobId>`. `/desktop.html?job=<jobId>` follows that run, from its first event however late the page opens (and uses the neutral `data/desktop-profiles/detonation-replay.json` profile when `profile` is missing). New world fields: `fs.nodes[].encrypted`, `data.startup`, `data.screenshots`, `data.web.homepage` ([`SYNC-AUDIT.md`](SYNC-AUDIT.md) §4). The replay owns `data.processes`, `data.startup`, `data.screenshots` and the notification lists for its run, so it sends them whole (see Limits).

## 4. Tests and evidence

```sh
node --test tests/desktop-world-backend.test.mjs   # unit + HTTP + the real parent subscribed to a real server
node tests/desktop-world-stream-e2e.mjs             # headless Chromium, both final shells (ports 4470/4471)
node --test tests/detonation-replay.test.mjs        # every SPEC §9.1 row as a world patch
node tools/e2e/desktops-e2e.mjs replay              # invoice.py replay in both shells, with an OS switch
```

- `tests/desktop-world-backend.test.mjs`: URL and allowlist rules; `DESKTOP_WORLD_DIR`; an upstream controller (validated world, no forwarded cookie or `Authorization`, invalid, redirecting and oversized answers refused); event validation; hub caps and replay; `/api/health`; POST access rules, size cap and refusals; a dropped stream replaying the missed event once; the token gate; and the real `desktop.js` in a VM, subscribed through HTTP, applying a POSTed patch and replacement, refusing and logging an unchecked event, and reopening a refused stream with `?last=`.
- `tests/desktop-world-stream-e2e.mjs` (12/12): on `deception-midnight`, a POSTed process and mail appear in Windows Task Manager; after a swap, in macOS Activity Monitor; a mail and a Downloads file POSTed while macOS is visible appear in macOS Mail and, after swapping back, in Windows Mail and File Explorer; an invalid patch is refused with 422 and changes nothing; no page errors; zero non-loopback requests. Screens: `screens/final-stream-01-process-windows.png` … `final-stream-05-file-windows.png`.

## 5. Limits

- A patch replaces whole arrays. Adding one mail or process means sending the full list, and a list that omits the scene's `sc-` items removes them (for example the lure mail or the attack's `sc-proc`). The controller should send `data.processes` and `data.mail.messages` only when it owns their content, or use an object store such as `fs.nodes`, which merges by id.
- The server validates a patch against the plain seed. A patch that refers to something only the live world has (a profile-only folder, a scene file as `parentId`) is refused with 422 even though the parent would accept it.
- Only the visible shell receives each change at once; the hidden shell gets the latest world on swap (the existing bridge rule).
- The event history is in memory: a server restart forgets it, and a parent that missed events across a restart keeps its world as it was.
- `GET /api/desktop/events` has no token. It sends only what POSTs published, and it is limited to the local (or `APP_PUBLIC_ORIGIN`) origin.
- No Vultr controller has been connected; the upstream path is tested against a loopback controller only.

## Quest generation (Vultr Serverless Inference)

An uploaded fish keeps no link to its file, so its scene is written for its **kind**: creature behaviour × file type
(`fish-f-keylog-exe`). `backend/detonation/quest-writer.mjs` asks the inference code model for a quest
([QUESTS.md](QUESTS.md)) for that kind, compiles it and checks it like a hand-written one (`check-quest`), and sends any
problems back to the model for up to three attempts. A passing quest is cached in `data/generated-quests/<kind>.scene`; the
guide plays it from then on. Until one exists, the guide plays the scene `upload-scenes.mjs` writes, so nothing waits on
the model.

- The brief is QUESTS.md, FISH-SCENES.md, `zeus.scene` as the reference, and the fallback scene as the facts to keep.
  See it with `node tools/generate-quests.mjs --prompt keylog-exe` (no call).
- Nothing from an upload reaches the model: only the behaviour id and the file type.
- Server: with `QUEST_WRITER_ENABLED=true` and inference configured (`DETONATION_INFERENCE_ENABLED=true`,
  `VULTR_INFERENCE_API_KEY`, `VULTR_INFERENCE_CODE_MODEL`), the first guide request for a kind with no quest starts one
  background job for it. Calls count against the same daily ledger as the detonation pipeline (`DAILY_INFERENCE_CALL_CAP`).
- Batch: `node tools/generate-quests.mjs keylog-exe encrypt-docm`, or `--all --types exe,docm,pdf,zip,js`; `--force` rewrites.
- Review a generated quest like any other: `node tools/check-quest.mjs data/generated-quests/keylog-exe.scene`, then play it
  at `/desktop.html?job=fish-f-keylog-exe&os=windows`. Delete the file to fall back.
