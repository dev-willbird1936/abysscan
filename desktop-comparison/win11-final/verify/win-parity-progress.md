# win-parity progress (Windows matches the macOS standard)

## GOAL

Fully synced state across the two desktops with macOS as the standard: every app feature and shell feature a trainee or scene can see or change on macOS exists on Windows in Windows idiom, and its content lives in the shared world so it looks the same after an OS switch. Culled apps stay culled.

## DONE WHEN

| Criterion | Status | Evidence |
|---|---|---|
| Gap table shows every row closed or justified | Met | `docs/desktop-parity/PARITY.md` "macOS-standard gap table": every row closed except 3 justified (Notepad rich text, Notes body formatting, Task view thumbnails) |
| `npm run verify` green | Met | shell 44/44, taskbar all pass, apps 63/63, sync 68/68, winpol 28/28 (plus the scene suite another owner added) |
| All new synced stores bound | Met | `data.browser`, `media`, `photos`, `whiteboard`, `calculator`, `clock`, `terminal`, `stickies`, the optional item fields and the new `sys` keys are read from the world and changed only with intents (`src/ocean/synced.js`); the local fallback slice was deleted once the model accepted the stores |
| Generic sync proof (user direction: 60 scenarios, no per-scenario sync code) | Met | `OceanWorldAdapter.snapshot()` reads rendered state; `verify/roundtrip.mjs` passes on generated worlds, including a negative DOM check |
| Screenshots inspected | Met | `docs/desktop-parity/screens/final-winsync-*.png` |

## Notes

- Shapes follow `docs/desktop-parity/requests/sync-model-ready.md` (it superseded `win-parity-to-sync-model.md`). Its final contract keeps sticky text and note bodies plain, so Windows dropped the bold rendering in Sticky Notes and the Notes formatting ribbon it had built against the draft.
- The model clears browser tabs while no browser window exists; Edge shows a window's `{url}` payload until the world has a tab for it, then adds the tab with `set-tabs`.
- The adapter now sets the body data attributes before dispatching the world, so window frames read the auto-hide work area in the same render.
- Run suites on a free port (`VERIFY_PORT=4384`) when another worker holds 4380.
