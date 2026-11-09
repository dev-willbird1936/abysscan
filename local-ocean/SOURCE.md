# Local ocean desktop — launcher source

`start.bat` runs `tools/start-local-ocean.mjs`, which loads this durable runtime directly from source and serves `http://127.0.0.1:4188/desktop.html`.

- Canonical ocean UI: `local-ocean/ui/desktop/{index.html,desktop.css,desktop.js}`. Future ocean edits belong here; restart the launcher to load updated JavaScript/backend modules.
- The launcher does not use temporary directories, generated builds or health-check reuse of an older server. An occupied port is refused without stopping any other process. Close the previous ocean server window before restarting.
- Keep the console open. Ctrl+C ends this owned local server and disposes synthetic sessions.
- All inherited `VULTR_*` settings are removed before loading the server. Container execution is disabled. This is local synthetic training, not a VM or Vultr deployment.
- This runtime was copied from the reviewed ocean snapshot. It contains server/build-module imports, backend/data and desktop files with 21 integrity-pinned passive SVGs. `build.mjs` is retained for its imported registration function; the launcher never executes a build.
- No externally managed gallery/vendor files or generated homepage were copied or overwritten. The older gallery remains separate; this launcher opens the standalone ocean desktop.
- `previous-start.bat` preserves the launcher before this change for manual rollback. It is not used by the ocean launcher.

Checks: `node --test tests/local-ocean-launcher.test.mjs`.
