// Standalone check for the final macOS shell: no parent attaches, so the shell runs the bundled seed world with
// OceanWorldModel. Uses real pointer and keyboard input inside a sandbox="allow-scripts" iframe with every
// non-loopback request aborted. Screenshots go to docs/desktop-parity/screens/final-mac-standalone-*.png.
//   node desktop-comparison/previews/macos-final/check/standalone.mjs [port 4340-4349]
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../../../..');
const screens = path.join(project, 'docs/desktop-parity/screens');
const port = Number(process.argv[2] ?? 4343);
if (!Number.isInteger(port) || port < 4340 || port > 4349) throw Error('Use a port from 4340 to 4349.');
const require = createRequire(path.join(process.env.PW_CORE_DIR ?? 'C:/Temp/pw-kimi', 'package.json'));
const { chromium } = require('playwright-core');
const { createComparisonServer } = await import(pathToFileURL(path.join(project, 'desktop-comparison/server.mjs')).href);

const server = createComparisonServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? 'C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aborted = [];
  await context.route(url => !url.href.startsWith(base) && !/^(data:|about:|blob:)/.test(url.href), route => { aborted.push(route.request().url()); route.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${base}/__host.html`, route => route.fulfill({ contentType: 'text/html',
    body: `<body style="margin:0"><iframe id="shell" sandbox="allow-scripts" src="${base}/previews/macos-final/index.html" style="width:100vw;height:100vh;border:0"></iframe></body>` }));
  await page.goto(`${base}/__host.html`);
  await page.waitForTimeout(2000);
  const frame = page.frames().find(item => item.url().includes('/previews/macos-final/'));
  const world = () => frame.evaluate(() => OceanWorldAdapter.world);
  const native = () => frame.evaluate(() => ({ phase: __macos27.phase.getState().phase, mc: __macos27.wins.getState().missionControl,
    windows: Object.values(__macos27.wins.getState().windows).map(win => win.appId) }));

  check('standalone mode with the seed world', (await frame.evaluate(() => OceanWorldAdapter.mode)) === 'standalone' && (await world()).phase === 'lock');
  check('no Siri, no screenshot entry points', await frame.evaluate(() => !document.querySelector('[aria-label="Siri"]') && !document.body.innerText.includes('Take Screenshot')));
  await page.screenshot({ path: path.join(screens, 'final-mac-standalone-lock.png') });
  check('lock screen shows the world user', (await frame.evaluate(() => document.body.innerText)).includes('Alex Rivera'));

  await page.mouse.click(720, 600);
  await page.waitForTimeout(1800);
  check('click to log in reaches the desktop through the world model', (await world()).phase === 'desktop' && (await native()).windows.length === 0, JSON.stringify(await native()));

  // Desktop layer: right-click on blank desktop opens the desktop menu; double-click a desktop icon opens the file.
  await page.mouse.click(1300, 700, { button: 'right' });
  await page.waitForTimeout(500);
  const menuText = await frame.evaluate(() => document.body.innerText);
  check('desktop context menu opens (overlay bug fixed)', menuText.includes('New Folder') && menuText.includes('Change Wallpaper'));
  await page.screenshot({ path: path.join(screens, 'final-mac-standalone-context-menu.png') });
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 700);
  await page.waitForTimeout(300);
  await frame.getByText('Welcome.txt', { exact: true }).dblclick();
  await page.waitForTimeout(1500);
  const afterOpen = await world();
  check('double-clicking a desktop file opens TextEdit as a world window', afterOpen.windows.some(win => win.app === 'texteditor'), afterOpen.windows.map(win => win.id).join(','));

  // Desktop New Folder: a native fs change becomes an fs intent and lands in the world.
  await page.mouse.click(1300, 700, { button: 'right' });
  await page.waitForTimeout(400);
  await frame.getByText('New Folder', { exact: true }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const folders = Object.values((await world()).fs.nodes).filter(node => node.parentId === 'desktop' && node.kind === 'folder').map(node => node.name);
  check('New Folder on the desktop is written to the world fs', folders.includes('untitled folder'), folders.join(', '));
  const icons = await frame.evaluate(() => [...document.querySelectorAll('[code-path^="src/os/components/Desktop.tsx:114"]')].map(node => {
    const rect = node.getBoundingClientRect();
    return { name: node.textContent, x: rect.x, y: rect.y };
  }));
  const overlapping = icons.filter((a, i) => icons.some((b, j) => j > i && Math.abs(a.x - b.x) < 60 && Math.abs(a.y - b.y) < 60));
  check('desktop icons do not overlap', overlapping.length === 0, icons.map(icon => `${icon.name}@${Math.round(icon.x)},${Math.round(icon.y)}`).join(' '));

  // Shortcuts that were shadowed in the original: ⌃↑ Mission Control and ⌃⌘Q lock.
  await page.keyboard.press('Control+ArrowUp');
  await page.waitForTimeout(800);
  check('⌃↑ opens Mission Control', (await native()).mc === 'all' && (await world()).overlays.taskView === true);
  await page.screenshot({ path: path.join(screens, 'final-mac-standalone-mission-control.png') });
  await page.keyboard.press('Control+ArrowUp');
  await page.waitForTimeout(500);
  await page.keyboard.press('Shift+Meta+Digit3');
  await page.waitForTimeout(300);
  check('⇧⌘3 takes no screenshot', !(await frame.evaluate(() => document.body.innerText.includes('Screenshot'))));
  await page.keyboard.press('Control+Meta+KeyQ');
  await page.waitForTimeout(900);
  check('⌃⌘Q locks the screen and keeps the windows', (await world()).phase === 'lock' && (await world()).windows.length > 0, (await world()).phase);
  await page.mouse.click(720, 600);
  await page.waitForTimeout(1800);

  // Scene gating shared with Windows: gestures are scene choices only while the highlight points at them.
  const setWorld = patch => frame.evaluate(patch => {
    const next = { ...OceanWorldAdapter.world, ...patch, data: { ...OceanWorldAdapter.world.data, ...(patch.data ?? {}) }, revision: OceanWorldAdapter.world.revision + 1 };
    OceanWorldAdapter.apply(next, OceanWorldAdapter.world);
  }, patch);
  const seen = async action => {
    await frame.evaluate(() => { window.__seen = []; window.__stopSeen?.(); window.__stopSeen = OceanWorldAdapter.onIntent(intent => window.__seen.push(intent)); });
    await action();
    await page.waitForTimeout(700);
    return frame.evaluate(() => window.__seen);
  };
  const choicesOf = intents => intents.filter(intent => intent.kind === 'scene-choice').map(intent => intent.choiceId);
  await setWorld({ windows: [], order: [], focusedId: null, scene: { phase: 'action', stepId: 'task', highlight: { app: 'files', ref: 'f-welcome' } },
    data: { updates: [{ id: 'u-1', title: 'Vendor Utility 4.2', kb: 'KB0042', size: '38 MB', status: 'available', choiceId: 'download' }],
      processes: [{ id: 'p-1', name: 'updater-helper', cpu: 31, mem: 140, publisher: 'Unknown', suspicious: true, endChoice: 'release' }, { id: 'p-2', name: 'vendor-agent', cpu: 2, mem: 60 }],
      alarms: [{ id: 'a-1', time: '07:30', label: 'Wake', enabled: true }] } });
  await page.waitForTimeout(600);
  let intents = await seen(() => frame.locator('[code-path^="src/os/components/Desktop.tsx:114"]', { hasText: 'Welcome.txt' }).dblclick());
  check('gating: opening the highlighted desktop file is run-file', choicesOf(intents).includes('run-file'), intents.map(i => i.kind + (i.choiceId ? ':' + i.choiceId : '')).join(','));
  intents = await seen(() => frame.evaluate(() => window.__oceanOpenAttachment('m-budget', 'f-budget')));
  check('gating: an attachment that is not highlighted is not a choice', !choicesOf(intents).includes('download') && intents.some(i => i.kind === 'open-app'), intents.map(i => i.kind).join(','));
  intents = await seen(() => frame.evaluate(() => __macos27.fs.getState().toTrash('f-welcome')));
  check('gating: trashing the highlighted file is delete', choicesOf(intents).includes('delete') && intents.some(i => i.kind === 'fs' && i.op === 'trash'));
  intents = await seen(() => frame.evaluate(() => __macos27.clock.getState().updateAlarm('a-1', { enabled: false })));
  check('alarms: the world alarm is native (07:30) and edits become alarms upserts', intents.some(i => i.kind === 'data' && i.store === 'alarms' && i.item.time === '07:30' && i.item.enabled === false));
  intents = await seen(() => frame.evaluate(() => {
    const sim = __macos27.processes();
    for (const name of ['updater-helper', 'vendor-agent']) sim.kill(sim.procs.find(proc => proc.name === name && !proc.dead).pid);
  }));
  const denied = await frame.evaluate(() => __macos27.notify.getState().history.some(item => item.title === 'Access is denied'));
  check('processes: End on a scene process sends its endChoice; one without endChoice is denied', choicesOf(intents).join() === 'release' && denied, choicesOf(intents).join());
  await setWorld({ scene: { phase: 'action', stepId: 'update', highlight: { app: 'updates', ref: null } } });
  await frame.evaluate(() => OceanWorldAdapter.apply(OceanWorldModel.applyIntent(OceanWorldAdapter.world, { kind: 'open-app', app: 'updates' }, Date.now()).world, OceanWorldAdapter.world));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(screens, 'final-mac-standalone-software-update.png') });
  intents = await seen(async () => {
    await frame.getByText('Check Now', { exact: true }).click();
    await page.waitForTimeout(300);
    await frame.getByText('Install', { exact: true }).click();
  });
  const installed = await frame.evaluate(() => OceanWorldAdapter.world.data.updates[0].status);
  check('updates: Check Now is check-updates while highlighted; Install sets installed and sends the item choice', choicesOf(intents).join() === 'check-updates,download' && installed === 'installed', choicesOf(intents).join());
  await setWorld({ scene: { phase: 'action', stepId: 'page', highlight: { app: 'browser', ref: null } },
    data: { web: { pages: { 'it-portal': { title: 'IT portal', url: 'https://it.northwind.example/reset', body: 'Reset your password here.', choices: [{ label: 'Reset', choiceId: 'sign-in' }] } } } } });
  await frame.evaluate(() => OceanWorldAdapter.apply(OceanWorldModel.applyIntent(OceanWorldAdapter.world, { kind: 'open-app', app: 'browser', payload: { url: 'scene:it-portal' } }, Date.now()).world, OceanWorldAdapter.world));
  await page.waitForTimeout(1500);
  intents = await seen(() => frame.locator('[role=dialog][aria-label="IT portal"] button[aria-label="Close"]').first().click());
  check('gating: closing the highlighted scene page is close-tab', choicesOf(intents).includes('close-tab') && intents.some(i => i.kind === 'close-window'), intents.map(i => i.kind + (i.choiceId ? ':' + i.choiceId : '')).join(','));
  await frame.evaluate(() => OceanWorldAdapter.apply(OceanWorldModel.applyIntent(OceanWorldAdapter.world, { kind: 'open-app', app: 'taskmanager' }, Date.now()).world, OceanWorldAdapter.world));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screens, 'final-mac-standalone-activity-monitor.png') });
  const amText = await frame.evaluate(() => document.body.innerText);
  check('Activity Monitor lists the scene processes', amText.includes('updater-helper'), `vendor-agent ${amText.includes('vendor-agent')}`);

  // Dynamic config without a reload: the world changes wallpaper, theme and installed apps.
  await frame.evaluate(() => {
    const next = OceanWorldModel.applyIntent(OceanWorldAdapter.world, { kind: 'set-sys', patch: { theme: 'light', wallpaper: 'depth-twilight' } }, Date.now()).world;
    OceanWorldAdapter.apply(OceanWorldModel.applyIntent(next, { kind: 'uninstall', app: 'stickies' }, Date.now()).world, OceanWorldAdapter.world);
  });
  await page.waitForTimeout(1200);
  const live = await frame.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), wallpaper: __macos27.sys.getState().wallpaper,
    stickies: __macos27.installed().some(entry => entry.id === 'stickies') }));
  check('world change applies live (theme, depth wallpaper, uninstall)', live.theme === 'light' && live.wallpaper.endsWith('depth-twilight.svg') && !live.stickies, JSON.stringify(live));
  await page.screenshot({ path: path.join(screens, 'final-mac-standalone-desktop.png') });

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
