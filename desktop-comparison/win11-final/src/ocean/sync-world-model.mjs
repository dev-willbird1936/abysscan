// Vendors the parent's world model and seed into the Windows build so standalone mode applies
// intents with the same implementation as the parent. Run: node src/ocean/sync-world-model.mjs
// (from desktop-comparison/win11-final). Pass --check to fail when the copies are stale.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "../../../..");
const pairs = [
  [resolve(project, "ui/desktop/world-model.js"), resolve(here, "world-model.js")],
  [resolve(project, "ui/desktop/program-ui.js"), resolve(here, "program-ui.js")],
  [resolve(project, "data/desktop-world-seed.json"), resolve(here, "../containers/applications/apps/ocean/world-seed.json")],
];
const check = process.argv.includes("--check");
let stale = 0;
for (const [from, to] of pairs) {
  const src = readFileSync(from, "utf8");
  let cur = null;
  try {
    cur = readFileSync(to, "utf8");
  } catch {}
  if (cur === src) continue;
  stale += 1;
  if (check) console.error(`stale: ${to}`);
  else writeFileSync(to, src), console.log(`updated: ${to}`);
}
if (check && stale) process.exit(1);
