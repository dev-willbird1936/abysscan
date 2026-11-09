// Dynamic-config proof for the final macOS shell. Loads previews/macos-final in a sandbox="allow-scripts" iframe under
// a parent page that speaks the v3 world transport, pushes world A then world B without a reload, and checks that the
// shell follows theme, wallpaper, installed apps and mailbox, and that culled or disabled apps are absent.
// Every non-loopback request is aborted. Screenshots go to docs/desktop-parity/screens/final-mac-*.png.
//   node desktop-comparison/previews/macos-final/check/world-ab.mjs [port 4340-4349]
// Needs playwright-core (PW_CORE_DIR, default C:/Temp/pw-kimi) and Chromium (CHROMIUM_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../../../..');
const screens = path.join(project, 'docs/desktop-parity/screens');
const port = Number(process.argv[2] ?? 4342);
if (!Number.isInteger(port) || port < 4340 || port > 4349) throw Error('Use a port from 4340 to 4349.');
const require = createRequire(path.join(process.env.PW_CORE_DIR ?? 'C:/Temp/pw-kimi', 'package.json'));
const { chromium } = require('playwright-core');
const WM = createRequire(import.meta.url)(path.join(project, 'ui/desktop/world-model.js'));
const { createComparisonServer } = await import(pathToFileURL(path.join(project, 'desktop-comparison/server.mjs')).href);

const seed = JSON.parse(fs.readFileSync(path.join(project, 'data/desktop-world-seed.json'), 'utf8'));
const darkProfile = JSON.parse(fs.readFileSync(path.join(project, 'data/desktop-profiles/example-dark.json'), 'utf8'));
const NOW = Date.parse('2026-11-02T10:00:00Z');
const step = (world, ...intents) => intents.reduce((current, intent) => {
  const result = WM.applyIntent(current, intent, NOW);
  if (!result.ok) throw Error(`${intent.kind}: ${result.reason}`);
  return result.world;
}, world);
const worldA = step(WM.createWorld(seed, { phase: 'desktop', sys: { theme: 'light', accent: 'blue', wallpaper: 'depth-sunlight' } }),
  { kind: 'open-app', app: 'mail', payload: { messageId: 'm-budget' } }, { kind: 'open-app', app: 'files', payload: { folderId: 'documents' } },
  { kind: 'set-rect', id: 'w-files-1', rect: { x: 520, y: 260, w: 460, h: 320 } });
const profiledB = WM.createWorld(seed, darkProfile);
const worldB = step({ ...profiledB, phase: 'desktop', revision: worldA.revision + 1,
  scene: { phase: 'lure', stepId: 'mail', highlight: { app: 'mail', ref: 'm-payroll' } },
  data: { ...profiledB.data,
    mfa: { accounts: [{ id: 'acc-sso', issuer: 'Contoso SSO', label: 'jordan.blake@contoso.example' }],
      prompts: [{ id: 'pr-1', app: 'Contoso SSO', account: 'jordan.blake@contoso.example', location: 'Lisbon, PT', device: 'Chrome on Windows', time: '2026-11-02T09:58:00Z', number: 42 }] },
    web: { pages: { 'payroll-portal': { title: 'Contoso Payroll', url: 'payroll.contoso-hr.example/confirm', brand: 'Contoso HR', heading: 'Confirm your direct deposit',
      body: 'Your direct deposit update could not be processed.\n\nSign in to confirm your bank details today.', insecure: true,
      choices: [{ label: 'Sign in', choiceId: 'sign-in', style: 'primary' }, { label: 'Not now', choiceId: 'close-tab', style: 'secondary' }] } } } } },
{ kind: 'open-app', app: 'mail', payload: { messageId: 'm-payroll' } }, { kind: 'open-app', app: 'mfa' }, { kind: 'tile', id: 'w-mfa-1', tile: 'right' });

const CULLED_NAMES = ['FaceTime', 'Photo Booth', 'Voice Memos', 'Weather', 'Maps', 'Podcasts', 'News', 'Chess', 'Dictionary', 'Disk Utility', 'Phone', 'Siri', 'Stocks'];
const NATIVE_NAMES = { store: 'App Store', media: 'Music', stickies: 'Stickies', whiteboard: 'Freeform', taskmanager: 'Activity Monitor' };

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
check('build is current: the shell carries the same world model and seed', fs.readFileSync(path.join(project, 'ui/desktop/world-model.js'), 'utf8') === fs.readFileSync(path.join(here, '../world-model.js'), 'utf8')
  && fs.readFileSync(path.join(here, '../world-seed.js'), 'utf8').includes(JSON.stringify(seed)), 'run desktop-comparison/make-macos-final.mjs if this fails');

const server = createComparisonServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${port}`;
// Autoplay without a gesture, so the OS-switch check can hear (or not hear) the hidden and visible shells.
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], executablePath: process.env.CHROMIUM_PATH ?? 'C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aborted = [];
  await context.route(url => !url.href.startsWith(base) && !/^(data:|about:|blob:)/.test(url.href), route => { aborted.push(route.request().url()); route.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The parent: a v3 transport host. It never touches the shell DOM. Like the real parent it applies each intent with
  // OceanWorldModel and pushes the next world, unless acceptIntents is false (then the shell must roll back).
  await page.route(`${base}/__ocean-parent.html`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0;background:#000">
<iframe id="shell" sandbox="allow-scripts" src="${base}/previews/macos-final/index.html" style="width:100vw;height:100vh;border:0"></iframe>
<script src="${base}/previews/macos-final/world-model.js"></script>
<script>
window.oceanLog = [];
window.acceptIntents = true;
let world = null;
const frame = document.getElementById('shell');
let port = null;
frame.addEventListener('load', () => {
  const channel = new MessageChannel();
  port = channel.port1;
  port.onmessage = event => {
    window.oceanLog.push(event.data);
    const parsed = OceanWorldModel.parseIntentMessage(event.data);
    if (!parsed || !world || !window.acceptIntents) return;
    const result = OceanWorldModel.applyIntent(world, parsed.intent, Date.now());
    if (result.changed) window.pushWorld(result.world);
  };
  frame.contentWindow.postMessage({ type: 'ocean-shell-attach', version: 3 }, '*', [channel.port2]);
});
window.pushWorld = next => { world = next; port.postMessage({ type: 'world', version: 3, revision: next.revision, world: next }); };
window.setActive = active => port.postMessage({ type: 'world-active', version: 3, active });
</script></body>` }));
  await page.goto(`${base}/__ocean-parent.html`);
  await page.waitForFunction(() => window.oceanLog.some(message => message.type === 'ready'), null, { timeout: 15000 });
  const ready = await page.evaluate(() => window.oceanLog.find(message => message.type === 'ready'));
  check('handshake: ready with the 21 canonical apps', ready.shell === 'macos' && ready.version === 3 && ready.apps.join() === WM.CANONICAL_APPS.join(), `${ready.apps.length} apps`);
  const frame = page.frames().find(item => item.url().includes('/previews/macos-final/'));
  await frame.evaluate(() => { window.__oceanBootMarker = Math.random(); });
  const marker = await frame.evaluate(() => window.__oceanBootMarker);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screens, 'final-mac-lock.png') });

  async function inspect(world) {
    return frame.evaluate(({ world, nativeNames }) => {
      const M = window.__macos27;
      const dock = [...document.querySelectorAll('[data-dock-app]')].map(node => node.getAttribute('data-dock-app'));
      return {
        mode: OceanWorldAdapter.mode, revision: OceanWorldAdapter.world.revision,
        theme: document.documentElement.getAttribute('data-theme'), wallpaper: M.sys.getState().wallpaper, accent: M.sys.getState().accent,
        installed: M.installed().map(entry => entry.id), registry: M.registry.map(entry => entry.id), dock,
        mail: M.mail.getState().messages.map(message => message.subject),
        windows: Object.values(M.wins.getState().windows).map(win => win.appId).sort(),
        user: M.sys.getState().user.name, home: M.fs.getState().nodes.home.name,
        bodyText: document.body.innerText,
        hiddenNames: Object.entries(nativeNames).filter(([app]) => !world.installed.includes(app)).map(([, name]) => name),
      };
    }, { world, nativeNames: NATIVE_NAMES });
  }
  async function launcherText() {
    await frame.evaluate(() => window.__macos27.ui.getState().openSpotlight('apps'));
    await page.waitForTimeout(700);
    const text = await frame.evaluate(() => document.body.innerText);
    return text;
  }
  async function closeLauncher() {
    await frame.evaluate(() => window.__macos27.ui.getState().closeSpotlight());
    await page.waitForTimeout(300);
  }

  // ---- world A ----
  await page.evaluate(world => window.pushWorld(world), worldA);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(screens, 'final-mac-world-a.png') });
  const a = await inspect(worldA);
  check('A: parent mode, world A applied (later revisions are accepted shell intents)', a.mode === 'parent' && a.revision >= worldA.revision, `rev ${a.revision}`);
  check('A: light theme and sunlight wallpaper', a.theme === 'light' && a.wallpaper.endsWith('depth-sunlight.svg'), `${a.theme} ${a.wallpaper}`);
  check('A: all 21 canonical apps installed', a.installed.filter(id => !['launchpad', 'preview', 'quicktime'].includes(id)).length === 21, a.installed.join(','));
  check('A: windows follow the world', a.windows.join() === ['finder', 'mail'].join(), a.windows.join());
  check('A: mailbox follows the world', a.mail.join('|') === worldA.data.mail.messages.map(m => m.subject).join('|'), a.mail.join(' | '));
  const launcherA = await launcherText();
  await page.screenshot({ path: path.join(screens, 'final-mac-world-a-launcher.png') });
  await closeLauncher();
  check('A: no culled app anywhere in the launcher', !CULLED_NAMES.some(name => new RegExp(`(^|\\n)${name}(\\n|$)`).test(launcherA)), CULLED_NAMES.filter(name => new RegExp(`(^|\\n)${name}(\\n|$)`).test(launcherA)).join(','));

  // ---- world B: different user, theme, wallpaper, enabled apps and mailbox; no reload ----
  await page.evaluate(world => window.pushWorld(world), worldB);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(screens, 'final-mac-world-b.png') });
  const b = await inspect(worldB);
  const accepted = await page.evaluate(() => OceanWorldModel.validate(world).ok && world.revision);
  check('B: shell intents were accepted by the parent model', accepted >= worldB.revision, `parent revision ${accepted}`);
  check('B: same document (no reload)', (await frame.evaluate(() => window.__oceanBootMarker)) === marker);
  check('B: dark theme, purple accent, abyss wallpaper', b.theme === 'dark' && b.accent === 'purple' && b.wallpaper.endsWith('depth-abyss.svg'), `${b.theme} ${b.accent} ${b.wallpaper}`);
  check('B: user identity', b.user === 'Jordan Blake' && b.home === 'jordan', `${b.user} /Users/${b.home}`);
  const expectedNative = new Set(worldB.installed.map(app => ({ files: 'finder', browser: 'safari', mfa: 'authenticator', updates: 'softwareupdate', texteditor: 'textedit', media: 'music', store: 'appstore', taskmanager: 'activitymonitor', whiteboard: 'freeform' })[app] ?? app));
  const unexpected = b.installed.filter(id => !expectedNative.has(id) && !['launchpad', 'preview'].includes(id));
  check('B: only the 16 enabled apps are installed', unexpected.length === 0 && [...expectedNative].every(id => b.installed.includes(id)), unexpected.join(',') || `${b.installed.length} native entries`);
  check('B: dock shows only enabled pins', b.dock.every(id => expectedNative.has(id) || id === 'launchpad' || id === 'downloads' || id === 'trash'), b.dock.join(','));
  check('B: mailbox swapped', b.mail.join('|') === worldB.data.mail.messages.map(m => m.subject).join('|'), b.mail.join(' | '));
  check('B: windows follow the world', b.windows.join() === ['authenticator', 'mail'].join(), b.windows.join());
  check('B: mail selects the payload message and its link chip shows the page address', b.bodyText.includes('payroll.contoso-hr.example/confirm') && !b.bodyText.includes('Open payroll-portal'));
  check('B: Authenticator shows the world prompt', b.bodyText.includes('Sign-in request · Contoso SSO') && b.bodyText.includes('Lisbon, PT') && b.bodyText.includes('42'));

  // Real clicks. As on macOS, the first click on an inactive window only activates it, so each window is activated first.
  // The mail link is highlighted, so it is also the follow-link choice; the page buttons and Approve are scene choices.
  const logStart = await page.evaluate(() => window.oceanLog.length);
  await frame.locator('[role=dialog][aria-label="Mail"]').click({ position: { x: 300, y: 20 } });
  await page.waitForTimeout(400);
  await frame.getByText('payroll.contoso-hr.example/confirm', { exact: true }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(screens, 'final-mac-world-b-scene-page.png') });
  const pageText = await frame.evaluate(() => document.body.innerText);
  check('B: link opens the data.web page in Safari (brand, heading, Not Secure, choices)', ['Contoso HR', 'Confirm your direct deposit', 'Not Secure', 'Sign in', 'Not now'].every(text => pageText.includes(text)));
  check('B: the scene page has no inputs or frames', await frame.evaluate(() => document.querySelectorAll('iframe, form').length === 0));
  await frame.getByText('Sign in', { exact: true }).click();
  await page.waitForTimeout(500);
  await frame.locator('[role=dialog][aria-label="Authenticator"]').click({ position: { x: 200, y: 20 } });
  await page.waitForTimeout(400);
  await frame.getByText('Approve', { exact: true }).click();
  await page.waitForTimeout(800);
  const clicked = (await page.evaluate(n => window.oceanLog.slice(n), logStart)).filter(m => m.type === 'world-intent').map(m => m.intent);
  const prompts = await page.evaluate(() => world.data.mfa.prompts.length);
  const choices = clicked.filter(i => i.kind === 'scene-choice').map(i => i.choiceId);
  check('B: clicks become intents (follow-link, open browser, sign-in, approve, mfa delete)', ['follow-link', 'sign-in', 'approve'].every(id => choices.includes(id))
    && clicked.some(i => i.kind === 'open-app' && i.app === 'browser') && clicked.some(i => i.kind === 'data' && i.store === 'mfa' && i.op === 'delete') && prompts === 0,
    clicked.map(i => i.kind + (i.choiceId ? ':' + i.choiceId : '')).join(','));
  const launcherB = await launcherText();
  await page.screenshot({ path: path.join(screens, 'final-mac-world-b-launcher.png') });
  await closeLauncher();
  const leaked = [...CULLED_NAMES, ...b.hiddenNames].filter(name => new RegExp(`(^|\\n)${name}(\\n|$)`).test(launcherB));
  check('B: launcher has no culled or disabled app', leaked.length === 0, leaked.join(',') || `hidden: ${b.hiddenNames.join(', ')}`);
  check('registry has no culled native app', !b.registry.some(id => ['weather', 'maps', 'stocks', 'podcasts', 'tv', 'photobooth', 'voicememos', 'diskutility', 'facetime', 'phone', 'chess', 'dictionary', 'home', 'news', 'games'].includes(id)));

  // ---- synced app stores (docs/desktop-parity/SYNC-AUDIT.md): world -> native ----
  const parentWorld = () => page.evaluate(() => world);
  const stepNow = (world, ...intents) => intents.reduce((current, intent) => {
    const result = WM.applyIntent(current, intent, Date.now());
    if (!result.ok) throw Error(`${intent.kind} ${intent.store ?? ''} ${intent.op ?? ''}: ${result.reason}`);
    return result.world;
  }, world);
  const d = (store, op, item) => ({ kind: 'data', store, op, item });
  let synced = await parentWorld();
  const firstTrack = synced.data.media.tracks[2];
  synced = stepNow(synced,
    { kind: 'open-app', app: 'terminal' },
    d('browser', 'visit', { id: 'h-sync', url: 'scene:handbook', title: 'Handbook' }),
    d('browser', 'bookmark-upsert', { id: 'bm-sync', title: 'Payroll (mine)', url: 'scene:payroll-portal' }),
    d('media', 'track-upsert', { ...firstTrack, title: 'Blue Note Sessions (live)' }),
    d('media', 'playlist-upsert', { id: 'pl-sync', name: 'Synced mix', trackIds: ['t3', 't1'] }),
    d('media', 'set-mode', { shuffle: false, repeat: 'one' }),
    d('media', 'set-playback', { trackId: 't3', queue: ['t3', 't1'], positionSec: 8, playing: false }),
    d('photos', 'photo-upsert', { ...synced.data.photos.items[0], favorite: true }),
    d('photos', 'album-upsert', { id: 'al-sync', name: 'Synced album', photoIds: ['p1', 'p4'] }),
    d('whiteboard', 'board-upsert', { id: 'board-sync', name: 'Synced board', items: [{ id: 'ff-s1', type: 'sticky', x: 10, y: 20, w: 200, h: 200, text: 'From Windows', color: 'green' }] }),
    d('calculator', 'set', { mode: 'scientific', angle: 'rad', base: 10, memory: 7 }),
    d('calculator', 'record', { id: 'tape-sync', expr: '6 × 7', result: '42' }),
    d('clock', 'city-upsert', { id: 'reykjavik', name: 'Reykjavik', tz: 'Atlantic/Reykjavik' }),
    d('clock', 'set-timer', { timer: { label: 'Tea', durationMs: 300000, remainingMs: 240000, running: true } }),
    d('clock', 'set-stopwatch', { running: false, elapsedMs: 65000, laps: [30000, 65000] }),
    d('terminal', 'record', { line: 'ls Documents' }),
    d('terminal', 'cd', { cwd: 'documents' }),
    d('stickies', 'upsert', { id: 'stk-sync', text: 'Synced sticky\nsecond line', color: 'purple', x: 120, y: 80, w: 220, h: 170, collapsed: false }),
    d('messages', 'pin', { threadId: synced.data.messages.threads[0].id, pinned: true }),
    d('contacts', 'upsert', { ...synced.data.contacts[0], favorite: true }),
    { kind: 'set-sys', patch: { wifiNetwork: 'Harbor-Library', dockAutohide: true, locationServices: false } });
  synced = stepNow(synced, d('browser', 'set-tabs', { tabs: [{ id: 'tab-sync-a', url: 'scene:payroll-portal', title: 'Contoso Payroll' }, { id: 'tab-sync-b', url: 'start:', title: 'Start Page' }], activeTabId: 'tab-sync-b' }));
  await page.evaluate(next => window.pushWorld(next), synced);
  await page.waitForTimeout(2500);
  const native = await frame.evaluate(() => {
    const M = window.__macos27;
    const safariWin = Object.values(M.wins.getState().windows).find(win => win.appId === 'safari');
    const tabs = safariWin && M.safariTabs.getState().byWin[safariWin.id];
    const clock = M.clock.getState();
    return {
      history: M.safari.getState().history.map(item => item.id), bookmarks: M.safari.getState().bookmarks.map(item => item.title),
      tabs: tabs ? tabs.tabs.map(tab => tab.id) : [], activeTab: tabs?.activeId,
      tracks: M.music.getState().tracks.map(track => track.title), playlists: M.music.getState().playlists.map(item => item.name), loved: M.music.getState().loved,
      repeat: M.music.getState().repeat, queue: M.music.getState().queue, qIndex: M.music.getState().qIndex,
      player: (({ owner, src, playing, position }) => ({ owner, src, playing, position }))(M.player.getState()),
      photo: M.photos.getState().items.find(item => item.id === 'p1')?.favorite, albums: M.photos.getState().albums.map(item => item.name),
      boards: M.freeform.getState().boards.map(board => `${board.name}:${board.items.length}`), activeBoard: M.freeform.getState().activeBoardId,
      calc: (({ mode, angleDeg, memory, tape }) => ({ mode, angleDeg, memory, tape: tape.map(item => item.expr) }))(M.calculator.getState()),
      cities: clock.cities.map(city => city.name), timer: clock.timer && { label: clock.timer.label, paused: clock.timer.paused, left: clock.timer.endsAt - Date.now() },
      stopwatch: { accum: clock.swAccum, laps: clock.swLaps.map(lap => lap.total) },
      terminal: M.terminal.getState().history, bodyText: document.body.innerText,
      stickies: M.stickies.getState().stickies.map(item => `${item.color}:${item.html}`),
      pinned: M.messages.getState().convs.filter(conv => conv.pinned).map(conv => conv.id), favorite: M.contacts.getState().contacts.filter(item => item.favorite).map(item => item.id),
      sys: (({ wifiNetwork, dockAutohide }) => ({ wifiNetwork, dockAutohide }))(M.sys.getState()), location: M.settingsStore.getState().privacy.locationServices,
    };
  });
  await page.screenshot({ path: path.join(screens, 'final-mac-sync-world.png') });
  check('sync: browser history, own bookmark and tab strip follow the world', native.history.includes('h-sync') && native.bookmarks.includes('Payroll (mine)')
    && native.tabs.join() === 'tab-sync-a,tab-sync-b' && native.activeTab === 'tab-sync-b', JSON.stringify([native.history, native.bookmarks, native.tabs, native.activeTab]));
  check('sync: music library, playlist, repeat and the paused now-playing track and position follow the world', native.tracks.includes('Blue Note Sessions (live)') && native.playlists.includes('Synced mix')
    && native.repeat === 'one' && native.queue.join() === 't3,t1' && native.qIndex === 0 && native.player.owner === 'music' && native.player.src.endsWith('track-3.mp3')
    && !native.player.playing && Math.abs(native.player.position - 8) < 1.5, JSON.stringify([native.repeat, native.queue, native.player]));
  check('sync: photos favourite and album follow the world', native.photo === true && native.albums.includes('Synced album'), native.albums.join());
  check('sync: whiteboard board opens with its items', native.boards.includes('Synced board:1') && native.activeBoard === 'board-sync', native.boards.join());
  check('sync: calculator mode, memory and history follow the world', native.calc.mode === 'scientific' && !native.calc.angleDeg && native.calc.memory === 7 && native.calc.tape[0] === '6 × 7', JSON.stringify(native.calc));
  check('sync: world clock, running timer and stopwatch follow the world', native.cities.includes('Reykjavik') && native.cities.includes('Harbor City') && native.timer?.label === 'Tea'
    && !native.timer.paused && native.timer.left > 230000 && native.timer.left <= 240000 && native.stopwatch.accum === 65000 && native.stopwatch.laps.join() === '30000,65000', JSON.stringify([native.timer, native.stopwatch]));
  check('sync: terminal history and working directory follow the world', native.terminal.at(-1) === 'ls Documents' && /(~|\/Users\/[a-z]+)\/Documents %/.test(native.bodyText), native.terminal.join(' | ') + ' / ' + (native.bodyText.match(/.{0,20}@mac.{0,30}/) ?? [''])[0]);
  check('sync: stickies, pinned thread, favourite contact and optional settings follow the world', native.stickies.some(item => item.startsWith('purple:') && item.includes('second line'))
    && native.pinned.length === 1 && native.favorite.length === 1 && native.sys.wifiNetwork === 'Harbor-Library' && native.sys.dockAutohide === true && native.location === false,
    JSON.stringify([native.pinned, native.favorite, native.sys, native.location]));

  // ---- synced app stores: native gestures -> intents -> parent world ----
  const syncStart = await page.evaluate(() => window.oceanLog.length);
  await frame.evaluate(() => {
    const M = window.__macos27;
    M.calculator.getState().pushTape({ expr: '20 + 22', result: '42', value: '42' });
    M.calculator.getState().setMode('programmer');
    M.clock.getState().addCity({ name: 'Paris', tz: 'Europe/Paris' });
    M.clock.getState().swStart();
    M.clock.getState().setTimer(null);
    M.terminal.getState().pushHistory('whoami');
    M.stickies.getState().addSticky();
    M.freeform.getState().addBoard('Ideas');
    M.photos.getState().toggleFavorite('p2');
    M.photos.getState().createAlbum('Trip');
    M.music.getState().toggleLove('t2');
    M.music.getState().createPlaylist('Gym');
    M.music.getState().cycleRepeat();
    M.safari.getState().addBookmark({ title: 'Payroll again', url: 'scene:payroll-portal', folder: 'favorites' });
    M.sys.getState().set({ showBatteryPercent: true });
    M.settingsStore.getState().togglePrivacy('analytics');
    const convs = M.messages.getState().convs;
    M.messages.setState({ convs: convs.map((conv, index) => (index === 1 ? { ...conv, pinned: true } : conv)) });
    M.reminders.setState({ reminders: M.reminders.getState().reminders.map((item, index) => (index === 0 ? { ...item, flagged: true, priority: 3 } : item)) });
    const safariWin = Object.values(M.wins.getState().windows).find(win => win.appId === 'safari');
    const entry = M.safariTabs.getState().byWin[safariWin.id];
    const tab = M.newSafariTab('start:');
    M.safariTabs.setState({ byWin: { ...M.safariTabs.getState().byWin, [safariWin.id]: { ...entry, tabs: [...entry.tabs, tab], activeId: tab.id } } });
    M.music.getState().playTrack('t1');
  });
  // Real typing: cd in the Terminal window is the world's working directory.
  await frame.locator('[role=dialog][aria-label*="zsh"]').click({ position: { x: 200, y: 120 } });
  await page.waitForTimeout(300);
  await page.keyboard.type('cd ../Desktop');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const after = await parentWorld();
  const syncIntents = (await page.evaluate(n => window.oceanLog.slice(n), syncStart)).filter(m => m.type === 'world-intent').map(m => m.intent);
  const sent = new Set(syncIntents.map(i => `${i.store ?? i.kind}:${i.op ?? ''}`));
  check('sync: native gestures become valid intents for every synced store', syncIntents.every(i => WM.parseIntent(i)) && ['calculator:record', 'calculator:set', 'clock:city-upsert',
    'clock:set-stopwatch', 'clock:set-timer', 'terminal:record', 'terminal:cd', 'stickies:upsert', 'whiteboard:board-upsert', 'photos:photo-upsert', 'photos:album-upsert', 'media:track-upsert',
    'media:playlist-upsert', 'media:set-mode', 'media:set-playback', 'browser:bookmark-upsert', 'browser:set-tabs', 'set-sys:', 'messages:pin', 'reminders:upsert'].every(key => sent.has(key)),
    [...sent].sort().join(' '));
  check('sync: the parent world took them (calculator, clock, terminal, stickies, board, photos, music, browser)', after.data.calculator.history[0].expr === '20 + 22'
    && after.data.calculator.mode === 'programmer' && after.data.clock.worldClocks.some(city => city.name === 'Paris') && after.data.clock.stopwatch.running && after.data.clock.timer === null
    && after.data.terminal.history.at(-1) === 'cd ../Desktop' && after.data.terminal.cwd === 'desktop' && after.data.stickies.length === synced.data.stickies.length + 1
    && after.data.whiteboard.boards.some(board => board.name === 'Ideas') && after.data.photos.items.find(item => item.id === 'p2').favorite === !synced.data.photos.items.find(item => item.id === 'p2').favorite
    && after.data.photos.albums.some(album => album.name === 'Trip') && after.data.media.tracks.find(track => track.id === 't2').loved !== synced.data.media.tracks.find(track => track.id === 't2').loved
    && after.data.media.playlists.some(item => item.name === 'Gym') && after.data.media.nowPlaying?.trackId === 't1' && after.data.browser.bookmarks.some(item => item.title === 'Payroll again')
    && after.data.browser.tabs.length === 3, JSON.stringify({ calc: after.data.calculator.history[0], cwd: after.data.terminal.cwd, term: after.data.terminal.history.at(-1), np: after.data.media.nowPlaying, tabs: after.data.browser.tabs.length }));
  check('sync: settings, pin, reminder flag reached the parent world', after.sys.showBatteryPercent === true && after.sys.shareAnalytics === !synced.sys.shareAnalytics
    && after.data.messages.threads.filter(thread => thread.pinned).length === 2 && after.data.reminders[0].flagged === true && after.data.reminders[0].priority === 3,
    JSON.stringify([after.sys.showBatteryPercent, after.sys.shareAnalytics, after.data.reminders[0]]));
  const echoStart = await page.evaluate(() => window.oceanLog.length);
  await page.waitForTimeout(1200);
  const echoes = (await page.evaluate(n => window.oceanLog.slice(n), echoStart)).filter(m => m.type === 'world-intent');
  check('sync: applying the accepted world sends no echo intents', echoes.length === 0, echoes.map(m => `${m.intent.kind}:${m.intent.store ?? ''}:${m.intent.op ?? ''}`).join(','));

  // ---- OS switch: only the visible shell plays; the hidden one resumes from the world ----
  await page.evaluate(next => window.pushWorld(next), stepNow(await parentWorld(), d('media', 'set-playback', { trackId: 't1', queue: ['t1', 't2'], positionSec: 5, playing: true })));
  await page.waitForTimeout(1200);
  const playingBefore = await frame.evaluate(() => window.__macos27.player.getState().playing);
  await page.evaluate(() => window.setActive(false));
  await page.waitForTimeout(500);
  const hidden = await frame.evaluate(() => window.__macos27.player.getState().playing);
  const worldHidden = await parentWorld();
  await page.evaluate(() => window.setActive(true));
  await page.waitForTimeout(1200);
  const shown = await frame.evaluate(() => (({ playing, position }) => ({ playing, position }))(window.__macos27.player.getState()));
  check('sync: the hidden shell pauses locally and resumes the world track when shown', playingBefore && !hidden && worldHidden.data.media.nowPlaying.playing && shown.playing && shown.position >= 5,
    JSON.stringify({ playingBefore, hidden, shown }));
  await page.evaluate(next => window.pushWorld(next), stepNow(await parentWorld(), d('media', 'set-playback', { trackId: null, queue: [], positionSec: 0, playing: false })));
  await page.waitForTimeout(600);

  // ---- native gesture -> intent (the parent now ignores intents) ----
  await page.evaluate(() => { window.acceptIntents = false; });
  const before = await page.evaluate(() => window.oceanLog.length);
  await frame.evaluate(() => window.__macos27.mail.getState().toggleFlag('m-it'));
  await frame.evaluate(() => window.__macos27.sys.getState().setTheme('light'));
  await page.waitForTimeout(400);
  const intents = (await page.evaluate(n => window.oceanLog.slice(n), before)).filter(message => message.type === 'world-intent');
  check('gestures become v3 world intents', intents.some(m => m.intent.kind === 'data' && m.intent.item.id === 'm-it') && intents.some(m => m.intent.kind === 'set-sys' && m.intent.patch.theme === 'light')
    && intents.every(m => WM.parseIntentMessage(m)), intents.map(m => m.intent.kind).join(','));
  // The parent did not accept them: the shell rolls back to the parent's world.
  await page.waitForTimeout(1900);
  const reverted = await frame.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('unanswered intents roll back to the parent world', reverted === 'dark', reverted);

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
