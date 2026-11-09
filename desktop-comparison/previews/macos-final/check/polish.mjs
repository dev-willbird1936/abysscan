// Polish tour for the final macOS shell: real pointer and keyboard input in a sandbox="allow-scripts" iframe (standalone
// seed world), light and dark, 1440x900 and 1280x800. Checks the shell surfaces against the world, scans every visited
// surface for real-brand text, and measures a rough headless frame rate with and without sys.reduceTransparency.
// Every non-loopback request is aborted. Screenshots go to docs/desktop-parity/screens/final-macfin-*.png.
//   node desktop-comparison/previews/macos-final/check/polish.mjs [port 4340-4349]
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../../../..');
const screens = path.join(project, 'docs/desktop-parity/screens');
const port = Number(process.argv[2] ?? 4344);
if (!Number.isInteger(port) || port < 4340 || port > 4349) throw Error('Use a port from 4340 to 4349.');
const require = createRequire(path.join(process.env.PW_CORE_DIR ?? 'C:/Temp/pw-kimi', 'package.json'));
const { chromium } = require('playwright-core');
const { createComparisonServer } = await import(pathToFileURL(path.join(project, 'desktop-comparison/server.mjs')).href);

// Real brands, services, people and places that the Kimi original showed; none may reach a trainee's screen.
const BRANDS = /\b(apple(?! ?-like)|icloud|cupertino|infinite loop|wikipedia|hacker news|ycombinator|github|google|gmail|microsoft|amazon|tesla|nvidia|netflix|meta platforms|kimi|aapl|msft|nvda|tsla|amzn|figma|dribbble|mozilla|openstreetmap|bloomberg|reuters|nikkei|y combinator|jobs|wozniak|airpods|magic keyboard|mx master|xfinity|apple one)\b/i;
const CULLED_NAMES = ['FaceTime', 'Photo Booth', 'Voice Memos', 'Weather', 'Maps', 'Podcasts', 'News', 'Chess', 'Dictionary', 'Disk Utility', 'Phone', 'Siri', 'Stocks', 'TV', 'Home', 'Games'];

const server = createComparisonServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? 'C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const brandHits = new Map();
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
  // World changes the way a parent would make them: validated intents, then apply.
  const step = (...intents) => frame.evaluate(intents => {
    let next = OceanWorldAdapter.world;
    for (const intent of intents) {
      const result = OceanWorldModel.applyIntent(next, intent, Date.now());
      if (!result.ok) throw Error(`${intent.kind}: ${result.reason}`);
      next = result.world;
    }
    OceanWorldAdapter.apply(next, OceanWorldAdapter.world);
  }, intents);
  const closeAll = () => frame.evaluate(() => {
    let next = OceanWorldAdapter.world;
    for (const win of next.windows) next = OceanWorldModel.applyIntent(next, { kind: 'close-window', id: win.id }, Date.now()).world;
    OceanWorldAdapter.apply(next, OceanWorldAdapter.world);
  });
  const shot = async (name, wait = 600) => {
    await page.waitForTimeout(wait);
    const text = await frame.evaluate(() => document.body.innerText);
    for (const line of text.split('\n')) if (BRANDS.test(line)) brandHits.set(line.trim().slice(0, 80), name);
    await page.screenshot({ path: path.join(screens, `final-macfin-${name}.png`) });
    return text;
  };
  const press = async (key, wait = 500) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };

  // ---- lock and log in ----
  await shot('01-lock-dark-1440');
  await page.mouse.click(720, 600);
  await page.waitForTimeout(1800);
  check('log in reaches the desktop', (await world()).phase === 'desktop');

  // ---- desktop: icons, widgets, context menus, dock ----
  const desktopText = await shot('02-desktop-dark-1440');
  check('desktop shows the world desktop files and fictional widgets', desktopText.includes('Welcome.txt') && desktopText.includes('Harbor City') && desktopText.includes('NWND'));
  const dock = await frame.evaluate(() => [...document.querySelectorAll('[data-dock-app]')].map(node => node.getAttribute('data-dock-app')));
  const pins = await frame.evaluate(() => OceanWorldAdapter.world.dock.pins);
  const NATIVE = { files: 'finder', browser: 'safari', mfa: 'authenticator', updates: 'softwareupdate', texteditor: 'textedit', media: 'music', store: 'appstore', taskmanager: 'activitymonitor', whiteboard: 'freeform' };
  const expectedDock = pins.map(app => NATIVE[app] ?? app);
  check('Dock shows exactly the world pins (plus Apps, Downloads, Trash)', dock.filter(id => !['launchpad', 'downloads', 'trash'].includes(id)).join() === expectedDock.join(), dock.join(','));
  await page.mouse.click(1000, 700, { button: 'right' });
  const menu = await shot('03-desktop-menu', 500);
  check('desktop context menu reachable (overlay fix)', menu.includes('New Folder') && menu.includes('Change Wallpaper'));
  await press('Escape');
  await frame.locator('[code-path^="src/os/components/Desktop.tsx:114"]', { hasText: 'Welcome.txt' }).click({ button: 'right' });
  const iconMenu = await shot('04-icon-menu', 500);
  check('desktop icon menu reachable', iconMenu.includes('Get Info') && iconMenu.includes('Move to Trash'));
  await press('Escape');
  await page.mouse.click(1000, 700);

  // ---- Apps panel (launcher) and Spotlight ----
  await press('F4', 800);
  const launcher = await shot('05-apps-panel');
  const leaked = CULLED_NAMES.filter(name => new RegExp(`(^|\\n)${name}(\\n|$)`).test(launcher));
  check('Apps panel lists no culled app', leaked.length === 0 && launcher.includes('Authenticator') && launcher.includes('Software Update'), leaked.join(','));
  const spotlight = () => frame.locator('[code-path^="src/os/components/Spotlight.tsx"]').first().innerText();
  await page.keyboard.type('stocks', { delay: 20 });
  await page.waitForTimeout(600);
  const appsQuery = await spotlight();
  await shot('05b-apps-panel-culled-query', 100);
  check('Apps search does not offer a culled app', !/(^|\n)Stocks(\n|$)/.test(appsQuery) && appsQuery.includes('No Results'), appsQuery.replace(/\n/g, ' ').slice(0, 80));
  await press('Escape');
  await press('Meta+Space', 700);
  await page.keyboard.type('welcome', { delay: 40 });
  await shot('06-spotlight-files', 900);
  check('⌘Space searches files and finds world files', (await spotlight()).includes('Welcome.txt') && (await world()).overlays.search === true);
  await frame.locator('input').first().fill('');
  await frame.locator('button', { hasText: /^Actions$/ }).click();
  await page.waitForTimeout(600);
  const spotActions = await shot('07-spotlight-actions');
  check('Spotlight actions have no screenshot entry', spotActions.includes('New Note') && !spotActions.includes('Take Screenshot'));
  await press('Escape');

  // ---- Control Center bound to world.sys ----
  await frame.locator('[aria-label="Control Center"]').click();
  await page.waitForTimeout(700);
  check('Control Center opens as world overlay quick', (await world()).overlays.quick === true);
  await frame.getByText('Dark Mode', { exact: true }).first().click();
  await page.waitForTimeout(600);
  check('Control Center Dark Mode writes world.sys.theme', (await world()).sys.theme === 'light');
  await frame.getByText('Dark Mode', { exact: true }).first().click();
  await page.waitForTimeout(600);
  const sys = (await world()).sys;
  check('Control Center reflects world.sys (battery)', sys.theme === 'dark' && (await frame.evaluate(() => document.body.innerText)).includes(`${sys.battery}%`));
  await shot('08-control-center', 300);
  await press('Escape');
  await page.mouse.click(1000, 700);

  // ---- Notification Center ----
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await frame.evaluate(item => {
    const next = { ...OceanWorldAdapter.world, revision: OceanWorldAdapter.world.revision + 1,
      notifications: { banners: [], history: [item, ...OceanWorldAdapter.world.notifications.history] } };
    OceanWorldAdapter.apply(next, OceanWorldAdapter.world);
  }, { id: 'n-it', app: 'mail', title: 'IT Service Desk', body: 'Your mailbox is almost full.', time: now });
  await frame.locator('[aria-label="Notifications"]').click();
  const centre = await shot('09-notification-center', 800);
  check('Notification Center shows world notifications', centre.includes('IT Service Desk') && (await world()).overlays.centre === true);
  await press('Escape');
  await page.mouse.click(1000, 700);
  await page.waitForTimeout(300);

  // ---- apps ----
  await step({ kind: 'open-app', app: 'files', payload: { folderId: 'documents' } });
  await shot('10-finder', 1400);
  await closeAll();
  await step({ kind: 'open-app', app: 'mail', payload: { messageId: 'm-budget' } });
  await shot('11-mail', 1400);
  await closeAll();
  await step({ kind: 'open-app', app: 'settings' });
  const settings = await shot('12-settings', 1400);
  const culledPanes = ['VPN', 'Menu Bar', 'Screen Saver', 'Keyboard', 'Trackpad', 'Mouse', 'Time Machine', 'Siri'].filter(name => new RegExp(`(^|\\n)${name}(\\n|$)`).test(settings));
  check('Settings lists only the kept panes', culledPanes.length === 0 && settings.includes('Wallpaper') && settings.includes('Privacy & Security'), culledPanes.join(','));
  const paneNames = ['Account', 'Wi-Fi', 'Bluetooth', 'Network', 'Battery', 'General', 'Accessibility', 'Appearance', 'Desktop & Dock', 'Displays', 'Wallpaper', 'Notifications', 'Focus', 'Sound', 'Privacy & Security', 'Users & Groups'];
  for (const name of paneNames) {
    await frame.locator('[role=dialog] button', { hasText: new RegExp(`^${name}$`) }).first().click();
    await page.waitForTimeout(350);
    const text = await frame.evaluate(() => document.querySelector('[role=dialog]').innerText);
    for (const line of text.split('\n')) if (BRANDS.test(line)) brandHits.set(line.trim().slice(0, 80), `settings ${name}`);
  }
  await frame.locator('[role=dialog] button', { hasText: /^Bluetooth$/ }).first().click();
  await shot('12b-settings-bluetooth', 500);
  await frame.getByText('General', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await frame.getByText('Software Update', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  check('Settings ▸ General ▸ Software Update opens the world Software Update app', (await world()).windows.some(win => win.app === 'updates'));
  await closeAll();
  await step({ kind: 'open-app', app: 'browser' });
  const start = await shot('13-safari-start', 1400);
  check('Safari start page has no real-brand favourites', !BRANDS.test(start));
  for (const address of ['apple.com', 'https://en.wikipedia.org/wiki/MacOS', 'news.ycombinator.com', 'github.com/trending', 'what is phishing']) {
    await press('Meta+KeyL', 300);
    await page.keyboard.type(address, { delay: 10 });
    await press('Enter', 900);
    const text = await frame.evaluate(() => document.body.innerText);
    for (const line of text.split('\n')) if (BRANDS.test(line) && !line.includes(address)) brandHits.set(line.trim().slice(0, 80), `safari ${address}`);
    check(`Safari "${address}" shows the neutral page`, text.includes('This Page Isn’t Available'));
  }
  await shot('14-safari-typed-address', 200);
  await closeAll();
  await step({ kind: 'open-app', app: 'files', payload: { folderId: 'documents' } }, { kind: 'open-app', app: 'mail' }, { kind: 'open-app', app: 'notes' }, { kind: 'open-app', app: 'calendar' });
  await page.waitForTimeout(1500);

  // ---- Mission Control and ⌘Tab ----
  await press('F3', 900);
  check('F3 opens Mission Control', (await world()).overlays.taskView === true);
  await shot('15-mission-control', 300);
  await press('F3', 700);
  await page.keyboard.down('Meta');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  check('⌘Tab opens the app switcher', await frame.evaluate(() => __macos27.wins.getState().appSwitcher.open));
  await shot('16-app-switcher', 200);
  await page.keyboard.up('Meta');
  await page.waitForTimeout(600);

  // ---- light theme, 1440 and 1280 ----
  await step({ kind: 'set-sys', patch: { theme: 'light', wallpaper: 'depth-sunlight' } });
  await shot('17-desktop-light-1440', 1400);
  await press('F4', 800);
  await shot('18-apps-panel-light', 300);
  await press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1200);
  await shot('19-desktop-light-1280', 600);
  await step({ kind: 'set-sys', patch: { theme: 'dark', wallpaper: 'depth-midnight' } });
  await shot('20-desktop-dark-1280', 1400);
  const fit = await frame.evaluate(() => [...document.querySelectorAll('[role=dialog]')].every(node => {
    const rect = node.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  }));
  check('windows fit the 1280x800 work area', fit);
  await press('Control+Meta+KeyQ', 900);
  await shot('21-lock-dark-1280', 300);
  await page.mouse.click(640, 560);
  await page.waitForTimeout(1600);

  // ---- low-effects mode (sys.reduceTransparency): rough headless frame rate while dragging a window ----
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  const fps = async reduce => {
    await step({ kind: 'set-sys', patch: { reduceTransparency: reduce } });
    await page.waitForTimeout(1200);
    const sample = frame.evaluate(() => new Promise(resolve => {
      let frames = 0;
      const start = performance.now();
      const tick = () => { frames += 1; if (performance.now() - start < 4000) requestAnimationFrame(tick); else resolve(frames * 1000 / (performance.now() - start)); };
      requestAnimationFrame(tick);
    }));
    const notes = frame.locator('[role=dialog][aria-label="Notes"]');
    const title = await notes.boundingBox();
    await page.mouse.move(title.x + 200, title.y + 14);
    await page.mouse.down();
    for (let i = 0; i < 40; i += 1) await page.mouse.move(title.x + 200 + (i % 20) * 12, title.y + 14 + (i % 10) * 8, { steps: 2 });
    await page.mouse.up();
    const value = await sample;
    const moved = Math.round(Math.abs((await notes.boundingBox()).x - title.x) + Math.abs((await notes.boundingBox()).y - title.y));
    const filters = await frame.evaluate(() => [...document.querySelectorAll('*')].filter(node => getComputedStyle(node).backdropFilter !== 'none').length);
    return { fps: Math.round(value * 10) / 10, filters, moved };
  };
  const full = await fps(false);
  await shot('22-effects-full', 100);
  const low = await fps(true);
  await shot('23-effects-low', 100);
  console.log(`FPS (headless, 4 windows, dragging the Notes window): full effects ${full.fps} fps with ${full.filters} backdrop-filter elements; reduceTransparency ${low.fps} fps with ${low.filters} (window moved ${full.moved} / ${low.moved} px)`);
  check('reduceTransparency removes every backdrop filter', low.filters === 0 && full.filters > 0, `${full.filters} -> ${low.filters}`);

  check('no real-brand text on any visited surface', brandHits.size === 0, [...brandHits].map(([line, where]) => `${where}: ${line}`).join(' | '));
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
