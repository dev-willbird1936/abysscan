// Generic sync proof for the macOS shell: generated valid worlds round-trip through it.
// A v3 parent (like world-ab.mjs) pushes each world from check/world-gen.mjs into previews/macos-final in a
// sandbox="allow-scripts" iframe and waits until OceanWorldAdapter.snapshot() equals OceanWorldModel.normalise() of the
// parent's world (the parent applies any intents the shell sends meanwhile, as the real parent does). No scenario- or
// store-specific code: a failure prints the first differing paths and the seed to replay.
//   node desktop-comparison/previews/macos-final/check/roundtrip.mjs [port 4340-4349] [worlds, default 12] [seed, default 1]
// Needs playwright-core (PW_CORE_DIR, default C:/Temp/pw-kimi) and Chromium (CHROMIUM_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateWorld } from './world-gen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../../../..');
const port = Number(process.argv[2] ?? 4345);
const count = Number(process.argv[3] ?? 12);
const firstSeed = Number(process.argv[4] ?? 1);
if (!Number.isInteger(port) || port < 4340 || port > 4349) throw Error('Use a port from 4340 to 4349.');
const require = createRequire(path.join(process.env.PW_CORE_DIR ?? 'C:/Temp/pw-kimi', 'package.json'));
const { chromium } = require('playwright-core');
const WM = createRequire(import.meta.url)(path.join(project, 'ui/desktop/world-model.js'));
const { createComparisonServer } = await import(pathToFileURL(path.join(project, 'desktop-comparison/server.mjs')).href);
const seedWorld = JSON.parse(fs.readFileSync(path.join(project, 'data/desktop-world-seed.json'), 'utf8'));
const profiles = fs.readdirSync(path.join(project, 'data/desktop-profiles')).filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(fs.readFileSync(path.join(project, 'data/desktop-profiles', file), 'utf8')));

// Paths where two canonical values differ (at most `max`).
function differences(a, b, at = '', out = [], max = 6) {
  if (out.length >= max || JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${at}/${key}`, out, max);
  } else {
    out.push(`${at}: shell ${JSON.stringify(a)?.slice(0, 90)} vs world ${JSON.stringify(b)?.slice(0, 90)}`);
  }
  return out;
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const server = createComparisonServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'],
  executablePath: process.env.CHROMIUM_PATH ?? 'C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aborted = [];
  await context.route(url => !url.href.startsWith(base) && !/^(data:|about:|blob:)/.test(url.href), route => { aborted.push(route.request().url()); route.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${base}/__ocean-parent.html`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0;background:#000">
<iframe id="shell" sandbox="allow-scripts" src="${base}/previews/macos-final/index.html" style="width:100vw;height:100vh;border:0"></iframe>
<script src="${base}/previews/macos-final/world-model.js"></script>
<script>
window.ready = false;
let world = null;
let port = null;
document.getElementById('shell').addEventListener('load', event => {
  const channel = new MessageChannel();
  port = channel.port1;
  port.onmessage = message => {
    if (message.data?.type === 'ready') window.ready = true;
    const parsed = OceanWorldModel.parseIntentMessage(message.data);
    if (!parsed || !world) return;
    const result = OceanWorldModel.applyIntent(world, parsed.intent, Date.now());
    if (result.changed) window.pushWorld(result.world);
  };
  event.target.contentWindow.postMessage({ type: 'ocean-shell-attach', version: 3 }, '*', [channel.port2]);
});
window.pushWorld = next => { world = next; port.postMessage({ type: 'world', version: 3, revision: next.revision, world: next }); };
window.currentWorld = () => world;
</script></body>` }));
  await page.goto(`${base}/__ocean-parent.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const frame = page.frames().find(item => item.url().includes('/previews/macos-final/'));
  check('adapter exposes snapshot()', await frame.evaluate(() => typeof OceanWorldAdapter.snapshot === 'function'));

  let previous = null;
  for (let n = 0; n < count; n += 1) {
    const seed = firstSeed + n;
    // Every third world starts fresh from the seed (with a profile overlay when one exists); the others continue
    // from the parent's current world, so both full replacements and incremental changes are covered.
    const fresh = n % 3 === 0 || !previous;
    const start = fresh ? WM.createWorld(seedWorld, profiles.length && n % 2 ? profiles[n % profiles.length] : undefined) : previous;
    const generated = generateWorld(WM, start, seed, 40);
    const world = { ...generated, revision: (previous?.revision ?? 0) + 1 + generated.revision };
    if (!WM.validate(world).ok) throw Error(`seed ${seed}: generator produced an invalid world (${WM.validate(world).error})`);
    await page.evaluate(next => window.pushWorld(next), world);
    let diff = [];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await page.waitForTimeout(attempt ? 500 : 1500);
      const [shown, current] = await Promise.all([frame.evaluate(() => OceanWorldAdapter.snapshot()), page.evaluate(() => window.currentWorld())]);
      diff = differences(shown, WM.normalise(current));
      previous = current;
      if (diff.length === 0) break;
    }
    check(`seed ${seed} (${fresh ? 'fresh' : 'continued'}, ${world.windows.length} windows): snapshot equals normalise(world)`, diff.length === 0, diff.join(' | '));
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no external request left the sandbox', aborted.length === 0, aborted.slice(0, 3).join(', '));
} finally {
  await browser.close();
  server.closeAllConnections?.();
  server.close();
}
const failed = results.filter(item => !item.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
