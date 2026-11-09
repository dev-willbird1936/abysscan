// Generic sync proof for the Windows shell (WORLD-CONTRACT §3.1): generated valid worlds round-trip through it.
// A v3 parent pushes each world from previews/macos-final/check/world-gen.mjs (shell-neutral) into the production
// build in <iframe sandbox="allow-scripts">, applies any intents the shell sends (as the real parent does), and
// waits until OceanWorldAdapter.snapshot() deep-equals OceanWorldModel.normalise(parent world). No scenario- or
// store-specific code: a failure prints the first differing paths and the seed to replay.
//   node verify/roundtrip.mjs [worlds, default 12] [first seed, default 1]
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ORIGIN, PROJECT, guard, launch, makeChecks, startServer } from "./lib.mjs";

const count = Number(process.argv[2] || 12);
const firstSeed = Number(process.argv[3] || 1);
const WM = createRequire(import.meta.url)(join(PROJECT, "ui/desktop/world-model.js"));
const { generateWorld } = await import(pathToFileURL(join(PROJECT, "desktop-comparison/previews/macos-final/check/world-gen.mjs")).href);
const seedWorld = JSON.parse(readFileSync(join(PROJECT, "data/desktop-world-seed.json"), "utf8"));
const profileDir = join(PROJECT, "data/desktop-profiles");
const profiles = readdirSync(profileDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(profileDir, f), "utf8")));
const modelSource = readFileSync(join(PROJECT, "ui/desktop/world-model.js"), "utf8");

// Paths where two canonical values differ (at most `max`).
function differences(a, b, at = "", out = [], max = 6) {
  if (out.length >= max || JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${at}/${key}`, out, max);
  } else out.push(`${at}: shell ${JSON.stringify(a)?.slice(0, 90)} vs world ${JSON.stringify(b)?.slice(0, 90)}`);
  return out;
}

const { check, summary } = makeChecks();
const blocked = [];
const errors = [];
const server = await startServer();
const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await guard(context, blocked);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${ORIGIN}/__roundtrip.html`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body style="margin:0;background:#000">
<iframe id="shell" sandbox="allow-scripts" src="${ORIGIN}/app/index.html?oceanShell=1" style="width:100vw;height:100vh;border:0"></iframe>
<script src="${ORIGIN}/__model.js"></script>
<script>
window.ready = false;
let world = null;
let port = null;
document.getElementById('shell').addEventListener('load', (event) => {
  const channel = new MessageChannel();
  port = channel.port1;
  port.onmessage = (message) => {
    if (message.data && message.data.type === 'ready') window.ready = true;
    const parsed = OceanWorldModel.parseIntentMessage(message.data);
    if (!parsed || !world) return;
    const result = OceanWorldModel.applyIntent(world, parsed.intent, Date.now());
    if (result.changed) window.pushWorld(result.world);
  };
  event.target.contentWindow.postMessage({ type: 'ocean-shell-attach', version: 3 }, '*', [channel.port2]);
});
window.pushWorld = (next) => { world = next; port.postMessage({ type: 'world', version: 3, revision: next.revision, world: next }); };
window.currentWorld = () => world;
</script></body>`,
    }),
  );
  await page.route(`${ORIGIN}/__model.js`, (route) => route.fulfill({ contentType: "text/javascript", body: modelSource }));
  await page.goto(`${ORIGIN}/__roundtrip.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const frame = page.frames().find((f) => f.url().includes("/app/index.html"));
  check("adapter exposes snapshot()", await frame.evaluate(() => typeof window.OceanWorldAdapter.snapshot === "function"));

  let previous = null;
  for (let n = 0; n < count; n += 1) {
    const seed = firstSeed + n;
    // Every third world starts fresh from the seed (with a profile overlay on odd runs); the others continue from
    // the parent's current world, so full replacements and incremental changes are both covered.
    const fresh = n % 3 === 0 || !previous;
    const start = fresh ? WM.createWorld(seedWorld, profiles.length && n % 2 ? profiles[n % profiles.length] : undefined) : previous;
    const generated = generateWorld(WM, start, seed, 40);
    const world = { ...generated, revision: ((previous && previous.revision) || 0) + 1 + generated.revision };
    if (!WM.validate(world).ok) throw Error(`seed ${seed}: generator produced an invalid world (${WM.validate(world).error})`);
    await page.evaluate((next) => window.pushWorld(next), world);
    let diff = [];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await page.waitForTimeout(attempt ? 500 : 1500);
      const [shown, current] = await Promise.all([frame.evaluate(() => window.OceanWorldAdapter.snapshot()), page.evaluate(() => window.currentWorld())]);
      diff = differences(shown, WM.normalise(current));
      previous = current;
      if (diff.length === 0) break;
    }
    check(`seed ${seed} (${fresh ? "fresh" : "continued"}, ${world.windows.length} windows): snapshot equals normalise(world)`, diff.length === 0, diff.join(" | "));
  }
  // The snapshot reads what is rendered: detaching a window frame from the DOM must show up as a difference.
  const detached = await frame.evaluate(() => {
    const el = document.querySelector(".oceanWin[data-win-id]");
    if (!el) return null;
    const before = JSON.stringify(window.OceanWorldAdapter.snapshot().windows);
    const parent = el.parentNode;
    const next = el.nextSibling;
    el.remove();
    const after = JSON.stringify(window.OceanWorldAdapter.snapshot().windows);
    parent.insertBefore(el, next);
    return before !== after;
  });
  if (detached !== null) check("snapshot reflects the rendered DOM, not a copy of the world", detached);
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("zero non-loopback requests", blocked.length === 0, blocked.slice(0, 3).join(", "));
} finally {
  await browser.close();
  server.close();
}
process.exitCode = summary("roundtrip") ? 1 : 0;
