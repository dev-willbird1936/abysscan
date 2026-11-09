// Parent-owned desktop world (WORLD-CONTRACT v3). DOM-free: no timers and no randomness; the clock is injected.
//   createWorld(seed, profilePatch)        -> World          (seed + deep-merge overlay, installed filtering, validated)
//   validate(world)                        -> { ok, error }
//   applyIntent(world, intent, now)        -> { ok, changed, world, reason, forward }
//   parseIntent(value) / parseIntentMessage(message)
//   mergeProfile(seed, patch)              -> merged plain JSON (objects merge, arrays replace, null removes an object)
// Both shells (macOS, Windows) render the same world and report gestures as intents; the parent applies them here.
// ESM apps import ./world-model.mjs, which re-exports this file.
(() => {
  'use strict';

  const CANONICAL_APPS = Object.freeze([
    'files', 'browser', 'mail', 'messages', 'mfa', 'updates', 'settings', 'terminal', 'notes', 'texteditor',
    'calendar', 'reminders', 'contacts', 'photos', 'media', 'calculator', 'clock', 'store', 'taskmanager',
    'stickies', 'whiteboard',
  ]);
  // Native or historical ids of apps culled in PARITY.md. They never enter a world, even as an intent value.
  const CULLED_APPS = Object.freeze([
    'photobooth', 'facetime', 'voicememos', 'camera', 'voicerecorder', 'phone', 'yourphone', 'weather', 'maps',
    'dictionary', 'podcasts', 'tv', 'news', 'home', 'chess', 'games', 'movies', 'xbox', 'diskutility', 'siri',
    'cortana', 'copilot', 'screenshot', 'snipping', 'spotify', 'discord', 'github', 'vscode', 'getstarted',
    'buymeacoffee', 'twitter', 'pinterest', 'skype', 'yammer', 'office',
  ]);
  // Scene presentation fields (SCENARIOS-60-CONTRACT §3, §4): creature states, depths and the fixed attack kinds.
  const CREATURE_STATES = Object.freeze(['idle', 'notice', 'approach', 'circle', 'press', 'breakthrough']);
  const SCENE_DEPTHS = Object.freeze(['sunlight', 'twilight', 'midnight', 'abyss', 'trench']);
  const ATTACK_KINDS = Object.freeze([
    'scareware', 'credential-phish', 'mfa-fatigue', 'oauth-consent', 'mass-mail-worm', 'macro-dropper', 'ransomware-encrypt',
    'data-exfil', 'money-transfer', 'wallet-drain', 'supply-chain-update', 'network-worm', 'botnet-ddos', 'account-takeover-post',
    'sim-swap', 'spyware-surveillance', 'server-exploit-leak',
  ]);
  const SANDBOX_MODES = Object.freeze(['docker', 'vultr', 'simulated']);
  const SANDBOX_STATUSES = Object.freeze(['idle', 'provisioning', 'running', 'done', 'destroyed', 'failed']);
  const SANDBOX_MAX_EVENTS = 64;
  const WORLD_MAX_BYTES = 256 * 1024;
  const WORK = Object.freeze({ w: 1000, h: 600 });
const GUIDE_EDGE = 270;
  const MIN_SIZE = Object.freeze({ w: 200, h: 120 });
  const PHASES = Object.freeze(['boot', 'lock', 'desktop', 'sleep', 'off']);
  // Allowed shell-requested phase changes. lock -> desktop is the fixed training sign-in (no password).
  const PHASE_MOVES = Object.freeze({
    boot: ['lock'], lock: ['desktop', 'sleep', 'off'], desktop: ['lock', 'sleep', 'off'], sleep: ['lock'], off: ['boot'],
  });
  const ACCENTS = Object.freeze(['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite']);
  const WALLPAPERS = Object.freeze(['depth-sunlight', 'depth-twilight', 'depth-midnight', 'depth-abyss', 'depth-trench', 'stock']);
  const MODES = Object.freeze(['normal', 'minimized', 'maximized', 'fullscreen']);
  const TILES = Object.freeze(['left', 'right', 'top', 'bottom', 'tl', 'tr', 'bl', 'br']);
  const OVERLAYS = Object.freeze(['launcher', 'search', 'quick', 'centre', 'taskView', 'switcher']);
  const FIXED_FOLDERS = Object.freeze(['root', 'home', 'desktop', 'documents', 'downloads', 'pictures', 'music', 'trash']);
  const NODE_KINDS = Object.freeze(['folder', 'file', 'app']);
  // System windows that are not apps a trainee launches: 'program' draws data.views (a scene program's own window).
  // They are always available, never in the dock, launcher, store or `installed`.
  const SYSTEM_APPS = Object.freeze(['program']);
  // ---- file types (PROGRAMS.md §1): what a file is, from its name. Both shells use these for icon, label and open. ----
  // [type, label]. Windows hides the extension of every type listed here (x.pdf.exe shows as x.pdf); macOS shows them
  // all except .app. An unlisted extension is 'unknown': shown in full, and opening it asks how to open it.
  const FILE_TYPES = Object.freeze(Object.fromEntries([
    ...['exe', 'com'].map(ext => [ext, ['program', 'Application']]), ['scr', ['program', 'Screen saver']], ['pif', ['program', 'Shortcut to MS-DOS Program']],
    ['vbs', ['script', 'VBScript Script File']], ['vbe', ['script', 'VBScript Encoded File']], ['js', ['script', 'JScript Script File']],
    ['jse', ['script', 'JScript Encoded File']], ['wsf', ['script', 'Windows Script File']], ['bat', ['script', 'Windows Batch File']],
    ['cmd', ['script', 'Windows Command Script']], ['ps1', ['script', 'Windows PowerShell Script']], ['hta', ['script', 'HTML Application']],
    ['sh', ['script', 'Shell script']], ['command', ['script', 'Terminal shell script']], ['reg', ['script', 'Registration Entries']],
    ['msi', ['installer', 'Windows Installer Package']], ['pkg', ['installer', 'Installer package']], ['mpkg', ['installer', 'Installer package']],
    ['app', ['macapp', 'Application']], ['dmg', ['diskimage', 'Disk Image']], ['iso', ['diskimage', 'Disc Image File']], ['img', ['diskimage', 'Disc Image File']],
    ['zip', ['archive', 'Compressed (zipped) Folder']], ['rar', ['archive', 'RAR archive']], ['7z', ['archive', '7-Zip archive']],
    ['gz', ['archive', 'GZ archive']], ['tgz', ['archive', 'Compressed archive']], ['tar', ['archive', 'TAR archive']],
    ['lnk', ['shortcut', 'Shortcut']], ['url', ['shortcut', 'Internet Shortcut']],
    ['dll', ['library', 'Application extension']], ['sys', ['library', 'System file']], ['ocx', ['library', 'ActiveX control']],
    ['dat', ['data', 'DAT File']], ['bin', ['data', 'BIN File']], ['tmp', ['data', 'TMP File']],
    ['jar', ['java', 'Executable Jar File']], ['class', ['java', 'Java class file']],
    ...['doc', 'docx', 'rtf', 'odt'].map(ext => [ext, ['word', ext === 'rtf' ? 'Rich Text Format' : 'Word Document']]),
    ['docm', ['word-macro', 'Word Macro-Enabled Document']], ['dotm', ['word-macro', 'Word Macro-Enabled Template']],
    ...['xls', 'xlsx', 'ods'].map(ext => [ext, ['sheet', 'Excel Worksheet']]), ['xlsm', ['sheet-macro', 'Excel Macro-Enabled Worksheet']],
    ['csv', ['sheet', 'CSV File']], ['tsv', ['sheet', 'TSV File']], ['numbers', ['sheet', 'Numbers Spreadsheet']],
    ...['ppt', 'pptx'].map(ext => [ext, ['slides', 'PowerPoint Presentation']]), ['odp', ['slides', 'OpenDocument Presentation']], ['key', ['slides', 'Keynote Presentation']],
    ['pages', ['word', 'Pages Document']],
    ['pdf', ['pdf', 'PDF Document']],
    ...['txt', 'log', 'ini', 'cfg', 'conf', 'md', 'json', 'xml', 'nfo', 'yaml', 'yml', 'toml', 'py', 'sql'].map(ext => [ext, ['text', ext === 'txt' ? 'Text Document' : `${ext.toUpperCase()} File`]]),
    ...['html', 'htm', 'mht'].map(ext => [ext, ['web', 'HTML Document']]), ['eml', ['mail', 'Email message']], ['msg', ['mail', 'Outlook Item']],
    ...['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'heic', 'tif', 'tiff'].map(ext => [ext, ['image', `${ext.toUpperCase()} image`]]),
    ...['mp3', 'wav', 'm4a', 'ogg', 'wma', 'flac', 'aac'].map(ext => [ext, ['audio', `${ext.toUpperCase()} audio`]]),
    ...['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv'].map(ext => [ext, ['video', `${ext.toUpperCase()} video`]]),
    ...['cer', 'crt', 'pem'].map(ext => [ext, ['certificate', 'Security Certificate']]), ...['p12', 'pfx'].map(ext => [ext, ['certificate', 'Personal Information Exchange']]),
    ...['bz2', 'xz'].map(ext => [ext, ['archive', 'Compressed archive']]),
    ['ics', ['calendar', 'iCalendar File']], ['vcf', ['contact', 'vCard File']],
  ]));
  const FILE_KINDS = Object.freeze(['program', 'script', 'installer', 'macapp', 'diskimage', 'archive', 'shortcut', 'library', 'data', 'java',
    'word', 'word-macro', 'sheet', 'sheet-macro', 'slides', 'pdf', 'text', 'web', 'mail', 'image', 'audio', 'video', 'certificate', 'calendar', 'contact', 'folder', 'unknown']);
  // Types that run code when opened.
  const RUNNABLE = Object.freeze(['program', 'script', 'installer', 'macapp', 'java']);
  const extOf = name => (String(name).includes('.') ? String(name).slice(String(name).lastIndexOf('.') + 1).toLowerCase() : '');
  // { type, label, ext } for a file name (or a node: a folder, an archive folder or an encrypted file).
  function fileTypeOf(nodeOrName) {
    const node = typeof nodeOrName === 'string' ? null : nodeOrName;
    const name = node ? node.name : nodeOrName;
    const ext = extOf(name);
    if (node?.kind === 'folder' && !node.archive) return { type: 'folder', label: 'File folder', ext: '' };
    if (node?.kind === 'folder') {
      const labels = { zip: 'Compressed (zipped) Folder', rar: 'RAR archive', dmg: 'Disk Image', iso: 'Disc Image File', img: 'Disc Image File', usb: 'USB Drive', cd: 'CD Drive', share: 'Network location' };
      return { type: ['zip', 'rar'].includes(node.archive) ? 'archive' : 'diskimage', label: labels[node.archive], ext: ['usb', 'cd', 'share'].includes(node.archive) ? '' : ext };
    }
    const known = FILE_TYPES[ext];
    if (known) return { type: known[0], label: known[1], ext };
    return { type: 'unknown', label: ext ? `${ext.toUpperCase()} File` : 'File', ext };
  }
  // The name a file manager shows: Windows hides a known extension (the double-extension trick); macOS hides .app only.
  // showAll: the trainee turned on file name extensions (sys.showExtensions), so nothing is hidden.
  function displayName(nodeOrName, os, showAll = false) {
    const name = typeof nodeOrName === 'string' ? nodeOrName : nodeOrName.name;
    if (showAll) return name;
    if (typeof nodeOrName !== 'string' && nodeOrName.kind === 'folder' && !nodeOrName.archive) return name;
    const ext = extOf(name);
    const hide = os === 'macos' ? ext === 'app' : Object.hasOwn(FILE_TYPES, ext);
    return hide && name.length > ext.length + 1 ? name.slice(0, -(ext.length + 1)) : name;
  }
  // The icon a file shows: its own type, or the type its author disguised it as (node.icon: an .exe drawn as a PDF).
  const iconTypeOf = node => (node?.icon && FILE_KINDS.includes(node.icon) ? node.icon : fileTypeOf(node).type);
  const FS_OPS = Object.freeze(['mkdir', 'touch', 'rename', 'move', 'trash', 'restore', 'empty-trash', 'write', 'set-desktop-pos']);
  const MULTI_WINDOW_APPS = Object.freeze(['files', 'texteditor', 'stickies']);
  // A Settings window may open on a named pane: payload { pane }. Each shell shows it its own way: startup is Windows
  // Settings > Apps > Startup and macOS Login Items; privacy and network are the matching panes on both.
  const SETTINGS_PANES = Object.freeze(['startup', 'privacy', 'network']);
  // Apps a profile may never remove: the desktop needs a file manager and a settings app.
  const CORE_APPS = Object.freeze(['files', 'settings']);
  // Synced app stores (SYNC-AUDIT.md §4): optional, absent means empty.
  const SYNCED_DATA = Object.freeze(['browser', 'media', 'photos', 'whiteboard', 'calculator', 'clock', 'terminal', 'stickies']);
  const OPTIONAL_DATA = Object.freeze(['alarms', 'updates', 'mfa', 'processes', 'startup', 'screenshots', 'web', 'programs', 'views', 'quota', 'flags', 'captured', 'net', ...SYNCED_DATA]);
  const UPDATE_STATUSES = Object.freeze(['available', 'installed']);
  const WINDOW_ID_INTENTS = Object.freeze(['close-window', 'focus-window', 'minimize', 'restore', 'maximize', 'fullscreen']);
  const DATA_OPS = Object.freeze({
    mail: ['mark-read', 'flag', 'move', 'save-draft'],
    messages: ['append', 'pin'],
    notes: ['upsert', 'delete'],
    calendar: ['upsert', 'delete'],
    reminders: ['toggle', 'upsert', 'delete'],
    contacts: ['upsert', 'delete'],
    alarms: ['upsert', 'delete'],
    updates: ['upsert', 'delete'],
    mfa: ['delete'],
    browser: ['set-tabs', 'visit', 'history-delete', 'clear-history', 'bookmark-upsert', 'bookmark-delete'],
    media: ['set-playback', 'set-mode', 'track-upsert', 'playlist-upsert', 'playlist-delete'],
    photos: ['photo-upsert', 'photo-delete', 'album-upsert', 'album-delete'],
    whiteboard: ['board-upsert', 'board-delete', 'set-active'],
    calculator: ['set', 'record', 'clear-history'],
    clock: ['city-upsert', 'city-delete', 'set-timer', 'set-stopwatch'],
    terminal: ['cd', 'record', 'clear-history'],
    stickies: ['upsert', 'delete'],
  });
  const ID_RE = /^[a-z0-9-]{1,40}$/;
  // An ocean key names one thing a trainee can see or touch, the same on both desktops (QUESTS.md §2): app:mail, mail:<id>,
  // link:<mail id>, file:<node id>, page:<id>, choice:<choice id>, field:<page>:<n>, section:<page>:<n>, view:<id>,
  // dialog:<kind>:<program or file id>, dialog-btn:<answer>, process:<name>, startup:<name>, notification:<id>, net.
  const KEY_RE = /^[a-z][a-z-]{1,15}(:[^"'<>\u0000-\u001f]{1,140})?$/;
  const isKey = value => typeof value === 'string' && KEY_RE.test(value);
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
  const SCENE_URL_RE = /^scene:[a-z0-9-]{1,40}$/;
  const WEB_URL_RE = /^(https?:\/\/)?[a-z0-9.-]+\.(example|invalid)(\/[^\s]{0,160})?$/i;
  // Same-origin path or inline image only: the shells run with connect-src 'self' and no external hosts.
  const WALLPAPER_URL_RE = /^(\/(?!\/)[A-Za-z0-9._~\/-]{1,200}|data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+\/=]{1,180000})$/;
  const EMAIL_DOMAIN_RE = /@([A-Za-z0-9.-]+)/g;
  const MAX_TEXT = 16384;
  const MAX_NODES = 600;
  const MAX_WINDOWS = 24;
  const MAX_BANNERS = 8;
  const MAX_HISTORY = 120;
  const MAX_ITEMS = 400;
  const MAX_COUNTER = 2 ** 31;
  const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  const DEFAULT_RECTS = Object.freeze({
    files: [110, 60, 720, 440], browser: [120, 40, 780, 500], mail: [80, 40, 820, 500], messages: [180, 70, 640, 440],
    mfa: [350, 130, 300, 340], updates: [190, 80, 620, 420], settings: [170, 50, 660, 480], terminal: [200, 110, 600, 380],
    notes: [150, 60, 700, 440], texteditor: [210, 70, 580, 420], calendar: [120, 50, 760, 480], reminders: [200, 70, 600, 420],
    contacts: [220, 70, 560, 420], photos: [130, 50, 740, 480], media: [150, 60, 700, 460], calculator: [400, 120, 240, 360],
    clock: [260, 90, 480, 380], store: [120, 40, 780, 500], taskmanager: [180, 70, 640, 420], stickies: [640, 60, 240, 220],
    whiteboard: [110, 40, 780, 500], program: [250, 110, 500, 330],
  });
  // Neutral display names; each shell may show its native name instead.
  const APP_NAMES = Object.freeze({
    files: 'Files', browser: 'Browser', mail: 'Mail', messages: 'Messages', mfa: 'Authenticator', updates: 'Software Update',
    settings: 'Settings', terminal: 'Terminal', notes: 'Notes', texteditor: 'Text Editor', calendar: 'Calendar', reminders: 'Reminders',
    contacts: 'Contacts', photos: 'Photos', media: 'Media', calculator: 'Calculator', clock: 'Clock', store: 'App Store',
    taskmanager: 'Task Manager', stickies: 'Stickies', whiteboard: 'Whiteboard',
  });
  const TILE_RECTS = Object.freeze({
    left: [0, 0, 500, 600], right: [500, 0, 500, 600], top: [0, 0, 1000, 300], bottom: [0, 300, 1000, 300],
    tl: [0, 0, 500, 300], tr: [500, 0, 500, 300], bl: [0, 300, 500, 300], br: [500, 300, 500, 300],
  });

  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const hasExactKeys = (value, keys) => isRecord(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
  // Exact required keys plus a fixed set of optional ones.
  const hasKeys = (value, required, optional = []) => isRecord(value) &&
    required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
  const clone = value => JSON.parse(JSON.stringify(value));
  const isId = value => typeof value === 'string' && ID_RE.test(value);
  const isText = (value, max = 200) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  const isLine = (value, max = 200) => isText(value, max) && !/[\r\n]/.test(value);
  const isTime = value => typeof value === 'string' && ISO_RE.test(value) && !Number.isNaN(Date.parse(value));
  const isAlarmTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const isBool = value => typeof value === 'boolean';
  const isIntIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const nullable = (value, test) => value === null || test(value);
  const byteSize = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const isCounter = value => isIntIn(value, 0, MAX_COUNTER);
  // Every address-like token must use a reserved fictional domain.
  const fictionalAddresses = text => [...String(text).matchAll(EMAIL_DOMAIN_RE)].every(match => /\.(example|invalid)$/i.test(match[1]));
  const isFileName = value => isLine(value, 120) && value.trim().length > 0 && !/[\/\\]/.test(value) && value !== '.' && value !== '..';
  const toRect = ([x, y, w, h]) => ({ x, y, w, h });

  // ---- world shape --------------------------------------------------------------------------------------

  function rectProblem(rect) {
    return hasExactKeys(rect, ['x', 'y', 'w', 'h']) && Object.values(rect).every(Number.isInteger) &&
      rect.w >= MIN_SIZE.w && rect.w <= WORK.w && rect.h >= MIN_SIZE.h && rect.h <= WORK.h &&
      rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= WORK.w && rect.y + rect.h <= WORK.h ? null : 'rect';
  }

  function payloadOk(payload) {
    if (payload === null) return true;
    if (hasExactKeys(payload, ['folderId'])) return isId(payload.folderId);
    if (hasExactKeys(payload, ['fileId'])) return isId(payload.fileId);
    if (hasExactKeys(payload, ['messageId'])) return isId(payload.messageId);
    if (hasExactKeys(payload, ['pane'])) return SETTINGS_PANES.includes(payload.pane);
    if (hasExactKeys(payload, ['url'])) return typeof payload.url === 'string' && SCENE_URL_RE.test(payload.url);
    // A program window: the view it draws and, for a view with pages (a wizard, a document's stages), the page shown.
    // flips: the checkboxes the trainee clicked, as '<page>.<n>' (n counts the page's checks in order).
    if (hasKeys(payload, ['view'], ['page', 'flips'])) return isId(payload.view) && (!Object.hasOwn(payload, 'page') || isIntIn(payload.page, 0, 11))
      && (!Object.hasOwn(payload, 'flips') || (Array.isArray(payload.flips) && payload.flips.length <= 24 && new Set(payload.flips).size === payload.flips.length
        && payload.flips.every(key => typeof key === 'string' && /^\d{1,2}\.\d{1,2}$/.test(key))));
    return false;
  }

  const SYS_CHECKS = Object.freeze({
    theme: value => value === 'light' || value === 'dark',
    accent: value => ACCENTS.includes(value),
    wallpaper: value => WALLPAPERS.includes(value),
    wallpaperUrl: value => value === null || (typeof value === 'string' && WALLPAPER_URL_RE.test(value) && !value.includes('..')),
    volume: value => isIntIn(value, 0, 100),
    muted: isBool,
    brightness: value => isIntIn(value, 20, 100),
    nightLight: isBool, wifi: isBool, bluetooth: isBool, focus: isBool, lowPower: isBool,
    battery: value => isIntIn(value, 0, 100),
    reduceMotion: isBool, reduceTransparency: isBool,
    // Optional settings synced from macOS (SYNC-AUDIT.md §2).
    dockAutohide: isBool, showBatteryPercent: isBool, increaseContrast: isBool,
    wifiNetwork: value => isLine(value, 40) && value.trim() !== '',
    locationServices: isBool, shareAnalytics: isBool, personalizedAds: isBool,
    // Explorer View > Show > File name extensions; Finder View > Show All Filename Extensions.
    showExtensions: isBool,
  });
  const SYS_OPTIONAL = Object.freeze(['wallpaperUrl', 'dockAutohide', 'showBatteryPercent', 'increaseContrast', 'wifiNetwork',
    'locationServices', 'shareAnalytics', 'personalizedAds', 'showExtensions']);
  const SYS_REQUIRED = Object.keys(SYS_CHECKS).filter(key => !SYS_OPTIONAL.includes(key));

  function sysProblem(sys) {
    if (!hasKeys(sys, SYS_REQUIRED, SYS_OPTIONAL)) return 'sys';
    return Object.entries(sys).every(([key, value]) => SYS_CHECKS[key](value)) ? null : 'sys';
  }

  function nodeProblem(node, id, nodes, installed) {
    if (!hasKeys(node, ['id', 'parentId', 'name', 'kind', 'mime', 'size', 'modified', 'trashed'], ['appId', 'contentId', 'desktopPos', 'encrypted', 'icon', 'program', 'hidden', 'archive', 'drive'])) return 'fs-node';
    if (Object.hasOwn(node, 'encrypted') && !(isBool(node.encrypted) && node.kind === 'file')) return 'fs-node';
    // PROGRAMS.md §1: a disguised icon, the program a file runs, a hidden (system) file, a folder that is an archive or disk.
    if (Object.hasOwn(node, 'icon') && !(node.kind === 'file' && FILE_KINDS.includes(node.icon))) return 'fs-node';
    if (Object.hasOwn(node, 'program') && !(node.kind === 'file' && isId(node.program))) return 'fs-node';
    if (Object.hasOwn(node, 'hidden') && !isBool(node.hidden)) return 'fs-node';
    if (Object.hasOwn(node, 'archive') && !(node.kind === 'folder' && ARCHIVE_KINDS.includes(node.archive))) return 'fs-node';
    // A drive (USB stick, CD, network share) sits at the top of the computer and has a short label: E:, USB, \\fileserver.
    if (Object.hasOwn(node, 'drive') && !(node.kind === 'folder' && node.parentId === 'root' && ['usb', 'cd', 'share'].includes(node.archive) && isLine(node.drive, 40))) return 'fs-node';
    if (node.id !== id || !isId(id) || !NODE_KINDS.includes(node.kind) || !isBool(node.trashed) || !isTime(node.modified) ||
        !isIntIn(node.size, 0, 1e9) || !nullable(node.mime, value => isLine(value, 80))) return 'fs-node';
    if (id === 'root' ? node.parentId !== null || node.name !== '' : !isFileName(node.name) || !isId(node.parentId) || !nodes[node.parentId]) return 'fs-node';
    if (node.parentId !== null && nodes[node.parentId].kind !== 'folder') return 'fs-parent';
    if (node.kind === 'app' ? !installed.includes(node.appId) : Object.hasOwn(node, 'appId')) return 'fs-app';
    if (Object.hasOwn(node, 'contentId') && (node.kind !== 'file' || !isId(node.contentId))) return 'fs-content';
    if (Object.hasOwn(node, 'desktopPos') && !(hasExactKeys(node.desktopPos, ['x', 'y']) &&
        isIntIn(node.desktopPos.x, 0, WORK.w) && isIntIn(node.desktopPos.y, 0, WORK.h))) return 'fs-pos';
    return null;
  }

  function fsProblem(fs, installed) {
    if (!hasExactKeys(fs, ['nodes']) || !isRecord(fs.nodes)) return 'fs';
    const { nodes } = fs;
    const ids = Object.keys(nodes);
    if (ids.length > MAX_NODES || !FIXED_FOLDERS.every(id => nodes[id]?.kind === 'folder')) return 'fs-fixed';
    for (const id of ids) {
      const problem = nodeProblem(nodes[id], id, nodes, installed);
      if (problem) return problem;
    }
    // Every chain must reach root without a cycle.
    for (const id of ids) {
      let current = nodes[id];
      for (let steps = 0; current.parentId !== null; steps += 1) {
        if (steps > ids.length) return 'fs-cycle';
        current = nodes[current.parentId];
      }
      if (current.id !== 'root') return 'fs-cycle';
    }
    return null;
  }

  const notificationOk = (item, installed) => hasKeys(item, ['id', 'app', 'title', 'body', 'time'], ['ref']) &&
    isId(item.id) && installed.includes(item.app) && isLine(item.title, 120) && isText(item.body, 600) &&
    isTime(item.time) && (!Object.hasOwn(item, 'ref') || isId(item.ref));

  const uniqueIds = list => new Set(list.map(item => item.id)).size === list.length;
  const listOk = (list, test) => Array.isArray(list) && list.length <= MAX_ITEMS && list.every(test) && uniqueIds(list);

  const mailOk = (message, folders) => hasKeys(message, ['id', 'folder', 'from', 'to', 'subject', 'body', 'time', 'read', 'flagged', 'attachments'], ['link']) &&
    isId(message.id) && folders.includes(message.folder) && isLine(message.from, 200) && isLine(message.to, 400) &&
    fictionalAddresses(message.from) && fictionalAddresses(message.to) && isLine(message.subject, 200) && isText(message.body, 4000) &&
    fictionalAddresses(message.body) && isTime(message.time) && isBool(message.read) && isBool(message.flagged) &&
    Array.isArray(message.attachments) && message.attachments.length <= 8 && message.attachments.every(isId) &&
    (!Object.hasOwn(message, 'link') || (typeof message.link === 'string' && SCENE_URL_RE.test(message.link)));
  const threadItemOk = item => hasExactKeys(item, ['id', 'from', 'text', 'time']) && isId(item.id) && isLine(item.from, 80) &&
    isText(item.text, 2000) && fictionalAddresses(item.text) && isTime(item.time);
  const optional = (item, key, test) => !Object.hasOwn(item, key) || test(item[key]);
  const isNotes = value => isText(value, 2000) && fictionalAddresses(value);
  const threadOk = thread => hasKeys(thread, ['id', 'with', 'items'], ['pinned']) && isId(thread.id) && isLine(thread.with, 80) &&
    listOk(thread.items, threadItemOk) && optional(thread, 'pinned', isBool);
  const noteOk = note => hasExactKeys(note, ['id', 'folder', 'title', 'body', 'modified', 'pinned']) && isId(note.id) && isId(note.folder) &&
    isLine(note.title, 120) && isText(note.body, MAX_TEXT) && isTime(note.modified) && isBool(note.pinned);
  const eventOk = event => hasKeys(event, ['id', 'title', 'start', 'end', 'location'], ['invite', 'allDay', 'notes']) && isId(event.id) && isLine(event.title, 120) &&
    isTime(event.start) && isTime(event.end) && Date.parse(event.end) >= Date.parse(event.start) && isLine(event.location, 120) &&
    (!Object.hasOwn(event, 'invite') || (isLine(event.invite, 200) && fictionalAddresses(event.invite))) &&
    optional(event, 'allDay', isBool) && optional(event, 'notes', isNotes);
  const reminderOk = item => hasKeys(item, ['id', 'list', 'title', 'due', 'done'], ['flagged', 'priority', 'notes']) && isId(item.id) && isId(item.list) &&
    isLine(item.title, 160) && nullable(item.due, isTime) && isBool(item.done) && optional(item, 'flagged', isBool) &&
    optional(item, 'priority', value => isIntIn(value, 0, 3)) && optional(item, 'notes', isNotes);
  const contactOk = item => hasKeys(item, ['id', 'name', 'email', 'phone', 'org'], ['favorite']) && isId(item.id) && isLine(item.name, 80) &&
    isLine(item.email, 120) && /^[^@\s]+@[A-Za-z0-9.-]+\.(example|invalid)$/i.test(item.email) && isLine(item.phone, 40) && isLine(item.org, 80) &&
    optional(item, 'favorite', isBool);
  const contentOk = item => (hasExactKeys(item, ['text']) && isText(item.text, MAX_TEXT)) || (hasExactKeys(item, ['asset']) && isId(item.asset));
  // Shapes agreed with the Windows apps (requests/win-apps-to-mac.md). Choice ids are format-checked here; the
  // CONTRACT-V2 scene model decides whether a forwarded choice applies to the current step.
  const alarmOk = item => hasExactKeys(item, ['id', 'time', 'label', 'enabled']) && isId(item.id) && isAlarmTime(item.time) &&
    isLine(item.label, 60) && isBool(item.enabled);
  const updateOk = item => hasKeys(item, ['id', 'title', 'kb', 'size', 'status'], ['choiceId']) && isId(item.id) && isLine(item.title, 160) &&
    isLine(item.kb, 20) && isLine(item.size, 20) && UPDATE_STATUSES.includes(item.status) && (!Object.hasOwn(item, 'choiceId') || isId(item.choiceId));
  const mfaAccountOk = item => hasExactKeys(item, ['id', 'issuer', 'label']) && isId(item.id) && isLine(item.issuer, 80) &&
    isLine(item.label, 120) && fictionalAddresses(item.label);
  const mfaPromptOk = item => hasExactKeys(item, ['id', 'app', 'account', 'location', 'device', 'time', 'number']) && isId(item.id) &&
    isLine(item.app, 80) && isLine(item.account, 120) && fictionalAddresses(item.account) && isLine(item.location, 120) &&
    isLine(item.device, 80) && isTime(item.time) && nullable(item.number, value => isIntIn(value, 0, 999));
  // keylog: the process records what is typed and sends it (each key the trainee types then shows network activity).
  const processOk = item => hasKeys(item, ['id', 'name'], ['cpu', 'mem', 'publisher', 'suspicious', 'endChoice', 'parent', 'command', 'net', 'disk', 'keylog']) && isId(item.id) &&
    optional(item, 'keylog', isBool) &&
    optional(item, 'parent', value => isLine(value, 80)) && optional(item, 'command', value => isLine(value, 300) && fictionalAddresses(value)) &&
    optional(item, 'net', value => isLine(value, 80) && fictionalAddresses(value)) && optional(item, 'disk', value => isLine(value, 40)) &&
    isLine(item.name, 80) && (!Object.hasOwn(item, 'cpu') || (typeof item.cpu === 'number' && item.cpu >= 0 && item.cpu <= 100)) &&
    (!Object.hasOwn(item, 'mem') || (typeof item.mem === 'number' && item.mem >= 0 && item.mem <= 1e6)) &&
    (!Object.hasOwn(item, 'publisher') || isLine(item.publisher, 80)) && (!Object.hasOwn(item, 'suspicious') || isBool(item.suspicious)) &&
    (!Object.hasOwn(item, 'endChoice') || isId(item.endChoice));
  // Items the sandbox replay shows (SPEC §9.1): a startup or login item, and a screenshot the program drew under Wine.
  // location: where it is registered (a Run key, a service, a scheduled task, a login item).
  const startupOk = item => hasKeys(item, ['id', 'name', 'command'], ['location', 'publisher']) && isId(item.id) && isLine(item.name, 80) && isLine(item.command, 200) &&
    optional(item, 'location', value => isLine(value, 160)) && optional(item, 'publisher', value => isLine(value, 80));

  // ---- programs, views and dialogs (PROGRAMS.md) ----
  // A view is a program's own window, drawn from data: a message box, a panel of rows and tables, a setup wizard, a ransom
  // note with timers, a console, a document with a Protected View bar, a full-screen boot screen, a fake scan, a desktop
  // character. Buttons carry actions the parent applies (view-action). No view has an input field.
  const VIEW_LAYOUTS = Object.freeze(['message', 'panel', 'wizard', 'ransom', 'console', 'document', 'screen', 'scan', 'character', 'sheet', 'slides']);
  const VIEW_ICONS = Object.freeze(['none', 'error', 'warning', 'info', 'question', 'shield', 'shield-ok', 'shield-bad', 'lock', 'program', 'gear', 'bug', 'disk', 'web', 'mail', 'money', 'user', 'character']);
  const ACTION_RE = /^(close|next|back|none|done|page:\d{1,2}|check:\d{1,2}|run:[a-z0-9-]{1,40}|view:[a-z0-9-]{1,40}|open:[a-z0-9-]{1,40}|choice:[a-z0-9-]{1,40}|notify:[a-z0-9-]{1,40})$/;
  const PROMPT_KINDS = Object.freeze(['open-warning', 'reputation', 'elevation']);
  // firewall: a program opened a port to listen (Windows Security Alert / macOS "accept incoming network connections?").
  const DIALOG_KINDS = Object.freeze([...PROMPT_KINDS, 'cant-open', 'properties', 'detected', 'autoplay', 'message', 'firewall']);
  const ARCHIVE_KINDS = Object.freeze(['zip', 'rar', 'iso', 'img', 'dmg', 'usb', 'cd', 'share']);
  const isColour = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  const isAction = value => typeof value === 'string' && ACTION_RE.test(value);
  const prose = (value, max) => isText(value, max) && fictionalAddresses(value);
  const lineOf = max => value => isLine(value, max) && fictionalAddresses(value);
  const listOf = (max, test) => value => Array.isArray(value) && value.length <= max && value.every(test);
  const buttonOk = item => hasKeys(item, ['label'], ['action', 'primary']) && isLine(item.label, 40) && optional(item, 'action', isAction) && optional(item, 'primary', isBool);
  // A field the trainee types into (QUESTS.md §3). There is no real input: each key types the next character of value, the
  // fictional answer the scene wrote, so nothing the trainee knows can be entered. secret draws dots; reveal (with secret)
  // draws the password in plain text, the way a tampered page might.
  const fieldOk = item => hasKeys(item, ['label', 'value'], ['secret', 'reveal']) && isLine(item.label, 60) && isLine(item.value, 80) &&
    item.value.length > 0 && fictionalAddresses(item.value) && optional(item, 'secret', isBool) && optional(item, 'reveal', isBool);
  const sectionOk = item => hasKeys(item, [], ['heading', 'text', 'rows', 'table', 'items', 'checks', 'progress', 'timer', 'code', 'tone', 'note', 'fields']) &&
    optional(item, 'fields', listOf(6, fieldOk)) &&
    optional(item, 'heading', lineOf(160)) && optional(item, 'text', value => prose(value, 4000)) &&
    optional(item, 'rows', listOf(40, row => Array.isArray(row) && row.length === 2 && isLine(row[0], 80) && lineOf(300)(row[1]))) &&
    optional(item, 'table', value => hasExactKeys(value, ['columns', 'rows']) && listOf(6, lineOf(40))(value.columns) && value.columns.length > 0 &&
      listOf(60, row => listOf(6, lineOf(300))(row) && row.length === value.columns.length)(value.rows)) &&
    optional(item, 'items', listOf(40, lineOf(300))) &&
    optional(item, 'checks', listOf(12, check => hasExactKeys(check, ['label', 'checked']) && lineOf(160)(check.label) && isBool(check.checked))) &&
    optional(item, 'progress', value => isIntIn(value, 0, 100)) &&
    optional(item, 'timer', value => hasExactKeys(value, ['label', 'seconds']) && isLine(value.label, 80) && isIntIn(value.seconds, 1, 30 * 86400)) &&
    optional(item, 'code', value => prose(value, 4000)) && optional(item, 'tone', value => ['normal', 'good', 'bad', 'warn', 'injected'].includes(value)) &&
    optional(item, 'note', lineOf(200));
  const VIEW_PAGE_KEYS = ['heading', 'text', 'icon', 'sections', 'buttons', 'bar', 'lines', 'counter', 'image', 'balloon'];
  const viewPageOk = page => optional(page, 'heading', lineOf(200)) && optional(page, 'text', value => prose(value, 4000)) &&
    optional(page, 'icon', value => VIEW_ICONS.includes(value)) && optional(page, 'sections', listOf(12, sectionOk)) &&
    optional(page, 'buttons', listOf(6, buttonOk)) &&
    optional(page, 'bar', value => hasKeys(value, ['text'], ['button', 'action', 'tone']) && lineOf(240)(value.text) && optional(value, 'button', v => isLine(v, 40)) &&
      optional(value, 'action', isAction) && optional(value, 'tone', v => ['info', 'warn', 'bad'].includes(v))) &&
    optional(page, 'lines', listOf(60, lineOf(160))) &&
    optional(page, 'counter', value => hasExactKeys(value, ['label', 'from', 'to']) && isLine(value.label, 160) && isIntIn(value.from, 0, 1e9) && isIntIn(value.to, 0, 1e9)) &&
    optional(page, 'image', value => typeof value === 'string' && WALLPAPER_URL_RE.test(value) && !value.includes('..')) &&
    optional(page, 'balloon', lineOf(300));
  const viewOk = view => hasKeys(view, ['layout', 'title'], ['app', 'theme', 'size', 'fullscreen', 'pages', 'publisher', ...VIEW_PAGE_KEYS]) &&
    VIEW_LAYOUTS.includes(view.layout) && isLine(view.title, 120) && optional(view, 'app', value => isLine(value, 60)) &&
    optional(view, 'publisher', value => isLine(value, 80)) &&
    optional(view, 'theme', value => hasKeys(value, [], ['bg', 'fg', 'accent', 'header']) && Object.values(value).every(isColour)) &&
    optional(view, 'size', value => hasExactKeys(value, ['w', 'h']) && isIntIn(value.w, MIN_SIZE.w, WORK.w) && isIntIn(value.h, MIN_SIZE.h, WORK.h)) &&
    optional(view, 'fullscreen', isBool) && viewPageOk(view) &&
    optional(view, 'pages', listOf(12, page => hasKeys(page, [], VIEW_PAGE_KEYS) && viewPageOk(page)));
  // A program: what opening a file does. prompts are the OS warnings shown first; then it may be caught by the antivirus
  // (detected), or it runs: a process, a start-up entry, its own window (view), a notification, and it may delete itself.
  const programOk = item => hasKeys(item, ['name', 'publisher', 'signed', 'prompts'], ['view', 'process', 'startup', 'selfDelete', 'notify', 'detected', 'description']) &&
    isLine(item.name, 80) && nullable(item.publisher, value => isLine(value, 80)) && isBool(item.signed) &&
    Array.isArray(item.prompts) && item.prompts.length <= 3 && item.prompts.every(kind => PROMPT_KINDS.includes(kind)) &&
    optional(item, 'view', isId) && optional(item, 'selfDelete', isBool) && optional(item, 'detected', value => isLine(value, 80)) &&
    optional(item, 'description', value => isLine(value, 120)) &&
    optional(item, 'process', value => hasKeys(value, ['name'], ['cpu', 'mem', 'parent', 'command', 'net', 'keylog']) && isLine(value.name, 80) && optional(value, 'keylog', isBool) &&
      optional(value, 'cpu', v => typeof v === 'number' && v >= 0 && v <= 100) && optional(value, 'mem', v => typeof v === 'number' && v >= 0 && v <= 1e6) &&
      optional(value, 'parent', v => isLine(v, 80)) && optional(value, 'command', lineOf(300)) && optional(value, 'net', lineOf(80))) &&
    optional(item, 'startup', value => hasKeys(value, ['name', 'command'], ['location']) && isLine(value.name, 80) && isLine(value.command, 200) && optional(value, 'location', v => isLine(v, 160))) &&
    optional(item, 'notify', value => hasExactKeys(value, ['app', 'title', 'body']) && CANONICAL_APPS.includes(value.app) && isLine(value.title, 120) && prose(value.body, 600));
  const dialogOptionOk = item => hasKeys(item, ['label', 'action'], ['sub']) && isLine(item.label, 80) && isAction(item.action) && optional(item, 'sub', value => isLine(value, 120));
  const dialogOk = (item, world) => hasKeys(item, ['id', 'kind'], ['fileId', 'programId', 'step', 'threat', 'options', 'view']) && isId(item.id) &&
    DIALOG_KINDS.includes(item.kind) && optional(item, 'fileId', id => isId(id) && Boolean(world.fs.nodes[id])) &&
    optional(item, 'programId', id => isId(id) && Boolean(world.data.programs?.[id])) && optional(item, 'step', value => isIntIn(value, 0, 2)) &&
    optional(item, 'threat', value => isLine(value, 80)) && optional(item, 'options', listOf(4, dialogOptionOk)) &&
    optional(item, 'view', id => isId(id) && Boolean(world.data.views?.[id])) &&
    (!PROMPT_KINDS.includes(item.kind) || Object.hasOwn(item, 'fileId') || Object.hasOwn(item, 'programId')) &&
    (item.kind !== 'message' || Object.hasOwn(item, 'view'));
  const screenshotOk = item => hasExactKeys(item, ['id', 'caption', 'image']) && isId(item.id) && isLine(item.caption, 160) &&
    typeof item.image === 'string' && WALLPAPER_URL_RE.test(item.image) && !item.image.includes('..');
  // goto: the page the browser shows after the button (a confirmation, the page behind a sign-in).
  const webChoiceOk = choice => hasKeys(choice, ['label', 'choiceId'], ['style', 'goto']) && isLine(choice.label, 60) && isId(choice.choiceId) && optional(choice, 'goto', isId) &&
    (!Object.hasOwn(choice, 'style') || choice.style === 'primary' || choice.style === 'secondary');
  // sections: content on the page (tone 'injected' marks what malware added); toolbars: adware toolbars; issuer: the
  // certificate issuer shown under the address bar; warning: the browser's full-page warning (PROGRAMS.md §3b).
  // fields: a sign-in form, submitted by the page's first button. requires: the sign-in page shown instead until the trainee
  // has signed in there (data.web.sessions).
  const pageOk = page => hasKeys(page, ['title', 'url', 'body', 'choices'], ['brand', 'heading', 'insecure', 'sections', 'toolbars', 'issuer', 'warning', 'fields', 'requires']) && isLine(page.title, 120) &&
    optional(page, 'fields', listOf(8, fieldOk)) && optional(page, 'requires', isId) &&
    optional(page, 'sections', listOf(8, sectionOk)) && optional(page, 'toolbars', listOf(4, value => isLine(value, 40))) &&
    optional(page, 'issuer', value => isLine(value, 80)) && optional(page, 'warning', value => ['cert', 'deceptive', 'malware'].includes(value)) &&
    typeof page.url === 'string' && WEB_URL_RE.test(page.url) && isText(page.body, 4000) && fictionalAddresses(page.body) &&
    (!Object.hasOwn(page, 'brand') || isLine(page.brand, 60)) && (!Object.hasOwn(page, 'heading') || isLine(page.heading, 160)) &&
    (!Object.hasOwn(page, 'insecure') || isBool(page.insecure)) && Array.isArray(page.choices) && page.choices.length <= 6 && page.choices.every(webChoiceOk);
  const favoriteOk = item => hasExactKeys(item, ['title', 'url']) && isLine(item.title, 80) && SCENE_URL_RE.test(item.url);

  // ---- synced app stores (SYNC-AUDIT.md §4) ----
  const capped = (list, max, test) => Array.isArray(list) && list.length <= max && list.every(test) && uniqueIds(list);
  const idsIn = (ids, max, known) => Array.isArray(ids) && ids.length <= max && ids.every(id => isId(id) && (!known || known.has(id)));
  const isNum = (value, limit) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
  const isSceneUrl = value => typeof value === 'string' && SCENE_URL_RE.test(value);
  // The browser stores no typed address: anything that is not a scene page is 'unavailable:'.
  const isBrowserUrl = value => ['start:', 'history:', 'unavailable:'].includes(value) || isSceneUrl(value);
  const tabOk = tab => hasExactKeys(tab, ['id', 'url', 'title']) && isId(tab.id) && isBrowserUrl(tab.url) && isLine(tab.title, 120);
  const tabsOk = (tabs, activeTabId) => capped(tabs, 16, tabOk) &&
    (activeTabId === null ? tabs.length === 0 : tabs.some(tab => tab.id === activeTabId));
  const bookmarkOk = item => hasExactKeys(item, ['id', 'title', 'url']) && isId(item.id) && isLine(item.title, 80) && isSceneUrl(item.url);
  const visitOk = item => hasExactKeys(item, ['id', 'url', 'title', 'time']) && isId(item.id) && isSceneUrl(item.url) && isLine(item.title, 120) && isTime(item.time);
  const browserOk = value => hasExactKeys(value, ['tabs', 'activeTabId', 'bookmarks', 'history']) && tabsOk(value.tabs, value.activeTabId) &&
    capped(value.bookmarks, 50, bookmarkOk) && capped(value.history, 100, visitOk) && new Set(value.history.map(item => item.url)).size === value.history.length;

  const REPEATS = Object.freeze(['off', 'all', 'one']);
  const trackOk = item => hasKeys(item, ['id', 'title', 'artist', 'album', 'genre', 'asset', 'duration', 'loved'], ['cover']) && isId(item.id) &&
    isLine(item.title, 120) && isLine(item.artist, 80) && isLine(item.album, 120) && isLine(item.genre, 40) && isId(item.asset) &&
    optional(item, 'cover', isId) && isIntIn(item.duration, 0, 86400) && isBool(item.loved);
  const playlistShapeOk = item => hasExactKeys(item, ['id', 'name', 'trackIds']) && isId(item.id) && isLine(item.name, 80) && idsIn(item.trackIds, 200);
  const playbackShapeOk = item => isId(item.trackId) && idsIn(item.queue, 200) && item.queue.includes(item.trackId) &&
    isNum(item.positionSec, 86400) && item.positionSec >= 0 && isBool(item.playing);
  function mediaOk(value) {
    if (!hasExactKeys(value, ['tracks', 'playlists', 'shuffle', 'repeat', 'nowPlaying']) || !capped(value.tracks, 200, trackOk) ||
        !isBool(value.shuffle) || !REPEATS.includes(value.repeat)) return false;
    const tracks = new Set(value.tracks.map(item => item.id));
    const playing = value.nowPlaying;
    return capped(value.playlists, 50, item => playlistShapeOk(item) && idsIn(item.trackIds, 200, tracks)) &&
      (playing === null || (hasExactKeys(playing, ['trackId', 'queue', 'positionSec', 'playing', 'at']) && playbackShapeOk(playing) &&
        idsIn(playing.queue, 200, tracks) && isTime(playing.at)));
  }

  const photoOk = item => hasExactKeys(item, ['id', 'name', 'asset', 'taken', 'favorite', 'trashed']) && isId(item.id) && isFileName(item.name) &&
    isId(item.asset) && isTime(item.taken) && isBool(item.favorite) && isBool(item.trashed);
  const albumShapeOk = item => hasExactKeys(item, ['id', 'name', 'photoIds']) && isId(item.id) && isLine(item.name, 80) &&
    idsIn(item.photoIds, MAX_ITEMS) && new Set(item.photoIds).size === item.photoIds.length;
  function photosOk(value) {
    if (!hasExactKeys(value, ['items', 'albums']) || !capped(value.items, MAX_ITEMS, photoOk)) return false;
    const items = new Set(value.items.map(item => item.id));
    return capped(value.albums, 50, item => albumShapeOk(item) && idsIn(item.photoIds, MAX_ITEMS, items));
  }

  const BOARD_TYPES = Object.freeze(['text', 'sticky', 'shape', 'pen']);
  const BOARD_SHAPES = Object.freeze(['rect', 'ellipse', 'arrow']);
  const COLOR_RE = /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|[a-z]{3,12})$/;
  const isCoord = value => isNum(value, 100000);
  const boardItemOk = item => hasKeys(item, ['id', 'type', 'x', 'y', 'w', 'h'], ['text', 'color', 'shape', 'points', 'width']) && isId(item.id) &&
    BOARD_TYPES.includes(item.type) && ['x', 'y', 'w', 'h'].every(key => isCoord(item[key])) && item.w >= 0 && item.h >= 0 &&
    optional(item, 'text', value => item.type !== 'pen' && isText(value, 2000) && fictionalAddresses(value)) &&
    optional(item, 'color', value => typeof value === 'string' && COLOR_RE.test(value)) &&
    (item.type === 'shape' ? BOARD_SHAPES.includes(item.shape) : !Object.hasOwn(item, 'shape')) &&
    (item.type === 'pen' ? Array.isArray(item.points) && item.points.length >= 4 && item.points.length <= 2000 && item.points.length % 2 === 0 &&
      item.points.every(isCoord) : !Object.hasOwn(item, 'points')) &&
    (item.type === 'pen' ? optional(item, 'width', value => isNum(value, 40) && value >= 1) : !Object.hasOwn(item, 'width'));
  const boardItemsOk = items => capped(items, 300, boardItemOk);
  const boardOk = board => hasExactKeys(board, ['id', 'name', 'modified', 'items']) && isId(board.id) && isLine(board.name, 80) &&
    isTime(board.modified) && boardItemsOk(board.items);
  const whiteboardOk = value => hasExactKeys(value, ['boards', 'activeId']) && capped(value.boards, 20, boardOk) &&
    nullable(value.activeId, id => value.boards.some(board => board.id === id));

  const CALC_MODES = Object.freeze(['basic', 'scientific', 'programmer']);
  const calcSettingsOk = item => CALC_MODES.includes(item.mode) && (item.angle === 'deg' || item.angle === 'rad') &&
    [2, 8, 10, 16].includes(item.base) && isNum(item.memory, Number.MAX_VALUE);
  const calcLineOk = item => hasExactKeys(item, ['id', 'expr', 'result', 'time']) && isId(item.id) && isLine(item.expr, 200) && isLine(item.result, 80) && isTime(item.time);
  const calculatorOk = value => hasExactKeys(value, ['mode', 'angle', 'base', 'memory', 'history']) && calcSettingsOk(value) && capped(value.history, 100, calcLineOk);

  // 'local' is the device's own zone; anything else must be a time zone the runtime knows.
  const isZone = value => {
    if (value === 'local') return true;
    if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(value) || value.length > 40) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  };
  const cityOk = item => hasExactKeys(item, ['id', 'name', 'tz']) && isId(item.id) && isLine(item.name, 60) && item.name.trim() !== '' && isZone(item.tz);
  const timerShapeOk = item => hasKeys(item, ['label', 'durationMs', 'remainingMs', 'running'], ['at']) && isLine(item.label, 60) &&
    isIntIn(item.durationMs, 1000, 86400000) && isIntIn(item.remainingMs, 0, item.durationMs) && isBool(item.running);
  const lapsOk = laps => Array.isArray(laps) && laps.length <= 100 && laps.every((lap, index) => isIntIn(lap, 0, 1e11) && (index === 0 || lap >= laps[index - 1]));
  const stopwatchShapeOk = item => isBool(item.running) && isIntIn(item.elapsedMs, 0, 1e11) && lapsOk(item.laps);
  const clockOk = value => hasExactKeys(value, ['worldClocks', 'timer', 'stopwatch']) && capped(value.worldClocks, 24, cityOk) &&
    nullable(value.timer, timer => hasExactKeys(timer, ['label', 'durationMs', 'remainingMs', 'running', 'at']) && timerShapeOk(timer) && isTime(timer.at)) &&
    hasExactKeys(value.stopwatch, ['running', 'elapsedMs', 'at', 'laps']) && stopwatchShapeOk(value.stopwatch) &&
    (value.stopwatch.running ? isTime(value.stopwatch.at) : nullable(value.stopwatch.at, isTime));

  const isCommand = value => isLine(value, 500) && value.trim() !== '' && fictionalAddresses(value);
  const terminalOk = value => hasExactKeys(value, ['cwd', 'history']) && isId(value.cwd) && Array.isArray(value.history) &&
    value.history.length <= 100 && value.history.every(isCommand);

  const STICKY_COLORS = Object.freeze(['yellow', 'pink', 'blue', 'green', 'purple', 'gray']);
  const stickyOk = item => hasExactKeys(item, ['id', 'text', 'color', 'x', 'y', 'w', 'h', 'collapsed']) && isId(item.id) &&
    isText(item.text, 4000) && fictionalAddresses(item.text) && STICKY_COLORS.includes(item.color) && isIntIn(item.x, 0, 2000) &&
    isIntIn(item.y, 0, 2000) && isIntIn(item.w, 60, 2000) && isIntIn(item.h, 60, 2000) && isBool(item.collapsed);

  const SYNCED_CHECKS = Object.freeze({
    browser: browserOk, media: mediaOk, photos: photosOk, whiteboard: whiteboardOk, calculator: calculatorOk, clock: clockOk,
    terminal: terminalOk, stickies: value => capped(value, 50, stickyOk),
  });
  // Empty stores, created on the first intent that writes one.
  const EMPTY_SYNCED = Object.freeze({
    browser: () => ({ tabs: [], activeTabId: null, bookmarks: [], history: [] }),
    media: () => ({ tracks: [], playlists: [], shuffle: false, repeat: 'off', nowPlaying: null }),
    photos: () => ({ items: [], albums: [] }),
    whiteboard: () => ({ boards: [], activeId: null }),
    calculator: () => ({ mode: 'basic', angle: 'deg', base: 10, memory: 0, history: [] }),
    clock: () => ({ worldClocks: [], timer: null, stopwatch: { running: false, elapsedMs: 0, at: null, laps: [] } }),
    terminal: () => ({ cwd: 'home', history: [] }),
    stickies: () => [],
  });

  // Optional stores: absent in older worlds; processes and web are scene-provided and read-only.
  function optionalDataProblem(data) {
    if (Object.hasOwn(data, 'alarms') && !listOk(data.alarms, alarmOk)) return 'data-alarms';
    if (Object.hasOwn(data, 'updates') && !listOk(data.updates, updateOk)) return 'data-updates';
    if (Object.hasOwn(data, 'mfa') && !(hasExactKeys(data.mfa, ['accounts', 'prompts']) && listOk(data.mfa.accounts, mfaAccountOk) &&
        listOk(data.mfa.prompts, mfaPromptOk))) return 'data-mfa';
    if (Object.hasOwn(data, 'processes') && !listOk(data.processes, processOk)) return 'data-processes';
    if (Object.hasOwn(data, 'startup') && !listOk(data.startup, startupOk)) return 'data-startup';
    const record = (value, max, test) => isRecord(value) && Object.keys(value).length <= max && Object.entries(value).every(([id, item]) => isId(id) && test(item));
    if (Object.hasOwn(data, 'programs') && !record(data.programs, 64, programOk)) return 'data-programs';
    if (Object.hasOwn(data, 'views') && !record(data.views, 64, viewOk)) return 'data-views';
    if (Object.hasOwn(data, 'programs') && Object.values(data.programs).some(item => item.view && !data.views?.[item.view])) return 'data-programs';
    if (Object.hasOwn(data, 'screenshots') && !(Array.isArray(data.screenshots) && data.screenshots.length <= 8 && listOk(data.screenshots, screenshotOk))) return 'data-screenshots';
    if (Object.hasOwn(data, 'web') && !(hasKeys(data.web, ['pages'], ['favorites', 'homepage', 'sessions', 'typed']) && isRecord(data.web.pages) &&
        Object.keys(data.web.pages).length <= 64 && Object.entries(data.web.pages).every(([id, page]) => isId(id) && pageOk(page)) &&
        (!Object.hasOwn(data.web, 'favorites') || (Array.isArray(data.web.favorites) && data.web.favorites.length <= 16 && data.web.favorites.every(favoriteOk))) &&
        // The page a new browser tab opens (replay: a hijacked homepage).
        (!Object.hasOwn(data.web, 'homepage') || (isSceneUrl(data.web.homepage) && Object.hasOwn(data.web.pages, data.web.homepage.slice(6)))))) return 'data-web';
    if (Object.hasOwn(data, 'web')) {
      const { pages } = data.web;
      const signIn = id => pageFields(pages[id] ?? {}).length > 0;
      if (Object.values(pages).some(page => (page.requires && !signIn(page.requires)) || page.choices.some(choice => choice.goto && !pages[choice.goto]))) return 'data-web';
      if (Object.hasOwn(data.web, 'sessions') && !(Array.isArray(data.web.sessions) && data.web.sessions.length <= 16 && data.web.sessions.every(id => isId(id) && signIn(id)))) return 'data-web';
      if (Object.hasOwn(data.web, 'typed') && !(isRecord(data.web.typed) && Object.entries(data.web.typed).every(([id, counts]) => pages[id] &&
          Array.isArray(counts) && counts.length <= 14 && counts.every((n, at) => isIntIn(n, 0, pageFields(pages[id])[at]?.value.length ?? 0))))) return 'data-web';
    }
    // The shift's task counter (QUESTS.md §1), the trainee's flags, what a keylogger captured and how often it sent.
    if (Object.hasOwn(data, 'quota') && !(hasExactKeys(data.quota, ['label', 'done', 'total']) && isLine(data.quota.label, 60) &&
        isIntIn(data.quota.total, 1, 999) && isIntIn(data.quota.done, 0, data.quota.total))) return 'data-quota';
    if (Object.hasOwn(data, 'flags') && !(Array.isArray(data.flags) && data.flags.length <= 64 && new Set(data.flags.map(item => item?.key)).size === data.flags.length &&
        data.flags.every(item => hasExactKeys(item, ['key', 'label']) && isKey(item.key) && isLine(item.label, 120)))) return 'data-flags';
    if (Object.hasOwn(data, 'captured') && !(Array.isArray(data.captured) && data.captured.length <= 24 &&
        data.captured.every(item => hasExactKeys(item, ['label', 'value']) && isLine(item.label, 60) && isLine(item.value, 80) && fictionalAddresses(item.value)))) return 'data-captured';
    if (Object.hasOwn(data, 'net') && !(hasExactKeys(data.net, ['sent']) && isCounter(data.net.sent))) return 'data-net';
    for (const store of SYNCED_DATA) if (Object.hasOwn(data, store) && !SYNCED_CHECKS[store](data[store])) return `data-${store}`;
    return null;
  }

  function dataProblem(data) {
    if (!hasKeys(data, ['mail', 'messages', 'notes', 'calendar', 'reminders', 'contacts', 'contents'], OPTIONAL_DATA)) return 'data';
    const { mail } = data;
    if (!hasExactKeys(mail, ['folders', 'messages']) || !Array.isArray(mail.folders) || mail.folders.length > 24 ||
        !mail.folders.every(isId) || new Set(mail.folders).size !== mail.folders.length ||
        !listOk(mail.messages, message => mailOk(message, mail.folders))) return 'data-mail';
    if (!hasExactKeys(data.messages, ['threads']) || !listOk(data.messages.threads, threadOk)) return 'data-messages';
    if (!listOk(data.notes, noteOk)) return 'data-notes';
    if (!listOk(data.calendar, eventOk)) return 'data-calendar';
    if (!listOk(data.reminders, reminderOk)) return 'data-reminders';
    if (!listOk(data.contacts, contactOk)) return 'data-contacts';
    if (!isRecord(data.contents) || Object.keys(data.contents).length > MAX_NODES ||
        !Object.entries(data.contents).every(([id, item]) => isId(id) && contentOk(item))) return 'data-contents';
    return optionalDataProblem(data);
  }

  // world.scene.creature: the wallpaper sprite and what it is doing. The sprite is a same-origin creature GIF.
  const creatureOk = value => hasExactKeys(value, ['family', 'depth', 'sprite', 'state', 'targetApp']) && isId(value.family) &&
    SCENE_DEPTHS.includes(value.depth) && typeof value.sprite === 'string' &&
    /^\/ocean-creatures\/[a-z-]{1,40}\/(sunlight|twilight|midnight|abyss|trench)\.gif$/.test(value.sprite) &&
    CREATURE_STATES.includes(value.state) && nullable(value.targetApp, app => CANONICAL_APPS.includes(app));
  const introOk = value => hasExactKeys(value, ['title', 'line', 'next']) && isLine(value.title, 160) && isLine(value.line, 600) && isLine(value.next, 400);
  const focusAppsOk = value => Array.isArray(value) && value.length <= CANONICAL_APPS.length && new Set(value).size === value.length &&
    value.every(app => CANONICAL_APPS.includes(app));
  const counterOrNull = value => value === null || isIntIn(value, 0, 1_000_000);
  const sandboxEventOk = item => hasKeys(item, ['seq', 'kind', 'label'], ['count', 'total']) && isIntIn(item.seq, 0, 1_000_000) &&
    isId(item.kind) && isLine(item.label, 120) && fictionalAddresses(item.label) &&
    (!Object.hasOwn(item, 'count') || counterOrNull(item.count)) && (!Object.hasOwn(item, 'total') || counterOrNull(item.total));
  const sandboxReceiptOk = value => hasExactKeys(value, ['provider', 'instance', 'startedAt', 'destroyedAt', 'teardownConfirmed', 'egress', 'dataset']) &&
    isLine(value.provider, 40) && isLine(value.instance, 80) && isTime(value.startedAt) && nullable(value.destroyedAt, isTime) &&
    isBool(value.teardownConfirmed) && value.egress === 'none' && value.dataset === 'synthetic';
  // world.sandbox: the live sandbox run behind the scenario. A merged patch removes `receipt: null` (null deletes an
  // object-valued key), so a missing receipt means null.
  const sandboxOk = value => hasKeys(value, ['runId', 'scenario', 'attackKind', 'mode', 'status', 'events'], ['receipt']) && isId(value.runId) &&
    isId(value.scenario) && ATTACK_KINDS.includes(value.attackKind) && SANDBOX_MODES.includes(value.mode) && SANDBOX_STATUSES.includes(value.status) &&
    Array.isArray(value.events) && value.events.length <= SANDBOX_MAX_EVENTS && value.events.every(sandboxEventOk) &&
    (!Object.hasOwn(value, 'receipt') || nullable(value.receipt, sandboxReceiptOk));

  function appListProblem(list) {
    if (!Array.isArray(list) || new Set(list).size !== list.length) return 'apps';
    if (list.some(app => CULLED_APPS.includes(app))) return 'culled-app';
    return list.every(app => CANONICAL_APPS.includes(app)) ? null : 'unknown-app';
  }

  function worldProblem(world) {
    if (!hasKeys(world, ['v', 'revision', 'phase', 'user', 'sys', 'fs', 'windows', 'order', 'focusedId', 'overlays',
      'notifications', 'dock', 'installed', 'data', 'scene'], ['sandbox', 'dialogs'])) return 'shape';
    if (world.v !== 3 || !isCounter(world.revision) || !PHASES.includes(world.phase)) return 'header';
    const { user } = world;
    if (!hasExactKeys(user, ['id', 'name', 'short', 'email', 'avatar']) || !isId(user.id) || !isLine(user.name, 80) ||
        !/^[a-z][a-z0-9._-]{0,31}$/.test(user.short) || !/^[^@\s]+@[A-Za-z0-9.-]+\.(example|invalid)$/i.test(user.email) ||
        !(user.avatar === 'initials' || isId(user.avatar))) return 'user';
    const sys = sysProblem(world.sys);
    if (sys) return sys;
    const installed = appListProblem(world.installed);
    if (installed) return installed;
    const fs = fsProblem(world.fs, world.installed);
    if (fs) return fs;
    if (!Array.isArray(world.windows) || world.windows.length > MAX_WINDOWS) return 'windows';
    const ids = [];
    for (const win of world.windows) {
      if (!hasExactKeys(win, ['id', 'app', 'title', 'rect', 'mode', 'tile', 'payload']) || !isId(win.id) || ids.includes(win.id) ||
          !(world.installed.includes(win.app) || SYSTEM_APPS.includes(win.app)) || !isLine(win.title, 120) || rectProblem(win.rect) || !MODES.includes(win.mode) ||
          !nullable(win.tile, tile => TILES.includes(tile)) || !payloadOk(win.payload)) return 'window';
      // A program window draws a view that exists; no other window carries a view.
      if (Object.hasOwn(win.payload ?? {}, 'pane') && win.app !== 'settings') return 'window';
      if ((win.app === 'program') !== Object.hasOwn(win.payload ?? {}, 'view') || (win.app === 'program' && !world.data?.views?.[win.payload.view])) return 'window';
      ids.push(win.id);
    }
    if (!Array.isArray(world.order) || world.order.length !== ids.length || new Set(world.order).size !== ids.length ||
        !world.order.every(id => ids.includes(id))) return 'order';
    if (!nullable(world.focusedId, id => world.windows.some(win => win.id === id && win.mode !== 'minimized'))) return 'focus';
    if (!hasExactKeys(world.overlays, OVERLAYS) || !Object.values(world.overlays).every(isBool)) return 'overlays';
    const { notifications } = world;
    if (!hasExactKeys(notifications, ['banners', 'history']) || !Array.isArray(notifications.banners) || !Array.isArray(notifications.history) ||
        notifications.banners.length > MAX_BANNERS || notifications.history.length > MAX_HISTORY ||
        ![...notifications.banners, ...notifications.history].every(item => notificationOk(item, world.installed)) ||
        !uniqueIds(notifications.banners) || !uniqueIds(notifications.history)) return 'notifications';
    const { dock } = world;
    if (!hasExactKeys(dock, ['pins', 'badges']) || appListProblem(dock.pins) || !dock.pins.every(app => world.installed.includes(app)) ||
        !isRecord(dock.badges) || !Object.entries(dock.badges).every(([app, count]) => world.installed.includes(app) && isIntIn(count, 1, 999))) return 'dock';
    const data = dataProblem(world.data);
    if (data) return data;
    if (world.data.terminal && world.fs.nodes[world.data.terminal.cwd]?.kind !== 'folder') return 'data-terminal';
    const { scene } = world;
    // cue: what the guide points at next, as ocean keys in order (the shells glow the first one on screen; QUESTS.md §2).
    if (!hasKeys(scene, ['phase', 'stepId', 'highlight'], ['focusApps', 'creature', 'intro', 'cue', 'fx']) || !isId(scene.phase) || !nullable(scene.stepId, isId) ||
        (Object.hasOwn(scene, 'cue') && !nullable(scene.cue, value => Array.isArray(value) && value.length <= 8 && value.every(isKey))) || (Object.hasOwn(scene, 'fx') && !['none', 'low', 'high'].includes(scene.fx)) ||
        !nullable(scene.highlight, value => hasExactKeys(value, ['app', 'ref']) && CANONICAL_APPS.includes(value.app) && nullable(value.ref, isId))) return 'scene';
    if (Object.hasOwn(scene, 'focusApps') && !focusAppsOk(scene.focusApps)) return 'scene-focus-apps';
    if (Object.hasOwn(scene, 'creature') && !nullable(scene.creature, creatureOk)) return 'scene-creature';
    if (Object.hasOwn(scene, 'intro') && !nullable(scene.intro, introOk)) return 'scene-intro';
    if (Object.hasOwn(world, 'sandbox') && !nullable(world.sandbox, sandboxOk)) return 'sandbox';
    // world.dialogs: OS prompts and modal boxes over the desktop (PROGRAMS.md §3), oldest first; synced across an OS swap.
    if (Object.hasOwn(world, 'dialogs') && !(Array.isArray(world.dialogs) && world.dialogs.length <= 6 && uniqueIds(world.dialogs) &&
        world.dialogs.every(item => dialogOk(item, world)))) return 'dialogs';
    return byteSize(world) <= WORLD_MAX_BYTES ? null : 'size';
  }

  function validate(world) {
    const problem = worldProblem(world);
    return problem ? { ok: false, error: problem } : { ok: true, error: null };
  }

  // ---- profile overlay ----------------------------------------------------------------------------------

  // Deep merge for plain JSON: objects merge key by key, arrays and scalars replace. null removes a key whose base value
  // is an object (such as an fs node or a content entry); otherwise it is stored as null (such as a folder's mime).
  function mergeProfile(seed, patch) {
    if (patch === undefined || patch === null) return clone(seed);
    if (!isRecord(patch)) throw new TypeError('The profile patch must be an object.');
    const merge = (base, overlay, depth) => {
      if (depth > 12) throw new TypeError('The profile patch is nested too deeply.');
      const out = isRecord(base) ? clone(base) : {};
      for (const [key, value] of Object.entries(overlay)) {
        if (UNSAFE_KEYS.has(key)) throw new TypeError(`The profile patch uses a forbidden key: ${key}`);
        if (value === null && isRecord(out[key])) delete out[key];
        else if (isRecord(value)) out[key] = merge(out[key], value, depth + 1);
        else out[key] = value === null ? null : clone(value);
      }
      return out;
    };
    return merge(seed, patch, 0);
  }

  // Drops everything that refers to an app outside `installed`: pins, badges, windows, notifications, app nodes.
  function filterInstalled(world) {
    const has = app => world.installed.includes(app);
    world.dock.pins = world.dock.pins.filter(has);
    world.dock.badges = Object.fromEntries(Object.entries(world.dock.badges).filter(([app]) => has(app)));
    world.windows = world.windows.filter(win => has(win.app) || SYSTEM_APPS.includes(win.app));
    const ids = world.windows.map(win => win.id);
    world.order = world.order.filter(id => ids.includes(id));
    if (!ids.includes(world.focusedId)) world.focusedId = topWindowId(world);
    world.notifications.banners = world.notifications.banners.filter(item => has(item.app));
    world.notifications.history = world.notifications.history.filter(item => has(item.app));
    for (const [id, node] of Object.entries(world.fs.nodes)) if (node.kind === 'app' && !has(node.appId)) delete world.fs.nodes[id];
    if (world.scene.highlight && !has(world.scene.highlight.app)) world.scene.highlight = null;
    if (Array.isArray(world.scene.focusApps)) world.scene.focusApps = world.scene.focusApps.filter(has);
    if (world.scene.creature && !has(world.scene.creature.targetApp)) world.scene.creature.targetApp = null;
  }

  function createWorld(seed, profilePatch) {
    const world = mergeProfile(seed, profilePatch);
    if (!isRecord(world)) throw new TypeError('The world seed must be an object.');
    const apps = appListProblem(world.installed);
    if (apps) throw new TypeError(`Invalid world: ${apps}`);
    world.installed = CANONICAL_APPS.filter(app => world.installed.includes(app));
    try {
      filterInstalled(world);
    } catch {
      // A malformed shape is reported by the validation below.
    }
    const problem = worldProblem(world);
    if (problem) throw new TypeError(`Invalid world: ${problem}`);
    return world;
  }

  // ---- intents ------------------------------------------------------------------------------------------

  function parsePatch(patch) {
    if (!isRecord(patch) || Object.keys(patch).length === 0) return null;
    for (const [key, value] of Object.entries(patch)) if (!Object.hasOwn(SYS_CHECKS, key) || !SYS_CHECKS[key](value)) return null;
    return { ...patch };
  }

  const FS_ARGS = Object.freeze({
    mkdir: [['parentId', 'name'], ['id']],
    touch: [['parentId', 'name'], ['id', 'mime', 'text']],
    rename: [['id', 'name'], []],
    move: [['id', 'parentId'], []],
    trash: [['id'], []],
    restore: [['id'], []],
    'empty-trash': [[], []],
    write: [['id', 'text'], []],
    'set-desktop-pos': [['id', 'pos'], []],
  });
  const FS_FIELD_CHECKS = Object.freeze({
    id: isId, parentId: isId, name: isFileName, mime: value => isLine(value, 80), text: value => isText(value, MAX_TEXT),
    pos: value => hasExactKeys(value, ['x', 'y']) && isIntIn(value.x, 0, WORK.w) && isIntIn(value.y, 0, WORK.h),
  });

  const ITEM_SHAPES = Object.freeze({
    'mail:mark-read': [['id', 'read'], { id: isId, read: isBool }],
    'mail:flag': [['id', 'flagged'], { id: isId, flagged: isBool }],
    'mail:move': [['id', 'folder'], { id: isId, folder: isId }],
    'mail:save-draft': [['id', 'to', 'subject', 'body'], {
      id: isId, to: value => isLine(value, 400) && fictionalAddresses(value), subject: value => isLine(value, 200),
      body: value => isText(value, 4000) && fictionalAddresses(value),
    }],
    'messages:append': [['threadId', 'id', 'text'], { threadId: isId, id: isId, text: value => isText(value, 2000) && value.trim() !== '' && fictionalAddresses(value) }],
    'messages:pin': [['threadId', 'pinned'], { threadId: isId, pinned: isBool }],
    'notes:upsert': [['id', 'folder', 'title', 'body', 'pinned'], { id: isId, folder: isId, title: value => isLine(value, 120), body: value => isText(value, MAX_TEXT), pinned: isBool }],
    'calendar:upsert': [['id', 'title', 'start', 'end', 'location'], { id: isId, title: value => isLine(value, 120), start: isTime, end: isTime,
      location: value => isLine(value, 120), allDay: isBool, notes: isNotes }, ['allDay', 'notes']],
    'reminders:toggle': [['id', 'done'], { id: isId, done: isBool }],
    'reminders:upsert': [['id', 'list', 'title', 'due'], { id: isId, list: isId, title: value => isLine(value, 160), due: value => nullable(value, isTime),
      flagged: isBool, priority: value => isIntIn(value, 0, 3), notes: isNotes }, ['flagged', 'priority', 'notes']],
    'contacts:upsert': [['id', 'name', 'email', 'phone', 'org'], {
      id: isId, name: value => isLine(value, 80), email: value => isLine(value, 120) && /^[^@\s]+@[A-Za-z0-9.-]+\.(example|invalid)$/i.test(value),
      phone: value => isLine(value, 40), org: value => isLine(value, 80), favorite: isBool,
    }, ['favorite']],
    'alarms:upsert': [['id', 'time', 'label', 'enabled'], { id: isId, time: isAlarmTime, label: value => isLine(value, 60), enabled: isBool }],
  });
  const shapeOk = (value, [keys, checks, optionalKeys = []]) => hasKeys(value, keys, optionalKeys) &&
    Object.keys(value).every(key => checks[key](value[key]));
  const onlyId = item => hasExactKeys(item, ['id']) && isId(item.id);
  const empty = item => hasExactKeys(item, []);
  // Items of the synced app stores (SYNC-AUDIT.md §5). The parent stamps time, at and modified.
  const SYNCED_ITEMS = Object.freeze({
    'browser:set-tabs': item => hasExactKeys(item, ['tabs', 'activeTabId']) && nullable(item.activeTabId, isId) && tabsOk(item.tabs, item.activeTabId),
    'browser:visit': item => hasExactKeys(item, ['id', 'url', 'title']) && isId(item.id) && isSceneUrl(item.url) && isLine(item.title, 120),
    'browser:history-delete': onlyId,
    'browser:clear-history': empty,
    'browser:bookmark-upsert': bookmarkOk,
    'browser:bookmark-delete': onlyId,
    'media:set-playback': item => hasExactKeys(item, ['trackId', 'queue', 'positionSec', 'playing']) && (item.trackId === null
      ? Array.isArray(item.queue) && item.queue.length === 0 && item.positionSec === 0 && item.playing === false : playbackShapeOk(item)),
    'media:set-mode': item => hasExactKeys(item, ['shuffle', 'repeat']) && isBool(item.shuffle) && REPEATS.includes(item.repeat),
    'media:track-upsert': trackOk,
    'media:playlist-upsert': playlistShapeOk,
    'media:playlist-delete': onlyId,
    'photos:photo-upsert': photoOk,
    'photos:photo-delete': onlyId,
    'photos:album-upsert': albumShapeOk,
    'photos:album-delete': onlyId,
    'whiteboard:board-upsert': item => hasExactKeys(item, ['id', 'name', 'items']) && isId(item.id) && isLine(item.name, 80) && boardItemsOk(item.items),
    'whiteboard:board-delete': onlyId,
    'whiteboard:set-active': item => hasExactKeys(item, ['id']) && nullable(item.id, isId),
    'calculator:set': item => hasExactKeys(item, ['mode', 'angle', 'base', 'memory']) && calcSettingsOk(item),
    'calculator:record': item => hasExactKeys(item, ['id', 'expr', 'result']) && isId(item.id) && isLine(item.expr, 200) && isLine(item.result, 80),
    'calculator:clear-history': empty,
    'clock:city-upsert': cityOk,
    'clock:city-delete': onlyId,
    'clock:set-timer': item => hasExactKeys(item, ['timer']) && nullable(item.timer, timer => hasExactKeys(timer, ['label', 'durationMs', 'remainingMs', 'running']) && timerShapeOk(timer)),
    'clock:set-stopwatch': item => hasExactKeys(item, ['running', 'elapsedMs', 'laps']) && stopwatchShapeOk(item),
    'terminal:cd': item => hasExactKeys(item, ['cwd']) && isId(item.cwd),
    'terminal:record': item => hasExactKeys(item, ['line']) && isCommand(item.line),
    'terminal:clear-history': empty,
    'stickies:upsert': stickyOk,
    'stickies:delete': onlyId,
  });

  // Strict, exact-key intent shapes. Returns a fresh normalised intent, or null.
  function parseIntent(value) {
    if (!isRecord(value) || typeof value.kind !== 'string') return null;
    const { kind } = value;
    const only = (required, optional = []) => hasKeys(value, ['kind', ...required], optional);
    const app = text => typeof text === 'string' && CANONICAL_APPS.includes(text);
    if (kind === 'open-app') {
      if (!only(['app'], ['payload']) || !app(value.app)) return null;
      if (!Object.hasOwn(value, 'payload')) return { kind, app: value.app };
      return value.payload !== null && payloadOk(value.payload) ? { kind, app: value.app, payload: { ...value.payload } } : null;
    }
    if (WINDOW_ID_INTENTS.includes(kind)) return only(['id']) && isId(value.id) ? { kind, id: value.id } : null;
    if (kind === 'set-rect') {
      return only(['id', 'rect']) && isId(value.id) && hasExactKeys(value.rect, ['x', 'y', 'w', 'h']) &&
        Object.values(value.rect).every(number => typeof number === 'number' && Number.isFinite(number))
        ? { kind, id: value.id, rect: { x: value.rect.x, y: value.rect.y, w: value.rect.w, h: value.rect.h } } : null;
    }
    if (kind === 'tile') return only(['id', 'tile']) && isId(value.id) && nullable(value.tile, tile => TILES.includes(tile)) ? { kind, id: value.id, tile: value.tile } : null;
    if (kind === 'set-sys') {
      const patch = only(['patch']) ? parsePatch(value.patch) : null;
      return patch ? { kind, patch } : null;
    }
    if (kind === 'set-phase') return only(['phase']) && PHASES.includes(value.phase) ? { kind, phase: value.phase } : null;
    if (kind === 'toggle-overlay') return only(['name', 'open']) && OVERLAYS.includes(value.name) && isBool(value.open) ? { kind, name: value.name, open: value.open } : null;
    if (kind === 'fs') {
      const args = FS_ARGS[value.op];
      if (!args || !only(['op', ...args[0]], args[1])) return null;
      const fields = Object.keys(value).filter(key => key !== 'kind' && key !== 'op');
      return fields.every(key => FS_FIELD_CHECKS[key](value[key])) ? clone(value) : null;
    }
    if (kind === 'data') {
      const shape = ITEM_SHAPES[`${value.store}:${value.op}`];
      if (!only(['store', 'op', 'item']) || !DATA_OPS[value.store]?.includes(value.op)) return null;
      const synced = SYNCED_ITEMS[`${value.store}:${value.op}`];
      const item = synced ? synced(value.item) : value.op === 'delete' ? onlyId(value.item)
        : value.store === 'updates' ? updateOk(value.item) : shape && shapeOk(value.item, shape);
      return item ? { kind, store: value.store, op: value.op, item: clone(value.item) } : null;
    }
    if (kind === 'notify-dismiss' || kind === 'notify-clear') {
      if (!only([], ['id'])) return null;
      if (!Object.hasOwn(value, 'id')) return { kind };
      return isId(value.id) ? { kind, id: value.id } : null;
    }
    if (kind === 'dock') {
      if (!['pin', 'unpin', 'move'].includes(value.op) || !app(value.app)) return null;
      if (value.op === 'unpin') return only(['op', 'app']) ? { kind, op: value.op, app: value.app } : null;
      const required = value.op === 'move' ? ['op', 'app', 'index'] : ['op', 'app'];
      if (!only(required, ['index']) || (Object.hasOwn(value, 'index') && !isIntIn(value.index, 0, CANONICAL_APPS.length))) return null;
      return Object.hasOwn(value, 'index') ? { kind, op: value.op, app: value.app, index: value.index } : { kind, op: value.op, app: value.app };
    }
    if (kind === 'install' || kind === 'uninstall') return only(['app']) && app(value.app) ? { kind, app: value.app } : null;
    if (kind === 'scene-choice') return only(['choiceId']) && isId(value.choiceId) ? { kind, choiceId: value.choiceId } : null;
    // QUESTS.md: a key typed into a page's field (it types the field's next character); a flag the trainee puts on something.
    if (kind === 'page-type') return only(['page', 'field']) && isId(value.page) && isIntIn(value.field, 0, 13) ? { kind, page: value.page, field: value.field } : null;
    if (kind === 'flag') return only(['key', 'label', 'on']) && isKey(value.key) && isLine(value.label, 120) && isBool(value.on) ? { kind, key: value.key, label: value.label, on: value.on } : null;
    // PROGRAMS.md §4: open a file the way the OS would, show its properties, answer a dialog, press a button in a view.
    if (kind === 'open-file' || kind === 'file-properties') return only(['fileId']) && isId(value.fileId) ? { kind, fileId: value.fileId } : null;
    if (kind === 'dialog-answer') {
      return only(['id', 'answer']) && isId(value.id) && typeof value.answer === 'string' && /^(run|cancel|ok|trash|option:[0-3])$/.test(value.answer)
        ? { kind, id: value.id, answer: value.answer } : null;
    }
    if (kind === 'view-action') return only(['windowId', 'action']) && isId(value.windowId) && isAction(value.action) ? { kind, windowId: value.windowId, action: value.action } : null;
    return null;
  }

  // The shell -> parent envelope: { type:'world-intent', version:3, revision, seq, intent }.
  function parseIntentMessage(message) {
    if (!hasExactKeys(message, ['type', 'version', 'revision', 'seq', 'intent']) || message.type !== 'world-intent' ||
        message.version !== 3 || !isCounter(message.revision) || !isCounter(message.seq)) return null;
    const intent = parseIntent(message.intent);
    return intent ? { revision: message.revision, seq: message.seq, intent } : null;
  }

  // Names the specific reason a raw intent was refused, so a culled app is reported as such.
  function rejectReason(raw) {
    if (!isRecord(raw)) return 'invalid-intent';
    const named = [raw.app, raw.name].filter(value => typeof value === 'string');
    return named.some(value => CULLED_APPS.includes(value)) ? 'culled-app' : 'invalid-intent';
  }

  // ---- web forms and sign-in (QUESTS.md §3) ----

  // A page's fields in typing order: the form's own, then those in its sections (injected marks a section malware added).
  function pageFields(page) {
    return [...(page.fields ?? []).map(field => ({ ...field, injected: false })),
      ...(page.sections ?? []).flatMap(item => (item.fields ?? []).map(field => ({ ...field, injected: item.tone === 'injected' })))];
  }
  // The page a browser tab shows for a scene page: its sign-in page until the trainee has signed in there.
  function shownPage(world, pageId) {
    const pages = world.data.web?.pages ?? {};
    const page = pages[pageId];
    if (!page) return null;
    return page.requires && pages[page.requires] && !(world.data.web.sessions ?? []).includes(page.requires) ? page.requires : pageId;
  }
  // How far each field of a page is typed: counts per field, 0 when nothing yet.
  const typedOf = (world, pageId) => {
    const page = world.data.web?.pages?.[pageId];
    const counts = world.data.web?.typed?.[pageId] ?? [];
    return page ? pageFields(page).map((_, at) => counts[at] ?? 0) : [];
  };
  const formComplete = (world, pageId) => {
    const page = world.data.web?.pages?.[pageId];
    const counts = typedOf(world, pageId);
    return Boolean(page) && pageFields(page).every((field, at) => counts[at] >= field.value.length);
  };

  // ---- reducer ------------------------------------------------------------------------------------------

  const reject = (world, reason) => ({ ok: false, changed: false, world, reason, forward: null });
  const noop = (world, forward = null) => ({ ok: true, changed: false, world, reason: null, forward });

  function topWindowId(world) {
    for (let index = world.order.length - 1; index >= 0; index -= 1) {
      const win = world.windows.find(item => item.id === world.order[index]);
      if (win && win.mode !== 'minimized') return win.id;
    }
    return null;
  }

  function focusWindow(world, win) {
    if (win.mode === 'minimized') win.mode = 'normal';
    world.order = [...world.order.filter(id => id !== win.id), win.id];
    world.focusedId = win.id;
  }

  function clampRect(rect) {
    const w = Math.round(Math.min(Math.max(rect.w, MIN_SIZE.w), WORK.w));
    const h = Math.round(Math.min(Math.max(rect.h, MIN_SIZE.h), WORK.h));
    return { x: Math.round(Math.min(Math.max(rect.x, 0), WORK.w - w)), y: Math.round(Math.min(Math.max(rect.y, 0), WORK.h - h)), w, h };
  }

  const nextId = (prefix, taken) => {
    for (let n = 1; ; n += 1) if (!taken(`${prefix}-${n}`)) return `${prefix}-${n}`;
  };

  function windowTitle(world, app, payload) {
    const node = payload?.fileId ? world.fs.nodes[payload.fileId] : payload?.folderId ? world.fs.nodes[payload.folderId] : null;
    if (node) return node.name.slice(0, 120) || 'Files';
    const message = payload?.messageId ? world.data.mail.messages.find(item => item.id === payload.messageId) : null;
    if (message) return message.subject.slice(0, 120) || 'Mail';
    return APP_NAMES[app];
  }

  function payloadProblem(world, payload) {
    if (!payload) return null;
    if (payload.folderId) return world.fs.nodes[payload.folderId]?.kind === 'folder' ? null : 'no-such-folder';
    if (payload.fileId) return world.fs.nodes[payload.fileId]?.kind === 'file' ? null : 'no-such-file';
    if (payload.messageId) return world.data.mail.messages.some(item => item.id === payload.messageId) ? null : 'no-such-message';
    if (payload.view) return 'system-window';
    return null;
  }

  function reduceOpenApp(world, intent) {
    if (!world.installed.includes(intent.app)) return 'not-installed';
    const payload = intent.payload ?? null;
    if (payload?.pane && intent.app !== 'settings') return 'invalid-intent';
    const problem = payloadProblem(world, payload);
    if (problem) return problem;
    const existing = MULTI_WINDOW_APPS.includes(intent.app) && payload
      ? world.windows.find(win => win.app === intent.app && JSON.stringify(win.payload) === JSON.stringify(payload))
      : world.windows.find(win => win.app === intent.app && (!MULTI_WINDOW_APPS.includes(intent.app) || payload === null));
    if (existing) {
      if (payload && !MULTI_WINDOW_APPS.includes(intent.app)) existing.payload = payload;
      focusWindow(world, existing);
      return null;
    }
    if (world.windows.length >= MAX_WINDOWS) return 'too-many-windows';
    const id = nextId(`w-${intent.app}`, candidate => world.windows.some(win => win.id === candidate));
    const offset = (world.windows.length % 6) * 24;
    const win = { id, app: intent.app, title: windowTitle(world, intent.app, payload), rect: clampRect((({ x, y, w, h }) => ({ x: x + offset, y: y + offset, w, h }))(toRect(DEFAULT_RECTS[intent.app]))), mode: 'normal', tile: null, payload };
    world.windows.push(win);
    focusWindow(world, win);
    return null;
  }

  function reduceWindow(world, intent) {
    const win = world.windows.find(item => item.id === intent.id);
    if (!win) return 'no-such-window';
    switch (intent.kind) {
      case 'close-window':
        world.windows = world.windows.filter(item => item !== win);
        world.order = world.order.filter(id => id !== win.id);
        if (world.focusedId === win.id) world.focusedId = topWindowId(world);
        return null;
      case 'focus-window':
        if (world.focusedId === win.id && win.mode !== 'minimized') return 'unchanged';
        focusWindow(world, win);
        return null;
      case 'minimize':
        if (win.mode === 'minimized') return 'unchanged';
        win.mode = 'minimized';
        if (world.focusedId === win.id) world.focusedId = topWindowId(world);
        return null;
      case 'restore':
        if (win.mode === 'normal' && win.tile === null && world.focusedId === win.id) return 'unchanged';
        win.mode = 'normal';
        win.tile = null;
        focusWindow(world, win);
        return null;
      case 'maximize':
      case 'fullscreen': {
        const mode = intent.kind === 'maximize' ? 'maximized' : 'fullscreen';
        if (win.mode === mode && world.focusedId === win.id) return 'unchanged';
        win.mode = mode;
        focusWindow(world, win);
        return null;
      }
      case 'set-rect': {
        const rect = clampRect(intent.rect);
        if (win.mode === 'normal' && win.tile === null && JSON.stringify(rect) === JSON.stringify(win.rect)) return 'unchanged';
        Object.assign(win, { rect, mode: 'normal', tile: null });
        return null;
      }
      case 'tile':
        if (intent.tile === null) {
          if (win.tile === null) return 'unchanged';
          win.tile = null;
          return null;
        }
        if (win.tile === intent.tile && win.mode === 'normal') return 'unchanged';
        Object.assign(win, { tile: intent.tile, mode: 'normal', rect: toRect(TILE_RECTS[intent.tile]) });
        focusWindow(world, win);
        return null;
      default:
        return 'invalid-intent';
    }
  }

  function setPhase(world, phase) {
    if (world.phase === phase) return 'unchanged';
    if (!PHASE_MOVES[world.phase].includes(phase)) return 'phase-transition';
    world.phase = phase;
    for (const name of OVERLAYS) world.overlays[name] = false;
    if (phase === 'off') {
      world.windows = [];
      world.order = [];
      world.focusedId = null;
      world.notifications.banners = [];
    }
    return null;
  }

  // ---- fs ----

  const children = (world, parentId) => Object.values(world.fs.nodes).filter(node => node.parentId === parentId);
  const nameTaken = (world, parentId, name, exceptId = null) =>
    children(world, parentId).some(node => !node.trashed && node.id !== exceptId && node.name.toLowerCase() === name.toLowerCase());
  const isWithin = (world, id, ancestorId) => {
    for (let node = world.fs.nodes[id]; node; node = world.fs.nodes[node.parentId]) if (node.id === ancestorId) return true;
    return false;
  };
  const mimeFor = name => ({ txt: 'text/plain', md: 'text/markdown', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf', html: 'text/html' })[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream';

  function reduceFs(world, intent, stamp) {
    const { nodes } = world.fs;
    const node = intent.id && nodes[intent.id];
    const editable = item => item && !FIXED_FOLDERS.includes(item.id);
    switch (intent.op) {
      case 'mkdir':
      case 'touch': {
        const parent = nodes[intent.parentId];
        if (parent?.kind !== 'folder' || parent.trashed || intent.parentId === 'trash') return 'no-such-folder';
        if (Object.keys(nodes).length >= MAX_NODES) return 'fs-full';
        if (nameTaken(world, intent.parentId, intent.name)) return 'name-taken';
        if (intent.id && (nodes[intent.id] || world.data.contents[`c-${intent.id}`])) return 'id-taken';
        const id = intent.id ?? nextId('u', candidate => Boolean(nodes[candidate]));
        const created = { id, parentId: intent.parentId, name: intent.name, kind: intent.op === 'mkdir' ? 'folder' : 'file',
          mime: intent.op === 'mkdir' ? null : (intent.mime ?? mimeFor(intent.name)), size: 0, modified: stamp, trashed: false };
        if (intent.op === 'touch') {
          const contentId = `c-${id}`.slice(0, 40);
          if (world.data.contents[contentId]) return 'id-taken';
          created.contentId = contentId;
          world.data.contents[contentId] = { text: intent.text ?? '' };
          created.size = new TextEncoder().encode(intent.text ?? '').length;
        }
        nodes[id] = created;
        return null;
      }
      case 'rename':
        if (!editable(node)) return 'no-such-node';
        if (node.name === intent.name) return 'unchanged';
        if (nameTaken(world, node.parentId, intent.name, node.id)) return 'name-taken';
        Object.assign(node, { name: intent.name, modified: stamp });
        return null;
      case 'move': {
        if (!editable(node) || node.trashed) return 'no-such-node';
        const parent = nodes[intent.parentId];
        if (parent?.kind !== 'folder' || parent.trashed || intent.parentId === 'trash') return 'no-such-folder';
        if (node.parentId === intent.parentId) return 'unchanged';
        if (isWithin(world, intent.parentId, node.id)) return 'fs-cycle';
        if (nameTaken(world, intent.parentId, node.name, node.id)) return 'name-taken';
        node.parentId = intent.parentId;
        if (intent.parentId !== 'desktop') delete node.desktopPos;
        return null;
      }
      case 'trash':
      case 'restore':
        if (!editable(node)) return 'no-such-node';
        if (node.trashed === (intent.op === 'trash')) return 'unchanged';
        if (intent.op === 'restore' && nameTaken(world, node.parentId, node.name, node.id)) return 'name-taken';
        node.trashed = intent.op === 'trash';
        return null;
      case 'empty-trash': {
        const doomed = Object.keys(nodes).filter(id => Object.values(nodes).some(item => item.trashed && isWithin(world, id, item.id)));
        if (doomed.length === 0) return 'unchanged';
        for (const id of doomed) {
          if (nodes[id].contentId) delete world.data.contents[nodes[id].contentId];
          delete nodes[id];
        }
        world.windows = world.windows.filter(win => !doomed.includes(win.payload?.fileId) && !doomed.includes(win.payload?.folderId));
        world.order = world.order.filter(id => world.windows.some(win => win.id === id));
        if (!world.windows.some(win => win.id === world.focusedId)) world.focusedId = topWindowId(world);
        return null;
      }
      case 'write': {
        if (node?.kind !== 'file' || node.trashed) return 'no-such-file';
        const contentId = node.contentId ?? `c-${node.id}`.slice(0, 40);
        if (world.data.contents[contentId]?.asset) return 'read-only';
        if (world.data.contents[contentId]?.text === intent.text) return 'unchanged';
        world.data.contents[contentId] = { text: intent.text };
        Object.assign(node, { contentId, size: new TextEncoder().encode(intent.text).length, modified: stamp });
        return null;
      }
      case 'set-desktop-pos':
        if (!editable(node) || node.parentId !== 'desktop' || node.trashed) return 'no-such-node';
        if (node.desktopPos?.x === intent.pos.x && node.desktopPos?.y === intent.pos.y) return 'unchanged';
        node.desktopPos = { x: intent.pos.x, y: intent.pos.y };
        return null;
      default:
        return 'invalid-intent';
    }
  }

  // ---- data ----

  function upsert(list, item, max = MAX_ITEMS) {
    const index = list.findIndex(entry => entry.id === item.id);
    if (index >= 0 && JSON.stringify(list[index]) === JSON.stringify(item)) return 'unchanged';
    if (index >= 0) list[index] = item;
    else if (list.length >= max) return 'store-full';
    else list.push(item);
    return null;
  }

  function reduceData(world, { store, op, item }, stamp, stampMs) {
    const { data } = world;
    if (store === 'mail') {
      const message = data.mail.messages.find(entry => entry.id === item.id);
      if (op === 'save-draft') {
        if (message && message.folder !== 'drafts') return 'not-a-draft';
        if (!data.mail.folders.includes('drafts')) return 'no-such-folder';
        return upsert(data.mail.messages, { id: item.id, folder: 'drafts', from: `${world.user.name} <${world.user.email}>`, to: item.to,
          subject: item.subject, body: item.body, time: message?.time ?? stamp, read: true, flagged: false, attachments: [] });
      }
      if (!message) return 'no-such-item';
      const field = { 'mark-read': 'read', flag: 'flagged', move: 'folder' }[op];
      if (op === 'move' && !data.mail.folders.includes(item.folder)) return 'no-such-folder';
      if (message[field] === item[field]) return 'unchanged';
      message[field] = item[field];
      return null;
    }
    // mfa: delete removes an answered prompt (or an account). The answer itself is a scene-choice intent.
    if (store === 'mfa') {
      for (const list of [data.mfa?.prompts, data.mfa?.accounts]) {
        const index = list ? list.findIndex(entry => entry.id === item.id) : -1;
        if (index >= 0) {
          list.splice(index, 1);
          return null;
        }
      }
      return 'no-such-item';
    }
    if (store === 'updates' && op === 'upsert') {
      const current = data.updates?.find(entry => entry.id === item.id);
      // choiceId is scene-provided and read-only: an intent may repeat it but never set or change it.
      if (Object.hasOwn(item, 'choiceId') && item.choiceId !== current?.choiceId) return 'read-only';
      data.updates ??= [];
      return upsert(data.updates, current?.choiceId ? { ...item, choiceId: current.choiceId } : { ...item });
    }
    if (SYNCED_DATA.includes(store)) return reduceSynced(world, store, op, item, { s: stamp, ms: stampMs });
    if (store === 'alarms' || store === 'updates') data[store] ??= [];
    if (store === 'messages') {
      const thread = data.messages.threads.find(entry => entry.id === item.threadId);
      if (!thread) return 'no-such-item';
      if (op === 'pin') {
        if ((thread.pinned ?? false) === item.pinned) return 'unchanged';
        thread.pinned = item.pinned;
        return null;
      }
      if (thread.items.some(entry => entry.id === item.id)) return 'id-taken';
      if (thread.items.length >= MAX_ITEMS) return 'store-full';
      thread.items.push({ id: item.id, from: world.user.name, text: item.text, time: stamp });
      return null;
    }
    const list = data[store];
    if (op === 'delete') {
      const index = list.findIndex(entry => entry.id === item.id);
      if (index < 0) return 'no-such-item';
      list.splice(index, 1);
      return null;
    }
    if (store === 'reminders' && op === 'toggle') {
      const reminder = list.find(entry => entry.id === item.id);
      if (!reminder) return 'no-such-item';
      if (reminder.done === item.done) return 'unchanged';
      reminder.done = item.done;
      return null;
    }
    if (store === 'notes') return upsert(list, { ...item, modified: stamp });
    // An omitted optional field (flagged, priority, notes, allDay, favorite) keeps its stored value.
    if (store === 'reminders') {
      const current = list.find(entry => entry.id === item.id);
      return upsert(list, { ...current, ...item, done: current?.done ?? false });
    }
    if (store === 'calendar' && Date.parse(item.end) < Date.parse(item.start)) return 'invalid-intent';
    return upsert(list, { ...list.find(entry => entry.id === item.id), ...item });
  }

  const removeById = (list, id) => {
    const index = list.findIndex(entry => entry.id === id);
    if (index < 0) return 'no-such-item';
    list.splice(index, 1);
    return null;
  };
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Assigns the fields of `patch` to `target`, or reports 'unchanged'.
  const assignChanged = (target, patch) => {
    if (Object.entries(patch).every(([key, value]) => sameJson(target[key], value))) return 'unchanged';
    Object.assign(target, patch);
    return null;
  };

  // Synced app stores (SYNC-AUDIT.md §5). `stamp` is the parent clock: seconds for list times, milliseconds for `at`.
  function reduceSynced(world, store, op, item, stamp) {
    const { data } = world;
    data[store] ??= EMPTY_SYNCED[store]();
    const value = data[store];
    const at = stamp.ms;
    switch (`${store}:${op}`) {
      case 'browser:set-tabs': return assignChanged(value, { tabs: item.tabs, activeTabId: item.activeTabId });
      case 'browser:visit':
        if (value.history[0]?.url === item.url && value.history[0].title === item.title) return 'unchanged';
        value.history = [{ ...item, time: stamp.s }, ...value.history.filter(entry => entry.url !== item.url && entry.id !== item.id)].slice(0, 100);
        return null;
      case 'browser:history-delete': return removeById(value.history, item.id);
      case 'browser:bookmark-upsert': return upsert(value.bookmarks, item, 50);
      case 'browser:bookmark-delete': return removeById(value.bookmarks, item.id);
      case 'media:set-playback': {
        if (item.trackId === null) {
          if (value.nowPlaying === null) return 'unchanged';
          value.nowPlaying = null;
          return null;
        }
        const tracks = new Set(value.tracks.map(track => track.id));
        if (!item.queue.every(id => tracks.has(id))) return 'no-such-item';
        value.nowPlaying = { ...item, at };
        return null;
      }
      case 'media:set-mode': return assignChanged(value, item);
      case 'media:track-upsert': return upsert(value.tracks, item, 200);
      case 'media:playlist-upsert': {
        const tracks = new Set(value.tracks.map(track => track.id));
        return item.trackIds.every(id => tracks.has(id)) ? upsert(value.playlists, item, 50) : 'no-such-item';
      }
      case 'photos:photo-upsert': return upsert(value.items, item);
      case 'photos:photo-delete': {
        const problem = removeById(value.items, item.id);
        if (!problem) for (const album of value.albums) album.photoIds = album.photoIds.filter(id => id !== item.id);
        return problem;
      }
      case 'photos:album-upsert': {
        const photos = new Set(value.items.map(photo => photo.id));
        return item.photoIds.every(id => photos.has(id)) ? upsert(value.albums, item, 50) : 'no-such-item';
      }
      case 'whiteboard:board-upsert': {
        const board = value.boards.find(entry => entry.id === item.id);
        if (board) {
          if (board.name === item.name && sameJson(board.items, item.items)) return 'unchanged';
          Object.assign(board, { name: item.name, items: item.items, modified: stamp.s });
          return null;
        }
        if (value.boards.length >= 20) return 'store-full';
        // As on macOS, a new board opens.
        value.boards.push({ id: item.id, name: item.name, modified: stamp.s, items: item.items });
        value.activeId = item.id;
        return null;
      }
      case 'whiteboard:board-delete': {
        const problem = removeById(value.boards, item.id);
        if (!problem && value.activeId === item.id) value.activeId = value.boards[0]?.id ?? null;
        return problem;
      }
      case 'whiteboard:set-active':
        if (item.id !== null && !value.boards.some(board => board.id === item.id)) return 'no-such-item';
        return assignChanged(value, { activeId: item.id });
      case 'calculator:set': return assignChanged(value, item);
      case 'calculator:record':
        value.history = [{ ...item, time: stamp.s }, ...value.history.filter(entry => entry.id !== item.id)].slice(0, 100);
        return null;
      case 'clock:city-upsert': return upsert(value.worldClocks, item, 24);
      case 'clock:city-delete': return removeById(value.worldClocks, item.id);
      case 'clock:set-timer': {
        const timer = item.timer && { ...item.timer, at };
        if (timer === null && value.timer === null) return 'unchanged';
        value.timer = timer;
        return null;
      }
      case 'clock:set-stopwatch': {
        const { at: _, ...current } = value.stopwatch;
        if (sameJson(current, item) && !item.running) return 'unchanged';
        value.stopwatch = { running: item.running, elapsedMs: item.elapsedMs, at, laps: item.laps };
        return null;
      }
      case 'terminal:cd': {
        const folder = world.fs.nodes[item.cwd];
        if (folder?.kind !== 'folder' || folder.trashed) return 'no-such-folder';
        return assignChanged(value, { cwd: item.cwd });
      }
      case 'terminal:record':
        if (value.history.at(-1) === item.line) return 'unchanged';
        value.history = [...value.history, item.line].slice(-100);
        return null;
      case 'stickies:upsert': return upsert(value, item, 50);
      case 'stickies:delete': return removeById(value, item.id);
      case 'browser:clear-history':
      case 'calculator:clear-history':
      case 'terminal:clear-history':
        if (value.history.length === 0) return 'unchanged';
        value.history = [];
        return null;
      default:
        return removeById(value[{ media: 'playlists', photos: 'albums' }[store]], item.id);
    }
  }

  // Tabs belong to the open browser window and the working directory to the open terminal (a new macOS window starts
  // fresh): closing the window, switching off or uninstalling resets them, and a deleted folder sends the shell home.
  function resetClosedApps(world) {
    const { browser, terminal } = world.data;
    if (browser?.tabs.length && !world.windows.some(win => win.app === 'browser')) Object.assign(browser, { tabs: [], activeTabId: null });
    if (terminal && terminal.cwd !== 'home' && (!world.windows.some(win => win.app === 'terminal') || world.fs.nodes[terminal.cwd]?.kind !== 'folder')) terminal.cwd = 'home';
  }

  // open-app browser {url: 'scene:<id>'} shows that page in a tab: the existing one, else a new one (or the active one
  // when the strip is full).
  function openBrowserTab(world, url) {
    const browser = world.data.browser ??= EMPTY_SYNCED.browser();
    const title = world.data.web?.pages[url.slice(6)]?.title ?? 'Training page';
    let tab = browser.tabs.find(entry => entry.url === url);
    if (!tab && browser.tabs.length >= 16) tab = Object.assign(browser.tabs.find(entry => entry.id === browser.activeTabId), { url, title });
    if (!tab) {
      tab = { id: nextId('tab', candidate => browser.tabs.some(entry => entry.id === candidate)), url, title };
      browser.tabs.push(tab);
    }
    browser.activeTabId = tab.id;
  }

  // A scene tab is titled by the page it shows: behind a sign-in that is the sign-in page (shownPage), until the trainee signs in.
  function retitleTabs(world) {
    for (const tab of world.data.browser?.tabs ?? []) {
      if (!SCENE_URL_RE.test(tab.url)) continue;
      const title = world.data.web?.pages?.[shownPage(world, tab.url.slice(6)) ?? tab.url.slice(6)]?.title;
      if (title && tab.title !== title) tab.title = title;
    }
  }

  function reduceDock(world, intent) {
    const { pins } = world.dock;
    const at = pins.indexOf(intent.app);
    if (intent.op === 'unpin') {
      if (at < 0) return 'unchanged';
      pins.splice(at, 1);
      return null;
    }
    if (!world.installed.includes(intent.app)) return 'not-installed';
    if (intent.op === 'pin' && at >= 0) return 'unchanged';
    if (intent.op === 'move' && at < 0) return 'not-pinned';
    const without = pins.filter(app => app !== intent.app);
    const index = Math.min(intent.index ?? without.length, without.length);
    without.splice(index, 0, intent.app);
    if (without.join('|') === pins.join('|')) return 'unchanged';
    world.dock.pins = without;
    return null;
  }

  // ---- programs, views and dialogs (PROGRAMS.md §4) ----

  // Opens (or focuses) the program window that draws a view, centred and sized by the view; a screen covers the desk.
  function openView(world, viewId) {
    const view = world.data.views?.[viewId];
    if (!view) return 'no-such-view';
    // A full-screen takeover (a fake CHKDSK, a ransom boot screen) replaces everything the OS was showing, its
    // dialogs included: nothing from before the 'restart' stays on top of it.
    if (view.layout === 'screen' || view.fullscreen) delete world.dialogs;
    const existing = world.windows.find(win => win.app === 'program' && win.payload.view === viewId);
    if (existing) {
      focusWindow(world, existing);
      return null;
    }
    if (world.windows.length >= MAX_WINDOWS) return 'too-many-windows';
    const id = nextId('w-program', candidate => world.windows.some(win => win.id === candidate));
    const size = view.size ?? ({ message: { w: 420, h: 200 }, character: { w: 300, h: 260 }, screen: { w: WORK.w, h: WORK.h },
      sheet: { w: 700, h: 430 }, slides: { w: 720, h: 450 }, document: { w: 640, h: 440 } })[view.layout] ?? { w: 560, h: 380 };
    const offset = (world.windows.filter(win => win.app === 'program').length % 4) * 22;
    // Centred right of the guide card (bottom left, x < GUIDE_EDGE), like scene windows; a wider window keeps to the right edge.
    const rect = clampRect({ x: GUIDE_EDGE + (WORK.w - GUIDE_EDGE - size.w) / 2 + offset, y: (WORK.h - size.h) / 2 - 30 + offset, w: size.w, h: size.h });
    const win = { id, app: 'program', title: view.title, rect, mode: view.fullscreen || view.layout === 'screen' ? 'fullscreen' : 'normal', tile: null, payload: { view: viewId } };
    world.windows.push(win);
    focusWindow(world, win);
    return null;
  }

  // A dialog joins the stack (newest last); the same prompt for the same file replaces the old one.
  function pushDialog(world, dialog) {
    const rest = (world.dialogs ?? []).filter(item => !(item.kind === dialog.kind && item.fileId && item.fileId === dialog.fileId));
    world.dialogs = [...rest, { id: nextId('dlg', candidate => rest.some(item => item.id === candidate)), ...dialog }].slice(-6);
  }

  // A program runs: the antivirus may catch it first; otherwise its process, start-up entry, window and notification
  // appear, and it may delete its own file. forward tells the parent a program ran (the fish guide may move on).
  function runProgram(world, programId, fileId, stamp) {
    const program = world.data.programs?.[programId];
    if (!program) return { problem: 'no-such-program' };
    if (program.detected) {
      pushDialog(world, { kind: 'detected', programId, threat: program.detected, ...(fileId ? { fileId } : {}) });
      return { forward: { kind: 'program-detected', programId, fileId: fileId ?? null } };
    }
    if (program.process) {
      const processes = world.data.processes ??= [];
      if (!processes.some(item => item.name === program.process.name)) {
        const extra = Object.fromEntries(['parent', 'command', 'net', 'keylog'].filter(key => program.process[key]).map(key => [key, program.process[key]]));
        processes.push({ id: nextId('p-run', candidate => processes.some(item => item.id === candidate)), name: program.process.name,
          cpu: program.process.cpu ?? 3, mem: program.process.mem ?? 24, publisher: program.publisher ?? 'Unknown publisher', suspicious: true, ...extra });
      }
    }
    if (program.startup) {
      const startup = world.data.startup ??= [];
      if (!startup.some(item => item.name === program.startup.name)) {
        startup.push({ id: nextId('s-run', candidate => startup.some(item => item.id === candidate)), ...program.startup,
          ...(program.publisher ? { publisher: program.publisher } : {}) });
        startupNotice(world, program.startup.name, program.name, stamp);
      }
    }
    if (program.notify && world.installed.includes(program.notify.app)) {
      const item = { id: nextId('n-run', candidate => world.notifications.history.some(entry => entry.id === candidate)), ...program.notify, time: stamp };
      world.notifications.history = [...world.notifications.history, item].slice(-MAX_HISTORY);
      world.notifications.banners = [...world.notifications.banners, item].slice(-MAX_BANNERS);
    }
    if (program.selfDelete && fileId && world.fs.nodes[fileId]) world.fs.nodes[fileId].trashed = true;
    if (program.view) {
      const problem = openView(world, program.view);
      if (problem) return { problem };
    }
    return { forward: { kind: 'program-run', programId, fileId: fileId ?? null } };
  }

  // What both OSes do when something registers itself to run at sign-in: Windows 11 posts a Startup App Notification and
  // macOS 13+ posts "Background Items Added". One neutral banner from Settings stands for both.
  function startupNotice(world, name, by, stamp) {
    if (!world.installed.includes('settings')) return;
    const item = { id: nextId('n-startup', candidate => world.notifications.history.some(entry => entry.id === candidate)), app: 'settings',
      title: `New startup item: ${name}`.slice(0, 120),
      body: `${by && by !== name ? `${by} added ${name}` : `${name} was added`} to the programs that start every time ${world.user.name} signs in. On Windows it is listed in Settings › Apps › Startup and in Task Manager; on a Mac, in System Settings › Login Items.`.slice(0, 600),
      time: stamp };
    world.notifications.history = [...world.notifications.history, item].slice(-MAX_HISTORY);
    world.notifications.banners = [...world.notifications.banners, item].slice(-MAX_BANNERS);
  }

  // ---- the apps a file opens in (PROGRAMS.md §1) -----------------------------------------------------------------
  // A spreadsheet, a presentation, a saved web page, a saved email, a certificate, a zip or a disc image opens in the app the
  // OS would use (Excel or Numbers, PowerPoint or Keynote, the browser, Mail, the certificate viewer, the compressed folder,
  // the mounted disc), drawn as a read-only program window built from the file. The app's name is the shell's
  // (program-ui.js appName): the view stores a neutral one. Returns a view, or null when the type has no such app.
  const DOC_TYPES = Object.freeze(['sheet', 'sheet-macro', 'slides', 'web', 'mail', 'certificate', 'calendar', 'contact', 'archive', 'diskimage']);
  // Text that leaves a world view valid: one line, bounded, and no address outside the fictional domains.
  const safeLine = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(EMAIL_DOMAIN_RE, (match, domain) => (/\.(example|invalid)$/i.test(domain) ? match : ' at ' + domain)).slice(0, max);
  const safeText = (value, max) => String(value ?? '').split('\n').map(line => safeLine(line, max)).join('\n').slice(0, max);
  const baseName = name => String(name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || String(name);
  // Rows of a CSV / TSV / semicolon file: up to 6 columns and 40 rows. null when the text is not a table.
  function tableOf(text) {
    const lines = String(text ?? '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return null;
    const sep = [',', '\t', ';'].find(mark => lines[0].includes(mark));
    if (!sep) return null;
    // Quoted cells may hold the separator ("1,400") and doubled quotes.
    const split = line => {
      const cells = [''];
      let quoted = false;
      for (let n = 0; n < line.length; n++) {
        const ch = line[n];
        if (ch === '"' && quoted && line[n + 1] === '"') { cells[cells.length - 1] += '"'; n++; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === sep && !quoted) cells.push('');
        else cells[cells.length - 1] += ch;
      }
      return cells.map(cell => safeLine(cell.trim(), 120));
    };
    const rows = lines.slice(0, 41).map(split);
    const width = Math.min(6, Math.max(...rows.map(row => row.length)));
    const fit = row => Array.from({ length: width }, (_, n) => row[n] ?? '');
    return { columns: fit(rows[0]).map(cell => cell.slice(0, 40) || ' '), rows: rows.slice(1).map(fit) };
  }
  // A fictional table that fits the file's name, for a spreadsheet with no text of its own (budget.xlsx).
  function sampleTable(name) {
    const n = String(name).toLowerCase();
    if (/budget|expense|cost|forecast|ledger|finance|tax/.test(n)) {
      return { columns: ['Line', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'], rows: [['Salaries', '41,200', '41,200', '42,800', '42,800', '168,000'],
        ['Travel', '3,150', '2,480', '4,020', '3,600', '13,250'], ['Software', '1,900', '1,900', '2,150', '2,150', '8,100'],
        ['Office', '6,000', '6,000', '6,000', '6,000', '24,000'], ['Training', '800', '1,250', '600', '1,400', '4,050'],
        ['Total', '53,050', '52,830', '55,570', '55,950', '217,400']] };
    }
    if (/invoice|order|payment|billing/.test(n)) {
      return { columns: ['Invoice', 'Customer', 'Date', 'Amount', 'Status'], rows: [['INV-1041', 'Contoso Foods', '2026-10-02', '1,240.00', 'Paid'],
        ['INV-1042', 'Fabrikam Ltd', '2026-10-09', '3,815.50', 'Overdue'], ['INV-1043', 'Tailspin Toys', '2026-10-15', '612.00', 'Paid'],
        ['INV-1044', 'Litware Inc', '2026-10-28', '2,090.00', 'Sent']] };
    }
    if (/contact|client|customer|staff|employee|payroll|people|team/.test(n)) {
      return { columns: ['Name', 'Company', 'Email', 'Phone'], rows: [['Priya Shah', 'Northwind', 'priya.shah@northwind.example', '555-0141'],
        ['Marcus Lee', 'Northwind', 'marcus.lee@northwind.example', '555-0177'], ['Ana Ruiz', 'Contoso Foods', 'ana.ruiz@contoso.example', '555-0102'],
        ['Tom Becker', 'Fabrikam Ltd', 'tom.becker@fabrikam.example', '555-0190']] };
    }
    return { columns: ['Item', 'Owner', 'Due', 'Status'], rows: [['Draft', 'Dana', '2026-11-04', 'In progress'], ['Review', 'Priya', '2026-11-11', 'Not started'],
      ['Sign-off', 'Marcus', '2026-11-18', 'Not started']] };
  }
  // Slides: blank-line separated blocks of the file's text (first line the title), or a short fictional deck.
  function slidesOf(name, text) {
    const blocks = String(text ?? '').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
    const slides = blocks.length ? blocks.slice(0, 12).map(block => { const [head, ...rest] = block.split('\n'); return { heading: safeLine(head, 200), text: safeText(rest.join('\n'), 1200) }; })
      : [{ heading: baseName(name), text: 'Northwind Traders\n2026' }, { heading: 'Agenda', text: 'Where we are\nWhat changes next quarter\nQuestions' },
        { heading: 'Next steps', text: 'Owners confirm dates by Friday\nShare the final deck with the team' }];
    return slides.map(slide => (slide.text ? slide : { heading: slide.heading }));
  }
  const downloaded = (world, node) => {
    for (let at = node; at; at = world.fs.nodes[at.parentId]) if (at.id === 'downloads') return true;
    return (world.data.mail?.messages ?? []).some(message => message.attachments?.includes(node.id));
  };
  function docViewOf(world, node, type) {
    // A Word file from the Internet or a mail opens in Office's Protected View, read-only, instead of the editor.
    const word = (type === 'word' || type === 'word-macro') && downloaded(world, node);
    if (!DOC_TYPES.includes(type) && !word) return null;
    const text = (node.contentId && world.data.contents[node.contentId]?.text) || '';
    const title = node.name.slice(0, 120);
    if (word) {
      const lines = text.split(/\r?\n/);
      const page = { heading: safeLine(lines[0]?.trim() || baseName(node.name), 200), text: safeText(lines.slice(1).join('\n').trim() || 'This document has no text.', 4000) };
      const bars = [{ text: 'PROTECTED VIEW  Be careful: files from the Internet can contain viruses. Unless you need to edit, it is safer to stay in Protected View.', button: 'Enable Editing', action: 'next' }];
      if (type === 'word-macro') bars.push({ text: 'SECURITY WARNING  Macros have been disabled. This training copy has no macro to run.', button: 'Enable Content', action: 'next' });
      return { layout: 'document', title: `${title} [Protected View]`.slice(0, 120), app: 'Document', pages: [...bars.map(bar => ({ bar, ...page })), page] };
    }
    if (type === 'sheet' || type === 'sheet-macro') {
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const table = tableOf(text) ?? (lines.length ? { columns: [safeLine(lines[0], 40)], rows: lines.slice(1, 41).map(line => [safeLine(line, 120)]) } : sampleTable(node.name));
      const grid = { sections: [{ table }] };
      // Office's own bars: a file from the Internet opens in Protected View, a macro workbook with its macros off.
      const bars = [];
      if (downloaded(world, node)) bars.push({ text: 'PROTECTED VIEW  Be careful: files from the Internet can contain viruses. Unless you need to edit, it is safer to stay in Protected View.', button: 'Enable Editing', action: 'next' });
      if (type === 'sheet-macro') bars.push({ text: 'SECURITY WARNING  Macros have been disabled.', button: 'Enable Content', action: 'next' });
      const view = { layout: 'sheet', title, app: 'Spreadsheet' };
      return bars.length ? { ...view, pages: [...bars.map(bar => ({ bar, ...grid })), grid] } : { ...view, ...grid };
    }
    if (type === 'slides') return { layout: 'slides', title, app: 'Presentation', pages: slidesOf(node.name, text) };
    if (type === 'web') {
      const plain = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
      const heading = /<title>([^<]{1,200})<\/title>/i.exec(text)?.[1]?.trim();
      return { layout: 'document', title, app: 'Browser', heading: safeLine(heading || baseName(node.name), 200), text: safeText(plain || 'This page is blank.', 4000) };
    }
    if (type === 'mail') {
      const [head, ...rest] = text.split(/\r?\n\r?\n/);
      const field = key => new RegExp(`^${key}:\\s*(.+)$`, 'im').exec(head ?? '')?.[1];
      const rows = [['From', field('From')], ['To', field('To')], ['Date', field('Date')]].filter(([, value]) => value).map(([label, value]) => [label, safeLine(value, 300)]);
      return { layout: 'document', title, app: 'Mail', heading: safeLine(field('Subject') || baseName(node.name), 200),
        // Headers first, then the message, as a mail app shows it.
        sections: [...(rows.length ? [{ rows }] : []), { text: safeText((rows.length ? rest.join('\n\n') : text) || 'This message has no text.', 4000) }] };
    }
    if (type === 'certificate') {
      const subject = safeLine(baseName(node.name), 80);
      return { layout: 'panel', title: 'Certificate', app: 'Certificate', size: { w: 520, h: 330 }, icon: 'shield-bad', heading: 'Certificate information',
        text: 'This CA root certificate is not trusted. To trust it, it would have to be installed in the Trusted Root Certification Authorities store.',
        sections: [{ rows: [['Issued to', subject], ['Issued by', subject], ['Valid from', '01/01/2026 to 01/01/2036']] },
          { note: 'A certificate that issued itself proves nothing about who made it. Installing one lets its owner pose as any website.' }],
        buttons: [{ label: 'Install Certificate...', action: 'none' }, { label: 'OK', action: 'close', primary: true }] };
    }
    // An invitation or a contact card: the OS shows what it holds and offers to add it (Calendar / Contacts). Nothing is added.
    if (type === 'calendar' || type === 'contact') {
      const field = key => safeLine(new RegExp(`^${key}[^:\\n]*:(.+)$`, 'im').exec(text)?.[1]?.trim() ?? '', 200);
      const when = value => (/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value) ?? []).slice(1).filter(Boolean);
      const stamp = value => { const [y, m, d, hh, mm] = when(value); return y ? `${y}-${m}-${d}${hh ? ` ${hh}:${mm}` : ''}` : value; };
      const rows = (type === 'calendar'
        ? [['Event', field('SUMMARY')], ['Starts', stamp(field('DTSTART'))], ['Ends', stamp(field('DTEND'))], ['Where', field('LOCATION')], ['Organiser', field('ORGANIZER').replace(/^mailto:/i, '')]]
        : [['Name', field('FN')], ['Company', field('ORG')], ['Email', field('EMAIL')], ['Phone', field('TEL')]]).filter(([, value]) => value);
      const calendar = type === 'calendar';
      return { layout: 'panel', title, app: calendar ? 'Calendar' : 'Contacts', size: { w: 480, h: 320 }, icon: 'info',
        heading: calendar ? 'Add this event to your calendar?' : 'Add this card to your contacts?',
        sections: [{ rows: rows.length ? rows : [['File', title]] }, ...(calendar && field('DESCRIPTION') ? [{ text: safeText(field('DESCRIPTION').replace(/\\n/g, '\n'), 600) }] : [])],
        buttons: [{ label: 'Cancel', action: 'close' }, { label: calendar ? 'Add to Calendar' : 'Add to Contacts', action: 'close', primary: true }] };
    }
    const disc = type === 'diskimage';
    return { layout: 'panel', title, app: disc ? 'Disc' : 'Archive', icon: 'disk', heading: disc ? `${title} opened as a drive` : title,
      text: disc ? 'The disc image was mounted like a CD. It holds no files.' : 'This compressed folder is empty.',
      buttons: [{ label: disc ? 'Eject' : 'Extract all', action: 'close' }, { label: 'Close', action: 'close', primary: true }] };
  }

  // Prompts first (PROGRAMS.md §2), then the program.
  function startProgram(world, programId, fileId, stamp) {
    const program = world.data.programs?.[programId];
    if (!program) return { problem: 'no-such-program' };
    if (program.prompts.length) {
      pushDialog(world, { kind: program.prompts[0], programId, step: 0, ...(fileId ? { fileId } : {}) });
      return { forward: { kind: 'program-prompt', programId, fileId: fileId ?? null } };
    }
    return runProgram(world, programId, fileId, stamp);
  }

  // Double-click: what the OS does with this file. Returns { problem } or { forward }.
  function openFile(world, fileId, stamp) {
    const node = world.fs.nodes[fileId];
    if (!node || node.trashed || node.kind === 'app') return { problem: 'no-such-file' };
    if (node.kind === 'folder') return { problem: reduceOpenApp(world, { app: 'files', payload: { folderId: node.id } }) };
    if (node.program && world.data.programs?.[node.program]) return startProgram(world, node.program, node.id, stamp);
    const { type } = fileTypeOf(node);
    const doc = node.encrypted ? null : docViewOf(world, node, type);
    if (doc) {
      const viewId = `doc-${node.id}`.slice(0, 40);
      const views = world.data.views ??= {};
      if (!views[viewId] && Object.keys(views).length >= 64) return { problem: 'store-full' };
      views[viewId] = doc;
      return { problem: openView(world, viewId) };
    }
    if (node.encrypted || ['unknown', 'library', 'data'].includes(type)) {
      pushDialog(world, { kind: 'cant-open', fileId: node.id });
      return {};
    }
    // A script with no scene behaviour does what its OS does with it: a PowerShell script opens in the text editor (Windows
    // never runs one on a double-click); a batch or shell script shows its console, each command echoed (nothing runs).
    const ext = fileTypeOf(node).ext;
    const text = (node.contentId && world.data.contents[node.contentId]?.text) || '';
    if (type === 'script' && ext === 'ps1' && node.contentId) return { problem: reduceOpenApp(world, { app: 'texteditor', payload: { fileId: node.id } }) };
    // A .reg file: Registry Editor asks first, then says the keys were added (nothing is changed here).
    if (type === 'script' && ext === 'reg') {
      const viewId = `reg-${node.id}`.slice(0, 40);
      const views = world.data.views ??= {};
      if (!views[viewId] && Object.keys(views).length >= 64) return { problem: 'store-full' };
      const keys = text.split(/\r?\n/).map(line => line.trim()).filter(line => /^\[.+\]$|^".+"=|^@=/.test(line)).slice(0, 12);
      const where = `C:\\Users\\${world.user.short}\\${node.parentId === 'downloads' ? 'Downloads' : node.parentId === 'desktop' ? 'Desktop' : 'Documents'}\\${node.name}`;
      views[viewId] = { layout: 'message', title: 'Registry Editor', app: 'Registry Editor', size: { w: 520, h: 260 }, pages: [
        { icon: 'warning', text: safeText(`Adding information can unintentionally change or delete values and cause components to stop working correctly. If you do not trust the source of this information in ${where}, do not add it to the registry.\n\nAre you sure you want to continue?`, 4000),
          ...(keys.length ? { sections: [{ code: safeText(keys.join('\n'), 4000) }] } : {}),
          buttons: [{ label: 'Yes', action: 'next' }, { label: 'No', action: 'close', primary: true }] },
        { icon: 'info', text: safeText(`The keys and values contained in ${where} have been successfully added to the registry.\n\n(Training desktop: nothing was changed.)`, 4000),
          buttons: [{ label: 'OK', action: 'close', primary: true }] }] };
      return { problem: openView(world, viewId) };
    }
    if (type === 'script' && ['bat', 'cmd', 'sh', 'command'].includes(ext) && text.trim()) {
      const viewId = `con-${node.id}`.slice(0, 40);
      const views = world.data.views ??= {};
      if (!views[viewId] && Object.keys(views).length >= 64) return { problem: 'store-full' };
      const prompt = ['sh', 'command'].includes(ext) ? `${world.user.short}$` : `C:\\Users\\${world.user.short}>`;
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^(@?echo off|rem\b|::|#!)/i.test(line)).slice(0, 40);
      views[viewId] = { layout: 'console', title: node.name.slice(0, 120), app: 'Console', size: { w: 640, h: 360 },
        lines: [...lines.map(line => safeLine(`${prompt} ${line}`, 160)), ' ', safeLine('(Training desktop: the commands are shown, not run.)', 160)] };
      const problem = openView(world, viewId);
      return problem ? { problem } : { forward: { kind: 'program-run', programId: null, fileId: node.id } };
    }
    if (RUNNABLE.includes(type) || type === 'shortcut') {
      // A program with no scene behaviour: the OS still warns about a downloaded program; then it only starts.
      if (type !== 'script' && type !== 'shortcut' && node.parentId === 'downloads') {
        pushDialog(world, { kind: 'open-warning', fileId: node.id, step: 0 });
        return {};
      }
      return { forward: { kind: 'program-run', programId: null, fileId: node.id } };
    }
    // A PDF opens read-only in the document viewer (Edge on Windows, Preview on macOS), never in a text editor.
    if (type === 'pdf') {
      const viewId = `pdf-${node.id}`.slice(0, 40);
      const text = (node.contentId && world.data.contents[node.contentId]?.text) || '';
      const views = world.data.views ??= {};
      if (!views[viewId] && Object.keys(views).length >= 64) return { problem: 'store-full' };
      views[viewId] ??= { layout: 'document', title: node.name.slice(0, 120), app: 'PDF', icon: 'none', text: text.slice(0, 4000) };
      return { problem: openView(world, viewId) };
    }
    const app = type === 'image' ? 'photos' : type === 'audio' || type === 'video' ? 'media' : 'texteditor';
    return { problem: reduceOpenApp(world, { app, payload: { fileId: node.id } }) };
  }

  function answerDialog(world, intent, stamp) {
    const dialog = (world.dialogs ?? []).find(item => item.id === intent.id);
    if (!dialog) return { problem: 'no-such-dialog' };
    world.dialogs = world.dialogs.filter(item => item !== dialog);
    const node = dialog.fileId ? world.fs.nodes[dialog.fileId] : null;
    if (PROMPT_KINDS.includes(dialog.kind)) {
      if (intent.answer !== 'run') return { forward: { kind: 'program-cancelled', programId: dialog.programId ?? null, fileId: dialog.fileId ?? null } };
      const program = dialog.programId ? world.data.programs[dialog.programId] : null;
      const step = (dialog.step ?? 0) + 1;
      if (program && step < program.prompts.length) {
        pushDialog(world, { kind: program.prompts[step], programId: dialog.programId, step, ...(dialog.fileId ? { fileId: dialog.fileId } : {}) });
        return {};
      }
      if (program) return runProgram(world, dialog.programId, dialog.fileId, stamp);
      return { forward: { kind: 'program-run', programId: null, fileId: dialog.fileId ?? null } };
    }
    // Remove in the antivirus alert: the file goes, and a guide waiting on it (when remove) moves on.
    if (dialog.kind === 'detected' && intent.answer === 'trash') {
      if (node && !FIXED_FOLDERS.includes(node.id)) node.trashed = true;
      return { forward: { kind: 'program-removed', programId: dialog.programId ?? null, fileId: dialog.fileId ?? null } };
    }
    if (dialog.kind === 'autoplay' && intent.answer.startsWith('option:')) {
      const option = dialog.options?.[Number(intent.answer.slice(7))];
      if (option) {
        const result = viewAction(world, null, option.action, stamp);
        return result.problem === 'unchanged' ? { forward: result.forward } : result;
      }
    }
    return {};
  }

  // A button in a view (or an AutoPlay choice). win is the program window, or null.
  function viewAction(world, win, action, stamp) {
    const at = action.indexOf(':');
    const verb = at < 0 ? action : action.slice(0, at);
    const arg = at < 0 ? '' : action.slice(at + 1);
    const view = win ? world.data.views?.[win.payload.view] : null;
    const pages = view?.pages?.length ?? 0;
    switch (verb) {
      case 'none': return { problem: 'unchanged' };
      case 'close':
      case 'done':
        if (!win) return { problem: 'unchanged' };
        world.windows = world.windows.filter(item => item !== win);
        world.order = world.order.filter(id => id !== win.id);
        if (world.focusedId === win.id) world.focusedId = topWindowId(world);
        return verb === 'done' ? { forward: { kind: 'view-done', view: win.payload.view } } : {};
      // A checkbox on the page (an installer's pre-ticked offer): the trainee may untick it. The scene plays on as written.
      case 'check': {
        if (!win || !view) return { problem: 'unchanged' };
        const page = win.payload.page ?? 0;
        const current = pages ? view.pages[page] : view;
        const checks = (current?.sections ?? []).flatMap(item => item.checks ?? []);
        const n = Number(arg);
        if (!(n < checks.length)) return { problem: 'unchanged' };
        const key = `${page}.${n}`;
        const old = win.payload.flips ?? [];
        const flips = old.includes(key) ? old.filter(item => item !== key) : [...old, key].slice(-24);
        const { flips: _drop, ...rest } = win.payload;
        win.payload = flips.length ? { ...rest, flips } : rest;
        const checked = flips.includes(key) ? !checks[n].checked : checks[n].checked;
        return { forward: { kind: 'view-check', view: win.payload.view, page, check: n, label: checks[n].label, checked } };
      }
      case 'next':
      case 'back':
      case 'page': {
        if (!win || !pages) return { problem: 'unchanged' };
        const current = win.payload.page ?? 0;
        const page = verb === 'page' ? Number(arg) : current + (verb === 'next' ? 1 : -1);
        if (page < 0 || page >= pages || page === current) return { problem: 'unchanged' };
        win.payload = { view: win.payload.view, ...(page ? { page } : {}), ...(win.payload.flips ? { flips: win.payload.flips } : {}) };
        return { forward: { kind: 'view-page', view: win.payload.view, page } };
      }
      case 'run': return runProgram(world, arg, null, stamp);
      case 'view': return { problem: openView(world, arg) };
      case 'open': {
        if (world.data.web?.pages?.[arg]) {
          const problem = reduceOpenApp(world, { app: 'browser', payload: { url: `scene:${arg}` } });
          if (!problem) openBrowserTab(world, `scene:${arg}`);
          return { problem };
        }
        if (world.fs.nodes[arg]) return openFile(world, arg, stamp);
        if (world.data.mail.messages.some(item => item.id === arg)) return { problem: reduceOpenApp(world, { app: 'mail', payload: { messageId: arg } }) };
        if (CANONICAL_APPS.includes(arg)) return { problem: reduceOpenApp(world, { app: arg }) };
        return { problem: 'no-such-target' };
      }
      case 'choice': return { forward: { kind: 'choose', choiceId: arg }, problem: 'unchanged' };
      case 'notify': return { forward: { kind: 'view-notify', id: arg }, problem: 'unchanged' };
      default: return { problem: 'invalid-intent' };
    }
  }


  // Applies one shell intent. `now` is the parent clock in ms. Returns the next world (revision + 1) when it changed.
  // A scene choice never edits the world; it is returned as `forward` for the CONTRACT-V2 scene model.
  function applyIntent(world, rawIntent, now) {
    if (!Number.isFinite(now) || now < 0) return reject(world, 'invalid-time');
    if (worldProblem(world)) return reject(world, 'invalid-world');
    const intent = parseIntent(rawIntent);
    if (!intent) return reject(world, rejectReason(rawIntent));
    const stamp = new Date(Math.floor(now / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    const stampMs = new Date(Math.floor(now)).toISOString();
    const desktopOnly = !['set-phase', 'set-sys', 'notify-dismiss', 'notify-clear'].includes(intent.kind);
    if (desktopOnly && world.phase !== 'desktop') return reject(world, 'not-desktop');
    if (intent.kind === 'scene-choice') {
      // A scene page's button: the first one submits its form (all fields typed; signing in), and a button may lead on to
      // another page in the same tab. Any other choice (a V2 scene's) only goes to the scene model.
      const forward = { kind: 'choose', choiceId: intent.choiceId };
      const [pageId, page] = Object.entries(world.data.web?.pages ?? {}).find(([, item]) => item.choices.some(choice => choice.choiceId === intent.choiceId)) ?? [];
      if (!page) return noop(world, forward);
      const at = page.choices.findIndex(choice => choice.choiceId === intent.choiceId);
      const fields = pageFields(page);
      if (at === 0 && fields.length && !formComplete(world, pageId)) return reject(world, 'form-incomplete');
      const draft = clone(world);
      if (at === 0 && fields.length) draft.data.web.sessions = [...new Set([...(draft.data.web.sessions ?? []), pageId])].slice(-16);
      const goto = page.choices[at].goto;
      const browser = draft.data.browser;
      const tab = browser?.tabs.find(item => item.id === browser.activeTabId);
      if (goto && tab) Object.assign(tab, { url: `scene:${goto}`, title: draft.data.web.pages[goto].title });
      retitleTabs(draft);
      if (JSON.stringify(draft) === JSON.stringify(world)) return noop(world, forward);
      const problem = worldProblem(draft);
      if (problem) return reject(world, `invalid-result:${problem}`);
      draft.revision = world.revision + 1;
      return { ok: true, changed: true, world: draft, reason: null, forward };
    }
    const draft = clone(world);
    let problem = null;
    let forward = null;
    switch (intent.kind) {
      case 'open-app':
        problem = reduceOpenApp(draft, intent);
        if (!problem && intent.app === 'browser' && intent.payload?.url) openBrowserTab(draft, intent.payload.url);
        // What the trainee now sees, for a guide waiting on it (QUESTS.md §4): a message, or a page (or its sign-in page).
        if (!problem && intent.payload?.messageId) forward = { kind: 'mail-open', messageId: intent.payload.messageId };
        if (!problem && intent.payload?.url && draft.data.web?.pages?.[intent.payload.url.slice(6)]) forward = { kind: 'page-open', page: intent.payload.url.slice(6), shown: shownPage(draft, intent.payload.url.slice(6)) };
        // Any other app (Task Manager, Settings' start-up list): a guide can wait for the trainee to look (when open <app>).
        if ((!problem || problem === 'unchanged') && !forward) forward = { kind: 'app-open', app: intent.app, ...(intent.payload?.pane ? { pane: intent.payload.pane } : {}) };
        break;
      case 'set-sys':
        if (Object.entries(intent.patch).every(([key, value]) => draft.sys[key] === value)) problem = 'unchanged';
        Object.assign(draft.sys, intent.patch);
        break;
      case 'set-phase': problem = setPhase(draft, intent.phase); break;
      case 'toggle-overlay':
        if (draft.overlays[intent.name] === intent.open) problem = 'unchanged';
        // Overlays are exclusive: opening one closes the others.
        if (intent.open) for (const name of OVERLAYS) draft.overlays[name] = false;
        draft.overlays[intent.name] = intent.open;
        break;
      case 'fs': problem = reduceFs(draft, intent, stamp); break;
      case 'data': {
        problem = reduceData(draft, intent, stamp, stampMs);
        if (intent.store === 'mail' && intent.op === 'mark-read' && intent.item.read) forward = { kind: 'mail-open', messageId: intent.item.id };
        // Switching tabs or following a link: the page the active tab now shows.
        if (intent.store === 'browser' && intent.op === 'set-tabs') {
          const url = intent.item.tabs.find(tab => tab.id === intent.item.activeTabId)?.url ?? '';
          const was = world.data.browser?.tabs.find(tab => tab.id === world.data.browser.activeTabId)?.url;
          if (url !== was && SCENE_URL_RE.test(url) && draft.data.web?.pages?.[url.slice(6)]) forward = { kind: 'page-open', page: url.slice(6), shown: shownPage(draft, url.slice(6)) };
        }
        break;
      }
      case 'notify-dismiss': {
        const before = draft.notifications.banners.length;
        draft.notifications.banners = intent.id ? draft.notifications.banners.filter(item => item.id !== intent.id) : [];
        if (draft.notifications.banners.length === before) problem = 'unchanged';
        break;
      }
      case 'notify-clear': {
        const keep = item => intent.id && item.id !== intent.id;
        const before = draft.notifications.banners.length + draft.notifications.history.length;
        draft.notifications.banners = draft.notifications.banners.filter(keep);
        draft.notifications.history = draft.notifications.history.filter(keep);
        if (draft.notifications.banners.length + draft.notifications.history.length === before) problem = 'unchanged';
        break;
      }
      case 'dock': problem = reduceDock(draft, intent); break;
      case 'page-type': {
        // One key: the field's next character. A keylogger running (a keylog process) records it and sends it on.
        const page = draft.data.web?.pages?.[intent.page];
        const field = page && pageFields(page)[intent.field];
        if (!field) { problem = 'no-such-field'; break; }
        const counts = typedOf(draft, intent.page);
        if (counts[intent.field] >= field.value.length) { problem = 'unchanged'; break; }
        counts[intent.field] += 1;
        draft.data.web.typed = { ...(draft.data.web.typed ?? {}), [intent.page]: counts };
        const complete = counts[intent.field] === field.value.length;
        const logged = (draft.data.processes ?? []).some(item => item.keylog);
        if (logged) {
          draft.data.net = { sent: Math.min((draft.data.net?.sent ?? 0) + 1, MAX_COUNTER) };
          if (complete) draft.data.captured = [...(draft.data.captured ?? []).filter(item => item.label !== field.label), { label: field.label, value: field.value }].slice(-24);
        }
        forward = { kind: 'page-type', page: intent.page, field: intent.field, complete, logged, form: formComplete(draft, intent.page) };
        break;
      }
      case 'flag': {
        const flags = draft.data.flags ?? [];
        const at = flags.findIndex(item => item.key === intent.key);
        forward = { kind: 'flag', key: intent.key, on: intent.on };
        if (intent.on ? at >= 0 : at < 0) { problem = 'unchanged'; break; }
        if (intent.on && flags.length >= 64) { problem = 'store-full'; break; }
        draft.data.flags = intent.on ? [...flags, { key: intent.key, label: intent.label }] : flags.filter(item => item.key !== intent.key);
        break;
      }
      case 'install':
        if (draft.installed.includes(intent.app)) problem = 'unchanged';
        else draft.installed = CANONICAL_APPS.filter(app => app === intent.app || draft.installed.includes(app));
        break;
      case 'uninstall':
        if (CORE_APPS.includes(intent.app)) problem = 'core-app';
        else if (!draft.installed.includes(intent.app)) problem = 'unchanged';
        else {
          draft.installed = draft.installed.filter(app => app !== intent.app);
          filterInstalled(draft);
        }
        break;
      case 'open-file':
      case 'dialog-answer':
      case 'view-action': {
        let result;
        if (intent.kind === 'open-file') result = openFile(draft, intent.fileId, stamp);
        else if (intent.kind === 'dialog-answer') result = answerDialog(draft, intent, stamp);
        else {
          const win = draft.windows.find(item => item.id === intent.windowId && item.app === 'program');
          result = win ? viewAction(draft, win, intent.action, stamp) : { problem: 'no-such-window' };
        }
        problem = result.problem ?? null;
        forward = result.forward ?? (intent.kind === 'open-file' && !result.problem ? { kind: 'file-open', fileId: intent.fileId } : null);
        break;
      }
      case 'file-properties': {
        const node = draft.fs.nodes[intent.fileId];
        if (!node || node.kind === 'app' || node.id === 'root') problem = 'no-such-file';
        else pushDialog(draft, { kind: 'properties', fileId: node.id, ...(node.program && draft.data.programs?.[node.program] ? { programId: node.program } : {}) });
        break;
      }
      default: problem = reduceWindow(draft, intent);
    }
    if (problem === 'unchanged') return noop(world, forward);
    if (problem) return reject(world, problem);
    if (draft.dialogs && !draft.dialogs.length) delete draft.dialogs;
    resetClosedApps(draft);
    retitleTabs(draft);
    const next = worldProblem(draft);
    if (next) return reject(world, `invalid-result:${next}`);
    draft.revision = world.revision + 1;
    return { ok: true, changed: true, world: draft, reason: null, forward };
  }

  // ---- canonical projection ------------------------------------------------------------------------------
  // normalise(world) is what a trainee sees, independent of the OS: both shells' OceanWorldAdapter.snapshot() must
  // equal normalise(the parent's world) once they have applied it. It leaves out geometry (window rects, desktop icon
  // positions), titles a shell derives itself (tab titles, track durations), parent stamps on running values (`at`,
  // and the running remainder or position) and anything without a visible effect (revision, ids of windows).
  // It tolerates partial input: an absent store is empty and an absent optional setting takes its default.

  const SYS_DEFAULTS = Object.freeze({ wallpaperUrl: null, dockAutohide: false, showBatteryPercent: false, increaseContrast: false,
    wifiNetwork: 'Northwind-Staff', locationServices: true, shareAnalytics: false, personalizedAds: false, showExtensions: false });
  const canonicalTime = time => (typeof time === 'string' && !Number.isNaN(Date.parse(time)) ? new Date(Date.parse(time)).toISOString() : null);
  const sortedKeys = record => Object.fromEntries(Object.entries(record ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const pick = (item, keys) => Object.fromEntries(keys.map(key => [key, item[key]]));
  const isFullRect = rect => rect?.x === 0 && rect?.y === 0 && rect?.w === WORK.w && rect?.h === WORK.h;

  // One synced store in canonical form (also used by shells to diff a native store against the world).
  function normaliseStore(store, raw) {
    const value = raw ?? EMPTY_SYNCED[store]();
    switch (store) {
      case 'browser':
        return { tabs: value.tabs.map(tab => pick(tab, ['id', 'url'])), activeTabId: value.activeTabId,
          bookmarks: value.bookmarks.map(item => pick(item, ['id', 'title', 'url'])),
          history: value.history.map(item => ({ id: item.id, url: item.url, title: item.title, time: canonicalTime(item.time) })) };
      case 'media': {
        const playing = value.nowPlaying;
        return { tracks: value.tracks.map(track => ({ ...pick(track, ['id', 'title', 'artist', 'album', 'genre', 'asset', 'loved']), cover: track.cover ?? null })),
          playlists: value.playlists.map(item => pick(item, ['id', 'name', 'trackIds'])), shuffle: value.shuffle, repeat: value.repeat,
          nowPlaying: playing ? { trackId: playing.trackId, queue: playing.queue, playing: playing.playing,
            positionSec: playing.playing ? null : Math.round(playing.positionSec) } : null };
      }
      case 'photos':
        return { items: value.items.map(item => ({ ...pick(item, ['id', 'name', 'asset', 'favorite', 'trashed']), taken: canonicalTime(item.taken) })),
          albums: value.albums.map(item => pick(item, ['id', 'name', 'photoIds'])) };
      case 'whiteboard':
        return { boards: value.boards.map(board => ({ id: board.id, name: board.name, modified: canonicalTime(board.modified),
          items: board.items.map(item => sortedKeys(item)) })), activeId: value.activeId };
      case 'calculator':
        return { ...pick(value, ['mode', 'angle', 'base', 'memory']),
          history: value.history.map(item => ({ ...pick(item, ['id', 'expr', 'result']), time: canonicalTime(item.time) })) };
      case 'clock': {
        const { timer, stopwatch } = value;
        return { worldClocks: value.worldClocks.map(item => pick(item, ['id', 'name', 'tz'])),
          timer: timer ? { label: timer.label, durationMs: timer.durationMs, running: timer.running, remainingMs: timer.running ? null : timer.remainingMs } : null,
          stopwatch: { running: stopwatch.running, elapsedMs: stopwatch.running ? null : stopwatch.elapsedMs, laps: stopwatch.laps } };
      }
      case 'terminal': return { cwd: value.cwd, history: value.history };
      case 'stickies': return value.map(item => pick(item, ['id', 'text', 'color', 'x', 'y', 'w', 'h', 'collapsed']));
      default: throw new TypeError(`Unknown synced store: ${store}`);
    }
  }

  function normalise(world) {
    const data = world.data ?? {};
    const user = world.user ?? {};
    const windows = (world.order ?? []).map(id => (world.windows ?? []).find(win => win.id === id)).filter(Boolean);
    const contents = data.contents ?? {};
    const notification = item => pick(item, ['id', 'app', 'title', 'body']);
    return {
      phase: world.phase,
      user: pick(user, ['name', 'short', 'email']),
      sys: sortedKeys({ ...SYS_DEFAULTS, ...world.sys }),
      installed: CANONICAL_APPS.filter(app => (world.installed ?? []).includes(app)),
      dock: { pins: world.dock?.pins ?? [], badges: sortedKeys(world.dock?.badges) },
      overlays: sortedKeys(world.overlays),
      // Bottom to top. A normal window covering the whole work area looks maximized on both OSes.
      windows: windows.map(win => ({ app: win.app, payload: win.payload ?? null, mode: win.mode === 'normal' && isFullRect(win.rect) ? 'maximized' : win.mode })),
      focused: windows.findIndex(win => win.id === world.focusedId) >= 0 ? windows.findIndex(win => win.id === world.focusedId) : null,
      fs: Object.values(world.fs?.nodes ?? {}).filter(node => node.kind !== 'app' && node.id !== 'root')
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(node => {
          const text = node.contentId ? contents[node.contentId]?.text : undefined;
          return { ...pick(node, ['id', 'parentId', 'name', 'kind', 'trashed']), ...(node.encrypted ? { encrypted: true } : {}), ...(typeof text === 'string' ? { text } : {}) };
        }),
      notifications: { banners: (world.notifications?.banners ?? []).map(notification), history: (world.notifications?.history ?? []).map(notification) },
      data: {
        mail: (data.mail?.messages ?? []).map(item => pick(item, ['id', 'folder', 'subject', 'read', 'flagged'])),
        messages: (data.messages?.threads ?? []).map(thread => ({ id: thread.id, pinned: thread.pinned ?? false,
          items: thread.items.map(item => ({ id: item.id, text: item.text, mine: item.from === user.name })) })),
        notes: (data.notes ?? []).map(item => pick(item, ['id', 'folder', 'title', 'body', 'pinned'])),
        calendar: (data.calendar ?? []).map(item => ({ id: item.id, title: item.title, location: item.location, start: canonicalTime(item.start),
          end: canonicalTime(item.end), allDay: item.allDay ?? false, notes: item.notes ?? '' })),
        reminders: (data.reminders ?? []).map(item => ({ ...pick(item, ['id', 'list', 'title', 'done']), due: canonicalTime(item.due),
          flagged: item.flagged ?? false, priority: item.priority ?? 0, notes: item.notes ?? '' })),
        contacts: (data.contacts ?? []).map(item => ({ ...pick(item, ['id', 'email', 'phone', 'org']), name: item.name.split(/\s+/).filter(Boolean).join(' '),
          favorite: item.favorite ?? false })),
        alarms: (data.alarms ?? []).map(item => pick(item, ['id', 'time', 'label', 'enabled'])),
        updates: (data.updates ?? []).map(item => pick(item, ['id', 'status'])),
        mfa: { accounts: (data.mfa?.accounts ?? []).map(item => item.id), prompts: (data.mfa?.prompts ?? []).map(item => item.id) },
        processes: (data.processes ?? []).map(item => pick(item, ['id', 'name'])),
        startup: (data.startup ?? []).map(item => pick(item, ['id', 'name'])),
        web: Object.keys(data.web?.pages ?? {}).sort(),
        homepage: data.web?.homepage ?? null,
        ...Object.fromEntries(SYNCED_DATA.map(store => [store, normaliseStore(store, data[store])])),
      },
      highlight: world.scene?.highlight ?? null,
    };
  }

  const api = Object.freeze({
    CANONICAL_APPS, CULLED_APPS, CORE_APPS, APP_NAMES, WORK, WORLD_MAX_BYTES, PHASES, ACCENTS, WALLPAPERS, OVERLAYS, TILES, FIXED_FOLDERS, FS_OPS,
    CREATURE_STATES, ATTACK_KINDS, SANDBOX_MODES, SANDBOX_STATUSES, SANDBOX_MAX_EVENTS,
    SYSTEM_APPS, SETTINGS_PANES, FILE_TYPES, FILE_KINDS, RUNNABLE, VIEW_LAYOUTS, VIEW_ICONS, PROMPT_KINDS, DIALOG_KINDS, ARCHIVE_KINDS,
    fileTypeOf, displayName, iconTypeOf, pageFields, shownPage, typedOf, formComplete, isKey,
    // For authoring tools (the fish-scene compiler): the reducer steps a trainee's gesture runs, applied to a draft the
    // caller owns and validates. Shells never call these; they send intents.
    ops: Object.freeze({ openView, runProgram, startProgram, pushDialog, openFile, viewAction, openBrowserTab, startupNotice }),
    createWorld, validate, applyIntent, parseIntent, parseIntentMessage, mergeProfile,
    SYNCED_DATA, SYS_DEFAULTS, normalise, normaliseStore, emptyStore: store => EMPTY_SYNCED[store](),
  });
  if (typeof window !== 'undefined') window.OceanWorldModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
