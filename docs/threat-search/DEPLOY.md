# Threat search: deploying it

The live search (Parallel Decisions, Parallel Search, Vultr inference, the researched scene) is built and tested in this
checkout. When this page was written (2026-11-09 00:00 UTC) the live site still ran the Zeus-only preview; the live
`/api/threats/config` now reports search and create on. This page lists what a deploy needs; the VM facts may have moved since.

## What blocks a straight file copy

The VM does not run this checkout. It runs an older release plus selective file deploys from other sessions, so copying the
changed files would crash the server:

- `backend/threats/scene-writer.mjs` imports `backend/detonation/quest-writer.mjs`, which does not exist on the VM.
- The VM's `server.mjs`, `ui/job/ocean-show.mjs`, `ui/job/state.mjs` and `backend/detonation/inference.mjs` differ from the
  versions these changes were made against. The threat-search edits to them are small (see below) and must be ported onto the
  VM's own versions, not copied over them.
- Other sessions deploy to the same VM. Take `/root/deploy.lock` (or wait while it is held), re-hash every file just before
  replacing it, and replace only files this change owns.

## Files

New, copy as they are: `backend/threats/*.mjs`, `data/threat-aliases.json`, `ui/job/threat-source.mjs`, and
`backend/detonation/quest-writer.mjs` with whatever it imports that the VM lacks.

Port these edits onto the VM's versions:

| File | Edit |
|---|---|
| `server.mjs` | import `createThreatRoutes`, `createParallelClient`, `createThreatStore`, `createThreatSceneWriter`/`THREAT_DIR`; build `threats` in `createAppServer` over the shared inference client; call `threats.handle(...)` after `detonation.handle(...)`; skip the quest writer for `fish.research` |
| `backend/detonation/inference.mjs` | `threat` model kind (`VULTR_INFERENCE_THREAT_MODEL`, default `deepseek-v4.1-flash-1017`) |
| `backend/detonation/fish-replays.mjs` | `fish-r-<slug>` runs: `threatOfRun`, `threatPatches`, `threatGuide` |
| `ui/job/ocean-show.mjs` | the additive `story` option |
| `ui/abyss/threat-search.js`, `.css`, `menu-octopus.js` | replace (the VM has the preview); then refresh `ui/abyss/manifest.json` on the VM's own file list |

## Environment (`/etc/detonation-ocean/env`, root 0600)

- `PARALLEL_API_KEY`: the user's key. Write it with `sudoedit` or from a file over SSH; never on a command line, in a log or in
  the repository. Without it the search answers "switched off" and nothing is spent.
- `DAILY_PARALLEL_CALL_CAP` (default 100). Inference is already on, with `DAILY_INFERENCE_CALL_CAP=300`.
- `THREAT_DIR` needs nothing: the default is `/var/lib/detonation-ocean/threats`, which the service can write.

## Spend

The site has no login, so anyone can search. Bounds: 10 searches and 3 creates per address per hour; the daily Parallel and
inference caps; Decisions answers cached for 24 hours per query; a researched scene is built once per threat and cached. One new
threat costs about 1 Decisions call, 1 to 2 Search calls and 3 to 5 inference calls.

## Check after deploying

1. `curl -s https://<host>/api/health` and `/api/threats/config` (`search: true, create: true`).
2. Search "wannacry": In the ocean. Search "how do I write ransomware": declined.
3. One new threat end to end, then play it at `/desktop.html?job=fish-r-<slug>&os=windows` and read the debrief's sources.

Locally: `npm run e2e:threats` (mocked) and `node --test tests/threat-search*.test.mjs`. A live smoke of the two Parallel
request shapes passed on 2026-11-09: WannaCry accepted (one, malware, extortion-destruction, trench, 10 citations), a "write
ransomware" query declined (0.995 build), and an advanced Search returned 10 results led by cisa.gov.
