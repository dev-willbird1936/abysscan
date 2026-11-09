# Running the training desktops

## Start

Double-click `start-hackathon-demo.bat`, or run from the project root:

```sh
node tools/start-desktops.mjs
```

It serves the app on `127.0.0.1:4173` and the shells on `127.0.0.1:4189`, both loopback only, in one process. There is one Windows 11 desktop (`win11-final`) and one macOS desktop (`macos-final`); the shell server serves nothing else (superseded shells are in `desktop-comparison/archive/` and return 404). Keep the window open; Ctrl+C stops both servers.

Before it starts, the launcher checks both ports:

| Found on 4173 / 4189 | Action |
|---|---|
| Nothing | Start both servers. |
| This project's server, and its `GET /api/health` `buildId` equals the files on disk | Reuse it; run the smoke check; print the URLs; exit. |
| This project's server with an older `buildId`, no `/api/health`, or holding only one port | Stop that node process, wait for the ports to free, start fresh. |
| Anything else | Refuse. The message names the port, PID and command line. Nothing is stopped. |

"This project's server" means a `node` process running `server.mjs`, `desktop-comparison/server.mjs` or `tools/start-desktops.mjs`, whose command line contains this folder or whose port answers this project's routes (`/api/healthz` on the app port, `/previews/ocean-scenes.js` on the shells port). The `buildId` is `computeDesktopBuildId()` from `backend/desktop-world-build.mjs`: a hash of both shell builds, `ui/desktop/`, the scene scripts and the server files. The server computes it at start; the launcher computes it from disk. A server old enough to have no `/api/health` counts as stale.

After starting, a smoke check fetches both shell index pages, `/api/desktop/world` (plain and flagship profile), and `/api/desktop-templates/status`. A failure stops the new servers and lists every failed URL.

`start.bat` is a different program: the standalone ocean desktop on port 4188 (`tools/start-local-ocean.mjs`). It refuses an occupied port and stops nothing.

## Open

| Page | URL |
|---|---|
| Creature matrix (pick a cell, tick the opt-in, click the lock screen) | <http://127.0.0.1:4173/ocean-profiles.html> |
| Flagship scene (Google Docs OAuth worm) | <http://127.0.0.1:4173/desktop.html?profile=network-abuse-abyss> |
| Windows 11 shell alone | <http://127.0.0.1:4189/previews/win11-final/index.html> |
| macOS shell alone | <http://127.0.0.1:4189/previews/macos-final/index.html> |
| Both shells side by side | <http://127.0.0.1:4189/> |

The launcher prints the same list with the ports in use.

## Other ports

```sh
PORT=4461 SHELLS_PORT=4462 node tools/start-desktops.mjs          # bash
set PORT=4461& set SHELLS_PORT=4462& node tools\start-desktops.mjs  # cmd
```

Ports must be 1024–65535 and differ. The comparison server only lets `127.0.0.1:4173` frame the shells, so on another app port the launcher rewrites that origin in the shells' `Content-Security-Policy` header to the app origin in use (header only, as `tools/e2e` does).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Desktop is blank, or shell URLs return `Not found` | A server started before the last shell build is still running. The comparison server reads its file list once at start, so new build files 404. Run the launcher again; it restarts a stale project server. If you started `node server.mjs` by hand, stop it with Ctrl+C in its window. |
| `Launch refused` naming a PID | Another program holds the port. Close it, or use other ports (above). The launcher never stops non-project processes. |
| `Ports … are still in use after stopping the stale server` | The old process did not exit in 8 s. Check the PID in Task Manager, then run again. |
| `Smoke check failed` | The listed URL failed. A shell 404 means the build output is missing: rebuild that shell (below). A world failure means `data/desktop-world-seed.json` or a profile overlay is invalid. |
| Page still old after a restart | The browser kept the old page. Hard-refresh: Ctrl+Shift+R (Windows), Cmd+Shift+R (macOS). Responses are `no-store`, but an open tab keeps its loaded scripts. |

## Rebuild a shell

Rebuild, then run the launcher again so the server reloads the file list.

| Shell | Command | Output |
|---|---|---|
| Windows 11 | `cd desktop-comparison/win11-final && npm run build` | `desktop-comparison/previews/win11-final/` |
| macOS | `node desktop-comparison/make-macos-final.mjs` | `desktop-comparison/previews/macos-final/` |

Edits to files in the `buildId` are detected: run the launcher again and it restarts the server. `data/desktop-world-seed.json` and `data/desktop-profiles/*` are read per request and need nothing. `data/ocean-selection.json` and `data/personas.json` load at start but are **not** in the `buildId`: after editing them, stop the server with Ctrl+C and start it again.

## Checks

```sh
node --test tests/desktops-launcher.test.mjs   # launcher detection logic, mock listeners, in-process start on free ports
node --test tests/*.test.mjs
node tools/e2e/desktops-e2e.mjs                # own ports 4370/4371
```

## Launcher work notes

GOAL: the desktops never show nothing because of a stale server; the launcher says what it did and where to look.

DONE WHEN: launcher tests pass; a real run against a deliberately stale server on test ports restarts it and the smoke check passes; `node --test tests/*.test.mjs` and `node tools/e2e/desktops-e2e.mjs` stay green.

Status: done. Real runs on ports 4461/4462: an older-build project server was stopped and replaced, a pre-`/api/health` `node server.mjs` was replaced, a current server was reused, and a foreign node listener was refused. The live 4173/4189 server was not touched.
