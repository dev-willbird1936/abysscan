# Checks, builds and harnesses

`package.json` is the entry point. It has **no npm dependencies** — there is no
`node_modules` and nothing to `npm install`. The Node scripts run on a bare
checkout. The Python and browser scripts do have prerequisites; see
[Prerequisites](#prerequisites).

```sh
npm run check      # Node suite + all 59 scenes compile
```

Run that before handing work over. If you touched Python, run `npm run test:py`
too: `check` does not cover it.

## The gate

| Script | What it proves | Time |
|---|---|---|
| `npm run check` | `test` and `check:scenes` together, failing fast | 2–3 min |
| `npm run test` | 1122 Node tests across 83 files | 1.5 min warm, 2.6 min cold |
| `npm run check:scenes` | all 59 `.scene` files compile into valid desktop worlds | seconds |
| `npm run test:py` | 130 Python tests (static analysis, extractors, palettes) | ~40 s |
| `npm run test:portable` | the four files CI runs: release bytes and core logic | ~5 s |

`check` is the broadest single command, not a fast one, and it is **not
complete**: the 130 Python tests live in `test:py`, so a change under
`deploy/detonation/runner/` or `tools/*.py` can pass `check` without running its
own tests.

Node must be 22 or newer: the test scripts hand `"tests/*.test.mjs"` to Node as a
quoted literal and rely on Node's own glob expansion, because `cmd` cannot expand
it and `sh` would expand it inconsistently.

Tests that need Docker, gVisor, Wine or a browser **skip** rather than fail when
the dependency is absent, so a green run on a bare machine is not full coverage.
A clean Windows run reports `pass 1117, fail 0, skipped 5`. Live detonation
samples stay behind `DETONATION_LIVE_SAMPLES=1`, which is gated on the safety
amendment (`docs/safety-amendment-DRAFT.md`) — do not set it casually.

`npm run test:py` is noisy: ~2270 warnings, including an invalid `\o` escape in a
docstring at `deploy/detonation/runner/unpack.py:91` that wants an `r"""` prefix.

`test:portable` duplicates the file list in
`.github/workflows/source-checks.yml`. Nothing keeps the two in sync; change both.

## Prerequisites

| Scripts | Need |
|---|---|
| `test`, `check`, `check:scenes`, `check:quest`, `build*`, `start` | Node ≥ 22 only |
| `test:py` | `pytest`, and `Pillow` for the palette tests |
| `build:pixel-normals`, `build:lit-ocean`, `pixel` | `numpy`, `Pillow`, and the `spritefusion-sprite-normals` binary on `PATH` (see `AGENTS.md` for the cargo/MSVC build; the GNU toolchain fails on `dlltool`) |
| every `e2e:*` | `playwright-core` and a Chromium — see [End-to-end harnesses](#end-to-end-harnesses) |

## Builds

These **write into the working tree**. The tree often carries a large number of
uncommitted changes, so check `git status` before and after, and commit or stash
first if you need a clean diff.

| Script | When to run it |
|---|---|
| `npm run pixel` | after adding or changing any pixel PNG — normals, then the manifest |
| `npm run build:pixel-normals` | regenerate normal maps under `ui/abyss/pixel/normals/` |
| `npm run build:abyss-manifest` | refresh the abyss sprite manifest |
| `npm run build:lit-ocean` | re-light `ocean-style-prototypes/lit-ocean/` after a pipeline original changes |
| `npm run build` | site build (`build.mjs`) |
| `npm run build:macos` | rebuild the macOS shell from `make-macos-final.mjs` |

Every pixel sprite must have a normal map. A sprite without one logs
`pixel-lit: no normal map` and renders from a silhouette — treat that as a failed
check and run `npm run pixel`.

## End-to-end harnesses

These drive a real browser and are slow. Each one starts its own loopback
servers; none expects `npm start` to be running.

| Script | Covers | Time |
|---|---|---|
| `npm run e2e:desktops` | both shells, three scenes, mid-scene OS swap | minutes |
| `npm run e2e:scenes` | all 30 creature scenes, fell and safe paths (60 runs) | ~25 min |
| `npm run e2e:fish` | fish scenes; optional scene-name filters | minutes |
| `npm run e2e:guide` | guide steps answer real shell intents | minutes |
| `npm run e2e:quests` | every quest (`--lanes`, `--port` accepted) | long |
| `npm run e2e:sync` | world sync across an OS switch (`--random`, `--scenarios`) | long |
| `npm run e2e:site` | site completion sweep | minutes |
| `npm run e2e:scene-studio` | scene studio; set `E2E_SCENE_STUDIO=true` for navigation checks |
| `npm run e2e:threats` | threat search against mocked Parallel and inference: search, In the ocean badge, decline, confirm, the ocean show, then the new scene on the Windows desktop (screenshots to the OS temp dir) | ~3 min |

**Browser paths are machine-specific and must be set on any other machine.**
`PLAYWRIGHT_CORE` defaults to `C:/Temp/pw-kimi/node_modules/playwright-core`.
The `start()` harnesses fall back to Playwright's own Chromium when `CHROME_PATH`
is unset, but `e2e:scene-studio` in its default mode passes a hard-coded
`C:/Users/<you>/...` executable with no existence check
(`tools/e2e/scene-studio-e2e.mjs:23`), so set `CHROME_PATH` for it.

Two scripts need an argument and exit with a usage message without one:

```sh
npm run check:quest -- data/fish-scenes/zeus.scene
npm run e2e:quest   -- zeus both
```

`tools/e2e/README.md` documents the desktop harnesses, their ports and their
screenshot directories in detail. Two harnesses are deliberately absent from
`package.json`: `fork-candidates-smoke.mjs` needs fork builds from outside this
repo, and `ux-visual-overhaul-e2e.mjs` needs `UX_REVIEW_OUT` set.
`desktops-e2e-lib.mjs` and `assert-synced.mjs` are libraries, not harnesses.

## Keeping this honest

`tests/script-surface.test.mjs` fails if a `package.json` script names a file
that has been renamed or deleted, and if any `npm run X` named on this page is
not a real script. It does **not** verify the counts, timings or env-var names
above — re-measure those when you change them.
