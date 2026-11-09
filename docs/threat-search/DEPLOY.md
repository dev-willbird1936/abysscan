# Threat search: what is deployed

**Live on https://demo.abysscan.com since 2026-11-09 00:50 UTC** (hotfix 00:59), replacing the Zeus-only preview. Checked live: WannaCry shows In the ocean, a "write ransomware" query is declined, and Qakbot was researched (4 sources), written and played on the Windows desktop with the illustration label.

The live VM is not a checkout of this repository. It runs an older release plus selective file deploys, so later changes must be **ported onto the VM's own files**, never copied over them. Take `/root/deploy.lock` first; refuse the deploy if a target file changed since the snapshot; back up; import-check `server.mjs` as the service user; restart; check `/api/health` and `/api/threats/config`; roll back on any failure.

Files the search needs on the VM:

- New: `backend/threats/*.mjs`, `data/threat-aliases.json`, `ui/job/threat-source.mjs`, and (for the scene writer's prompt and checks) `backend/detonation/{quest-writer,upload-scenes}.mjs` plus `docs/desktop-parity/QUESTS.md`.
- Edited: `server.mjs` (threat routes, one shared inference client), `backend/detonation/fish-replays.mjs` (`fish-r-<slug>` runs), `backend/detonation/inference.mjs` (`threat` kind, reasoning off for it), `ui/job/ocean-show.mjs` (the `story` option), `ui/abyss/threat-search.{js,css}`, and the matching hashes in `ui/abyss/manifest.json`.

The VM's inference client keeps its daily cap in memory (no ledger file) and always asks for 4,096 completion tokens; a researched scene needs about 2,300 with reasoning off.

## Environment (`/etc/detonation-ocean/env`, root 0600)

See `deploy/vultr-vm/env.example`. On the live site:

- `PARALLEL_API_KEY` is set (copied over SSH stdin, never on a command line or in a log). `DAILY_PARALLEL_CALL_CAP=100`.
- Inference is on (`DAILY_INFERENCE_CALL_CAP=300`). `VULTR_INFERENCE_THREAT_REASONING_EFFORT` is unset, so threat calls send `reasoning_effort: none`: at `minimal`, DeepSeek V4.1 Flash spent the whole budget reasoning and returned an empty scene.
- `THREAT_DIR` is unset: the cache is `/var/lib/detonation-ocean/threats`.

## Spend

The site is public, so anyone can search. Bounds: 10 searches and 3 creates per address per hour; 100 Parallel calls a day; Decisions answers cached 24 hours per query; a researched scene is built once per threat and cached. One new threat costs 1 Decisions call, 1 to 2 Search calls and 3 to 5 inference calls.

## Check after a deploy

1. `curl -s https://demo.abysscan.com/api/threats/config` → `{"search":true,"create":true,...}`.
2. Search a known family (Zeus, WannaCry) and a refused query ("write ransomware") from a browser on `https://demo.abysscan.com` (scripted POSTs without that Origin get 403).
3. Play `/desktop.html?job=fish-r-<slug>&os=windows` and read the debrief's sources.

Locally: `npm run e2e:threats` (mocked) and `node --test tests/threat-search*.test.mjs`.
