// Optional local-only bridge smoke for the two full-baseline desktop forks.
// MAC_FORK_DIR, WINDOWS_FORK_DIST, PLAYWRIGHT_CORE and CHROME_PATH point to local reviewed artifacts.
// Does not copy files into this project, mutate a world on disk or contact an external service.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createComparisonServer } from '../../desktop-comparison/server.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const seed = JSON.parse(readFileSync(new URL('../../data/desktop-world-seed.json', import.meta.url), 'utf8'));
const roots = {
  macos: resolve(process.env.MAC_FORK_DIR || resolve(root, '../../Software/Desktop/macOS/dist')),
  windows: resolve(process.env.WINDOWS_FORK_DIST || resolve(root, '../../Software/Desktop/Windows/dist')),
};
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const paths = { macos: '/previews/macos-final/', windows: '/previews/win11-final/' };
const server = createComparisonServer({ shellRoots: roots });

await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const external = [], errors = [];
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue()
    : (external.push(route.request().url()), route.abort()));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route(`${origin}/test`, route => route.fulfill({ contentType: 'text/html', body:
    ['macos', 'windows'].map(name => `<iframe id="${name}" sandbox="allow-scripts" src="${paths[name]}index.html?oceanShell=1" style="width:1440px;height:900px;border:0"></iframe>`).join('') }));
  await page.goto(`${origin}/test`);
  const frames = Object.fromEntries(['macos', 'windows'].map(name => [name, page.frames().find(frame => frame.url().includes(paths[name]))]));
  for (const [name, frame] of Object.entries(frames)) {
    assert.ok(frame, `${name}: candidate frame loaded`);
    await frame.waitForFunction(() => Boolean(window.OceanWorldAdapter), null, { timeout: 20_000 });
  }
  const ready = await page.evaluate(async () => {
    window.forkPorts = {}; window.forkIntents = [];
    const results = [];
    for (const name of ['macos', 'windows']) {
      const channel = new MessageChannel();
      const response = await new Promise((done, reject) => {
        const timer = setTimeout(() => reject(Error(`${name} did not answer v3 attach`)), 10_000);
        channel.port1.onmessage = ({ data }) => {
          if (data?.type === 'ready') { clearTimeout(timer); done(data); }
          else window.forkIntents.push({ name, data });
        };
        channel.port1.start();
        document.getElementById(name).contentWindow.postMessage({ type: 'ocean-shell-attach', version: 3 }, '*', [channel.port2]);
      });
      window.forkPorts[name] = channel.port1;
      results.push(response);
    }
    return results;
  });
  for (const [index, name] of ['macos', 'windows'].entries()) {
    assert.equal(ready[index].shell, name);
    assert.equal(ready[index].version, 3);
    assert.deepEqual(new Set(ready[index].apps), new Set(seed.installed));
  }
  const apply = world => page.evaluate(value => {
    for (const port of Object.values(window.forkPorts)) port.postMessage({ type: 'world', version: 3, revision: value.revision, world: value });
  }, world);
  const snapshot = async frame => frame.evaluate(() => window.OceanWorldAdapter.snapshot());
  await apply(seed);
  await page.waitForTimeout(500);
  const before = await Promise.all([snapshot(frames.macos), snapshot(frames.windows)]);
  assert.equal(before[0].phase, 'lock'); assert.equal(before[1].phase, 'lock');
  await frames.macos.getByText('Click to log in').click();
  await page.waitForFunction(() => window.forkIntents.some(item => item.name === 'macos' && item.data?.intent?.kind === 'set-phase'));
  const intent = await page.evaluate(() => window.forkIntents.find(item => item.name === 'macos' && item.data?.intent?.kind === 'set-phase').data);
  assert.deepEqual({ kind: intent.intent.kind, phase: intent.intent.phase, revision: intent.revision }, { kind: 'set-phase', phase: 'desktop', revision: 0 });
  await apply({ ...seed, phase: 'desktop', revision: 1 });
  await page.waitForTimeout(500);
  const after = await Promise.all([snapshot(frames.macos), snapshot(frames.windows)]);
  for (const world of after) {
    assert.equal(world.phase, 'desktop');
    assert.equal(world.user.name, seed.user.name);
    assert.deepEqual(world.fs, after[0].fs);
    assert.deepEqual(world.data.mail, after[0].data.mail);
  }
  assert.deepEqual({ external, errors }, { external: [], errors: [] });
  console.log('Fork candidates: 21-app v3 ready, shared lock/sign-in world, validated intent and no external requests or page errors. Full parity not tested.');
  await context.close();
} finally {
  await browser?.close();
  server.closeAllConnections?.();
  await new Promise(done => server.close(done));
}
