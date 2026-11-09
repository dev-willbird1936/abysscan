# Scene Studio: one script, both desktops

Scene Studio is Abysscan's **authoring editor for guided desktop scenarios**, using the main app's shared pixel theme, Jersey font, navigation and beveled controls. It can run inside the gated Vultr app or as a standalone local tool. Write one `.scene` text file, validate it, and preview the same scene on Windows and macOS. No shell code, catalogue entry, JSON world patch or build is needed for each new script.

## Open it

Double-click `start-scene-studio.bat`, or run:

```sh
node tools/scene-studio.mjs
```

Open **http://127.0.0.1:4175/scene-studio**. The old root link redirects there. `SCENE_STUDIO_PORT` changes the standalone port when necessary. An occupied port is reported; the launcher does not stop other programs.

The editor mounts the complete fork builds from `<fork-checkout>/macOS/dist` and `<fork-checkout>/Windows/dist` when present. Otherwise it uses this checkout's existing previews. It does not copy over either build or stop the separate standalone desktop servers.

## Main-app / Vultr integration

The main Node service mounts `/scene-studio` when **`SCENE_STUDIO_ENABLED=true`**. The flag is off by default; no separate authoring process, proxy rule or public port is needed. When enabled, the main menu, Bestiary and About navigation include **Scene Studio**. The standalone launcher remains available independently.

Requirements:

- Desktop shells must be enabled. On production, set `DESKTOP_SHELLS_PUBLIC=true` and a valid `APP_PUBLIC_ORIGIN=https://<host>`. Missing prerequisites fail startup rather than serving a broken preview.
- Package the verified shell builds with the application. The developer's separate fork directories are not automatically present on Vultr.
- **Keep the existing Caddy login** on `/scene-studio`, `/scene-studio/*`, `/api/scene-studio/*` and `/api/desktop/guide`. Do not exempt these paths with the anonymous `/s/<token>/previews/` assets. Origin checks prevent cross-site authoring; they are not authentication.
- Authoring requests must reach the app through its loopback listener/reverse proxy and match the configured origin. Foreign and opaque origins cannot call authoring APIs.
- Enabling it does not enable cloud calls or script execution. The normal application's existing upload service remains separate.

See [the deployment checklist](../../deploy/vultr-vm/README.md#6a-optional-scene-studio-operator-only). This work prepares the source integration; it does not mean the feature is deployed at `demo.abysscan.com`.

## Workflow

1. Choose **Suspicious attachment**, **Files become locked**, or **Browser home page changes**, then **Load example**.
2. Edit the plain text. Use **Insert an action** for snippets and any of the 21 installed apps. Put the cursor inside a step, before the final lesson.
3. **Check script** validates commands, settings and every shared-world change. Errors identify the command's line where possible.
4. Choose the starting OS and press **Preview scene** (Ctrl/Command + Enter). Sign in. Use **Start / Next**, **Back**, **Show it all**, and the Windows/macOS switch. **Open full preview** gives the desktop a whole tab; the embedded desktop can scroll on small screens.
5. **Download .scene** keeps an exact reusable copy. **Open .scene** imports a file without uploading it to a filesystem. The current draft also survives reloads in this browser's local storage; download it for a durable backup.

Each preview is an immutable in-memory copy. Later edits do not change an already running preview. The server keeps its latest 20 preview links; restarting clears them. Downloaded scripts remain independent of that cache.

## A complete script

```text
title An unexpected invoice
os windows
user Alex Rivera
  email alex@northwind.example
theme dark

about
  | A fictional invoice arrives. This is an illustration, not a real malware run.

step The message arrives
  look Mail: the unexpected invoice
  | Check who sent an unexpected attachment before opening it.
mail invoice
  from Accounts <accounts@billing.example>
  subject Your invoice is ready
  attach Downloads/invoice.txt
  | Fictional training message. Please review the attachment.
open invoice

step A process appears
  look Task Manager or Activity Monitor
  | The attachment starts a suspicious process. The script only draws it in the simulation.
run invoice-helper
  cpu 68
  mem 140
block collector.invalid 443
open taskmanager

lesson
  | Contact the sender using details you already trust, not details from the message.
```

Rules:

- Commands start at column 0; indented `key value` and `| text` lines belong to the command above them. `#` starts a comment. LF, CRLF and a UTF-8 BOM are supported.
- `title`, `os`, `user`, `theme` are optional setup commands, each at most once and before `about`. `os` defaults to Windows; `theme` is `light` or `dark`. A user without an explicit email gets a fictional `.example` address. Setup is visible on the lock screen.
- `about` introduces the illustration. Each `step` requires a title, `look`, explanation and an actual world change. `lesson` must come last. At least one step is required.
- Content is declarative. **`run` adds a simulated process row; it never executes code.** `delete` and `encrypt` change only fictional world nodes. No operating-system files are read or changed by these commands.
- Use fictional mail/web domains ending in `.example` or `.invalid`. File arguments use paths such as `Documents/report.txt`; use filenames without spaces. Define a page before a mail message links to it.
- `open` accepts a mail/page id, a known folder, file path or any canonical app. See the full [command reference](FISH-SCENES.md).
- Scripts are limited to 64 KiB, 200 commands and 30 guide steps. Unknown settings, duplicate settings, missing values and invalid world changes are refused rather than silently ignored.

## Validate a downloaded file

```sh
node tools/scene-studio.mjs --check path/to/my-scenario.scene
```

Exit 0 means it compiles into valid shared desktop worlds. Exit 1 prints the authoring problem. No desktop, cloud operation or script process is started by this check.

## Scope and safety

This editor uses the existing guided-replay compiler and parent-owned world/guide. It is **not a JavaScript runner**, a real malware sandbox, or an editor for the separate 60-scenario interactive catalogue. Page buttons do not introduce branching; use the existing scenario engine for victim choices and safe/attack branches.

The standalone host binds only to `127.0.0.1`. Its authoring APIs require the local origin and JSON requests. Only allowlisted read-only shell assets accept opaque-origin iframe reads; the standalone host does not route uploads, sandbox execution, event publication or other application mutations. Main-app integration preserves the normal application's existing endpoints and uses its configured origin; authoring routes themselves never invoke execution. There is no server-side Save command: scripts leave through the browser's download action, not arbitrary filesystem writes.

The default main-app configuration does not expose Scene Studio endpoints. No live deployment, publication or environment change is implicit in creating or previewing a scene.

## HTTP API

All paths below use the same authorization/origin boundary as the editor. Mutating requests require `Content-Type: application/json`; their only accepted input key is `source`.

| Method and path | Input / output |
|---|---|
| `GET /scene-studio` | Editor; `/scene-studio/` also works. |
| `GET /scene-studio/help` | This guide, as plain text. |
| `GET /api/scene-studio/templates` | Starter scripts and command snippets. |
| `POST /api/scene-studio/validate` | `{ "source": "title ..." }` → `{ name, os, steps: [{ title, look }] }`; no preview allocated. |
| `POST /api/scene-studio/preview` | Same input → summary and an immutable `url` pointing to `/desktop.html?job=author-...&os=...`. |
| `GET /api/desktop/guide?run=author-...` | Compiled guide and validated initial world for an existing preview. |

Bad input returns 400/415/422 with `{ error, line? }`; denied origins return 403, unsupported methods 405 and expired/unknown previews 404. Source limit: 64 KiB; request-body limit: 128 KiB. There are at most 20 previews per service instance. Preview links are not durable storage and are not a replacement for the operator login.

## Verification

- `node --test tests/scene-studio.test.mjs`: compiler, all canonical apps, malformed/oversized input, immutable bounded previews, origin/host restrictions, read-only routes and production/cloud refusal.
- `node --test tests/scene-studio-integration.test.mjs`: main-app flag, shared theme/navigation, exact public-origin checks and missing deployment prerequisites.
- `node tools/e2e/scene-studio-e2e.mjs`: standalone browser workflow, shared theme, validation error, configured lock screen, Next/Back, OS switch, import/export, draft persistence, narrow layout and zero external requests.
- `E2E_SCENE_STUDIO=true node tools/e2e/scene-studio-e2e.mjs`: the same browser workflow through the actual main-app routes. Use `E2E_MACOS_SHELL_ROOT` and `E2E_WINDOWS_SHELL_ROOT` to choose the final fork artifacts, and separate parent/shell ports if needed. Screenshots go to a printed temporary directory.
- `node tools/check-fish-scenes.mjs`: all existing fish scenes still compile.
- `node tools/e2e/desktops-e2e.mjs`: existing desktop integration regression. Use the fork root environment variables described in FORK-REPLACEMENT.md.
