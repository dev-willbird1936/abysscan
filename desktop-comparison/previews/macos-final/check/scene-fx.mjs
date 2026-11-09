// Scene presentation proof for the final macOS shell: focus dimming (world.scene.focusApps), the creature in the desktop
// layer (world.scene.creature, six states), the lock screen (name, avatar, email, one click, no password field) and
// survival of an OS switch (a fresh shell given the same world draws the same picture).
// Loads previews/macos-final in a sandbox="allow-scripts" iframe under a v3 transport parent. Every non-loopback request is
// aborted. Screenshots go to docs/desktop-parity/screens/final-mac-scene-*.png.
//   node desktop-comparison/previews/macos-final/check/scene-fx.mjs [port 4340-4349]
// Needs playwright-core (PW_CORE_DIR, default C:/Temp/pw-kimi) and Chromium (CHROMIUM_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../../../..');
const screens = path.join(project, 'docs/desktop-parity/screens');
const port = Number(process.argv[2] ?? 4345);
if (!Number.isInteger(port) || port < 4340 || port > 4349) throw Error('Use a port from 4340 to 4349.');
const require = createRequire(path.join(process.env.PW_CORE_DIR ?? 'C:/Temp/pw-kimi', 'package.json'));
const { chromium } = require('playwright-core');
const WM = createRequire(import.meta.url)(path.join(project, 'ui/desktop/world-model.js'));
const { createComparisonServer } = await import(pathToFileURL(path.join(project, 'desktop-comparison/server.mjs')).href);

const seed = JSON.parse(fs.readFileSync(path.join(project, 'data/desktop-world-seed.json'), 'utf8'));
const NOW = Date.parse('2026-11-02T10:00:00Z');
const step = (world, ...intents) => intents.reduce((current, intent) => {
  const result = WM.applyIntent(current, intent, NOW);
  if (!result.ok) throw Error(`${intent.kind}: ${result.reason}`);
  return result.world;
}, world);
const SPRITE = '/ocean-creatures/anglerfish/midnight.gif';
const scene = (world, patch) => ({ ...world, revision: world.revision + 1, scene: { ...world.scene, ...patch } });
const creature = (state, targetApp) => ({ family: 'deception', depth: 'midnight', sprite: SPRITE, state, targetApp });

const base = step(WM.createWorld(seed, { phase: 'desktop', sys: { theme: 'dark', accent: 'blue', wallpaper: 'depth-midnight' } }),
  { kind: 'open-app', app: 'mail', payload: { messageId: 'm-budget' } }, { kind: 'open-app', app: 'files', payload: { folderId: 'documents' } },
  { kind: 'open-app', app: 'notes' },
  { kind: 'set-rect', id: 'w-mail-1', rect: { x: 330, y: 70, w: 560, h: 380 } }, { kind: 'set-rect', id: 'w-files-1', rect: { x: 40, y: 330, w: 400, h: 240 } },
  { kind: 'set-rect', id: 'w-notes-1', rect: { x: 600, y: 330, w: 380, h: 240 } });
const focused = scene(base, { focusApps: ['mail', 'browser'], creature: creature('idle', 'mail') });
const lockedWorld = { ...WM.createWorld(seed, { phase: 'lock', user: { id: 'trainee', name: 'Priya Nair', short: 'priya', email: 'priya.nair@harbor-news.example', avatar: 'priya-nair' } }) };

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const server = createComparisonServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? 'C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aborted = [];
  await context.route(url => !url.href.startsWith(origin) && !/^(data:|about:|blob:)/.test(url.href), route => { aborted.push(route.request().url()); route.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${origin}/__ocean-parent.html`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0;background:#000">
<iframe id="shell" sandbox="allow-scripts" src="${origin}/previews/macos-final/index.html" style="width:100vw;height:100vh;border:0"></iframe>
<script src="${origin}/previews/macos-final/world-model.js"></script>
<script>
window.oceanLog = [];
let world = null;
const frame = document.getElementById('shell');
let port = null;
frame.addEventListener('load', () => {
  const channel = new MessageChannel();
  port = channel.port1;
  port.onmessage = event => {
    window.oceanLog.push(event.data);
    const parsed = OceanWorldModel.parseIntentMessage(event.data);
    if (!parsed || !world) return;
    const result = OceanWorldModel.applyIntent(world, parsed.intent, Date.now());
    if (result.changed) window.pushWorld({ ...result.world, scene: world.scene });   // the scene mirror is read-only
  };
  frame.contentWindow.postMessage({ type: 'ocean-shell-attach', version: 3 }, '*', [channel.port2]);
});
window.pushWorld = next => { world = next; port.postMessage({ type: 'world', version: 3, revision: next.revision, world: next }); };
</script></body>` }));
  const open = async () => {
    await page.goto(`${origin}/__ocean-parent.html`);
    await page.waitForFunction(() => window.oceanLog.some(message => message.type === 'ready'), null, { timeout: 15000 });
    return page.frames().find(item => item.url().includes('/previews/macos-final/'));
  };
  let frame = await open();
  const push = async world => { await page.evaluate(next => window.pushWorld(next), world); };
  const shot = name => page.screenshot({ path: path.join(screens, `final-mac-scene-${name}.png`) });

  // ---- lock screen ----
  await push(lockedWorld);
  await page.waitForTimeout(1200);
  const lock = await frame.evaluate(() => {
    const text = document.body.innerText;
    const img = [...document.querySelectorAll('img')].find(item => item.getAttribute('src')?.startsWith('/avatars/'));
    return { text, inputs: document.querySelectorAll('input, textarea, [type=password]').length, avatar: img?.getAttribute('src') ?? null, phase: window.__macos27.phase.getState().phase };
  });
  await shot('lock');
  check('lock: shows the world user name and email', lock.text.includes('Priya Nair') && lock.text.includes('priya.nair@harbor-news.example'), lock.text.replace(/\s+/g, ' ').slice(0, 120));
  check('lock: avatar id becomes /avatars/<id> on the shell origin', lock.avatar === '/avatars/priya-nair', String(lock.avatar));
  check('lock: no password or any input field', lock.inputs === 0 && lock.phase === 'lock');
  const logStart = await page.evaluate(() => window.oceanLog.length);
  await page.mouse.click(720, 450);
  await page.waitForTimeout(1500);
  const phaseIntent = (await page.evaluate(n => window.oceanLog.slice(n), logStart)).filter(m => m.type === 'world-intent').map(m => m.intent);
  check('lock: one click signs in (set-phase desktop intent)', phaseIntent.some(intent => intent.kind === 'set-phase' && intent.phase === 'desktop'), JSON.stringify(phaseIntent));

  // ---- no scene: nothing dimmed, no creature ----
  await push(base);
  await page.waitForTimeout(1500);
  const plain = await frame.evaluate(() => ({ dim: document.querySelectorAll('[data-ocean-dim]').length, creature: document.getElementById('ocean-creature')?.hidden ?? true }));
  check('no scene fields: nothing dimmed and no creature', plain.dim === 0 && plain.creature === true, JSON.stringify(plain));

  // ---- focus dimming ----
  await push(focused);
  // Settle on the final look, not a fixed delay: the machine can be busy and window-open and dim fades then run long.
  await frame.waitForFunction(() => {
    const style = app => getComputedStyle(document.querySelector(`[role=dialog][data-native-app=${app}]`) ?? document.body);
    return style('mail').opacity === '1' && ['finder', 'notes'].every(app => style(app).opacity === '0.55' && style(app).filter === 'saturate(0.25)');
  }, null, { timeout: 30000, polling: 250 });
  const probe = () => frame.evaluate(() => {
    const info = element => { const style = getComputedStyle(element); return { opacity: Number(style.opacity), filter: style.filter, dim: element.hasAttribute('data-ocean-dim'), pe: style.pointerEvents }; };
    const windows = Object.fromEntries([...document.querySelectorAll('[role=dialog][data-native-app]')].map(element => [element.dataset.nativeApp, info(element)]));
    const dock = Object.fromEntries([...document.querySelectorAll('[data-dock-app]')].map(element => [element.dataset.dockApp, info(element)]));
    const bar = [...document.querySelectorAll('.glass-menubar > .menubar-item[data-menu-id]')].map(element => [element.dataset.menuId, element.hasAttribute('data-ocean-dim')]);
    return { windows, dock, bar };
  });
  const dimmed = await probe();
  await shot('focus-idle');
  check('focus: mail window bright, files and notes windows dimmed (saturate .25, opacity .55)', !dimmed.windows.mail.dim && dimmed.windows.mail.opacity === 1
    && ['finder', 'notes'].every(id => dimmed.windows[id].dim && dimmed.windows[id].opacity === 0.55 && dimmed.windows[id].filter.includes('saturate(0.25)')), JSON.stringify(dimmed.windows));
  check('focus: Dock icons follow focusApps (Mail and Safari bright, Finder and Notes dimmed, Apps launcher never dimmed)',
    !dimmed.dock.mail.dim && !dimmed.dock.safari.dim && dimmed.dock.finder.dim && dimmed.dock.notes.dim && !dimmed.dock.launchpad.dim, Object.entries(dimmed.dock).map(([id, v]) => `${id}:${v.dim ? 'dim' : 'ok'}`).join(' '));
  check('focus: dimmed items stay clickable', Object.values(dimmed.dock).every(item => item.pe !== 'none') && Object.values(dimmed.windows).every(item => item.pe === 'auto'));
  const noGlow = await frame.evaluate(() => document.querySelectorAll('[data-ocean-focus]').length);
  check('focus: focus apps get the glow marker', noGlow >= 2, `${noGlow} items`);
  // A dimmed Dock icon still launches: Reminders has no window yet and is dimmed.
  const before = await page.evaluate(() => window.oceanLog.length);
  await frame.locator('[data-dock-app=reminders]').click();
  await page.waitForTimeout(600);
  const dockClick = (await page.evaluate(n => window.oceanLog.slice(n), before)).filter(m => m.type === 'world-intent');
  check('focus: clicking a dimmed Dock icon still sends its intent', dockClick.some(m => m.intent.kind === 'open-app' && m.intent.app === 'reminders'), dockClick.map(m => m.intent.kind).join(','));
  // The menu bar follows the frontmost app.
  await frame.locator('[role=dialog][data-native-app=mail]').click({ position: { x: 300, y: 18 } });
  await page.waitForTimeout(600);
  const barMail = (await probe()).bar;
  await frame.locator('[role=dialog][data-native-app=finder]').click({ position: { x: 200, y: 18 } });
  await page.waitForTimeout(600);
  const barFiles = (await probe()).bar;
  check('focus: menu bar items dim with the frontmost app (Mail bright, Finder dimmed; Apple menu never)', barMail.filter(([id]) => id !== 'apple').every(([, dim]) => !dim)
    && barFiles.filter(([id]) => id !== 'apple').every(([, dim]) => dim) && barFiles.find(([id]) => id === 'apple')?.[1] === false, `mail ${JSON.stringify(barMail.map(x => x[1]))} finder ${JSON.stringify(barFiles.map(x => x[1]))}`);
  await frame.evaluate(() => window.__macos27.ui.getState().openSpotlight('apps'));
  await page.waitForTimeout(900);
  const panel = await frame.evaluate(() => [...document.querySelectorAll('button[data-native-app]:not([role])')].filter(b => !b.closest('[role=dialog]')).map(b => [b.dataset.nativeApp, b.hasAttribute('data-ocean-dim')]));
  await shot('focus-apps-panel');
  await frame.evaluate(() => window.__macos27.ui.getState().closeSpotlight());
  check('focus: Apps panel icons follow focusApps', panel.length > 5 && panel.find(([id]) => id === 'mail')?.[1] === false && panel.find(([id]) => id === 'finder')?.[1] === true, panel.map(([id, dim]) => `${id}:${dim ? 'dim' : 'ok'}`).join(' '));
  await push(scene(focused, { focusApps: [] }));
  await page.waitForTimeout(1200);
  check('focus: an empty focusApps list dims nothing', (await frame.evaluate(() => document.querySelectorAll('[data-ocean-dim]').length)) === 0);
  await push(scene(focused, { focusApps: ['mail', 'browser'], creature: creature('idle', 'mail') }));
  await page.waitForTimeout(800);

  // ---- creature states ----
  const cInfo = () => frame.evaluate(() => {
    const host = document.getElementById('ocean-creature');
    const img = host?.querySelector('img');
    const rect = img?.getBoundingClientRect();
    const layer = host?.parentElement;
    const at = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
    return {
      hidden: host?.hidden ?? true, loaded: Boolean(img?.complete && img.naturalWidth > 0), src: img?.getAttribute('src'),
      cx: rect ? rect.x + rect.width / 2 : 0, cy: rect ? rect.y + rect.height / 2 : 0, w: rect?.width ?? 0,
      pe: host ? getComputedStyle(host).pointerEvents : '', imgPe: img ? getComputedStyle(img).pointerEvents : '',
      order: layer ? [...layer.children].map(child => child.id || child.getAttribute('code-path')?.replace(/^src\/os\/components\//, '') || child.tagName) : [],
      hit: at ? at.id || at.tagName : null,
      mail: (() => { const r = document.querySelector('[role=dialog][data-native-app=mail]')?.getBoundingClientRect(); return r ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height } : null; })(),
    };
  });
  const sizes = {};
  const infos = {};
  for (const state of ['idle', 'notice', 'approach', 'circle', 'press']) {
    await push(scene(focused, { creature: creature(state, 'mail') }));
    await page.waitForTimeout(state === 'idle' ? 1800 : 4200);
    infos[state] = await cInfo();
    sizes[state] = infos[state].w;
    await shot(`creature-${state}`);
  }
  const idle = infos.idle;
  check('creature: sprite loads from the shell origin (same-origin GIF), host in the desktop layer', idle.loaded && idle.src === SPRITE && !idle.hidden, `${idle.src} loaded=${idle.loaded}`);
  check('creature: layer order is wallpaper, creature, widgets and icons (the window layer is a later sibling of the Desktop)', idle.order.indexOf('ocean-creature') === 1 && idle.order.length >= 3, idle.order.join(' > '));
  check('creature never blocks clicks (pointer-events none, hit test passes through)', idle.pe === 'none' && idle.imgPe === 'none' && idle.hit !== 'IMG', `${idle.pe}/${idle.imgPe} hit=${idle.hit}`);
  check('creature size grows idle < notice < approach and is largest at press', sizes.idle < sizes.notice && sizes.notice < sizes.approach && sizes.press > sizes.approach && sizes.circle > sizes.notice, JSON.stringify(sizes));
  const press = infos.press;
  check('creature press: centred on the target window', press.mail && Math.hypot(press.cx - press.mail.cx, press.cy - press.mail.cy) < 40, `${Math.round(press.cx)},${Math.round(press.cy)} vs ${press.mail && Math.round(press.mail.cx)},${press.mail && Math.round(press.mail.cy)}`);
  const approach = infos.approach;
  const gap = item => Math.hypot(Math.max(Math.abs(item.cx - item.mail.cx) - item.mail.w / 2, 0), Math.max(Math.abs(item.cy - item.mail.cy) - item.mail.h / 2, 0));
  check('creature approach: closer to the target window edge than idle', gap(approach) < gap(idle), `idle ${Math.round(gap(idle))}px, approach ${Math.round(gap(approach))}px`);
  const orbit = [];
  await push(scene(focused, { creature: creature('circle', 'mail') }));
  for (let i = 0; i < 4; i += 1) { await page.waitForTimeout(900); orbit.push(await cInfo()); }
  check('creature circle: orbits (position keeps changing)', new Set(orbit.map(item => `${Math.round(item.cx / 20)},${Math.round(item.cy / 20)}`)).size >= 3);
  // Dock-icon target when the target app has no window.
  await push(scene(focused, { creature: creature('approach', 'calculator') }));
  await page.waitForTimeout(4000);
  const dockTarget = await frame.evaluate(() => { const r = document.querySelector('[data-dock-app=calculator]')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
  const toDock = await cInfo();
  check('creature: with no window it heads for the Dock icon (calculator pin when present)', dockTarget === null || toDock.cy > 450, `dock ${JSON.stringify(dockTarget)} creature ${Math.round(toDock.cx)},${Math.round(toDock.cy)}`);
  await push(scene(focused, { creature: creature('breakthrough', 'mail') }));
  await page.waitForTimeout(800);
  check('creature breakthrough: the shell hides its creature', (await cInfo()).hidden);
  await push(scene(focused, { creature: null }));
  await page.waitForTimeout(500);
  check('creature null: hidden', (await cInfo()).hidden);
  await push(scene(focused, { creature: { ...creature('idle', null), sprite: 'https://example.invalid/x.gif' } }));
  await page.waitForTimeout(500);
  check('creature: a sprite outside /ocean-creatures/ is refused', (await cInfo()).hidden);

  // A quieter desktop (one dimmed window next to the lure) shows each state clearly for the screenshots.
  const sparseBase = step(WM.createWorld(seed, { phase: 'desktop', sys: { theme: 'dark', accent: 'blue', wallpaper: 'depth-midnight' } }),
    { kind: 'open-app', app: 'mail', payload: { messageId: 'm-budget' } }, { kind: 'set-rect', id: 'w-mail-1', rect: { x: 360, y: 110, w: 520, h: 360 } });
  const sparse = scene(sparseBase, { focusApps: ['mail', 'browser'], creature: creature('idle', 'mail') });
  for (const state of ['idle', 'notice', 'approach', 'circle', 'press']) {
    await push(scene(sparse, { creature: creature(state, 'mail') }));
    await page.waitForTimeout(state === 'idle' ? 1800 : 4200);
    await shot(`clean-${state}`);
  }

  // ---- reduced motion: no movement ----
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await push(scene(focused, { creature: creature('circle', 'mail') }));
  await page.waitForTimeout(800);
  const still = [];
  for (let i = 0; i < 3; i += 1) { still.push(await cInfo()); await page.waitForTimeout(700); }
  await shot('creature-reduced-motion');
  check('reduced motion: the creature does not move between frames', still.every(item => Math.abs(item.cx - still[0].cx) < 1 && Math.abs(item.cy - still[0].cy) < 1) && !still[0].hidden, still.map(item => `${Math.round(item.cx)},${Math.round(item.cy)}`).join(' '));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ---- OS switch: a fresh shell given the same world draws the same picture ----
  const snapshot = world => frame.evaluate(() => ({
    dim: [...document.querySelectorAll('[data-ocean-dim]')].map(element => element.dataset.nativeApp ?? element.dataset.dockApp ?? element.dataset.menuId).sort().join(),
    creature: document.getElementById('ocean-creature')?.dataset.state ?? null,
  }));
  await push(scene(focused, { creature: creature('approach', 'mail') }));
  await page.waitForTimeout(1500);
  const a = await snapshot();
  frame = await open();
  await push(scene(focused, { creature: creature('approach', 'mail') }));
  await page.waitForTimeout(1500);
  const b = await snapshot();
  check('OS switch: a fresh shell given the same world dims the same items and shows the same creature state', a.dim === b.dim && a.creature === 'approach' && b.creature === 'approach' && a.dim.length > 0, `${a.dim} | ${b.dim}`);

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('zero non-loopback requests', aborted.length === 0, aborted.join(' '));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
