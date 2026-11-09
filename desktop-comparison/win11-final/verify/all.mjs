// Runs every check against the production build: vendored world model/seed freshness, then
// the shell, taskbar, apps, sync (macOS-standard features and synced stores) and polish-check suites. Exit code 1 when any step fails.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const steps = [
  ["world model + seed copies", "../src/ocean/sync-world-model.mjs", "--check"],
  ["shell suite", "shell.mjs"],
  ["taskbar suite", "taskbar.mjs"],
  ["apps suite", "apps.mjs"],
  ["sync suite", "sync.mjs"],
  ["round trip (snapshot = normalise)", "roundtrip.mjs"],
  ["polish checks", "winpol.mjs"],
  ["scene suite", "scene.mjs"],
];
let failed = 0;
for (const [name, script, ...args] of steps) {
  const { status } = spawnSync(process.execPath, [resolve(here, script), ...args], { stdio: "inherit" });
  console.log(`== ${name}: ${status === 0 ? "ok" : "FAILED"}`);
  if (status !== 0) failed++;
}
process.exitCode = failed ? 1 : 0;
