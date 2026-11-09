// Seeded generator of valid worlds for sync round-trip tests (both shells may use it).
// generateWorld(M, start, seed, steps) applies `steps` random intents that the model accepts, plus a few scene-side
// edits (notifications, highlight) that the parent or a scenario would make, and returns a valid desktop world.
// Every text is fictional. No randomness outside the seeded generator, so a failing seed can be replayed.

export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['harbor', 'invoice', 'review', 'badge', 'offsite', 'payroll', 'roadmap', 'budget', 'kelp', 'reef', 'tide', 'lantern', 'draft', 'notes'];
const ZONES = ['local', 'Europe/Paris', 'Asia/Tokyo', 'America/New_York', 'Australia/Sydney', 'Europe/London'];
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'gray'];

export function generateWorld(M, start, seed, steps = 40) {
  const random = rng(seed);
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const one = list => list[Math.floor(random() * list.length)];
  const some = (list, max = list.length) => list.filter(() => random() < 0.5).slice(0, max);
  const words = (n = 2) => Array.from({ length: n }, () => one(WORDS)).join(' ');
  const title = () => words(2).replace(/^./, char => char.toUpperCase());
  const id = prefix => `${prefix}-${int(1, 60)}`;
  const time = () => new Date(Date.UTC(2026, 10, int(1, 28), int(0, 23), int(0, 59))).toISOString().replace('.000Z', 'Z');
  const data = (store, op, item) => ({ kind: 'data', store, op, item });
  let world = { ...start, phase: 'desktop' };

  const candidates = w => {
    const d = w.data;
    const folders = Object.values(w.fs.nodes).filter(node => node.kind === 'folder' && !node.trashed && node.id !== 'trash' && node.id !== 'root');
    const files = Object.values(w.fs.nodes).filter(node => node.kind === 'file' && !node.trashed);
    const editable = Object.values(w.fs.nodes).filter(node => node.kind !== 'app' && !M.FIXED_FOLDERS.includes(node.id));
    const win = w.windows.length ? one(w.windows) : null;
    const pages = Object.keys(d.web?.pages ?? {});
    const sceneUrl = () => `scene:${pages.length && random() < 0.7 ? one(pages) : one(['handbook', 'portal', 'news-desk'])}`;
    const media = d.media ?? { tracks: [], playlists: [] };
    const trackIds = media.tracks.map(track => track.id);
    const photos = d.photos ?? { items: [], albums: [] };
    const boards = d.whiteboard?.boards ?? [];
    const browserWin = w.windows.some(item => item.app === 'browser');
    const out = [
      () => {
        const app = one(w.installed);
        const payload = app === 'files' && random() < 0.6 ? { folderId: one(folders).id }
          : app === 'texteditor' && files.length && random() < 0.6 ? { fileId: one(files).id }
          : app === 'mail' && d.mail.messages.length && random() < 0.6 ? { messageId: one(d.mail.messages).id }
          : app === 'browser' && random() < 0.6 ? { url: sceneUrl() } : undefined;
        return payload ? { kind: 'open-app', app, payload } : { kind: 'open-app', app };
      },
      () => win && { kind: one(['minimize', 'restore', 'maximize', 'fullscreen', 'focus-window', 'close-window']), id: win.id },
      () => win && { kind: 'tile', id: win.id, tile: one([...M.TILES, null]) },
      () => win && { kind: 'set-rect', id: win.id, rect: { x: int(0, 600), y: int(0, 300), w: int(200, 700), h: int(120, 400) } },
      () => ({ kind: 'set-sys', patch: one([
        { theme: one(['light', 'dark']) }, { accent: one(M.ACCENTS) }, { wallpaper: one(M.WALLPAPERS) }, { volume: int(0, 100) }, { muted: random() < 0.5 },
        { brightness: int(20, 100) }, { nightLight: random() < 0.5 }, { wifi: random() < 0.5 }, { bluetooth: random() < 0.5 }, { focus: random() < 0.5 },
        { lowPower: random() < 0.5 }, { reduceMotion: random() < 0.5 }, { dockAutohide: random() < 0.5 }, { showBatteryPercent: random() < 0.5 },
        { increaseContrast: random() < 0.5 }, { wifiNetwork: one(['Harbor-Library', 'Northwind-Guest', 'Reef-Cafe']) }, { locationServices: random() < 0.5 },
        { shareAnalytics: random() < 0.5 }, { personalizedAds: random() < 0.5 }, { battery: int(5, 100) },
      ]) }),
      () => ({ kind: 'toggle-overlay', name: one(['launcher', 'search', 'quick', 'centre']), open: random() < 0.3 }),
      () => ({ kind: 'fs', op: 'mkdir', parentId: one(folders).id, name: `${title()} ${int(1, 99)}` }),
      () => ({ kind: 'fs', op: 'touch', parentId: one(folders).id, name: `${words(1)}-${int(1, 99)}.txt`, text: words(5) }),
      () => editable.length && { kind: 'fs', op: 'rename', id: one(editable).id, name: `${title()} ${int(1, 99)}.txt` },
      () => editable.length && { kind: 'fs', op: one(['trash', 'restore']), id: one(editable).id },
      () => files.length && { kind: 'fs', op: 'write', id: one(files).id, text: `${words(4)}\n${words(3)}` },
      () => ({ kind: 'dock', op: one(['pin', 'unpin']), app: one(w.installed) }),
      () => w.dock.pins.length && { kind: 'dock', op: 'move', app: one(w.dock.pins), index: int(0, w.dock.pins.length - 1) },
      () => ({ kind: one(['install', 'uninstall']), app: one(M.CANONICAL_APPS.filter(app => !M.CORE_APPS.includes(app))) }),
      () => d.mail.messages.length && data('mail', one(['mark-read', 'flag']), one([0, 1]) ? { id: one(d.mail.messages).id, read: random() < 0.5 } : { id: one(d.mail.messages).id, flagged: random() < 0.5 }),
      () => d.mail.messages.length && data('mail', 'move', { id: one(d.mail.messages).id, folder: one(d.mail.folders) }),
      () => d.messages.threads.length && data('messages', 'append', { threadId: one(d.messages.threads).id, id: id('i-g'), text: words(4) }),
      () => d.messages.threads.length && data('messages', 'pin', { threadId: one(d.messages.threads).id, pinned: random() < 0.5 }),
      () => data('notes', 'upsert', { id: id('n-g'), folder: 'notes', title: title(), body: `${words(3)}\n${words(2)}`, pinned: random() < 0.3 }),
      () => d.notes.length && data('notes', 'delete', { id: one(d.notes).id }),
      () => {
        const start = Date.UTC(2026, 10, int(1, 28), int(6, 18), int(0, 3) * 15);
        return data('calendar', 'upsert', { id: id('e-g'), title: title(), start: new Date(start).toISOString(), end: new Date(start + int(1, 4) * 900000).toISOString(),
          location: `Room ${int(1, 9)}`, ...(random() < 0.3 ? { allDay: random() < 0.5 } : {}), ...(random() < 0.3 ? { notes: words(3) } : {}) });
      },
      () => d.reminders.length && data('reminders', 'toggle', { id: one(d.reminders).id, done: random() < 0.5 }),
      () => data('reminders', 'upsert', { id: id('r-g'), list: one(['work', 'home']), title: title(), due: random() < 0.5 ? time() : null,
        ...(random() < 0.5 ? { flagged: random() < 0.5, priority: int(0, 3), notes: words(2) } : {}) }),
      () => data('contacts', 'upsert', { id: id('p-g'), name: `${title()} ${title().split(' ')[0]}`, email: `${one(WORDS)}.${int(1, 99)}@northwind.example`,
        phone: `+1 555 0${int(100, 999)}`, org: 'Northwind', ...(random() < 0.5 ? { favorite: random() < 0.5 } : {}) }),
      () => data('alarms', 'upsert', { id: id('a-g'), time: `${String(int(0, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`, label: title(), enabled: random() < 0.5 }),
      () => browserWin && data('browser', 'set-tabs', (() => {
        const tabs = Array.from({ length: int(1, 4) }, (_, n) => ({ id: `tab-g${n}`, url: one(['start:', 'history:', 'unavailable:', sceneUrl()]), title: title() }));
        return { tabs, activeTabId: one(tabs).id };
      })()),
      () => data('browser', 'visit', { id: id('h-g'), url: sceneUrl(), title: title() }),
      () => data('browser', one(['bookmark-upsert', 'bookmark-upsert', 'bookmark-delete']), (() => { const bm = id('bm-g'); return { id: bm, title: title(), url: sceneUrl() }; })()),
      () => trackIds.length && data('media', 'set-playback', (() => { const queue = some(trackIds); const trackId = queue[0] ?? trackIds[0];
        return { trackId, queue: queue.length ? queue : [trackId], positionSec: int(0, 15), playing: random() < 0.4 }; })()),
      () => data('media', 'set-mode', { shuffle: random() < 0.5, repeat: one(['off', 'all', 'one']) }),
      () => media.tracks.length && data('media', 'track-upsert', { ...one(media.tracks), loved: random() < 0.5 }),
      () => data('media', 'playlist-upsert', { id: id('pl-g'), name: title(), trackIds: some(trackIds) }),
      () => media.playlists.length && data('media', 'playlist-delete', { id: one(media.playlists).id }),
      () => photos.items.length && data('photos', 'photo-upsert', { ...one(photos.items), favorite: random() < 0.5, trashed: random() < 0.2 }),
      () => data('photos', 'album-upsert', { id: id('al-g'), name: title(), photoIds: some(photos.items.map(item => item.id), 4) }),
      () => photos.albums.length && data('photos', 'album-delete', { id: one(photos.albums).id }),
      () => data('whiteboard', 'board-upsert', { id: id('board-g'), name: title(), items: Array.from({ length: int(0, 3) }, (_, n) => one([
        { id: `ff-g${n}`, type: 'sticky', x: int(0, 600), y: int(0, 400), w: 200, h: 200, text: words(2), color: one(COLORS) },
        { id: `ff-g${n}`, type: 'shape', shape: one(['rect', 'ellipse', 'arrow']), x: int(0, 600), y: int(0, 400), w: int(20, 200), h: int(20, 200), color: '#0A84FF' },
        { id: `ff-g${n}`, type: 'pen', x: 10, y: 10, w: 40, h: 40, points: [10, 10, 30, 40, 50, 50], color: '#FF453A', width: 3 },
        { id: `ff-g${n}`, type: 'text', x: int(0, 600), y: int(0, 400), w: 240, h: 34, text: title() },
      ])) }),
      () => boards.length && data('whiteboard', one(['set-active', 'board-delete']), { id: one(boards).id }),
      () => data('calculator', 'set', { mode: one(['basic', 'scientific', 'programmer']), angle: one(['deg', 'rad']), base: one([2, 8, 10, 16]), memory: int(-50, 50) }),
      () => data('calculator', 'record', { id: id('tape-g'), expr: `${int(1, 99)} + ${int(1, 99)}`, result: String(int(2, 198)) }),
      () => data('clock', 'city-upsert', (() => { const tz = one(ZONES.slice(1)); return { id: tz.split('/')[1].toLowerCase().replace(/_/g, '-'), name: tz.split('/')[1].replace(/_/g, ' '), tz }; })()),
      () => (d.clock?.worldClocks.length ?? 0) > 1 && data('clock', 'city-delete', { id: one(d.clock.worldClocks).id }),
      () => data('clock', 'set-timer', { timer: random() < 0.2 ? null : (() => { const durationMs = int(1, 30) * 60000; return { label: title(), durationMs, remainingMs: int(1, durationMs / 1000) * 1000, running: random() < 0.5 }; })() }),
      () => data('clock', 'set-stopwatch', (() => { const laps = some([3000, 9000, 15000]); return { running: random() < 0.4, elapsedMs: (laps.at(-1) ?? 0) + int(0, 9000), laps }; })()),
      () => data('terminal', 'record', { line: one(['ls', 'pwd', 'whoami', `cat ${words(1)}.txt`, 'cd Documents']) }),
      () => w.windows.some(item => item.app === 'terminal') && data('terminal', 'cd', { cwd: one(folders).id }),
      () => data('stickies', 'upsert', { id: id('stk-g'), text: `${words(2)}\n${words(2)}`, color: one(COLORS), x: int(0, 600), y: int(0, 400), w: int(160, 300), h: int(120, 260), collapsed: random() < 0.2 }),
      () => (d.stickies?.length ?? 0) && data('stickies', 'delete', { id: one(d.stickies).id }),
    ];
    return out;
  };

  for (let n = 0; n < steps; n += 1) {
    const intent = one(candidates(world))();
    if (!intent) continue;
    const result = M.applyIntent(world, intent, Date.UTC(2026, 10, 2, 10, 0, n));
    if (result.ok) world = result.world;
  }
  // Scene-side edits a scenario makes through the parent: notifications and the highlight.
  const notify = { id: `n-g${int(1, 99)}`, app: one(world.installed), title: title(), body: words(5), time: time() };
  const edited = { ...world, notifications: { banners: random() < 0.5 ? [notify] : [], history: [notify, ...world.notifications.history.filter(item => item.id !== notify.id)].slice(0, 20) },
    scene: { ...world.scene, highlight: random() < 0.5 ? { app: one(world.installed), ref: null } : null } };
  return M.validate(edited).ok ? edited : world;
}
