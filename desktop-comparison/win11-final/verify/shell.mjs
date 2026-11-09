// Shell suite (win-shell): renders the production build inside <iframe sandbox="allow-scripts">,
// aborts every non-loopback request, exercises shell features and writes screenshots.
// node verify/shell.mjs [all|standalone|embedded]
import { ORIGIN as BASE, SHOTS as OUT, guard, launch, makeChecks, startServer } from './lib.mjs';

const only = process.argv[2] || 'all';
const server = await startServer();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const external = [];
await guard(ctx, external);
const { check, summary } = makeChecks();
const shot = async (page, name) => page.screenshot({ path: `${OUT}/final-win-shell-${name}.png` });

async function open(mode) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`${BASE}/parent.html?mode=${mode}`);
  const frame = page.frameLocator('#shell');
  const handle = () => page.frames().find((f) => f.url().includes('/app/index.html'));
  return { page, frame, handle, errors };
}
const world = async (h) => (await h()).evaluate(() => window.OceanWorldAdapter.world);
const applyIn = async (h, fn, arg) => (await h()).evaluate(fn, arg);

if (only === 'all' || only === 'standalone') {
  const { page, frame, handle, errors } = await open('standalone');
  await frame.locator('[data-testid=lock-screen]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await shot(page, '01-lock');
  const lockText = await frame.locator('[data-testid=lock-screen]').innerText();
  check('lock screen shows clock + hint', /Click or press any key/.test(lockText));
  await page.mouse.click(720, 450);
  await page.waitForTimeout(700);
  await shot(page, '02-signin');
  check('sign-in shows training user', (await frame.locator('[data-testid=lock-screen]').innerText()).includes('Alex Rivera'));
  // Count Web Audio cues.
  await applyIn(handle, () => {
    window.__osc = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  });
  await frame.getByRole('button', { name: 'Sign in' }).click();
  await frame.locator('[data-testid=taskbar]').waitFor();
  await page.waitForTimeout(1200);
  check('unlock sound synthesised', (await applyIn(handle, () => window.__osc)) > 0);
  check('phase desktop after sign-in', (await world(handle)).phase === 'desktop');
  await shot(page, '03-desktop');

  // Desktop icons from world.fs desktop folder + drag
  const icons = await frame.locator('[data-testid=desktop-icon]').allInnerTexts();
  check('desktop icons from world.fs', icons.some((t) => t.includes('Welcome.txt')) && icons.some((t) => t.includes('Q3 Planning')), icons.join(','));
  const welcome = frame.locator('[data-testid=desktop-icon]', { hasText: 'Welcome.txt' });
  const box = await welcome.boundingBox();
  await page.mouse.move(box.x + 38, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y + 160, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const pos = (await world(handle)).fs.nodes['f-welcome'].desktopPos;
  check('icon drag commits desktopPos', pos.x !== 900 || pos.y !== 20, JSON.stringify(pos));

  // Desktop context menu
  await page.mouse.click(600, 500, { button: 'right' });
  await page.waitForTimeout(300);
  await shot(page, '04-desktop-menu');
  check('desktop context menu', (await frame.locator('[data-testid=context-menu]').getAttribute('data-hide')) === 'false' && (await frame.locator('[data-testid=context-menu]').innerText()).includes('Personalize'));
  await frame.locator('.menuopt', { hasText: 'New' }).first().hover();
  await page.waitForTimeout(200);
  await frame.locator('.minimenu .menuopt', { hasText: 'Folder' }).click();
  await page.waitForTimeout(300);
  await frame.locator('.dskRename').fill('Lure drop');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const names = Object.values((await world(handle)).fs.nodes).filter((n) => n.parentId === 'desktop').map((n) => n.name);
  check('new folder + rename on desktop', names.includes('Lure drop'), names.join(','));

  // Start
  await frame.locator('.taskbar .tsIcon').first().click();
  await page.waitForTimeout(500);
  await shot(page, '05-start');
  check('start overlay mirrored to world', (await world(handle)).overlays.launcher === true);
  // Search: math + files + actions
  await page.keyboard.press('Escape');
  await frame.locator('[data-testid=search-pill]').click();
  await page.waitForTimeout(300);
  await frame.locator('[data-testid=search-input]').fill('12*7+1');
  await page.waitForTimeout(300);
  check('search math', (await frame.locator('[data-testid=search-results]').innerText()).includes('= 85'));
  await shot(page, '06-search-math');
  await frame.locator('[data-testid=search-input]').fill('budget');
  await page.waitForTimeout(300);
  const budget = await frame.locator('[data-testid=search-results]').innerText();
  check('search files', budget.includes('Team budget 2027.txt'), budget.replace(/\n/g, '|'));
  await shot(page, '07-search-files');
  await frame.locator('[data-testid=search-input]').fill('dark');
  await page.waitForTimeout(200);
  check('search actions', (await frame.locator('[data-testid=search-results]').innerText()).includes('dark mode'));
  await frame.locator('[data-testid=search-input]').fill('person');
  await page.waitForTimeout(200);
  check('search settings', (await frame.locator('[data-testid=search-results]').innerText()).includes('Personalisation'));
  await page.keyboard.press('Escape');

  // Quick settings
  await frame.locator('[data-testid=tray-quick]').click();
  await page.waitForTimeout(400);
  await frame.locator('[data-testid=quick-nightLight]').click();
  await frame.locator('[data-testid=quick-theme]').click();
  await page.waitForTimeout(600);
  const sys1 = (await world(handle)).sys;
  check('quick settings bound to sys', sys1.nightLight === true && sys1.theme === 'light', JSON.stringify({ n: sys1.nightLight, t: sys1.theme }));
  await shot(page, '08-quick-settings-nightlight');
  await applyIn(handle, () => window.__oceanEmit({ kind: 'set-sys', patch: { brightness: 40 } }));
  await page.waitForTimeout(500);
  const dim = await applyIn(handle, () => Number(getComputedStyle(document.getElementById('brightoverlay')).opacity));
  check('brightness overlay follows sys.brightness', Math.abs(dim - 0.51) < 0.02, String(dim));
  await shot(page, '08b-brightness-40');
  await applyIn(handle, () => window.__oceanEmit({ kind: 'set-sys', patch: { brightness: 90 } }));
  await frame.locator('[data-testid=quick-nightLight]').click();
  await frame.locator('[data-testid=quick-theme]').click();
  await page.mouse.click(700, 300);
  await page.waitForTimeout(400);

  // Notifications: banner + centre
  await applyIn(handle, () => {
    const w = JSON.parse(JSON.stringify(window.OceanWorldAdapter.world));
    const n = { id: 'n-it-1', app: 'mail', title: 'IT Service Desk', body: 'Your mailbox is almost full. Review the message in Mail.', time: new Date().toISOString() };
    w.notifications.banners.push(n); w.notifications.history.push(n); w.revision++;
    window.OceanWorldAdapter.apply(w);
  });
  await page.waitForTimeout(700);
  check('toast banner shown', (await frame.locator('[data-testid=toast]').count()) === 1);
  await shot(page, '09-toast');
  await frame.locator('[data-testid=tray-clock]').click();
  await page.waitForTimeout(500);
  const centre = await frame.locator('[data-testid=centre]').innerText();
  check('notification centre history + calendar', centre.includes('IT Service Desk') && centre.includes('Welcome, Alex') && /Su\s*Mo/.test(centre));
  await shot(page, '10-centre');
  await frame.locator('[data-testid=centre] .linkBtn').click();
  await page.waitForTimeout(300);
  check('clear all notifications', (await world(handle)).notifications.history.length === 0);
  await page.mouse.click(700, 300);

  // Settings personalisation
  await applyIn(handle, () => window.__oceanEmit({ kind: 'open-app', app: 'settings' }));
  await page.waitForTimeout(600);
  await frame.locator('[data-testid=settings-nav-personalisation]').click();
  await page.waitForTimeout(400);
  await frame.locator('[data-testid=accent-purple]').click();
  await frame.locator('[data-testid=wall-depth-twilight]').click();
  await page.waitForTimeout(600);
  const sys2 = (await world(handle)).sys;
  check('settings accent + wallpaper', sys2.accent === 'purple' && sys2.wallpaper === 'depth-twilight');
  await shot(page, '11-settings-personalisation');
  await frame.locator('[data-testid=settings-nav-accounts]').click();
  await page.waitForTimeout(300);
  check('accounts shows world.user', (await frame.locator('[data-testid=account-name]').innerText()) === 'Alex Rivera');
  await shot(page, '12-settings-accounts');
  await frame.locator('[data-testid=settings-nav-windows]').click();
  await page.waitForTimeout(500);
  await shot(page, '13-settings-windows-update');

  // More windows, task view, switcher, snap, fullscreen
  for (const app of ['files', 'texteditor', 'calculator']) await applyIn(handle, (a) => window.__oceanEmit({ kind: 'open-app', app: a }), app);
  await page.waitForTimeout(800);
  await frame.locator('[data-testid=task-view-button]').click();
  await page.waitForTimeout(500);
  check('task view lists windows', (await frame.locator('[data-testid=task-view] .winCard').count()) >= 4);
  await shot(page, '14-task-view');
  await frame.locator('[data-testid=task-view] .winCard', { hasText: 'Settings' }).click();
  await page.waitForTimeout(400);
  const wv = await world(handle);
  check('task view focus', wv.windows.find((w) => w.id === wv.focusedId)?.app === 'settings');
  await page.keyboard.down('Control');
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  check('switcher shown', (await frame.locator('[data-testid=switcher]').count()) === 1);
  await shot(page, '15-switcher');
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  check('switcher commits focus', (await world(handle)).overlays.switcher === false);

  const top = frame.locator('[data-testid=window][data-focused=true]');
  await top.locator('[aria-label=Maximise]').hover();
  await page.waitForTimeout(400);
  await shot(page, '16-snap-layouts');
  await frame.locator('[data-testid=snap-flyout] .snapLay').first().locator('.snapper').first().click();
  await page.waitForTimeout(500);
  const tiled = (await world(handle)).windows.find((w) => w.id === wv.focusedId || w.tile);
  check('snap layout tiles window', (await world(handle)).windows.some((w) => w.tile === 'left'), JSON.stringify(tiled && tiled.tile));
  await shot(page, '17-snapped');

  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(500);
  check('fullscreen mode', (await world(handle)).windows.some((w) => w.mode === 'fullscreen'));
  await shot(page, '18-fullscreen');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Taskbar jump list + badges
  await frame.locator('[data-testid=task-mail]').click({ button: 'right' }).catch(() => {});
  await frame.locator('[data-testid=task-files]').click({ button: 'right' });
  await page.waitForTimeout(300);
  check('taskbar right-click menu', (await frame.locator('[data-testid=context-menu]').getAttribute('data-hide')) === 'false' && (await frame.locator('[data-testid=context-menu]').innerText()).includes('taskbar'));
  await shot(page, '19-taskbar-menu');
  await page.mouse.click(700, 300);

  // Show desktop corner
  await frame.locator('[data-testid=show-desktop]').click();
  await page.waitForTimeout(500);
  check('show desktop minimises all', (await world(handle)).windows.every((w) => w.mode === 'minimized'));
  await shot(page, '20-show-desktop');
  await frame.locator('[data-testid=show-desktop]').click();
  await page.waitForTimeout(500);

  // Widgets
  await frame.locator('.weatherPill').click();
  await page.waitForTimeout(600);
  await shot(page, '21-widgets');
  await page.mouse.click(1200, 300);

  // Power: sleep → lock → off → boot → lock
  await frame.locator('.taskbar .tsIcon').first().click();
  await page.waitForTimeout(300);
  await frame.locator('[data-testid=power-button]').click();
  await page.waitForTimeout(300);
  await shot(page, '22-power-menu');
  await frame.locator('.powerCont .prtclk', { hasText: 'Sleep' }).click();
  await page.waitForTimeout(500);
  check('sleep screen', (await frame.locator('[data-testid=sleep-screen]').count()) === 1 && (await world(handle)).windows.length > 0);
  await shot(page, '23-sleep');
  await frame.locator('[data-testid=sleep-screen]').click();
  await page.waitForTimeout(500);
  check('wake to lock keeps windows', (await world(handle)).phase === 'lock' && (await world(handle)).windows.length > 0);
  await applyIn(handle, () => window.__oceanEmit({ kind: 'set-phase', phase: 'off' }));
  await page.waitForTimeout(400);
  await shot(page, '24-off');
  await frame.locator('[aria-label="Power on"]').click();
  await page.waitForTimeout(800);
  check('boot screen', (await frame.locator('[data-testid=boot-screen]').count()) === 1);
  await shot(page, '25-boot');
  await frame.locator('[data-testid=lock-screen]').waitFor({ timeout: 8000 });
  check('boot hands over to lock', (await world(handle)).phase === 'lock');
  check('no page errors (standalone)', errors.length === 0, errors.join(' || '));
  await page.close();
}

if (only === 'all' || only === 'embedded') {
  const { page, frame, handle, errors } = await open('embedded');
  await page.waitForFunction(() => window.harness && window.harness.ready, null, { timeout: 15000 });
  const ready = await page.evaluate(() => window.harness.ready);
  check('bridge v3 ready message', ready.shell === 'windows' && ready.apps.length === 21 && ready.version === 3, JSON.stringify(ready).slice(0, 120));
  await frame.locator('[data-testid=taskbar]').waitFor();
  await page.evaluate(() => window.harness.push((w) => { w.windows.push({ id: 'w-1', app: 'settings', title: 'Settings', rect: { x: 220, y: 40, w: 640, h: 440 }, mode: 'normal', tile: null, payload: null }); w.order = ['w-1']; w.focusedId = 'w-1'; }));
  await page.waitForTimeout(900);
  await shot(page, '30-runtime-before');
  const before = await (await handle()).evaluate(() => ({ theme: document.body.dataset.theme, accent: getComputedStyle(document.body).getPropertyValue('--clrPrm').trim(), wall: getComputedStyle(document.querySelector('.background')).backgroundImage, tasks: [...document.querySelectorAll('[data-testid^=task-]')].map((n) => n.dataset.testid) }));
  await page.evaluate(() => window.harness.push((w) => { w.sys.theme = 'light'; w.sys.accent = 'orange'; w.sys.wallpaper = 'depth-abyss'; w.installed = w.installed.filter((a) => !['mail', 'messages', 'photos', 'media'].includes(a)); }));
  await page.waitForTimeout(900);
  await shot(page, '31-runtime-after-theme-wallpaper-accent-installed');
  const after = await (await handle()).evaluate(() => ({ theme: document.body.dataset.theme, accent: getComputedStyle(document.body).getPropertyValue('--clrPrm').trim(), wall: getComputedStyle(document.querySelector('.background')).backgroundImage, tasks: [...document.querySelectorAll('[data-testid^=task-]')].map((n) => n.dataset.testid) }));
  check('runtime theme change', before.theme === 'dark' && after.theme === 'light', before.theme + '→' + after.theme);
  check('runtime accent change', before.accent !== after.accent, before.accent + '→' + after.accent);
  check('runtime wallpaper change', before.wall !== after.wall && after.wall.includes('abyss'), after.wall.slice(-40));
  check('runtime installed change', before.tasks.includes('task-mail') && !after.tasks.includes('task-mail'), after.tasks.join(','));
  await page.evaluate(() => window.harness.push((w) => { w.sys.wallpaperUrl = '/app/img/wallpaper/ThemeB/img2.jpg'; }));
  await page.waitForTimeout(700);
  await shot(page, '32-runtime-wallpaperUrl');
  // Start search must not list uninstalled apps
  await frame.locator('[data-testid=search-pill]').click();
  await frame.locator('[data-testid=search-input]').fill('mail');
  await page.waitForTimeout(300);
  const res = await frame.locator('[data-testid=search-results]').innerText();
  check('uninstalled app hidden from search', !/^Mail$/m.test(res), res.replace(/\n/g, '|'));
  await page.keyboard.press('Escape');
  // Start pinned + all apps, desktop shortcuts and file-open handlers follow world.installed.
  await page.evaluate(() => window.harness.push((w) => {
    w.fs.nodes['s-mail'] = { id: 's-mail', parentId: 'desktop', name: 'Mail shortcut', kind: 'app', appId: 'mail', mime: null, size: 0, modified: '2026-10-01T09:00:00Z', trashed: false, desktopPos: { x: 20, y: 420 } };
    w.fs.nodes['s-calc'] = { id: 's-calc', parentId: 'desktop', name: 'Calculator shortcut', kind: 'app', appId: 'calculator', mime: null, size: 0, modified: '2026-10-01T09:00:00Z', trashed: false, desktopPos: { x: 20, y: 500 } };
  }));
  await page.waitForTimeout(500);
  const deskNames = await frame.locator('[data-testid=desktop-icon]').allInnerTexts();
  check('desktop hides shortcuts of uninstalled apps', deskNames.some((t) => t.includes('Calculator shortcut')) && !deskNames.some((t) => t.includes('Mail shortcut')), deskNames.join(','));
  await frame.locator('.taskbar .tsIcon').first().click();
  await page.waitForTimeout(400);
  const startNames = await (await handle()).evaluate(() => [...document.querySelectorAll('.pnApp .appName, .allApp .appName')].map((n) => n.textContent));
  check('start lists only installed apps', startNames.length > 0 && !startNames.some((n) => ['Mail', 'Chat', 'Photos', 'Media Player'].includes(n)), startNames.join(','));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const intents = await page.evaluate(() => window.harness.intents.map((i) => i.intent.kind + ':' + (i.intent.name || i.intent.app || '')));
  check('intents posted to parent', intents.some((i) => i.startsWith('toggle-overlay:search')), intents.join(','));
  check('no page errors (embedded)', errors.length === 0, errors.join(' || '));
  await page.close();
}

check('zero non-loopback requests', external.length === 0, [...new Set(external)].join(' '));
await browser.close();
server.close();
process.exitCode = summary('shell') ? 1 : 0;
