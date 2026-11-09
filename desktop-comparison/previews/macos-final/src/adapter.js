// OceanWorldAdapter for the final macOS shell (WORLD-CONTRACT v3 §3).
// apply(world) maps the parent-owned world onto the Kimi macOS Zustand stores exposed as window.__macos27.
// Native gestures become world intents. With a parent (MessageChannel attach) they go to the parent, which answers with
// the next world; without one (standalone) they are applied locally with OceanWorldModel.
(() => {
  'use strict';

  const M = window.__macos27;
  const WM = window.OceanWorldModel;
  if (!M || !WM) {
    console.error('OceanWorldAdapter: the macOS stores or the world model are missing.');
    return;
  }

  // Canonical id -> native registry id. Companion native apps share their canonical app's install state.
  const NATIVE = Object.freeze({
    files: 'finder', browser: 'safari', mail: 'mail', messages: 'messages', mfa: 'authenticator', updates: 'softwareupdate',
    settings: 'settings', terminal: 'terminal', notes: 'notes', texteditor: 'textedit', calendar: 'calendar', reminders: 'reminders',
    contacts: 'contacts', photos: 'photos', media: 'music', calculator: 'calculator', clock: 'clock', store: 'appstore',
    taskmanager: 'activitymonitor', stickies: 'stickies', whiteboard: 'freeform', program: 'oceanprogram',
  });
  const COMPANIONS = Object.freeze({ preview: 'photos', quicktime: 'media' });
  const CANONICAL = Object.freeze({ ...Object.fromEntries(Object.entries(NATIVE).map(([canonical, native]) => [native, canonical])), ...COMPANIONS });
  const UTILITIES = ['activitymonitor', 'terminal'];
  const ASSETS = Object.freeze({ offsite: './photo-3.jpg' });
  // Logical asset ids (SYNC-AUDIT.md §4) <-> the bundled media files.
  const assetUrl = id => (/^(photo|cover)-\d+$/.test(id) ? `./${id}.jpg` : /^track-\d+$/.test(id) ? `./${id}.mp3` : ASSETS[id]);
  const assetOf = url => /^\.?\/((photo|cover|track)-\d+)\.(jpg|mp3)$/.exec(String(url))?.[1];
  const HOST_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const PENDING_MS = 2500;
  const RESYNC_MS = 1500;

  let world = null;
  let applying = false;
  let mode = 'standalone';
  let active = true;
  let port = null;
  let seq = 0;
  let resyncTimer = 0;
  const listeners = new Set();
  const queue = [];
  const winMap = new Map();          // world window id -> native window id
  const pendingNative = new Map();   // native window id -> { app, at } (opened natively, waiting for the world)
  const appliedFrame = new Map();    // native window id -> JSON of the applied {mode, tile, rect}
  const rectTimers = new Map();
  const closedByWorld = new Set();   // native window ids the adapter closed (their Safari tabs close silently)
  let base = null;                   // native snapshots taken right after apply: the diff baseline for intents

  const json = value => JSON.stringify(value);
  const clone = value => JSON.parse(json(value));
  const tabsReported = new Set();      // native Safari window ids whose tabs were reported after adoption
  const terminalSessions = new Set();   // native Terminal sessions (bundle patch), so a world cwd change can move them
  const same = (a, b) => json(a) === json(b);
  // Sections re-applied even when the world did not change them: native drift the parent did not accept.
  const forced = new Set();
  const changed = (prev, next, pick, section) => forced.has(section) || !prev || !same(pick(prev), pick(next));
  const esc = text => String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
  const iso = ms => new Date(ms).toISOString();
  const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'person';
  const isInstalledCanonical = app => Boolean(world?.installed.includes(app));
  // Scene gating shared with Windows: a gesture is also a scene choice only while the highlight points at it.
  const highlighted = (app, ref) => world?.scene.highlight?.app === app && (ref === undefined || world.scene.highlight.ref === ref);
  const sceneChoice = (choiceId, app, ref) => { if (highlighted(app, ref)) emit({ kind: 'scene-choice', choiceId }); };

  // ---- coordinates: the world's 1000x600 work area <-> the macOS work area in pixels ----
  function toPx(rect) {
    const area = M.workArea();
    return { x: Math.round(area.x + rect.x * area.w / 1000), y: Math.round(area.y + rect.y * area.h / 600), w: Math.round(rect.w * area.w / 1000), h: Math.round(rect.h * area.h / 600) };
  }
  function toVirtual(rect) {
    const area = M.workArea();
    return { x: Math.round((rect.x - area.x) * 1000 / area.w), y: Math.round((rect.y - area.y) * 600 / area.h), w: Math.round(rect.w * 1000 / area.w), h: Math.round(rect.h * 600 / area.h) };
  }
  const nearRect = (a, b) => a && b && ['x', 'y', 'w', 'h'].every(key => Math.abs(a[key] - b[key]) <= 2);

  // ---- intents out ----
  function emit(intent) {
    if (applying || !active) return;
    queue.push(intent);
    if (queue.length === 1) queueMicrotask(flush);
  }
  function flush() {
    const intents = queue.splice(0);
    if (!world || intents.length === 0) return;
    for (const intent of intents) for (const listener of listeners) listener(intent);
    if (mode === 'parent') {
      for (const intent of intents) {
        const parsed = WM.parseIntent(intent);
        if (!parsed) continue;
        seq += 1;
        port.postMessage({ type: 'world-intent', version: 3, revision: world.revision, seq, intent: parsed });
      }
      for (const intent of intents) for (const section of sectionsOf(intent)) drifted.add(section);
      clearTimeout(resyncTimer);
      resyncTimer = setTimeout(resync, RESYNC_MS);
      return;
    }
    let next = world;
    let rejected = false;
    for (const intent of intents) {
      const result = WM.applyIntent(next, intent, Date.now());
      if (result.ok) next = result.world;
      else {
        rejected = true;
        console.info('OceanWorldAdapter: intent refused', intent.kind, result.reason);
      }
    }
    if (rejected) for (const intent of intents) for (const section of sectionsOf(intent)) drifted.add(section);
    if (next !== world || rejected) apply(next, world, rejected);
  }
  // Which adapter sections an intent touches, so a refused intent re-applies only those.
  const drifted = new Set();
  function sectionsOf(intent) {
    if (intent.kind === 'data') return [intent.store];
    return ({ 'set-sys': ['sys'], 'set-phase': ['phase', 'windows'], 'toggle-overlay': ['overlays'], fs: ['fs'], dock: ['apps'], install: ['apps'],
      'notify-dismiss': ['notifications'], 'notify-clear': ['notifications'], 'scene-choice': [] })[intent.kind] ?? ['windows'];
  }
  function resync() {
    if (world) apply(world, world, true);
  }

  // ---- phase, sys, user ----
  function wallpaperFor(sys) {
    if (sys.wallpaperUrl) return sys.wallpaperUrl;
    if (sys.wallpaper !== 'stock') return `./src/wallpapers/${sys.wallpaper}.svg`;
    const current = M.sys.getState().wallpaper;
    return /^\.\/wallpaper-[a-z-]+\.jpg$/.test(current) ? current : './wallpaper-tahoe-day.jpg';
  }
  // Optional synced settings: world key -> native sys key. An absent world key means the model default (WM.SYS_DEFAULTS).
  const SYS_OPTIONAL = Object.freeze({ dockAutohide: 'dockAutohide', showBatteryPercent: 'showBatteryPercent', increaseContrast: 'increaseContrast', wifiNetwork: 'wifiNetwork' });
  // The same for Settings ▸ Privacy (the Settings app store).
  const PRIVACY = Object.freeze({ locationServices: 'locationServices', shareAnalytics: 'analytics', personalizedAds: 'personalizedAds' });
  const effectiveSys = sys => ({ ...WM.SYS_DEFAULTS, ...sys });
  function nativeSys(worldSys) {
    const sys = effectiveSys(worldSys);
    const out = {
      theme: sys.theme, accent: sys.accent, wallpaper: wallpaperFor(sys), volume: sys.volume / 100, muted: sys.muted,
      brightness: sys.brightness / 100, nightShift: sys.nightLight, wifi: sys.wifi, bluetooth: sys.bluetooth,
      focus: sys.focus, lowPowerMode: sys.lowPower, reduceMotion: sys.reduceMotion, reduceTransparency: sys.reduceTransparency,
    };
    for (const [key, native] of Object.entries(SYS_OPTIONAL)) out[native] = sys[key];
    return out;
  }
  function optionalSysFromNative() {
    const state = M.sys.getState();
    const privacy = M.settingsStore.getState().privacy;
    return { ...Object.fromEntries(Object.entries(SYS_OPTIONAL).map(([key, native]) => [key, state[native]])),
      ...Object.fromEntries(Object.entries(PRIVACY).map(([key, native]) => [key, privacy[native]])) };
  }
  function worldSysFromNative() {
    const state = M.sys.getState();
    const theme = state.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.theme;
    const out = {
      theme, accent: state.accent, volume: Math.round(state.volume * 100), muted: state.muted,
      brightness: Math.min(100, Math.max(20, Math.round(state.brightness * 100))), nightLight: state.nightShift, wifi: state.wifi,
      bluetooth: state.bluetooth, focus: state.focus, lowPower: state.lowPowerMode, battery: Math.round(state.battery.level * 100),
      reduceMotion: state.reduceMotion, reduceTransparency: state.reduceTransparency,
    };
    const url = state.wallpaper;
    const depth = /^\.\/src\/wallpapers\/(depth-[a-z]+)\.svg$/.exec(url);
    if (url === wallpaperFor(world.sys)) Object.assign(out, { wallpaper: world.sys.wallpaper, wallpaperUrl: world.sys.wallpaperUrl ?? null });
    else if (depth) Object.assign(out, { wallpaper: depth[1], wallpaperUrl: null });
    else if (/^data:image\/(png|jpeg|webp);base64,/.test(url) && url.length < 180000) out.wallpaperUrl = url;
    else Object.assign(out, { wallpaper: 'stock', wallpaperUrl: null });
    for (const [key, value] of Object.entries(optionalSysFromNative())) {
      const valid = typeof value === 'boolean' || (key === 'wifiNetwork' && typeof value === 'string' && value.trim() && value.length <= 40 && !/[\r\n]/.test(value));
      out[key] = valid ? value : effectiveSys(world.sys)[key];
    }
    return out;
  }

  function applyUser(next) {
    const { short, name, email } = next.user;
    Object.assign(window.__oceanUser, { short, name, email });
    Object.assign(M.mailIdentity, { name, email });
    if (M.sys.getState().user?.name !== name) M.sys.setState({ user: { ...M.sys.getState().user, name } });
  }

  function applySys(next, prev) {
    const target = nativeSys(next.sys);
    const state = M.sys.getState();
    const patch = Object.fromEntries(Object.entries(target).filter(([key, value]) => state[key] !== value));
    if (changed(prev, next, w => w.sys.battery, 'sys')) patch.battery = { level: next.sys.battery / 100, charging: false };
    if (state.openAtLogin.length) patch.openAtLogin = [];
    if (Object.keys(patch).length) M.sys.setState(patch);
    const privacy = M.settingsStore.getState().privacy;
    const sys = effectiveSys(next.sys);
    const privacyPatch = Object.fromEntries(Object.entries(PRIVACY).filter(([key, native]) => privacy[native] !== sys[key]).map(([key, native]) => [native, sys[key]]));
    if (Object.keys(privacyPatch).length) M.settingsStore.setState({ privacy: { ...privacy, ...privacyPatch } });
    document.documentElement.dataset.oceanWallpaper = next.sys.wallpaperUrl ? 'custom' : next.sys.wallpaper;
  }

  // ---- installed apps, dock ----
  function nativeInstalled(next) {
    // The program window (a system app, never in world.installed) can always open.
    const set = new Set(['launchpad', 'oceanprogram']);
    for (const app of next.installed) set.add(NATIVE[app]);
    for (const [native, canonical] of Object.entries(COMPANIONS)) if (next.installed.includes(canonical)) set.add(native);
    return set;
  }
  function applyApps(next, prev) {
    if (!changed(prev, next, w => [w.installed, w.dock], 'apps')) return;
    const installed = nativeInstalled(next);
    const pins = next.dock.pins.map(app => NATIVE[app]);
    pins.splice(Math.min(1, pins.length), 0, 'launchpad');
    const badges = Object.fromEntries(Object.entries(next.dock.badges).map(([app, count]) => [NATIVE[app], count]));
    M.apps.setState({ isInstalled: id => installed.has(id), dockPins: pins, badges, openAtLogin: [], installedExtraApps: [] });
  }

  // ---- files ----
  function nativeFs(next) {
    const current = M.fs.getState().nodes;
    const stamp = Date.now();
    const node = (id, parentId, name, extra = {}) => ({ created: stamp, modified: stamp, ...current[id], id, parentId, name, kind: 'folder', trashed: false, ...extra });
    const nodes = {
      root: node('root', null, '/'),
      applications: node('applications', 'root', 'Applications'),
      'apps-utilities': node('apps-utilities', 'applications', 'Utilities'),
      users: node('users', 'root', 'Users'),
    };
    const installed = nativeInstalled(next);
    for (const entry of M.registry) {
      if (entry.hidden || !installed.has(entry.id)) continue;
      nodes[`app-${entry.id}`] = node(`app-${entry.id}`, UTILITIES.includes(entry.id) ? 'apps-utilities' : 'applications', entry.name, { kind: 'app', appId: entry.id });
    }
    for (const item of Object.values(next.fs.nodes)) {
      if (item.id === 'root') continue;
      const time = Date.parse(item.modified);
      const content = item.contentId ? next.data.contents[item.contentId] : undefined;
      const converted = { id: item.id, parentId: item.id === 'home' ? 'users' : item.parentId, name: item.name, kind: item.kind,
        mime: item.mime ?? undefined, created: time, modified: time, trashed: item.trashed };
      if (item.encrypted) converted.encrypted = true;
      if (item.hidden) converted.hidden = true;
      if (content?.text !== undefined) converted.content = content.text;
      if (content?.asset) converted.assetUrl = assetUrl(content.asset) ?? './photo-1.jpg';
      if (item.kind === 'app') {
        converted.appId = NATIVE[item.appId];
      }
      nodes[item.id] = converted;
    }
    const area = M.workArea();
    const desktopPositions = {};
    const onDesktop = Object.values(next.fs.nodes).filter(item => item.parentId === 'desktop' && !item.trashed);
    for (const item of onDesktop) {
      if (item.desktopPos) desktopPositions[item.id] = { x: Math.round(item.desktopPos.x * area.w / 1000), y: Math.round(item.desktopPos.y * area.h / 600) };
    }
    // Icons without a world position take the first free cell of the right-hand grid, so none overlap.
    const taken = Object.values(desktopPositions);
    for (const item of onDesktop.filter(entry => !entry.desktopPos)) {
      for (let cell = 0; cell < 200; cell += 1) {
        const rows = Math.max(1, Math.floor((area.h - 40) / 100));
        const slot = { x: innerWidth - 108 - Math.floor(cell / rows) * 96, y: 34 + (cell % rows) * 100 };
        if (taken.some(pos => Math.abs(pos.x - slot.x) < 80 && Math.abs(pos.y - slot.y) < 80)) continue;
        desktopPositions[item.id] = slot;
        taken.push(slot);
        break;
      }
    }
    return { nodes, desktopPositions };
  }
  let fsArea = null;   // the work area the desktop icon positions were computed for
  function applyFs(next, prev) {
    const area = json(M.workArea());
    if (!changed(prev, next, w => [w.fs, w.data.contents, w.installed, w.user], 'fs') && area === fsArea) return;
    fsArea = area;
    M.fs.setState(nativeFs(next));
  }

  // ---- windows ----
  function nativePayload(win) {
    const payload = win.payload;
    const fs = M.fs.getState();
    if (payload?.folderId) return { folderId: payload.folderId, path: fs.pathOf(payload.folderId) };
    if (payload?.fileId) return { fileId: payload.fileId, path: fs.pathOf(payload.fileId) };
    if (payload?.messageId) return { messageId: payload.messageId };
    if (payload?.url) return { url: payload.url };
    if (payload?.view) return programPayload(payload);
    if (payload?.pane && win.app === 'settings' && SETTINGS_PANE[payload.pane]) return { pane: SETTINGS_PANE[payload.pane] };
    return undefined;
  }
  // World Settings panes (world-model SETTINGS_PANES) and the native panes that show them: start-up items are Login Items.
  const SETTINGS_PANE = Object.freeze({ startup: 'loginitems', privacy: 'privacy', network: 'network' });
  // A program window's payload, exactly as the world has it: { view, page?, flips? }.
  function programPayload(payload) {
    return { view: payload.view, ...(payload.page === undefined ? {} : { page: payload.page }), ...(payload.flips ? { flips: payload.flips } : {}) };
  }
  function programTitle(win) {
    return world?.data.views?.[win.payload?.view]?.title ?? 'Program';
  }
  function nativeAppFor(win) {
    const file = win.payload?.fileId ? world.fs.nodes[win.payload.fileId] : null;
    if (win.app === 'photos' && file) return 'preview';
    if (win.app === 'media' && file && !/^audio\//.test(file.mime ?? '')) return 'quicktime';
    return NATIVE[win.app];
  }
  function frameKey(win) {
    return json({ mode: win.mode, tile: win.tile, rect: win.rect });
  }
  function syncWindow(win, nativeId, force) {
    const store = M.wins.getState();
    const native = store.windows[nativeId];
    if (!native) return;
    if (win.mode === 'minimized') {
      if (!native.minimized) store.minimize(nativeId);
      appliedFrame.set(nativeId, frameKey(win));
      return;
    }
    if (native.minimized || native.hidden) store.focus(nativeId);
    if ((win.mode === 'fullscreen') !== Boolean(M.wins.getState().windows[nativeId].fullscreen)) M.wins.getState().toggleFullscreen(nativeId);
    if (win.mode !== 'fullscreen' && (force || appliedFrame.get(nativeId) !== frameKey(win))) {
      const target = win.mode === 'maximized' ? M.tileRect('fill') : win.tile ? M.tileRect(win.tile) : toPx(win.rect);
      if (!nearRect(M.wins.getState().windows[nativeId].rect, target)) M.wins.getState().setFrame(nativeId, target);
    }
    appliedFrame.set(nativeId, frameKey(win));
  }
  function applyWindows(next, prev) {
    const store = () => M.wins.getState();
    for (const [worldId, nativeId] of winMap) if (!store().windows[nativeId]) winMap.delete(worldId);
    const wanted = new Set(next.windows.map(win => win.id));
    for (const [worldId, nativeId] of [...winMap]) {
      if (wanted.has(worldId)) continue;
      closedByWorld.add(nativeId);
      store().close(nativeId);
      winMap.delete(worldId);
    }
    const mapped = () => new Set(winMap.values());
    for (const win of next.windows) {
      let nativeId = winMap.get(win.id);
      const fresh = !nativeId;
      // An adopted native window opened on another item than the world window (a dock open the scene redirected).
      let adoptedOther = false;
      if (!nativeId) {
        const adopt = [...pendingNative].find(([id, item]) => item.app === win.app && store().windows[id]);
        if (adopt) {
          nativeId = adopt[0];
          adoptedOther = !same(adopt[1].payload ?? null, win.payload);
          pendingNative.delete(nativeId);
        } else {
          const opened = M.open(nativeAppFor(win), nativePayload(win));
          if (!opened || mapped().has(opened)) continue;
          nativeId = opened;
          if (win.app === 'program') M.wins.setState({ windows: { ...store().windows, [opened]: { ...store().windows[opened], title: programTitle(win) } } });
        }
        winMap.set(win.id, nativeId);
      }
      const before = prev?.windows.find(item => item.id === win.id);
      syncWindow(win, nativeId, fresh || !before || forced.has('windows'));
      // Mail shows its payload message: on open, when the payload changes, and when the message arrives after the window.
      const messageId = win.app === 'mail' ? win.payload?.messageId : undefined;
      if (messageId && (fresh || !same(before?.payload, win.payload) || !prev?.data.mail.messages.some(item => item.id === messageId))) M.selectMail(messageId);
      // The reused Mail window now shows that message: its native payload says so too.
      const mailWin = win.app === 'mail' && store().windows[winMap.get(win.id)];
      if (mailWin && (mailWin.payload?.messageId ?? null) !== (messageId ?? null)) {
        M.wins.setState({ windows: { ...store().windows, [mailWin.id]: { ...mailWin, payload: nativePayload(win) } } });
      }
      // A program window turns the page in place (the component reads its native payload).
      const programWin = win.app === 'program' && store().windows[winMap.get(win.id)];
      if (programWin && (!same(programWin.payload, nativePayload(win)) || programWin.title !== programTitle(win))) {
        M.wins.setState({ windows: { ...store().windows, [programWin.id]: { ...programWin, payload: nativePayload(win), title: programTitle(win) } } });
      }
      // A reused window whose payload changed: point the running app at the new item.
      if ((before && !same(before.payload, win.payload)) || adoptedOther) {
        if (win.app !== 'mail' && win.app !== 'program') {
          closedByWorld.add(nativeId);
          store().close(nativeId);
          const reopened = M.open(nativeAppFor(win), nativePayload(win));
          if (reopened) {
            winMap.set(win.id, reopened);
            syncWindow(win, reopened, true);
          }
        }
      }
    }
    const now = Date.now();
    for (const [nativeId, item] of [...pendingNative]) {
      if (!store().windows[nativeId]) pendingNative.delete(nativeId);
      else if (now - item.at > PENDING_MS) {
        pendingNative.delete(nativeId);
        closedByWorld.add(nativeId);
        store().close(nativeId);
      }
    }
    // Native windows the world does not know about close, except the launcher panel and fresh native opens.
    const known = mapped();
    for (const [nativeId, native] of Object.entries(store().windows)) {
      if (!known.has(nativeId) && !pendingNative.has(nativeId) && CANONICAL[native.appId]) {
        closedByWorld.add(nativeId);
        store().close(nativeId);
      }
    }
    const order = next.order.map(id => winMap.get(id)).filter(id => id && store().windows[id]);
    const others = store().zOrder.filter(id => !order.includes(id));
    const focusedId = next.focusedId ? winMap.get(next.focusedId) ?? null : null;
    const zOrder = [...order, ...others];
    if (!same(zOrder, store().zOrder) || store().focusedId !== (others.length && pendingNative.size ? store().focusedId : focusedId)) {
      M.wins.setState({ zOrder, focusedId: others.length && pendingNative.size ? store().focusedId : focusedId });
    }
  }

  // ---- overlays, notifications ----
  function nativeOverlays() {
    const ui = M.ui.getState();
    const wins = M.wins.getState();
    return {
      launcher: ui.spotlightOpen && ui.spotlightTab === 'apps', search: ui.spotlightOpen && ui.spotlightTab !== 'apps',
      quick: ui.ccOpen, centre: M.notify.getState().ncOpen, taskView: Boolean(wins.missionControl), switcher: wins.appSwitcher.open,
    };
  }
  function applyOverlays(next, prev) {
    if (!changed(prev, next, w => w.overlays, 'overlays')) return;
    const overlays = next.overlays;
    const ui = M.ui.getState();
    const current = nativeOverlays();
    // Search keeps whichever non-Apps tab (Files, Actions, Clipboard) is already showing.
    if ((overlays.launcher && !current.launcher) || (overlays.search && !current.search)) ui.openSpotlight(overlays.launcher ? 'apps' : 'files');
    else if (!overlays.launcher && !overlays.search && ui.spotlightOpen) ui.closeSpotlight();
    if (ui.ccOpen !== overlays.quick) M.ui.getState().setCcOpen(overlays.quick);
    if (M.notify.getState().ncOpen !== overlays.centre) M.notify.getState().setNcOpen(overlays.centre);
    if (Boolean(M.wins.getState().missionControl) !== overlays.taskView) M.wins.getState().setMissionControl(overlays.taskView ? 'all' : false);
    if (M.wins.getState().appSwitcher.open !== overlays.switcher) M.wins.getState().setAppSwitcher({ open: overlays.switcher, index: 0 });
  }
  const nativeNotification = item => ({ id: item.id, appId: NATIVE[item.app], title: item.title, body: item.body, at: Date.parse(item.time) });
  function applyNotifications(next, prev) {
    if (!changed(prev, next, w => w.notifications, 'notifications')) return;
    M.notify.setState({ banners: next.notifications.banners.map(nativeNotification), history: next.notifications.history.map(nativeNotification) });
  }

  // ---- per-app data ----
  const parseAddress = text => {
    const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(text);
    return match ? { name: match[1] || match[2], email: match[2] } : { name: text.trim().split('@')[0], email: text.trim() };
  };
  const addressText = person => (person.name && person.name !== person.email ? `${person.name} <${person.email}>` : person.email);
  function nativeMail(message) {
    const to = message.to.split(',').filter(part => part.trim()).map(parseAddress);
    return { id: message.id, mailbox: message.folder, account: 'icloud', from: parseAddress(message.from), to, subject: message.subject,
      body: message.body, at: Date.parse(message.time), read: message.read, flagged: message.flagged };
  }
  function noteHtml(note) {
    return `<h1>${esc(note.title) || '<br>'}</h1>${note.body.split('\n').map(line => `<div>${esc(line) || '<br>'}</div>`).join('')}`;
  }
  function noteText(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const blocks = [...doc.body.children].map(element => element.textContent.replace(/\u00a0/g, ' '));
    if (blocks.length === 0) return { title: doc.body.textContent.slice(0, 120), body: '' };
    return { title: blocks[0].replace(/[\r\n]+/g, ' ').slice(0, 120), body: blocks.slice(1).join('\n').slice(0, 16000) };
  }
  const listColors = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F'];
  function personFor(name, contacts) {
    const contact = contacts.find(item => item.name === name);
    const [first] = name.split(/\s+/);
    const digits = (contact?.phone ?? '').replace(/\D/g, '');
    const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return { id: slug(name), name, first, phone: contact?.phone ?? '', phoneRaw: digits, email: contact?.email ?? '',
      gFrom: listColors[hue % listColors.length], gTo: listColors[(hue + 2) % listColors.length] };
  }

  function applyData(next, prev) {
    const { data, user } = next;
    // Safari favourites, bookmarks, address-bar suggestions and start page list only the scene's pages; the sample
    // sites and history are dropped.
    // The trainee's own bookmarks (data.browser.bookmarks) follow the scene favourites; history is data.browser.history.
    if (changed(prev, next, w => [w.data.web ?? null, w.data.browser?.bookmarks ?? [], w.data.browser?.history ?? []], 'web') || forced.has('browser')) {
      const pages = Object.entries(data.web?.pages ?? {});
      const favourites = (data.web?.favorites ?? pages.map(([id, page]) => ({ title: page.title, url: `scene:${id}` })))
        .map(item => ({ name: item.title, url: item.url, img: './photo-2.jpg' }));
      M.safariStart.splice(0, M.safariStart.length, ...favourites);
      M.safariSuggestions.splice(0, M.safariSuggestions.length, ...favourites.map(({ name, url }) => ({ name, url })));
      M.safariSites.splice(0, M.safariSites.length, ...pages.map(([id, page]) => ({ title: page.title, url: `scene:${id}`, description: page.url,
        keywords: `${page.title} ${page.url}`.toLowerCase() })));
      const now = Date.now();
      M.safari.setState({ readingList: [],
        history: (data.browser?.history ?? []).map(item => ({ id: item.id, url: item.url, title: item.title, at: Date.parse(item.time) })),
        bookmarks: [...favourites.map((item, index) => ({ id: `bm-web-${index}`, title: item.name, url: item.url, folder: 'favorites', createdAt: now - index })),
          ...(data.browser?.bookmarks ?? []).map((item, index) => ({ id: item.id, title: item.title, url: item.url, folder: 'favorites', createdAt: now + index + 1 }))] });
    }
    // Clock alarms: data.alarms (HH:MM) <-> native minutes. No data.alarms means no alarms, as on Windows.
    if (changed(prev, next, w => w.data.alarms ?? null, 'alarms')) {
      const current = new Map(M.clock.getState().alarms.map(alarm => [alarm.id, alarm]));
      M.clock.setState({ alarms: (data.alarms ?? []).map(alarm => {
        const [hours, minutes] = alarm.time.split(':').map(Number);
        return { repeat: [], sound: 'Chime', snoozeMin: 9, ...current.get(alarm.id), id: alarm.id, minutes: hours * 60 + minutes, label: alarm.label, enabled: alarm.enabled };
      }) });
    }
    // Activity Monitor: data.processes join the simulated process table as read-only scene processes.
    if (changed(prev, next, w => [w.data.processes ?? null, w.user], 'processes')) {
      const sim = M.processes();
      sim.procs = sim.procs.filter(proc => proc.kind !== 'scene');
      for (const item of data.processes ?? []) {
        const cpu = item.cpu ?? 0.4;
        const mem = item.mem ?? 24;
        sim.procs.push({ pid: sim.nextPid++, name: item.name, kind: 'scene', sceneId: item.id, endChoice: item.endChoice, user: item.suspicious ? 'root' : user.short,
          cpu, cpuTarget: cpu, cpuTime: 12, threads: 4, mem, memTarget: mem });
      }
    }
    if (changed(prev, next, w => [w.data.mail, w.user], 'mail')) {
      M.mail.setState({ messages: data.mail.messages.map(nativeMail), vipSenders: [], junkSenders: [] });
    }
    if (changed(prev, next, w => [w.data.messages, w.data.contacts, w.user], 'messages')) {
      const names = new Set(data.contacts.map(item => item.name));
      for (const thread of data.messages.threads) for (const item of thread.items) if (item.from !== user.name) names.add(item.from);
      for (const thread of data.messages.threads) if (!thread.items.length) names.add(thread.with);
      const people = [...names].map(name => personFor(name, data.contacts));
      M.people.splice(0, M.people.length, ...people);
      for (const key of Object.keys(M.peopleMap)) delete M.peopleMap[key];
      for (const person of people) M.peopleMap[person.id] = person;
      M.messages.setState({ convs: data.messages.threads.map(thread => {
        const senders = [...new Set(thread.items.filter(item => item.from !== user.name).map(item => slug(item.from)))];
        return { id: thread.id, members: senders.length ? senders : [slug(thread.with)], pinned: thread.pinned ?? false, unread: 0, hideAlerts: false,
          messages: thread.items.map(item => ({ id: item.id, sender: item.from === user.name ? 'me' : slug(item.from), text: item.text, at: Date.parse(item.time), tapbacks: [] })) };
      }) });
    }
    if (changed(prev, next, w => w.data.notes, 'notes')) {
      // Keep the native note (and its rich formatting) when its text already matches, so typing is not interrupted.
      const current = new Map(M.notes.getState().notes.map(note => [note.id, note]));
      M.notes.setState({ notes: data.notes.map(note => {
        const native = current.get(note.id);
        if (native && !native.deleted && native.pinned === note.pinned && same(noteText(native.html), { title: note.title, body: note.body })) return native;
        return { id: note.id, folderId: note.folder, html: noteHtml(note), pinned: note.pinned, tags: [], deleted: false,
          created: Date.parse(note.modified), modified: Date.parse(note.modified) };
      }) });
    }
    if (changed(prev, next, w => w.data.reminders, 'reminders')) {
      const lists = [...M.reminders.getState().lists];
      for (const item of data.reminders) {
        if (!lists.some(list => list.id === item.list)) lists.push({ id: item.list, name: item.list.charAt(0).toUpperCase() + item.list.slice(1), color: listColors[lists.length % listColors.length], glyph: 'ListChecks' });
      }
      M.reminders.setState({ lists, reminders: data.reminders.map(item => ({ id: item.id, listId: item.list, title: item.title, notes: item.notes ?? '',
        due: item.due ? Date.parse(item.due) : null, repeat: 'never', priority: item.priority ?? 0, tags: [], flagged: item.flagged ?? false, completed: item.done,
        completedAt: item.done ? Date.now() : null, notified: true, created: Date.now() })) });
    }
    if (changed(prev, next, w => w.data.calendar, 'calendar')) {
      M.calendar.setState({ events: data.calendar.map(event => ({ id: event.id, calId: 'work', title: event.title, location: event.location,
        start: Date.parse(event.start), end: Date.parse(event.end), allDay: event.allDay ?? false, repeat: 'none', alert: 'none', notes: event.notes ?? '' })) });
    }
    if (changed(prev, next, w => [w.data.contacts, w.user], 'contacts')) {
      const [first, ...rest] = user.name.split(/\s+/);
      const card = { id: 'me', first, last: rest.join(' '), company: '', phone: '', email: user.email, address: '', birthday: '', url: '', note: '', favorite: false, gradient: 0, myCard: true };
      M.contacts.setState({ contacts: [card, ...data.contacts.map((item, index) => {
        const [given, ...family] = item.name.split(/\s+/);
        return { id: item.id, first: given, last: family.join(' '), company: item.org, phone: item.phone, email: item.email, address: '', birthday: '',
          url: '', note: '', favorite: item.favorite ?? false, gradient: index % 6, myCard: false };
      })] });
    }
  }

  // ---- synced app stores (SYNC-AUDIT.md §4): one generic binding per store ----
  // BINDINGS is the only per-store code. Each row names the native Zustand store and gives
  //   toNative(world value, native state) -> native patch   (world -> native; null when another section applies it)
  //   fromNative(native state)            -> world-shaped value the shell shows (snapshot() and the intent diff)
  //   parts                                -> how a native difference becomes intents: `list` (upsert/delete by id),
  //                                           `set` (one op for a group of keys) or `log` (append-only history)
  // applyBindings, watchBindings and snapshot() are generic over the table; scenarios never add code here.
  // Exceptions with their own code below: browser tabs (they belong to the Safari window), media playback (only
  // trainee actions report, and only the visible shell plays) and the terminal working directory (bundle patches).
  const ID = /^[a-z0-9-]{1,40}$/;
  const line = (text, max) => String(text ?? '').replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  const fictional = text => [...String(text).matchAll(/@([A-Za-z0-9.-]+)/g)].every(match => /\.(example|invalid)$/i.test(match[1]));
  const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
  // Stickies text <-> the contentEditable HTML of a native sticky.
  const textHtml = text => text.split('\n').map(part => `<div>${esc(part) || '<br>'}</div>`).join('');
  const htmlText = html => new DOMParser().parseFromString(`<body>${String(html).replace(/<div><br\s*\/?><\/div>/gi, '<div></div>')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<(div|p)(\s[^>]*)?>/gi, '\n')}</body>`, 'text/html').body.textContent.replace(/\u00a0/g, ' ').replace(/^\n/, '');
  const nativeZone = tz => (tz === 'local' ? HOST_TZ : tz);
  const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'gray'];
  const BOARD_KEYS = ['id', 'type', 'x', 'y', 'w', 'h', 'text', 'color', 'shape', 'points', 'width'];

  // Freeform items keep only the world's fields; intents round them so a board stays small.
  const round = value => Math.round(Number(value) * 10) / 10;
  function boardItem(item) {
    const out = { id: item.id, type: item.type, x: round(item.x), y: round(item.y), w: Math.max(0, round(item.w)), h: Math.max(0, round(item.h)) };
    if (typeof item.text === 'string' && item.type !== 'pen') out.text = item.text.slice(0, 2000);
    if (typeof item.color === 'string' && /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|[a-z]{3,12})$/.test(item.color)) out.color = item.color;
    if (item.type === 'shape') out.shape = item.shape;
    if (item.type === 'pen') {
      out.points = item.points.slice(0, 2000).map(Math.round);
      if (Number.isFinite(item.width)) out.width = Math.min(40, Math.max(1, item.width));
    }
    return out;
  }

  // Browser tab urls: the world keeps only scene pages and three placeholders (no typed address).
  const NATIVE_TAB_URL = Object.freeze({ 'start:': 'start:', 'history:': 'safari:history', 'unavailable:': 'unavailable.invalid' });
  function worldTabOf(tab) {
    const info = tab.history[tab.hIndex]?.info ?? {};
    const url = String(info.url ?? '');
    const worldUrl = info.kind === 'start' ? 'start:' : info.kind === 'history' ? 'history:' : ID.test(url.slice(6)) && url.startsWith('scene:') ? url : 'unavailable:';
    return { id: tab.id, url: worldUrl, title: line(info.title || (worldUrl === 'start:' ? 'Start Page' : 'Untitled'), 120) };
  }
  // The Safari window of the world's browser window, else any Safari window on screen.
  const browserWindowId = () => {
    const win = world?.windows.find(item => item.app === 'browser');
    return (win && winMap.get(win.id)) ?? Object.values(M.wins.getState().windows).find(item => item.appId === 'safari')?.id;
  };
  function nativeTabs() {
    const entry = M.safariTabs.getState().byWin[browserWindowId()];
    const tabs = entry ? entry.tabs.filter(tab => ID.test(tab.id)).slice(0, 16).map(worldTabOf) : [];
    return { tabs, activeTabId: tabs.some(tab => tab.id === entry?.activeId) ? entry.activeId : tabs[0]?.id ?? null };
  }
  function applyBrowserTabs(nativeId, browser) {
    const entry = M.safariTabs.getState().byWin[nativeId];
    if (!entry || !browser?.tabs.length) return;
    const current = new Map(entry.tabs.map(tab => [tab.id, tab]));
    const tabs = browser.tabs.map(item => {
      const native = current.get(item.id);
      if (native && worldTabOf(native).url === item.url) return native;
      return { ...M.newSafariTab(NATIVE_TAB_URL[item.url] ?? item.url), id: item.id, loading: false, progress: 0 };
    });
    if (same(tabs.map(worldTabOf), entry.tabs.map(worldTabOf)) && entry.activeId === browser.activeTabId) return;
    M.safariTabs.setState({ byWin: { ...M.safariTabs.getState().byWin, [nativeId]: { ...entry, tabs, activeId: browser.activeTabId } } });
  }

  // Only the visible shell makes sound: the hidden one pauses (locally) and resumes from the world when shown again.
  function applyPlayback(media) {
    const player = M.player.getState();
    const playing = media?.nowPlaying;
    if (!playing) {
      if (player.owner === 'music') player.stop('music');
      // Nothing is playing: an empty queue, so the shell shows (and reports) no current track.
      if (M.music.getState().queue.length) M.music.setState({ queue: [], queueBase: [], qIndex: 0 });
      return;
    }
    const music = M.music.getState();
    const qIndex = Math.max(0, playing.queue.indexOf(playing.trackId));
    if (!same(music.queue, playing.queue) || music.qIndex !== qIndex) M.music.setState({ queue: [...playing.queue], queueBase: [...playing.queue], qIndex });
    if (!active) {
      if (player.owner === 'music' && player.playing) player.pause();
      return;
    }
    const track = M.music.getState().tracks.find(item => item.id === playing.trackId);
    const position = playing.positionSec + (playing.playing ? (Date.now() - Date.parse(playing.at)) / 1000 : 0);
    if (!track) return;
    if (player.owner !== 'music' || player.src !== track.src) {
      M.playMusicTrack(position, playing.playing);
      // A new source ignores a start position until its metadata loads.
      if (position > 0.5 && M.audio.readyState < 1) {
        M.audio.addEventListener('loadedmetadata', () => {
          const now = M.player.getState();
          if (now.owner !== 'music' || now.src !== track.src) return;
          applying = true;
          try { now.seek(position); } finally { applying = false; }
        }, { once: true });
      }
      return;
    }
    // A playing track may drift a little; a paused one shows the exact second.
    if (Math.abs(player.position - position) > (playing.playing ? 2 : 0.25)) player.seek(position);
    if (!playing.playing && player.playing) player.pause();
    else if (playing.playing && !player.playing) player.play();
  }
  function nativeNowPlaying(known) {
    const state = M.music.getState();
    const player = M.player.getState();
    const trackId = state.queue[state.qIndex];
    if (player.owner !== 'music' || !trackId || !known.has(trackId)) return null;
    const queue = state.queue.filter(id => known.has(id)).slice(0, 200);
    if (!queue.includes(trackId)) queue.splice(0, queue.length ? 1 : 0, trackId);
    return { trackId, queue, positionSec: Math.min(86400, Math.max(0, Math.round(player.position * 10) / 10)), playing: player.playing };
  }

  // The working directory of the newest Terminal session while a Terminal window is open; else home.
  function nativeCwd() {
    if (!Object.values(M.wins.getState().windows).some(win => win.appId === 'terminal')) return 'home';
    const session = [...terminalSessions].at(-1);
    const id = session && M.fs.getState().getByPath(session.cwd)?.id;
    return id && world?.fs.nodes[id]?.kind === 'folder' ? id : 'home';
  }

  const BINDINGS = {
    browser: {
      native: () => M.safari,
      toNative: null,   // bookmarks and history are applied with the scene favourites (applyData); tabs below
      fromNative: state => ({ ...nativeTabs(),
        bookmarks: state.bookmarks.filter(item => !String(item.id).startsWith('bm-web-') && ID.test(item.id) && /^scene:[a-z0-9-]{1,40}$/.test(item.url))
          .slice(0, 50).map(item => ({ id: item.id, title: line(item.title, 80), url: item.url })),
        history: state.history.filter(item => ID.test(item.id) && /^scene:[a-z0-9-]{1,40}$/.test(item.url)).slice(0, 100)
          .map(item => ({ id: item.id, url: item.url, title: line(item.title, 120), time: iso(item.at) })) }),
      parts: [
        { key: 'bookmarks', list: ['bookmark-upsert', 'bookmark-delete'] },
        // An entry replaced by a newer visit of the same page is not a deletion.
        { key: 'history', log: { record: 'visit', remove: 'history-delete', clear: 'clear-history', newestFirst: true, replacedBy: 'url',
          item: entry => ({ id: entry.id, url: entry.url, title: entry.title }) } },
      ],
    },
    media: {
      native: () => M.music,
      watchKey: value => value && { ...value, nowPlaying: null },   // playback has its own path
      toNative: (media, state) => {
        const current = new Map(state.tracks.map(track => [track.id, track]));
        return {
          tracks: media.tracks.map(item => ({ addedAt: 0, ...current.get(item.id), id: item.id, title: item.title, artist: item.artist, album: item.album,
            genre: item.genre, src: assetUrl(item.asset) ?? '', artwork: assetUrl(item.cover ?? '') ?? './cover-1.jpg', oceanAsset: item.asset, oceanCover: item.cover ?? null,
            duration: item.duration || current.get(item.id)?.duration || 0 })),
          playlists: media.playlists.map(item => ({ id: item.id, name: item.name, trackIds: [...item.trackIds] })),
          loved: media.tracks.filter(item => item.loved).map(item => item.id), shuffle: media.shuffle, repeat: media.repeat,
        };
      },
      fromNative: state => {
        const tracks = state.tracks.flatMap(track => {
          const asset = track.oceanAsset ?? assetOf(track.src);
          const cover = 'oceanCover' in track ? track.oceanCover : assetOf(track.artwork);
          return asset && ID.test(track.id) ? [{ id: track.id, title: line(track.title, 120), artist: line(track.artist, 80), album: line(track.album, 120),
            genre: line(track.genre, 40), asset, ...(cover ? { cover } : {}), duration: clampInt(track.duration, 0, 86400), loved: state.loved.includes(track.id) }] : [];
        }).slice(0, 200);
        const known = new Set(tracks.map(track => track.id));
        return { tracks, shuffle: state.shuffle, repeat: state.repeat, nowPlaying: nativeNowPlaying(known),
          playlists: state.playlists.filter(item => ID.test(item.id)).slice(0, 50)
            .map(item => ({ id: item.id, name: line(item.name, 80) || 'Playlist', trackIds: item.trackIds.filter(id => known.has(id)).slice(0, 200) })) };
      },
      parts: [
        { key: 'tracks', list: ['track-upsert', null] },
        { key: 'playlists', list: ['playlist-upsert', 'playlist-delete'] },
        { set: 'set-mode', keys: ['shuffle', 'repeat'] },
      ],
    },
    photos: {
      native: () => M.photos,
      toNative: (photos, state) => {
        const current = new Map(state.items.map(item => [item.id, item]));
        return {
          items: photos.items.map(item => {
            const native = current.get(item.id);
            const url = assetUrl(item.asset) ?? './photo-1.jpg';
            return { edits: M.photoEdits, edited: false, w: 1600, h: 1067, ...native, id: item.id, name: item.name, url: native?.edited ? native.url : url, originalUrl: url,
              oceanAsset: item.asset, takenAt: Date.parse(item.taken), favorite: item.favorite, deletedAt: item.trashed ? (native?.deletedAt ?? Date.now()) : null };
          }),
          albums: photos.albums.map(item => ({ id: item.id, name: item.name, photoIds: [...item.photoIds] })),
        };
      },
      fromNative: state => {
        const items = state.items.flatMap(item => {
          const asset = item.oceanAsset ?? assetOf(item.originalUrl ?? item.url);
          const name = line(item.name, 120).replace(/[\/\\]/g, '-');
          return asset && ID.test(item.id) ? [{ id: item.id, name: name.trim() && name !== '.' && name !== '..' ? name : 'Photo.jpg', asset,
            taken: iso(item.takenAt), favorite: Boolean(item.favorite), trashed: item.deletedAt != null }] : [];
        }).slice(0, 400);
        const ids = new Set(items.map(item => item.id));
        return { items, albums: state.albums.filter(item => ID.test(item.id)).slice(0, 50)
          .map(item => ({ id: item.id, name: line(item.name, 80) || 'Album', photoIds: [...new Set(item.photoIds.filter(id => ids.has(id)))] })) };
      },
      parts: [{ key: 'items', list: ['photo-upsert', 'photo-delete'] }, { key: 'albums', list: ['album-upsert', 'album-delete'] }],
    },
    whiteboard: {
      native: () => M.freeform,
      debounce: 400,
      toNative: (whiteboard, state) => {
        const current = new Map(state.boards.map(board => [board.id, board]));
        const boards = whiteboard.boards.map(board => ({ created: Date.parse(board.modified), ...current.get(board.id), id: board.id, name: board.name,
          items: clone(board.items), modified: Date.parse(board.modified), oceanPlaceholder: false }));
        // Freeform always shows a board: an empty world gets a local blank one, which joins the world once drawn on.
        if (boards.length === 0) boards.push({ id: 'board-1', name: 'Board 1', items: [], created: Date.now(), modified: Date.now(), oceanPlaceholder: true });
        return { boards, activeBoardId: whiteboard.activeId ?? boards[0].id };
      },
      fromNative: state => {
        const boards = state.boards.filter(board => ID.test(board.id) && !(board.oceanPlaceholder && board.items.length === 0)).slice(0, 20).map(board => ({
          id: board.id, name: line(board.name, 80) || 'Board', modified: iso(board.modified),
          items: board.items.filter(item => ID.test(item.id) && ['text', 'sticky', 'shape', 'pen'].includes(item.type))
            .filter(item => (item.type !== 'pen' || item.points?.length >= 4) && (typeof item.text !== 'string' || fictional(item.text))).slice(0, 300)
            .map(item => Object.fromEntries(BOARD_KEYS.filter(key => item[key] !== undefined).map(key => [key, item[key]]))),
        }));
        return { boards, activeId: boards.some(board => board.id === state.activeBoardId) ? state.activeBoardId : null };
      },
      parts: [
        { key: 'boards', list: ['board-upsert', 'board-delete'], item: board => ({ id: board.id, name: board.name, items: board.items.map(boardItem) }) },
        { set: 'set-active', keys: ['activeId'], item: value => ({ id: value.activeId }) },
      ],
    },
    calculator: {
      native: () => M.calculator,
      toNative: (calc, state) => {
        const current = new Map(state.tape.map(item => [item.id, item]));
        return { mode: calc.mode, angleDeg: calc.angle === 'deg', base: calc.base, memory: calc.memory,
          tape: calc.history.map(item => ({ value: current.get(item.id)?.value ?? item.result, id: item.id, expr: item.expr, result: item.result, at: Date.parse(item.time) })) };
      },
      fromNative: state => ({ mode: state.mode, angle: state.angleDeg ? 'deg' : 'rad', base: state.base, memory: Number.isFinite(state.memory) ? state.memory : 0,
        history: state.tape.filter(item => ID.test(item.id)).slice(0, 100).map(item => ({ id: item.id, expr: line(item.expr, 200), result: line(item.result, 80), time: iso(item.at) })) }),
      parts: [
        { set: 'set', keys: ['mode', 'angle', 'base', 'memory'] },
        { key: 'history', log: { record: 'record', clear: 'clear-history', newestFirst: true, item: entry => ({ id: entry.id, expr: entry.expr, result: entry.result }) } },
      ],
    },
    clock: {
      native: () => M.clock,
      toNative: clock => {
        const { timer, stopwatch } = clock;
        const remaining = timer && (timer.running ? Math.max(0, timer.remainingMs - (Date.now() - Date.parse(timer.at))) : timer.remainingMs);
        return {
          cities: clock.worldClocks.map(city => ({ name: city.name, tz: nativeZone(city.tz), oceanId: city.id, oceanTz: city.tz })),
          timer: timer && { label: timer.label, totalMs: timer.durationMs, remainingMs: remaining, endsAt: Date.now() + remaining, paused: !timer.running },
          swRunning: stopwatch.running, swStartAt: stopwatch.running ? Date.parse(stopwatch.at) : 0, swAccum: stopwatch.elapsedMs,
          swLaps: stopwatch.laps.map((total, index) => ({ n: index + 1, split: total - (stopwatch.laps[index - 1] ?? 0), total })),
        };
      },
      fromNative: state => {
        const timer = state.timer;
        const durationMs = timer && clampInt(timer.totalMs, 1000, 86400000);
        const cities = new Map();
        for (const city of state.cities) {
          const id = city.oceanId ?? slug(city.name);
          if (!cities.has(id)) cities.set(id, { id, name: line(city.name, 60).trim() || 'City', tz: city.oceanTz ?? city.tz });
        }
        return {
          worldClocks: [...cities.values()].slice(0, 24),
          timer: timer && { label: line(timer.label, 60), durationMs, running: !timer.paused,
            remainingMs: clampInt(timer.paused ? timer.remainingMs : timer.endsAt - Date.now(), 0, durationMs) },
          stopwatch: { running: state.swRunning, elapsedMs: Math.max(0, Math.round(state.swAccum + (state.swRunning ? Date.now() - state.swStartAt : 0))),
            at: null, laps: state.swLaps.map(lap => Math.round(lap.total)).slice(0, 100) },
        };
      },
      parts: [
        { key: 'worldClocks', list: ['city-upsert', 'city-delete'] },
        { set: 'set-timer', keys: ['timer'], item: value => ({ timer: value.timer }) },
        { set: 'set-stopwatch', keys: ['stopwatch'], item: value => ({ running: value.stopwatch.running, elapsedMs: value.stopwatch.elapsedMs, laps: value.stopwatch.laps }) },
      ],
    },
    terminal: {
      native: () => M.terminal,
      toNative: terminal => ({ history: [...terminal.history] }),
      fromNative: state => ({ cwd: nativeCwd(), history: state.history.map(entry => line(entry, 500)).filter(entry => entry.trim() && fictional(entry)).slice(-100) }),
      // cwd: the Terminal bundle patches report each cd (watchTerminal).
      parts: [{ key: 'history', log: { record: 'record', clear: 'clear-history', tail: true } }],
    },
    stickies: {
      native: () => M.stickies,
      debounce: 400,
      toNative: (stickies, state) => {
        const current = new Map(state.stickies.map(item => [item.id, item]));
        return { stickies: stickies.map((item, index) => {
          const native = current.get(item.id);
          return { id: item.id, x: item.x, y: item.y, w: item.w, h: item.h, color: item.color, collapsed: item.collapsed, z: index + 1,
            html: native && htmlText(native.html) === item.text ? native.html : textHtml(item.text) };
        }) };
      },
      fromNative: state => state.stickies.filter(item => ID.test(item.id)).slice(0, 50).map(item => {
        const text = htmlText(item.html).slice(0, 4000);
        return { id: item.id, text: fictional(text) ? text : '', color: STICKY_COLORS.includes(item.color) ? item.color : 'yellow',
          x: clampInt(item.x, 0, 2000), y: clampInt(item.y, 0, 2000), w: clampInt(item.w, 60, 2000), h: clampInt(item.h, 60, 2000), collapsed: Boolean(item.collapsed) };
      }),
      parts: [{ key: null, list: ['upsert', 'delete'] }],
    },
  };
  const worldStore = (next, store) => next.data[store] ?? WM.emptyStore(store);

  function applyBindings(next, prev) {
    for (const [store, binding] of Object.entries(BINDINGS)) {
      const key = binding.watchKey ?? (value => value);
      if (!binding.toNative || !changed(prev, next, w => key(w.data[store] ?? null), store)) continue;
      const native = binding.native();
      native.setState(binding.toNative(worldStore(next, store), native.getState()));
    }
    // Only a changed now-playing moves the player, so an older world answering another intent cannot undo a skip.
    if (changed(prev, next, w => w.data.media?.nowPlaying ?? null, 'media')) applyPlayback(next.data.media);
    if (changed(prev, next, w => [w.data.browser?.tabs ?? [], w.data.browser?.activeTabId ?? null, w.windows.map(win => win.id)], 'browser')) {
      const nativeId = browserWindowId();
      if (nativeId) applyBrowserTabs(nativeId, next.data.browser);
    }
    // A cwd changed on the other OS moves the open session (its prompt redraws on the next key).
    const cwd = worldStore(next, 'terminal').cwd;
    if (prev && (prev.data.terminal?.cwd ?? 'home') !== cwd) for (const session of terminalSessions) session.cwd = M.fs.getState().pathOf(cwd);
  }

  // ---- apply ----
  function nativeBaseline() {
    return {
      phase: M.phase.getState().phase,
      fs: M.fs.getState().nodes, positions: M.fs.getState().desktopPositions,
      pins: M.apps.getState().dockPins, extra: M.apps.getState().installedExtraApps,
      overlays: nativeOverlays(),
      banners: M.notify.getState().banners, history: M.notify.getState().history,
      mail: M.mail.getState().messages, notes: M.notes.getState().notes, reminders: M.reminders.getState().reminders,
      calendar: M.calendar.getState().events, contacts: M.contacts.getState().contacts,
    };
  }

  function apply(next, prev, reapplyDrift = false) {
    const check = WM.validate(next);
    if (!check.ok) throw new TypeError(`OceanWorldAdapter: invalid world (${check.error})`);
    clearTimeout(resyncTimer);
    forced.clear();
    if (reapplyDrift) for (const section of drifted) forced.add(section);
    drifted.clear();
    applying = true;
    try {
      world = next;
      window.__oceanWorld = next;
      applyUser(next);
      applySys(next, prev);
      applyApps(next, prev);
      applyFs(next, prev);
      applyData(next, prev);
      if (M.phase.getState().phase !== next.phase) M.phase.getState().setPhase(next.phase);
      applyWindows(next, prev);
      applyBindings(next, prev);
      applyOverlays(next, prev);
      applyNotifications(next, prev);
      applyDialogs(next);
      refreshScenePages();
      questOverlay()?.update(next, 'macos');
      // The menu bar and Activity Monitor name a program window by its program ("Wana Decrypt0r 2.0"), as macOS does.
      {
        const top = [...(next.order ?? [])].reverse().map(id => next.windows.find(win => win.id === id)).find(win => win?.app === 'program');
        const view = top && next.data.views?.[top.payload?.view];
        window.__oceanProgramName = ((view?.app && window.OceanProgramUI?.appName ? window.OceanProgramUI.appName(view.app, 'macos') : view?.app) || view?.title || 'Program').slice(0, 40);
      }
      base = nativeBaseline();
      sentSinceApply.clear();
      // A Safari window adopted from a native open reports its tabs once (the world had none for it yet).
      const browserId = browserWindowId();
      if (browserId && !tabsReported.has(browserId)) {
        tabsReported.add(browserId);
        queueMicrotask(() => { if (world && !applying) syncBrowserTabs(); });
      }
    } finally {
      applying = false;
      forced.clear();
    }
    window.dispatchEvent(new Event('ocean-world'));
  }

  // ---- snapshot: what this shell shows, in the canonical OS-neutral form ----
  // Read from the native stores only (except what the shell renders straight from the world: updates, MFA and the
  // scene highlight), then put through WM.normalise. After an apply it must equal WM.normalise(the applied world).
  function snapshot() {
    const wins = M.wins.getState();
    const user = { ...window.__oceanUser };
    const nodes = {};
    const contents = {};
    for (const node of Object.values(M.fs.getState().nodes)) {
      if (node.kind === 'app' || ['root', 'applications', 'apps-utilities', 'users'].includes(node.id)) continue;
      nodes[node.id] = { id: node.id, parentId: node.parentId === 'users' ? 'root' : node.parentId, name: node.name, kind: node.kind, trashed: Boolean(node.trashed) };
      if (node.encrypted) nodes[node.id].encrypted = true;
      if (node.kind === 'file' && typeof node.content === 'string') {
        nodes[node.id].contentId = `c-${node.id}`;
        contents[`c-${node.id}`] = { text: node.content };
      }
    }
    const windows = [...new Set([...wins.zOrder, ...Object.keys(wins.windows)])].map(id => wins.windows[id]).filter(native => native && CANONICAL[native.appId])
      .map(native => ({ id: native.id, app: CANONICAL[native.appId], payload: openPayload(native) ?? null,
        mode: native.minimized || native.hidden ? 'minimized' : native.fullscreen ? 'fullscreen' : nearRect(native.rect, M.tileRect('fill')) ? 'maximized' : 'normal' }));
    const notification = item => ({ id: item.id, app: CANONICAL[item.appId] ?? item.appId, title: item.title, body: item.body });
    const apps = M.apps.getState();
    const minutes = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    return WM.normalise({
      phase: M.phase.getState().phase, user, sys: worldSysFromNative(),
      installed: [...new Set(M.installed().map(entry => CANONICAL[entry.id]).filter(Boolean))],
      dock: { pins: [...new Set(apps.dockPins.map(id => CANONICAL[id]).filter(Boolean))],
        badges: Object.fromEntries(Object.entries(apps.badges).filter(([id, count]) => CANONICAL[id] && count > 0).map(([id, count]) => [CANONICAL[id], count])) },
      overlays: nativeOverlays(),
      windows, order: windows.map(win => win.id), focusedId: windows.some(win => win.id === wins.focusedId) ? wins.focusedId : null,
      fs: { nodes }, scene: { highlight: world?.scene.highlight ?? null },
      notifications: { banners: M.notify.getState().banners.filter(item => !item.dismissing).map(notification), history: M.notify.getState().history.map(notification) },
      data: {
        contents,
        mail: { messages: M.mail.getState().messages.map(item => ({ id: item.id, folder: item.mailbox, subject: item.subject, read: item.read, flagged: item.flagged })) },
        messages: { threads: M.messages.getState().convs.map(conv => ({ id: conv.id, pinned: Boolean(conv.pinned),
          items: conv.messages.map(item => ({ id: item.id, text: item.text, from: item.sender === 'me' ? user.name : item.sender })) })) },
        notes: M.notes.getState().notes.filter(note => !note.deleted).map(note => ({ id: note.id, folder: note.folderId, ...noteText(note.html), pinned: Boolean(note.pinned) })),
        calendar: M.calendar.getState().events.map(event => ({ id: event.id, title: event.title, location: event.location, start: iso(event.start), end: iso(event.end),
          allDay: Boolean(event.allDay), notes: event.notes ?? '' })),
        reminders: M.reminders.getState().reminders.map(item => ({ id: item.id, list: item.listId, title: item.title, due: item.due ? iso(item.due) : null, done: item.completed,
          flagged: Boolean(item.flagged), priority: item.priority ?? 0, notes: item.notes ?? '' })),
        contacts: M.contacts.getState().contacts.filter(item => !item.myCard).map(item => ({ id: item.id, name: `${item.first} ${item.last}`.trim(), email: item.email,
          phone: item.phone, org: item.company, favorite: Boolean(item.favorite) })),
        alarms: M.clock.getState().alarms.map(alarm => ({ id: alarm.id, time: minutes(alarm.minutes), label: alarm.label, enabled: alarm.enabled })),
        updates: world?.data.updates, mfa: world?.data.mfa,
        processes: M.processes().procs.filter(proc => proc.kind === 'scene' && !proc.dead).map(proc => ({ id: proc.sceneId, name: proc.name })),
        // Login Items and Safari's homepage are drawn straight from the world.
        startup: world?.data.startup,
        web: { pages: Object.fromEntries(M.safariSites.map(site => [site.url.slice(6), {}])), homepage: world?.data.web?.homepage },
        ...Object.fromEntries(Object.entries(BINDINGS).map(([store, binding]) => [store, binding.fromNative(binding.native().getState())])),
      },
    });
  }

  // ---- native gestures -> intents ----
  function diffById(before, after) {
    const old = new Map(before.map(item => [item.id, item]));
    const now = new Map(after.map(item => [item.id, item]));
    return {
      added: after.filter(item => !old.has(item.id)),
      removed: before.filter(item => !now.has(item.id)),
      updated: after.filter(item => old.has(item.id) && old.get(item.id) !== item).map(item => [old.get(item.id), item]),
    };
  }

  // Like macOS, the transparent menu bar picks its text colour from the wallpaper strip behind it, not from the theme:
  // html[data-menubar-tone] is 'light' (white text) on a dark strip and 'dark' on a light one.
  function watchMenubarTone() {
    let sampled = null;
    const update = () => {
      const url = M.sys.getState().wallpaper;
      const key = `${url}@${innerWidth}x${innerHeight}`;
      if (key === sampled) return;
      sampled = key;
      const image = new Image();
      image.onload = () => {
        if (key !== sampled || !image.naturalWidth) return;
        // The wallpaper is drawn background-size: cover, centred; sample the 24px under the menu bar.
        const scale = Math.max(innerWidth / image.naturalWidth, innerHeight / image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 4;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, (image.naturalWidth - innerWidth / scale) / 2, (image.naturalHeight - innerHeight / scale) / 2, innerWidth / scale, 24 / scale, 0, 0, 64, 4);
        const pixels = context.getImageData(0, 0, 64, 4).data;
        const linear = value => (value /= 255) <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) sum += 0.2126 * linear(pixels[i]) + 0.7152 * linear(pixels[i + 1]) + 0.0722 * linear(pixels[i + 2]);
        // 0.179: the luminance where white and black text have equal contrast.
        document.documentElement.dataset.menubarTone = sum / (pixels.length / 4) < 0.179 ? 'light' : 'dark';
      };
      image.onerror = () => { if (key === sampled) delete document.documentElement.dataset.menubarTone; };
      // The shell frame is sandboxed (opaque origin): a CORS load keeps the canvas readable (the server allows any origin).
      image.crossOrigin = 'anonymous';
      image.src = url;
    };
    M.sys.subscribe(update);
    window.addEventListener('resize', update);
    update();
  }

  function watchPhase() {
    M.phase.subscribe((state, prev) => {
      if (state.phase !== prev.phase && world && state.phase !== world.phase) emit({ kind: 'set-phase', phase: state.phase });
    });
  }

  function watchSys() {
    const report = () => {
      if (applying || !world) return;
      const current = worldSysFromNative();
      const sys = effectiveSys(world.sys);
      const patch = Object.fromEntries(Object.entries(current).filter(([key, value]) => sys[key] !== value));
      if (Object.keys(patch).length) emit({ kind: 'set-sys', patch });
    };
    M.sys.subscribe(report);
    M.settingsStore.subscribe((state, prev) => { if (state.privacy !== prev.privacy) report(); });
  }

  function watchApps() {
    // Dock badges are world data (dock.badges): the apps' own badge counters (Mail unread, Messages, Reminders due,
    // App Store updates) must not overwrite them, or the Dock would differ from Windows.
    M.apps.setState({ setBadge: () => {}, clearBadge: () => {} });
    M.apps.subscribe(state => {
      if (applying || !world || !base) return;
      for (const native of state.installedExtraApps) {
        const app = CANONICAL[native];
        if (app && !world.installed.includes(app)) emit({ kind: 'install', app });
      }
      if (state.dockPins === base.pins) return;
      const pins = state.dockPins.map(native => CANONICAL[native]).filter(app => app && NATIVE[app] && world.installed.includes(app));
      const old = world.dock.pins;
      for (const app of old) if (!pins.includes(app)) emit({ kind: 'dock', op: 'unpin', app });
      pins.forEach((app, index) => {
        if (!old.includes(app)) emit({ kind: 'dock', op: 'pin', app, index });
      });
      const kept = pins.filter(app => old.includes(app));
      const oldKept = old.filter(app => pins.includes(app));
      const moved = kept.find((app, index) => oldKept[index] !== app);
      if (moved) emit({ kind: 'dock', op: 'move', app: moved, index: pins.indexOf(moved) });
      base.pins = state.dockPins;
    });
  }

  function watchFs() {
    M.fs.subscribe(state => {
      if (applying || !world || !base) return;
      const before = base.fs;
      const nodes = state.nodes;
      let emptied = false;
      for (const [id, node] of Object.entries(nodes)) {
        if (node.kind === 'app' || ['root', 'applications', 'apps-utilities', 'users'].includes(id)) continue;
        const old = before[id];
        if (!old) {
          if (!world.fs.nodes[node.parentId] && node.parentId !== 'users') continue;
          if (node.kind === 'folder') emit({ kind: 'fs', op: 'mkdir', parentId: node.parentId, name: node.name, id });
          else emit({ kind: 'fs', op: 'touch', parentId: node.parentId, name: node.name, id, ...(node.mime ? { mime: node.mime } : {}), text: String(node.content ?? '').slice(0, 16000) });
          if (node.trashed) emit({ kind: 'fs', op: 'trash', id });
          continue;
        }
        if (old === node) continue;
        if (old.name !== node.name) emit({ kind: 'fs', op: 'rename', id, name: node.name });
        if (old.parentId !== node.parentId) emit({ kind: 'fs', op: 'move', id, parentId: node.parentId });
        if (old.trashed !== node.trashed) {
          emit({ kind: 'fs', op: node.trashed ? 'trash' : 'restore', id });
          if (node.trashed) sceneChoice('delete', 'files', id);
        }
        if (node.kind === 'file' && old.content !== node.content && typeof node.content === 'string') emit({ kind: 'fs', op: 'write', id, text: node.content.slice(0, 16000) });
      }
      for (const id of Object.keys(before)) if (!nodes[id] && before[id].trashed) emptied = true;
      if (emptied) emit({ kind: 'fs', op: 'empty-trash' });
      if (state.desktopPositions !== base.positions) {
        const area = M.workArea();
        for (const [id, pos] of Object.entries(state.desktopPositions)) {
          if (same(pos, base.positions[id]) || !world.fs.nodes[id]) continue;
          emit({ kind: 'fs', op: 'set-desktop-pos', id, pos: { x: Math.min(1000, Math.max(0, Math.round(pos.x * 1000 / area.w))), y: Math.min(600, Math.max(0, Math.round(pos.y * 600 / area.h))) } });
        }
      }
      base.fs = nodes;
      base.positions = state.desktopPositions;
    });
  }

  function worldWindow(nativeId) {
    for (const [worldId, mapped] of winMap) if (mapped === nativeId) return world.windows.find(win => win.id === worldId);
    return undefined;
  }
  function openPayload(native) {
    const payload = native.payload;
    if (typeof payload?.folderId === 'string' && world.fs.nodes[payload.folderId]?.kind === 'folder') return { folderId: payload.folderId };
    if (typeof payload?.fileId === 'string' && world.fs.nodes[payload.fileId]?.kind === 'file') return { fileId: payload.fileId };
    if (typeof payload?.messageId === 'string' && world.data.mail.messages.some(item => item.id === payload.messageId)) return { messageId: payload.messageId };
    if (typeof payload?.url === 'string' && /^scene:[a-z0-9-]{1,40}$/.test(payload.url)) return { url: payload.url };
    if (native.appId === 'oceanprogram' && typeof payload?.view === 'string' && world.data.views?.[payload.view]) return programPayload(payload);
    // Only a pane the world named: a Settings window the trainee opened on another pane stays a plain Settings window.
    const pane = native.appId === 'settings' ? Object.keys(SETTINGS_PANE).find(key => SETTINGS_PANE[key] === payload?.pane) : null;
    if (pane) return { pane };
    return undefined;
  }
  // Activity Monitor's Inspect window: a scene process's parent, command, network and publisher (PROGRAMS.md).
  window.__oceanProcRows = proc => {
    const item = proc?.kind === 'scene' ? world?.data.processes?.find(entry => entry.id === proc.sceneId) : null;
    if (!item) return [];
    return [['Parent Process', item.parent], ['Command', item.command], ['Network', item.net], ['Publisher', item.publisher ?? 'Unknown publisher']]
      .filter(([, value]) => value);
  };
  // The world window a native window shows (program windows send view-action with it).
  window.__oceanWorldWindowId = nativeId => worldWindow(nativeId)?.id ?? null;
  function watchWindows() {
    M.wins.subscribe((state, prev) => {
      if (applying || !world) return;
      for (const [worldId, nativeId] of [...winMap]) {
        if (state.windows[nativeId]) continue;
        winMap.delete(worldId);
        emit({ kind: 'close-window', id: worldId });
      }
      for (const [nativeId, native] of Object.entries(state.windows)) {
        const app = CANONICAL[native.appId];
        if (!app) continue;
        const win = worldWindow(nativeId);
        if (!win) {
          if (!pendingNative.has(nativeId)) {
            const payload = openPayload(native);
            pendingNative.set(nativeId, { app, at: Date.now(), payload });
            emit(payload ? { kind: 'open-app', app, payload } : { kind: 'open-app', app });
            // Opening the highlighted file from Finder or the desktop is the scene's run-file choice.
            if (payload?.fileId) sceneChoice('run-file', 'files', payload.fileId);
          }
          continue;
        }
        const old = prev.windows[nativeId];
        const minimized = native.minimized || native.hidden;
        if (minimized && win.mode !== 'minimized') emit({ kind: 'minimize', id: win.id });
        else if (!minimized && win.mode === 'minimized') emit({ kind: 'restore', id: win.id });
        if (native.fullscreen && win.mode !== 'fullscreen') emit({ kind: 'fullscreen', id: win.id });
        else if (!native.fullscreen && old?.fullscreen && win.mode === 'fullscreen') emit({ kind: 'restore', id: win.id });
        if (!native.fullscreen && !minimized && old && old.rect !== native.rect) {
          clearTimeout(rectTimers.get(nativeId));
          rectTimers.set(nativeId, setTimeout(() => {
            const current = M.wins.getState().windows[nativeId];
            const target = worldWindow(nativeId);
            if (!current || !target || current.fullscreen) return;
            const expected = target.mode === 'maximized' ? M.tileRect('fill') : target.tile ? M.tileRect(target.tile) : toPx(target.rect);
            if (!nearRect(current.rect, expected)) emit({ kind: 'set-rect', id: target.id, rect: toVirtual(current.rect) });
          }, 350));
        }
      }
      if (state.focusedId !== prev.focusedId && state.focusedId) {
        const win = worldWindow(state.focusedId);
        if (win && world.focusedId !== win.id) emit({ kind: 'focus-window', id: win.id });
      }
    });
  }

  function watchOverlays() {
    const check = () => {
      if (applying || !world) return;
      const now = nativeOverlays();
      for (const name of WM.OVERLAYS) if (now[name] !== world.overlays[name] && !now[name]) emit({ kind: 'toggle-overlay', name, open: false });
      for (const name of WM.OVERLAYS) if (now[name] !== world.overlays[name] && now[name]) emit({ kind: 'toggle-overlay', name, open: true });
    };
    M.ui.subscribe((state, prev) => { if (state.spotlightOpen !== prev.spotlightOpen || state.spotlightTab !== prev.spotlightTab || state.ccOpen !== prev.ccOpen) check(); });
    M.wins.subscribe((state, prev) => { if (state.missionControl !== prev.missionControl || state.appSwitcher.open !== prev.appSwitcher.open) check(); });
    M.notify.subscribe((state, prev) => {
      if (state.ncOpen !== prev.ncOpen) check();
      if (applying || !world) return;
      const banners = new Set(state.banners.filter(item => !item.dismissing).map(item => item.id));
      for (const item of world.notifications.banners) if (!banners.has(item.id) && prev.banners.some(old => old.id === item.id && !old.dismissing)) emit({ kind: 'notify-dismiss', id: item.id });
      const history = new Set(state.history.map(item => item.id));
      if (state.history.length === 0 && world.notifications.history.length) emit({ kind: 'notify-clear' });
      else for (const item of world.notifications.history) if (!history.has(item.id) && prev.history.some(old => old.id === item.id)) emit({ kind: 'notify-clear', id: item.id });
    });
  }

  function watchData() {
    // Mail: read, flag and mailbox changes; drafts. Sending never leaves the frame: the message stays a draft.
    M.mail.subscribe(state => {
      if (applying || !world || !base || state.messages === base.mail) return;
      const { added, updated } = diffById(base.mail, state.messages);
      for (const [old, item] of updated) {
        if (old.read !== item.read) emit({ kind: 'data', store: 'mail', op: 'mark-read', item: { id: item.id, read: item.read } });
        if (old.flagged !== item.flagged) emit({ kind: 'data', store: 'mail', op: 'flag', item: { id: item.id, flagged: item.flagged } });
        if (old.mailbox !== item.mailbox && world.data.mail.folders.includes(item.mailbox)) {
          emit({ kind: 'data', store: 'mail', op: 'move', item: { id: item.id, folder: item.mailbox } });
          // Junk is the Mac's Report action; moving to Trash is Delete.
          if (item.mailbox === 'junk') sceneChoice('report', 'mail', item.id);
          if (item.mailbox === 'trash') sceneChoice('delete', 'mail', item.id);
        }
        if (item.mailbox === 'drafts' && (old.subject !== item.subject || old.body !== item.body || !same(old.to, item.to))) emitDraft(item);
      }
      for (const item of added) if (item.mailbox === 'drafts') emitDraft(item);
      base.mail = state.messages;
    });
    const emitDraft = item => emit({ kind: 'data', store: 'mail', op: 'save-draft', item: {
      id: item.id, to: (item.to ?? []).map(addressText).join(', ').slice(0, 400), subject: String(item.subject ?? '').slice(0, 200), body: String(item.body ?? '').slice(0, 4000) } });
    M.mail.setState({ sendMail: ({ to, subject, body, draftId }) => {
      const id = draftId ?? `d-${Date.now().toString(36)}`;
      emitDraft({ id, to, subject, body });
      M.notify.getState().push({ appId: 'mail', title: 'Not sent', body: 'Sending is turned off on this training desktop. The message was kept in Drafts.' });
    } });

    M.messages.setState({ sendMessage: (convId, { text }) => {
      if (typeof text !== 'string' || !text.trim()) return;
      const id = `i-${Date.now().toString(36)}`;
      M.messages.setState({ convs: M.messages.getState().convs.map(conv => conv.id === convId
        ? { ...conv, messages: [...conv.messages, { id, sender: 'me', text, at: Date.now(), tapbacks: [] }] } : conv) });
      emit({ kind: 'data', store: 'messages', op: 'append', item: { threadId: convId, id, text: text.slice(0, 2000) } });
    } });

    let notesTimer = 0;
    M.notes.subscribe(() => {
      if (applying || !world || !base) return;
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => {
        const notes = M.notes.getState().notes;
        const { added, removed, updated } = diffById(base.notes, notes);
        for (const note of [...added, ...updated.map(([, item]) => item)]) {
          if (note.deleted) { if (world.data.notes.some(item => item.id === note.id)) emit({ kind: 'data', store: 'notes', op: 'delete', item: { id: note.id } }); continue; }
          const { title, body } = noteText(note.html);
          emit({ kind: 'data', store: 'notes', op: 'upsert', item: { id: note.id, folder: /^[a-z0-9-]{1,40}$/.test(note.folderId) ? note.folderId : 'notes', title, body, pinned: Boolean(note.pinned) } });
        }
        for (const note of removed) emit({ kind: 'data', store: 'notes', op: 'delete', item: { id: note.id } });
        base.notes = notes;
      }, 500);
    });

    M.reminders.subscribe(state => {
      if (applying || !world || !base || state.reminders === base.reminders) return;
      const { added, removed, updated } = diffById(base.reminders, state.reminders);
      const reminder = item => ({ id: item.id, list: item.listId, title: item.title.slice(0, 160), due: item.due ? iso(item.due) : null, flagged: Boolean(item.flagged),
        priority: Math.min(3, Math.max(0, Math.round(Number(item.priority) || 0))), notes: String(item.notes ?? '').slice(0, 2000) });
      for (const item of added) emit({ kind: 'data', store: 'reminders', op: 'upsert', item: reminder(item) });
      for (const [old, item] of updated) {
        if (old.completed !== item.completed) emit({ kind: 'data', store: 'reminders', op: 'toggle', item: { id: item.id, done: item.completed } });
        if (['title', 'due', 'listId', 'flagged', 'priority', 'notes'].some(key => old[key] !== item[key])) emit({ kind: 'data', store: 'reminders', op: 'upsert', item: reminder(item) });
      }
      for (const item of removed) emit({ kind: 'data', store: 'reminders', op: 'delete', item: { id: item.id } });
      base.reminders = state.reminders;
    });

    M.calendar.subscribe(state => {
      if (applying || !world || !base || state.events === base.calendar) return;
      const { added, removed, updated } = diffById(base.calendar, state.events);
      for (const item of [...added, ...updated.map(([, event]) => event)]) {
        emit({ kind: 'data', store: 'calendar', op: 'upsert', item: { id: item.id, title: String(item.title).slice(0, 120), start: iso(item.start), end: iso(Math.max(item.start, item.end)),
          location: String(item.location ?? '').slice(0, 120), allDay: Boolean(item.allDay), notes: String(item.notes ?? '').slice(0, 2000) } });
      }
      for (const item of removed) emit({ kind: 'data', store: 'calendar', op: 'delete', item: { id: item.id } });
      base.calendar = state.events;
    });

    M.contacts.subscribe(state => {
      if (applying || !world || !base || state.contacts === base.contacts) return;
      const { added, removed, updated } = diffById(base.contacts, state.contacts);
      for (const item of [...added, ...updated.map(([, contact]) => contact)]) {
        if (item.myCard || !/^[^@\s]+@[A-Za-z0-9.-]+\.(example|invalid)$/i.test(item.email)) continue;
        emit({ kind: 'data', store: 'contacts', op: 'upsert', item: { id: item.id, name: `${item.first} ${item.last}`.trim().slice(0, 80) || item.email, email: item.email, phone: String(item.phone).slice(0, 40), org: String(item.company).slice(0, 80), favorite: Boolean(item.favorite) } });
      }
      for (const item of removed) if (!item.myCard) emit({ kind: 'data', store: 'contacts', op: 'delete', item: { id: item.id } });
      base.contacts = state.contacts;
    });
  }

  // Clock alarms, Safari tab closes and Activity Monitor quits.
  function watchScene() {
    M.clock.subscribe((state, prev) => {
      if (applying || !world || state.alarms === prev.alarms) return;
      const { added, removed, updated } = diffById(prev.alarms, state.alarms);
      const time = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      for (const alarm of [...added, ...updated.map(([, item]) => item)]) {
        emit({ kind: 'data', store: 'alarms', op: 'upsert', item: { id: alarm.id, time: time(alarm.minutes), label: String(alarm.label || 'Alarm').slice(0, 60), enabled: Boolean(alarm.enabled) } });
      }
      for (const alarm of removed) emit({ kind: 'data', store: 'alarms', op: 'delete', item: { id: alarm.id } });
    });
    // Closing a tab (or the window) that shows a scene page is the scene's close-tab choice while Safari is highlighted.
    const sceneTabs = byWin => Object.entries(byWin).flatMap(([winId, entry]) => entry.tabs
      .filter(tab => String(tab.history[tab.hIndex]?.info?.url ?? '').startsWith('scene:')).map(tab => `${winId}|${tab.id}`));
    M.safariTabs.subscribe((state, prev) => {
      if (applying || !world) return;
      const open = new Set(sceneTabs(state.byWin));
      const closed = sceneTabs(prev.byWin).filter(key => !open.has(key) && !closedByWorld.has(key.split('|')[0]) &&
        (state.byWin[key.split('|')[0]] ? !state.byWin[key.split('|')[0]].tabs.some(tab => `${key.split('|')[0]}|${tab.id}` === key) : true));
      if (closed.length) sceneChoice('close-tab', 'browser');
      for (const winId of Object.keys(prev.byWin)) if (!state.byWin[winId]) closedByWorld.delete(winId);
    });
    const sim = M.processes();
    const kill = sim.kill.bind(sim);
    sim.kill = pid => {
      const proc = sim.procs.find(item => item.pid === pid && !item.dead);
      if (proc?.kind !== 'scene') return kill(pid);
      if (!proc.endChoice) {
        M.notify.getState().push({ appId: 'activitymonitor', title: 'Access is denied', body: `${proc.name} cannot be quit from this account.` });
        return undefined;
      }
      emit({ kind: 'scene-choice', choiceId: proc.endChoice });
      return kill(pid);
    };
  }

  // ---- synced app stores (SYNC-AUDIT.md §5): native gestures -> intents, generically ----
  // diffStore compares the canonical form (WM.normaliseStore) of what the native store shows with the world's, part by
  // part, and sends only the difference. The adapter's own apply leaves no difference, so it never echoes; an intent
  // already sent is not repeated until the next world arrives.
  const data = (store, op, item) => emit({ kind: 'data', store, op, item });
  const sentSinceApply = new Set();
  const sendOnce = (store, op, item) => {
    const key = json([store, op, item]);
    if (sentSinceApply.has(key)) return;
    sentSinceApply.add(key);
    data(store, op, item);
  };
  const debounced = (ms, run) => {
    let timer = 0;
    return () => {
      if (applying || !world) return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (world) run(); }, ms);
    };
  };
  const at = (value, key) => (key === null ? value : value[key]);

  function diffStore(store, binding) {
    const worldValue = worldStore(world, store);
    const nativeValue = binding.fromNative(binding.native().getState());
    const canonicalWorld = WM.normaliseStore(store, worldValue);
    const canonicalNative = WM.normaliseStore(store, nativeValue);
    for (const part of binding.parts) {
      if (part.set) {
        const pickKeys = value => part.keys.map(key => value[key]);
        if (!same(pickKeys(canonicalWorld), pickKeys(canonicalNative))) {
          sendOnce(store, part.set, part.item ? part.item(nativeValue) : Object.fromEntries(part.keys.map(key => [key, nativeValue[key]])));
        }
      } else if (part.list) {
        const [upsertOp, deleteOp] = part.list;
        const worldItems = new Map(at(canonicalWorld, part.key).map(item => [item.id, item]));
        const rawNative = at(nativeValue, part.key);
        at(canonicalNative, part.key).forEach((item, index) => {
          if (!same(worldItems.get(item.id), item)) sendOnce(store, upsertOp, part.item ? part.item(rawNative[index]) : rawNative[index]);
        });
        const nativeIds = new Set(rawNative.map(item => item.id));
        if (deleteOp) for (const id of worldItems.keys()) if (!nativeIds.has(id)) sendOnce(store, deleteOp, { id });
      } else {
        const { record, remove, clear, newestFirst, replacedBy, tail, item } = part.log;
        const worldLog = at(worldValue, part.key);
        const nativeLog = at(nativeValue, part.key);
        if (nativeLog.length === 0) {
          if (worldLog.length) sendOnce(store, clear, {});
        } else if (tail) {
          if (nativeLog.at(-1) !== worldLog.at(-1)) sendOnce(store, record, { line: nativeLog.at(-1) });
        } else {
          const known = new Set(worldLog.map(entry => entry.id));
          for (const entry of newestFirst ? [...nativeLog].reverse() : nativeLog) if (!known.has(entry.id)) sendOnce(store, record, item(entry));
          if (remove) {
            const ids = new Set(nativeLog.map(entry => entry.id));
            const kept = new Set(nativeLog.map(entry => entry[replacedBy]));
            for (const entry of worldLog) if (!ids.has(entry.id) && !kept.has(entry[replacedBy])) sendOnce(store, remove, { id: entry.id });
          }
        }
      }
    }
  }

  function watchBindings() {
    for (const [store, binding] of Object.entries(BINDINGS)) {
      const run = () => diffStore(store, binding);
      binding.native().subscribe(binding.debounce ? debounced(binding.debounce, run) : () => { if (!applying && world) run(); });
    }
  }

  // Browser tabs follow the Safari window of the world's browser window.
  function syncBrowserTabs() {
    if (!world.windows.some(win => win.app === 'browser') || !M.safariTabs.getState().byWin[browserWindowId()]) return;
    const { tabs, activeTabId } = nativeTabs();
    const canonical = value => WM.normaliseStore('browser', { ...WM.emptyStore('browser'), tabs: value.tabs, activeTabId: value.activeTabId });
    if (!same(canonical({ tabs, activeTabId }), canonical(worldStore(world, 'browser')))) sendOnce('browser', 'set-tabs', { tabs, activeTabId });
  }
  function watchBrowserTabs() {
    M.safariTabs.subscribe((state, prev) => {
      if (applying || !world) return;
      const nativeId = browserWindowId();
      // A Safari window that just mounted shows the world's tabs (from the other OS) instead of its fresh start tab.
      if (nativeId && state.byWin[nativeId] && !prev.byWin[nativeId] && world.data.browser?.tabs.length) {
        applying = true;
        try { applyBrowserTabs(nativeId, world.data.browser); } finally { applying = false; }
        return;
      }
      syncBrowserTabs();
    });
  }

  // Music playback reports only after a trainee action (play, pause, seek, skip), never from the adapter's own start
  // or a refused autoplay.
  function watchPlayback() {
    const report = debounced(300, () => {
      const known = new Set(worldStore(world, 'media').tracks.map(track => track.id));
      const playing = nativeNowPlaying(known);
      if (playing) data('media', 'set-playback', playing);
      else if (world.data.media?.nowPlaying) data('media', 'set-playback', { trackId: null, queue: [], positionSec: 0, playing: false });
    });
    // Wrap the actions a trainee uses; the adapter calls them only while applying, so wrapped calls then do not report.
    const wrap = (store, names) => {
      const state = store.getState();
      store.setState(Object.fromEntries(names.map(name => [name, (...args) => {
        const result = state[name](...args);
        if (!applying && active) report();
        return result;
      }])));
    };
    wrap(M.music, ['playTrack', 'playQueue', 'toggle', 'next', 'prev', 'setShuffle', 'removeFromQueue']);
    wrap(M.player, ['play', 'pause', 'toggle', 'seek', 'stop']);
  }

  function watchTerminal() {
    window.__oceanTerminalCwd = () => (world ? M.fs.getState().pathOf(worldStore(world, 'terminal').cwd) : undefined);
    window.__oceanTerminalCd = path => {
      const node = M.fs.getState().getByPath(path);
      if (!world || applying || !node || world.fs.nodes[node.id]?.kind !== 'folder' || node.id === worldStore(world, 'terminal').cwd) return;
      data('terminal', 'cd', { cwd: node.id });
    };
    window.__oceanTerminalSession = session => {
      terminalSessions.add(session);
      window.__oceanTerminalCd(session.cwd);
    };
  }

  function watchSynced() {
    watchBindings();
    watchBrowserTabs();
    watchPlayback();
    watchTerminal();
    M.messages.subscribe((state, prev) => {
      if (applying || !world || state.convs === prev.convs) return;
      for (const conv of state.convs) {
        const thread = world.data.messages.threads.find(item => item.id === conv.id);
        if (thread && Boolean(conv.pinned) !== (thread.pinned ?? false)) data('messages', 'pin', { threadId: conv.id, pinned: Boolean(conv.pinned) });
      }
    });
  }

  // ---- scene hooks used by the bundle patches ----
  window.__oceanEmit = intent => emit(intent);
  window.__oceanMailExtrasFor = id => {
    const message = world?.data.mail.messages.find(item => item.id === id);
    if (!message) return null;
    const attachments = message.attachments.map(fileId => world.fs.nodes[fileId]).filter(Boolean).map(node => ({ id: node.id, name: node.name }));
    // The link chip shows the page's display address, as on Windows; the page id only when the page is missing.
    const page = message.link ? world.data.web?.pages[message.link.slice(6)] : undefined;
    return { link: message.link ?? null, linkLabel: page ? page.url.replace(/^https?:\/\//, '') : message.link ? `Open ${message.link.slice(6)}` : '', attachments };
  };
  window.__oceanFollowLink = id => {
    const message = world?.data.mail.messages.find(item => item.id === id);
    if (!message?.link) return;
    sceneChoice('follow-link', 'mail', id);
    if (isInstalledCanonical('browser')) emit({ kind: 'open-app', app: 'browser', payload: { url: message.link } });
  };
  // Opening an attachment goes through the OS, as on Windows: programs prompt and run, PDFs open read-only, locked or
  // unknown files cannot open (world-model openFile).
  window.__oceanOpenAttachment = (id, fileId) => {
    const node = world?.fs.nodes[fileId];
    if (!node) return;
    sceneChoice('download', 'mail', id);
    emit({ kind: 'open-file', fileId });
  };
  // Finder and desktop double-clicks on a world file (the bundle's open function asks this first). Folders and
  // "Open With" stay native.
  window.__oceanOpenFile = fileId => {
    if (!world || world.phase !== 'desktop' || world.fs.nodes[fileId]?.kind !== 'file') return false;
    sceneChoice('run-file', 'files', fileId);
    emit({ kind: 'open-file', fileId });
    return true;
  };
  // Get Info on a world file opens the shared Properties dialog (type, publisher, signature, hidden extension).
  window.__oceanGetInfo = fileId => {
    if (!world || world.fs.nodes[fileId]?.kind !== 'file') return false;
    emit({ kind: 'file-properties', fileId });
    return true;
  };
  // The Finder and desktop icon for a world file or archive folder: the shared type icon (a disguised file shows its
  // disguise). Images keep their native thumbnail; ordinary folders and apps keep theirs.
  window.__oceanFileIconUrl = id => {
    const node = world?.fs.nodes[id];
    const UI = window.OceanProgramUI;
    if (!node || !UI) return null;
    if (node.kind === 'folder' && !node.archive) return null;
    if (node.kind !== 'file' && node.kind !== 'folder') return null;
    const type = WM.iconTypeOf(node);
    if (node.kind === 'file' && !node.icon && type === 'image') return null;
    // The padlock badge for an encrypted file is the bundle's own (make-macos-final.mjs).
    return UI.fileIcon(type, 'macos');
  };
  // The page a new Safari tab opens (data.web.homepage), else undefined for the start page.
  window.__oceanHomepage = () => world?.data.web?.homepage;
  // Safari's scene:<id> page: the scene-provided data.web page (brand, display URL, heading, body, choice buttons;
  // no inputs, no frames), else a neutral placeholder. Choice buttons are explicit scene choices.
  const proceededPages = new Set();
  // Finder View > Show All Filename Extensions: the shared setting both desktops honour (Explorer shows it too).
  window.__oceanToggleExtensions = () => emit({ kind: 'set-sys', patch: { showExtensions: !world?.sys.showExtensions } });
  // Safari keeps the element it rendered for an address, so a scene page is a host the adapter draws into and redraws on
  // every world change: a sign-in that succeeds shows the page behind it, and each typed key shows in its box.
  const pageHosts = new Set();
  window.__oceanScenePage = (url, jsx) => jsx.jsx('div', { className: 'w-full h-full', 'data-scene-url': url, ref: el => {
    if (!el) return;
    el.dataset.sceneUrl = url;
    pageHosts.add(el);
    drawScenePage(el);
  } });
  function refreshScenePages() {
    for (const host of [...pageHosts]) {
      if (!host.isConnected) pageHosts.delete(host);
      else drawScenePage(host);
    }
  }
  const el = (tag, style = {}, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    Object.assign(node.style, style);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'onClick') node.addEventListener('click', value);
      else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return node;
  };
  function drawScenePage(host) {
    const url = host.dataset.sceneUrl ?? '';
    // A page behind a sign-in shows its sign-in page until the trainee signs in there (world-model shownPage).
    const pageId = world ? WM.shownPage(world, url.slice(6)) ?? url.slice(6) : url.slice(6);
    const page = world?.data.web?.pages[pageId];
    const dark = world?.sys.theme === 'dark';
    const typed = page ? WM.typedOf(world, pageId) : [];
    const key = JSON.stringify([pageId, page, dark, typed, proceededPages.has(pageId)]);
    if (host.dataset.key === key) return;
    // A redraw that only typed a letter keeps the boxes (and the caret): the shared parts redraw themselves.
    const sameShape = host.dataset.page === JSON.stringify([pageId, page, dark, proceededPages.has(pageId)]);
    host.dataset.key = key;
    const UI = window.OceanProgramUI;
    const drawPart = (node, name, onProceed) => UI?.renderPagePart(node, name, { page, os: 'macos', dark, pageId, typed, onType: field => emit({ kind: 'page-type', page: pageId, field }) }, onProceed);
    if (sameShape) {
      for (const node of host.querySelectorAll('[data-scene-part]')) drawPart(node, node.dataset.scenePart);
      return;
    }
    host.dataset.page = JSON.stringify([pageId, page, dark, proceededPages.has(pageId)]);
    if (!page) {
      host.replaceChildren(el('div', { display: 'grid', placeItems: 'center', height: '100%' }, { class: 'surface-window text-label' },
        el('div', { textAlign: 'center', maxWidth: '420px', padding: '24px' }, {},
          el('div', { fontSize: '18px', fontWeight: '600', marginBottom: '6px' }, {}, 'Training page'),
          el('div', { fontSize: '12px' }, { class: 'text-label-2' }, `${url.slice(6)} · this page is part of the exercise and is not a real website.`))));
      return;
    }
    const part = name => { const node = el('div', {}, { 'data-testid': `page-${name}`, 'data-scene-part': name }); drawPart(node, name); return node; };
    const button = choice => el('button', choice.style === 'secondary'
      ? { padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', background: '#fff', color: '#0A64D8', boxShadow: 'inset 0 0 0 1px #0A64D8', border: '0', cursor: 'pointer' }
      : { padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', background: '#0A64D8', color: '#fff', border: '0', cursor: 'pointer' },
      { 'data-ocean-key': `choice:${choice.choiceId}`, 'data-ocean-label': `The “${choice.label}” button`, onClick: () => emit({ kind: 'scene-choice', choiceId: choice.choiceId }) }, choice.label);
    // The browser's warning covers the page until the trainee chooses to visit it (a per-view choice).
    let warning = null;
    if (page.warning && !proceededPages.has(pageId)) {
      warning = el('div', { position: 'absolute', inset: '0', overflow: 'auto', zIndex: '2', background: dark ? '#1E1E1E' : '#fff', color: dark ? '#F5F5F7' : '#1D1D1F' }, { 'data-testid': 'page-warning', 'data-warning-page': pageId });
      UI?.renderPagePart(warning, 'warning', { page, os: 'macos', dark }, () => { proceededPages.add(pageId); refreshScenePages(); });
    }
    host.replaceChildren(el('div', { width: '100%', height: '100%', overflow: 'auto', background: '#F5F6F8', color: '#1D1D1F', position: 'relative' }, {},
      warning,
      el('div', { maxWidth: '540px', margin: '40px auto', background: '#fff', borderRadius: '14px', boxShadow: '0 6px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }, {},
        (page.toolbars || page.issuer) && part('top'),
        el('div', { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 28px', background: '#1D3557', color: '#fff' }, {},
          el('div', { fontSize: '15px', fontWeight: '700', flex: '1' }, {}, page.brand ?? page.title),
          page.insecure && el('div', { fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '6px', background: '#FF3B30' }, {}, 'Not Secure')),
        el('div', { padding: '28px' }, { 'data-ocean-key': `page:${pageId}`, 'data-ocean-label': `The page ${page.url}` },
          el('div', { fontSize: '11px', color: '#6E6E73', marginBottom: '6px' }, {}, page.url),
          el('div', { fontSize: '22px', fontWeight: '600', marginBottom: '12px' }, {}, page.heading ?? page.title),
          ...page.body.split(/\n{2,}/).filter(Boolean).map(text => el('p', { fontSize: '14px', lineHeight: '1.5', margin: '0 0 12px', whiteSpace: 'pre-wrap' }, {}, text)),
          page.fields && part('form'),
          page.sections && part('sections'),
          el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }, {}, page.choices.map(button))))));
  }

  // ---- transport ----
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window.parent || window.parent === window || !data || data.type !== 'ocean-shell-attach' || data.version !== 3 || event.ports.length !== 1) return;
    port?.close();
    port = event.ports[0];
    mode = 'parent';
    port.onmessage = ({ data: message }) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'world' && message.version === 3 && message.world?.revision === message.revision) {
        if (!WM.validate(message.world).ok) return;
        apply(message.world, world);
      } else if (message.type === 'world-active' && typeof message.active === 'boolean') {
        active = message.active;
        // Only the visible shell plays: pause when hidden, resume from the world when shown.
        if (world) {
          applying = true;
          try { applyPlayback(world.data.media); } finally { applying = false; }
        }
      }
    };
    port.start();
    adapter.ready.then(() => port.postMessage({ type: 'ready', version: 3, shell: 'macos', apps: [...WM.CANONICAL_APPS] }));
  });
  window.addEventListener('pagehide', () => port?.close(), { once: true });
  // ---- the quest overlay (program-ui.js mountOverlay): where an ocean key is on this Mac's screen ----
  // The bundle's own DOM has no world ids, so most keys are found here: the dock by app, a desktop or Finder icon by its
  // node, a Mail row by its subject, a notification by its title.
  let overlay = null;
  const nativeOf = app => NATIVE[app];
  function questOverlay() {
    if (overlay || !window.OceanProgramUI?.mountOverlay) return overlay;
    const UI = window.OceanProgramUI;
    overlay = UI.mountOverlay(document, {
      emit,
      locate: key => {
        const at = key.indexOf(':');
        const kind = at < 0 ? key : key.slice(0, at);
        const ref = at < 0 ? '' : key.slice(at + 1);
        if (kind === 'app') return document.querySelector(`[data-dock-app="${nativeOf(ref)}"]`);
        if (kind === 'file') {
          const node = world?.fs.nodes[ref];
          const icon = document.querySelector(`img[data-file-icon="${ref}"]`);
          const tile = icon?.closest('button, [role=button], [draggable=true]') ?? icon?.parentElement ?? null;
          const listed = node ? [...document.querySelectorAll('[data-item]')].filter(el => el.textContent.trim() === WM.displayName(node, 'macos', !!world.sys.showExtensions)) : [];
          // A Mail attachment chip (bundle-hook __oceanMailExtras) names the file in full.
          const pane = document.querySelector('[data-native-app="mail"]');
          const chip = node && pane ? [...pane.querySelectorAll('button')].find(el => el.textContent.trim() === node.name) : null;
          if (chip) chip.setAttribute('data-ocean-label', `The attachment “${node.name}”`);
          return [tile, ...listed, chip].filter(Boolean);
        }
        if (kind === 'mail') {
          const message = world?.data.mail.messages.find(item => item.id === ref);
          const pane = document.querySelector('[data-native-app="mail"]');
          if (!message || !pane) return null;
          const row = [...pane.querySelectorAll('.group')].find(el => el.textContent.includes(message.subject));
          if (row) row.setAttribute('data-ocean-label', `The email “${message.subject}”`);
          return row ?? null;
        }
        if (kind === 'link') {
          const pane = document.querySelector('[data-native-app="mail"]');
          const label = window.__oceanMailExtrasFor?.(ref)?.linkLabel;
          return label && pane ? [...pane.querySelectorAll('button')].find(el => el.textContent.trim() === label) ?? null : null;
        }
        if (kind === 'notification') {
          const item = world?.notifications.banners.find(entry => entry.id === ref);
          if (!item) return null;
          // A banner top right, or its card in Notification Center (an older banner a newer one replaced is still there).
          const hit = [...document.querySelectorAll('div')].filter(el => el.children.length < 8 && el.textContent.includes(item.title) && el.getBoundingClientRect().left > window.innerWidth / 2);
          return hit.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height).find(el => el.getBoundingClientRect().height > 40) ?? null;
        }
        // Login Items rows (bundle-hook OceanLoginItems) by the item's name.
        if (kind === 'startup') {
          const list = document.querySelector('[data-testid="login-items"]');
          const label = list && [...list.querySelectorAll('span')].find(el => el.children.length === 0 && el.textContent.trim() === ref);
          return label?.closest('div.w-full') ?? label?.parentElement?.parentElement ?? null;
        }
        // A Safari favourites-bar item, by the page's title.
        if (kind === 'fav') {
          const title = world?.data.web?.pages?.[ref]?.title;
          const pane = document.querySelector('[data-native-app="safari"]');
          return title && pane ? [...pane.querySelectorAll('button, a, [role=button]')].find(el => el.textContent.trim() === title && el.getBoundingClientRect().top < 280) ?? null : null;
        }
        if (kind === 'process') return [...document.querySelectorAll('[data-native-app="activitymonitor"] tr, [data-native-app="activitymonitor"] [role=row]')].find(el => el.textContent.includes(ref)) ?? null;
        if (kind === 'view') return [...document.querySelectorAll('[data-native-app="oceanprogram"]')].find(el => el.querySelector(`[data-ocean-view="${ref}"]`)) ?? null;
        if (kind === 'net') return document.querySelector('.glass-menubar [aria-label*="Wi" i]') ?? null;
        return null;
      },
    });
    return overlay;
  }

  // ---- dialogs (world.dialogs): Gatekeeper, the auth sheet, XProtect, Get Info and the rest, drawn by OceanProgramUI ----
  // Like the Windows shell, nothing here keeps state the world does not have: the layer is redrawn from world.dialogs.
  let dialogLayer = null;
  let dialogKey = '';
  function applyDialogs(next) {
    const UI = window.OceanProgramUI;
    if (!UI) return;
    const dialogs = next.phase === 'desktop' ? next.dialogs ?? [] : [];
    const dark = next.sys.theme === 'dark';
    const key = json([dialogs, dark, dialogs.map(d => [d.fileId ? next.fs.nodes[d.fileId] : null, d.programId ? next.data.programs?.[d.programId] : null])]);
    if (key === dialogKey) return;
    dialogKey = key;
    if (!dialogLayer) {
      UI.injectStyles(document);
      dialogLayer = document.createElement('div');
      dialogLayer.className = 'oceanDialogs';
      dialogLayer.setAttribute('data-testid', 'dialogs');
      dialogLayer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none';
      document.body.appendChild(dialogLayer);
    }
    dialogLayer.replaceChildren();
    if (!dialogs.length) return;
    const top = dialogs[dialogs.length - 1];
    const frame = UI.dialogFrame(top);
    if (frame.modal) {
      const backdrop = document.createElement('div');
      backdrop.style.cssText = `position:absolute;inset:0;pointer-events:auto;background:${frame.dim ? 'rgba(0,0,0,0.45)' : 'transparent'}`;
      dialogLayer.appendChild(backdrop);
    }
    for (const dialog of dialogs) {
      const slot = document.createElement('div');
      slot.dataset.dialog = dialog.kind;
      slot.dataset.top = String(dialog === top);
      slot.style.cssText = UI.dialogFrame(dialog).corner
        ? 'position:absolute;right:16px;top:40px;pointer-events:auto'
        : 'position:absolute;left:50%;top:22%;transform:translateX(-50%);pointer-events:auto';
      const inner = document.createElement('div');
      slot.appendChild(inner);
      dialogLayer.appendChild(slot);
      UI.renderDialog(inner, { dialog, world: next, os: 'macos', dark }, answer => emit({ kind: 'dialog-answer', id: dialog.id, answer }));
    }
  }

  // The first apply can run before a sandboxed frame has its size, and the host can resize the frame: desktop icons
  // and window frames follow the new work area.
  window.addEventListener('resize', () => {
    if (!world) return;
    drifted.add('windows');
    apply(world, world, true);
  });

  const adapter = {
    shell: 'macos',
    apps: [...WM.CANONICAL_APPS],
    apply: (next, prev) => apply(next, prev ?? null),
    onIntent: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    ready: new Promise(resolve => requestAnimationFrame(() => resolve())),
    // Native app id -> canonical app id (companions included); null for system surfaces such as the Apps panel.
    canonicalOf: native => CANONICAL[native] ?? null,
    get world() { return world; },
    get mode() { return mode; },
    snapshot,
  };
  window.OceanWorldAdapter = adapter;

  watchMenubarTone();
  watchPhase();
  watchSys();
  watchApps();
  watchFs();
  watchWindows();
  watchOverlays();
  watchData();
  watchScene();
  watchSynced();

  // Standalone: the bundled seed, until (and unless) a parent attaches and sends its world.
  apply(WM.createWorld(window.__oceanWorldSeed), null);
})();
