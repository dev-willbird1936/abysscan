// Fish scenes: what a well-known file did, written as a short script (data/fish-scenes/<name>.scene) and compiled into
// desktop world patches, played on the Windows and macOS training desktops from the ocean's creature panel. The language is
// documented in docs/desktop-parity/FISH-SCENES.md. Each top-level command is one patch; every patch is checked with the world
// model against the world the earlier commands left, so a scene that compiles is one the desktops accept. `step` commands group
// the commands after them into the guide the desktop page walks a visitor through (one patch per guide step).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const Model = createRequire(import.meta.url)('../../ui/desktop/world-model.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCENE_DIR = join(ROOT, 'data', 'fish-scenes');
const readJson = path => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

// The replay desktop the patches land on: the seed world with the neutral replay profile (Dana Okafor).
let startWorld;
export const sceneStartWorld = () => (startWorld ??= Model.createWorld(readJson('data/desktop-world-seed.json'), readJson('data/desktop-profiles/detonation-replay.json')));

const FOLDERS = { desktop: 'desktop', documents: 'documents', downloads: 'downloads', pictures: 'pictures', music: 'music' };
const APPS = new Set(Model.CANONICAL_APPS);
const APP_TITLES = { files: 'Files', browser: 'Browser', mail: 'Mail', messages: 'Messages', updates: 'Software Update', settings: 'Settings',
  terminal: 'Terminal', notes: 'Notes', taskmanager: 'Task Manager', photos: 'Photos', store: 'Store' };
const TEXT_TYPES = /\.(txt|log|csv|html?|md|ini|cfg|js|py|sh|bat|vbs|ps1|reg|json|doc|eml)$/i;
const MIME = { txt: 'text/plain', log: 'text/plain', csv: 'text/csv', html: 'text/html', htm: 'text/html', png: 'image/png', jpg: 'image/jpeg',
  pdf: 'application/pdf', zip: 'application/zip', doc: 'application/msword', docm: 'application/vnd.ms-word.document.macroEnabled.12',
  xls: 'application/vnd.ms-excel', exe: 'application/vnd.microsoft.portable-executable', dmg: 'application/x-apple-diskimage', jar: 'application/java-archive' };
const START = Date.parse('2026-11-02T09:01:00Z');
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 8);
const clone = value => JSON.parse(JSON.stringify(value));

// Lines: a command starts at column 0; indented lines belong to the command above, as `key value` or `| text`. # comments.
export function parseScene(text, name = 'scene') {
  const steps = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, n) => {
    const line = raw.replace(/\s+$/, '');
    const where = `${name}:${n + 1}`;
    if (!line.trim() || line.trim().startsWith('#')) return;
    if (/^\s/.test(line)) {
      const step = steps.at(-1);
      if (!step) throw new SyntaxError(`${where}: an indented line needs a command above it`);
      const body = line.trim();
      if (body.startsWith('|')) {
        step.text.push(body.slice(1).replace(/^ /, ''));
        step.lines.push({ text: body.slice(1).replace(/^ /, ''), where });
      } else {
        const at = body.search(/\s/);
        const pair = at < 0 ? [body, ''] : [body.slice(0, at), body.slice(at + 1).trim()];
        step.props.push(pair);
        step.lines.push({ key: pair[0], value: pair[1], where });
      }
      return;
    }
    const [cmd, ...args] = line.split(/\s+/);
    steps.push({ cmd, args, props: [], text: [], lines: [], where });
  });
  return steps;
}

// Compiles a scene into { os, patches, guide }. fish: { name } for the first notification's title.
// guide: { about, lesson, setup, steps: [{ title, text, look, patch, attack? }] }. attack: { kind, beats } plays the creature's
// attack animation (OceanFx.playAttack) when the visitor reaches that step. setup is applied at sign-in; each step's patch is the
// change from the world the step started on, and its notification banners are only the step's new ones (the shells time
// banners out, so an old one sent again would pop up again).
export function compileScene(source, fish = { name: 'This file' }, name = 'scene') {
  const steps = parseScene(source, name);
  const w = clone(sceneStartWorld());
  let label = fish.name;
  let os = 'windows', clock = 0, counter = 0;
  const time = () => new Date(START + clock++ * 60_000).toISOString().replace('.000Z', 'Z');
  const id = prefix => `fs-${prefix}-${++counter}`;
  const prop = (step, key) => step.props.find(([k]) => k === key)?.[1];
  const props = (step, key) => step.props.filter(([k]) => k === key).map(([, v]) => v);
  const body = step => step.text.join('\n');
  // sent <YYYY-MM-DD> <HH:MM>: when a message arrived (a story spread over days); otherwise the scene's own minute clock.
  const sentAt = step => {
    const sent = prop(step, 'sent');
    if (!sent) return time();
    const at = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(sent.trim());
    if (!at || Number.isNaN(Date.parse(`${at[1]}T${at[2]}:00Z`))) fail(step, 'sent is <YYYY-MM-DD> <HH:MM>, e.g. sent 2026-10-30 09:12');
    return `${at[1]}T${at[2]}:00Z`;
  };
  const fail = (step, message) => { throw new SyntaxError(`${step.where}: ${message}`); };
  const nodes = () => Object.values(w.fs.nodes).filter(Boolean);
  const pathOf = node => { const parts = []; for (let n = node; n && !Object.values(FOLDERS).includes(n.id) && n.id !== 'root'; n = w.fs.nodes[n.parentId]) parts.unshift(n.name); return parts.join('/'); };

  // A path: a home folder (Desktop, Documents, Downloads, Pictures, Music, Home) or a drive, then folders, then the name:
  // Downloads/invoice.doc, Downloads/invoice.zip/shipment.pdf.exe, USB/autorun.inf. { folder, name }.
  const find = (folder, fileName) => nodes().find(n => n.parentId === folder && n.name === fileName && !n.trashed);
  const topFolder = name => FOLDERS[name?.toLowerCase()] ?? (name?.toLowerCase() === 'home' ? 'home' : nodes().find(n => n.parentId === 'root' && n.kind === 'folder' && n.drive === name)?.id);
  const split = (step, path) => {
    const parts = String(path ?? '').split('/');
    let folder = topFolder(parts[0]);
    if (!folder || parts.length < 2 || !parts.at(-1)) fail(step, `"${path}" must be <Desktop|Documents|Downloads|Pictures|Music|Home|a drive>/[folder/…]<name>`);
    for (const part of parts.slice(1, -1)) {
      const next = find(folder, part);
      if (next?.kind !== 'folder') fail(step, `"${path}": no folder ${part} (create it first with folder)`);
      folder = next.id;
    }
    return { folder, name: parts.at(-1).slice(0, 120) };
  };
  function makeFile(step, path, text) {
    const { folder, name: fileName } = split(step, path);
    let node = find(folder, fileName);
    if (!node) {
      const nid = `fs-${slug(fileName)}-${hash(`${folder}/${fileName}`)}`;
      const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
      node = { id: nid, parentId: folder, name: fileName, kind: 'file', mime: MIME[ext] ?? 'application/octet-stream', size: 4096, modified: time(), trashed: false };
      w.fs.nodes[nid] = node;
    }
    if (text) { node.contentId = `c-${node.id}`; node.size = text.length; w.data.contents[node.contentId] = { text: text.slice(0, 16000) }; }
    return node;
  }
  // File properties a scene may set: a disguised icon, the program it runs, hidden (a system file), its size.
  function fileProps(step, node) {
    const icon = prop(step, 'icon');
    if (icon !== undefined) node.icon = Model.FILE_KINDS.includes(icon) ? icon : fail(step, `icon is one of ${Model.FILE_KINDS.join(' ')}`);
    const program = prop(step, 'program');
    if (program !== undefined) node.program = /^[a-z0-9-]{1,40}$/.test(program) ? program : fail(step, 'program <id>');
    if (step.props.some(([k]) => k === 'hidden')) node.hidden = true;
    const size = prop(step, 'size');
    if (size !== undefined) node.size = /^\d{1,9}$/.test(size) ? Number(size) : fail(step, 'size <bytes>');
    // at <x> <y>: where a desktop icon sits, in the 1000×600 work area (both shells scale it), clear of the guide card.
    const at = prop(step, 'at');
    if (at !== undefined) {
      const m = /^(\d{1,4})\s+(\d{1,3})$/.exec(at);
      if (!m || node.parentId !== 'desktop' || Number(m[1]) > 1000 || Number(m[2]) > 600) fail(step, 'at <x 0-1000> <y 0-600>, for a file on the Desktop');
      node.desktopPos = { x: Number(m[1]), y: Number(m[2]) };
    }
  }
  function makeFolder(step, path, archive) {
    const { folder, name: folderName } = split(step, path);
    let node = find(folder, folderName);
    if (!node) {
      const nid = `fs-${slug(folderName)}-${hash(`${folder}/${folderName}`)}`;
      node = { id: nid, parentId: folder, name: folderName, kind: 'folder', mime: null, size: 0, modified: time(), trashed: false };
      w.fs.nodes[nid] = node;
    }
    if (archive) node.archive = archive;
    return node;
  }
  const notify = (app, title, text) => {
    const item = { id: id('n'), app, title: title.slice(0, 120), body: text.slice(0, 600), time: time() };
    w.notifications.history = [...w.notifications.history, item].slice(-120);
    w.notifications.banners = [...w.notifications.banners, item].slice(-8);
  };
  function openWindow(app, title, payload) {
    // Like the world's open-app: a one-window app (Mail, Task Manager, the browser…) is brought forward with its new
    // payload, and a multi-window app reuses a window already showing the same thing.
    const multi = Model.MULTI_WINDOW_APPS?.includes(app) ?? ['files', 'texteditor', 'stickies'].includes(app);
    const existing = w.windows.find(item => item.app === app && (!multi || JSON.stringify(item.payload) === JSON.stringify(payload)));
    if (existing) {
      if (payload || !multi) Object.assign(existing, { title: title.slice(0, 120), payload: payload ?? existing.payload ?? null });
      w.windows = [...w.windows.filter(item => item !== existing), existing];
      w.order = w.windows.map(item => item.id);
      w.focusedId = existing.id;
      return;
    }
    const n = w.windows.length;
    // Right of the guide card (desktop page, bottom left), cascading.
    const win = { id: id('w'), app, title: title.slice(0, 120), rect: { x: Math.min(270 + 20 * n, 310), y: Math.min(30 + 26 * n, 130), w: 690, h: 430 }, mode: 'normal', tile: null, payload };
    w.windows = [...w.windows, win].slice(-6);
    w.order = w.windows.map(item => item.id);
    w.focusedId = win.id;
  }
  // The things a scene can open: a file path, a home folder, a message, a page or an app.
  function open(step, target) {
    const message = w.data.mail.messages.find(m => m.id === `m-${target}`);
    if (message) {
      message.read = true;
      const unread = w.data.mail.messages.filter(m => !m.read && m.folder === 'inbox').length;
      w.dock.badges = Object.fromEntries(Object.entries({ ...w.dock.badges, mail: unread }).filter(([, n]) => n > 0));
      return openWindow('mail', message.subject, { messageId: message.id });
    }
    if (w.data.web?.pages?.[target]) {
      // As open-app does: the page becomes the browser's active tab too, which is what Safari and Edge both show.
      openWindow('browser', w.data.web.pages[target].title, { url: `scene:${target}` });
      return Model.ops.openBrowserTab(w, `scene:${target}`);
    }
    if (FOLDERS[target.toLowerCase()]) return openWindow('files', target, { folderId: FOLDERS[target.toLowerCase()] });
    if (APPS.has(target)) return openWindow(target, APP_TITLES[target] ?? target, null);
    if (w.data.views?.[target]) return ops(step, () => Model.ops.openView(w, target));
    const drive = nodes().find(n => n.parentId === 'root' && n.drive === target);
    if (drive) return openWindow('files', target, { folderId: drive.id });
    const { folder, name: fileName } = split(step, target);
    const node = find(folder, fileName) ?? fail(step, `open: no file ${target} (create it first with file or mail … attach)`);
    if (node.kind === 'folder') return openWindow('files', node.name, { folderId: node.id });
    const type = Model.fileTypeOf(node).type;
    // What a double-click does: a program shows its prompts (or runs), a locked or unknown file cannot open, a PDF opens read-only,
    // a spreadsheet, presentation, web page, saved mail, certificate, zip or disc image opens in its app (world-model docViewOf).
    const VIEWED = ['pdf', 'sheet', 'sheet-macro', 'slides', 'web', 'mail', 'certificate', 'archive', 'diskimage'];
    const fromNet = (() => { for (let at = node; at; at = w.fs.nodes[at.parentId]) if (at.id === 'downloads') return true;
      return w.data.mail.messages.some(message => message.attachments.includes(node.id)); })();
    if (node.program || node.encrypted || VIEWED.includes(type) || Model.RUNNABLE.includes(type) || !['text', 'word'].includes(type) || (type === 'word' && fromNet)) {
      if (!node.program && !node.encrypted && !VIEWED.includes(type) && !Model.RUNNABLE.includes(type) && !node.contentId) return openWindow('files', target.split('/')[0], { folderId: folder });
      if (node.program && !w.data.programs?.[node.program]) fail(step, `open: program "${node.program}" is not defined (define it first with program)`);
      return gesture(step, { kind: 'open-file', fileId: node.id });
    }
    if (node.contentId && TEXT_TYPES.test(node.name)) return openWindow('texteditor', node.name, { fileId: node.id });
    return openWindow('files', target.split('/')[0], { folderId: folder });
  }
  // A trainee's gesture, run through the real reducer (the desktop does the same when the trainee clicks).
  function gesture(step, intent) {
    const result = Model.applyIntent({ ...clone(w), phase: 'desktop' }, intent, START + clock * 60_000);
    if (!result.ok) fail(step, `the desktop refuses ${intent.kind}: ${result.reason}`);
    const { phase, revision } = w;
    for (const key of Object.keys(w)) delete w[key];
    Object.assign(w, result.world, { phase, revision });
    lastForward = result.forward;
    // What the trainee did in this step, for a step with no `when` (inferWhen).
    if (group && result.forward) group.events.push(result.forward);
    if (group) group.intents.push(intent);
  }
  // An author-side reducer step (open a view, run a program, add a dialog) on the scene's world.
  function ops(step, run) {
    const result = run();
    const problem = typeof result === 'string' ? result : result?.problem;
    if (problem) fail(step, problem);
  }
  let lastForward = null;
  // One line of a section (in a view or on a web page). Returns false for a key that is not a section line.
  function sectionLine(section, key, value, bad) {
    if (key === 'row') {
      const [label, ...rest] = value.split(/\s*=\s*/);
      section.rows = [...(section.rows ?? []), [label, rest.join(' = ')]];
    } else if (key === 'item') section.items = [...(section.items ?? []), value];
    else if (key === 'check') {
      const m = /^\[( |x)\]\s*(.+)$/i.exec(value) ?? bad('check [x] <label> or check [ ] <label>');
      section.checks = [...(section.checks ?? []), { label: m[2], checked: m[1].toLowerCase() === 'x' }];
    } else if (key === 'progress') section.progress = Number(value);
    else if (key === 'timer') {
      const [label, seconds] = value.split(/\s*=\s*/);
      section.timer = { label, seconds: Number(seconds) };
    } else if (key === 'columns') section.table = { columns: value.split(/\s*\|\s*/), rows: section.table?.rows ?? [] };
    else if (key === 'cells') {
      if (!section.table) bad('cells needs columns first');
      section.table.rows.push(value.split(/\s*\|\s*/));
    } else if (key === 'code') section.code = section.code === undefined ? value : `${section.code}\n${value}`;
    else if (key === 'tone') section.tone = value;
    else if (key === 'note') section.note = value;
    else if (key === 'heading') section.heading = value;
    else return false;
    return true;
  }
  // The ordered lines of a view command: page keys go to the current page, section keys to the current section.
  function buildView(step, layout) {
    const view = { layout, title: '' };
    let page = view, section = null;
    const pageKeys = new Set(['heading', 'icon', 'button', 'bar', 'line', 'counter', 'image', 'balloon']);
    const arrow = value => value.split(/\s*->\s*/);
    for (const { key, value, text, where } of step.lines) {
      const bad = message => { throw new SyntaxError(`${where}: ${message}`); };
      if (text !== undefined) {
        const target = section ?? page;
        target.text = target.text === undefined ? text : `${target.text}\n${text}`;
        continue;
      }
      if (key === 'title') view.title = value;
      else if (key === 'app') view.app = value;
      else if (key === 'publisher') view.publisher = value;
      else if (['bg', 'fg', 'accent', 'header'].includes(key)) view.theme = { ...(view.theme ?? {}), [key]: value };
      else if (key === 'size') {
        const m = /^(\d+)x(\d+)$/.exec(value) ?? bad('size <w>x<h>, e.g. 640x420');
        view.size = { w: Number(m[1]), h: Number(m[2]) };
      } else if (key === 'fullscreen') view.fullscreen = true;
      else if (key === 'page') {
        if (!view.pages) {
          // Content written before the first `page` line is the first page, not lost behind the pages.
          view.pages = [];
          const first = Object.fromEntries(Object.entries(view).filter(([k]) => ['heading', 'text', 'icon', 'sections', 'buttons', 'bar', 'lines', 'counter', 'image', 'balloon'].includes(k)));
          if (Object.keys(first).length) {
            for (const k of Object.keys(first)) delete view[k];
            view.pages.push(first);
          }
        }
        page = {};
        if (value) page.heading = value;
        view.pages.push(page);
        section = null;
      } else if (key === 'section') {
        page.sections ??= [];
        section = value ? { heading: value } : {};
        page.sections.push(section);
      } else if (pageKeys.has(key)) {
        if (key === 'heading') page.heading = value;
        else if (key === 'icon') page.icon = value;
        else if (key === 'button') {
          const [label, action] = arrow(value.replace(/\s+primary$/, ''));
          page.buttons = [...(page.buttons ?? []), { label, ...(action ? { action } : { action: 'close' }), ...(/\s+primary$/.test(value) ? { primary: true } : {}) }];
        } else if (key === 'bar') {
          const [barText, label, action] = arrow(value);
          page.bar = { text: barText, ...(label ? { button: label } : {}), ...(action ? { action } : {}) };
        } else if (key === 'line') page.lines = [...(page.lines ?? []), value || ' '];
        else if (key === 'counter') {
          const m = /^(.*\S)\s+(\d+)\s+(\d+)$/.exec(value) ?? bad('counter <label> <from> <to>');
          page.counter = { label: m[1], from: Number(m[2]), to: Number(m[3]) };
        } else if (key === 'image') page.image = value;
        else page.balloon = value;
      } else {
        if (!section) {
          page.sections ??= [];
          section = {};
          page.sections.push(section);
        }
        if (!sectionLine(section, key, value, bad)) bad(`view: unknown line "${key}" (see docs/desktop-parity/PROGRAMS.md)`);
      }
    }
    if (!view.title) fail(step, 'view needs title');
    return view;
  }
  const docsIn = (step, where) => {
    const folder = FOLDERS[where.toLowerCase()];
    if (folder) return nodes().filter(n => n.parentId === folder && n.kind === 'file' && !n.trashed);
    const { folder: f, name: fileName } = split(step, where);
    return [find(f, fileName) ?? fail(step, `no file ${where}`)];
  };
  // A plain wallpaper: a colour and up to eight lines of text (a ransom screen, a fake alert).
  const wallpaper = (colour, lines) => {
    const esc = s => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
    const text = lines.slice(0, 8).map((line, n) => `<text x="800" y="${330 + n * 64}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="${n ? 34 : 52}" font-weight="${n ? 400 : 700}" fill="#fff" text-anchor="middle">${esc(line)}</text>`).join('');
    return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${colour}"/>${text}</svg>`).toString('base64')}`;
  };

  const run = {
    os(step) { os = ['windows', 'macos'].includes(step.args[0]) ? step.args[0] : fail(step, 'os is windows or macos'); },
    title(step) {
      label = step.args.join(' ');
      if (!label || label.length > 120) fail(step, 'title needs 1–120 characters');
    },
    user(step) {
      const name = step.args.join(' ');
      if (!name || name.length > 80) fail(step, 'user needs a fictional name of 1–80 characters');
      const short = slug(name.split(/\s+/)[0]);
      w.user = { ...w.user, name, short: /^[a-z]/.test(short) ? short : 'user', email: prop(step, 'email') ?? `${slug(name)}@northwind.example` };
      w.fs.nodes.home.name = w.user.short;
      // The furnished inbox (furnish) is theirs too.
      for (const message of w.data.mail.messages.filter(item => item.id.startsWith('fu-mail'))) {
        Object.assign(message, { to: w.user.email, body: message.body.replace(/\bDana\b/g, name.split(/\s+/)[0]) });
      }
    },
    theme(step) {
      if (!['light', 'dark'].includes(step.args[0])) fail(step, 'theme is light or dark');
      w.sys.theme = step.args[0];
    },
    about(step) { if (!steps.some(item => item.cmd === 'story')) notify('files', `${label}: an illustration`, body(step) || 'What this file did, acted out on a training desktop. Nothing here is real.'); },
    // QUESTS.md §1: who the trainee is and what they were doing (the guide's first card), and the shift's task counter.
    story(step) { guide.story = body(step) || fail(step, 'story needs | text'); },
    // spotted <text>: what the grade card counts ("signs of the attack spotted" by default); a test file or a hoax says what
    // its hard flags really are, e.g. "signs it was only a test".
    spotted(step) { guide.spotted = (step.args.join(' ') || fail(step, 'spotted needs text')).slice(0, 60); },
    quota(step) {
      const [first, ...rest] = step.args;
      if (/^\+\d+$/.test(first ?? '')) {
        const quota = w.data.quota ?? fail(step, 'quota +n: set the counter first with quota <done> <total> <label>');
        quota.done = Math.min(quota.total, quota.done + Number(first.slice(1)));
        return;
      }
      const [done, total, ...words] = step.args;
      if (!/^\d+$/.test(done ?? '') || !/^\d+$/.test(total ?? '') || Number(done) > Number(total) || !words.length) fail(step, 'quota <done> <total> <label…> or quota +1');
      w.data.quota = { label: words.join(' ').slice(0, 60), done: Number(done), total: Number(total) };
    },
    // A sign-in on a scene page: every field typed (through the real reducer, so a keylogger running records it), then
    // its first button. choose presses one button on a page (a goto moves the tab on).
    signin(step) {
      const pid = step.args[0];
      const page = w.data.web?.pages?.[pid] ?? fail(step, `signin: no page "${pid}"`);
      const fields = Model.pageFields(page);
      if (!fields.length) fail(step, `signin ${pid}: the page has no field lines`);
      fields.forEach((field, at) => { for (let n = Model.typedOf(w, pid)[at]; n < field.value.length; n++) gesture(step, { kind: 'page-type', page: pid, field: at }); });
      gesture(step, { kind: 'scene-choice', choiceId: page.choices[0]?.choiceId ?? fail(step, `signin ${pid}: the page needs a button`) });
    },
    choose(step) {
      const [pid, n = '1'] = step.args;
      const page = w.data.web?.pages?.[pid] ?? fail(step, `choose: no page "${pid}"`);
      const choice = page.choices[Number(n) - 1] ?? fail(step, `choose ${pid}: no button ${n}`);
      gesture(step, { kind: 'scene-choice', choiceId: choice.choiceId });
    },
    // The site signs the trainee out (a session that expired): the next visit asks for the sign-in again, empty.
    signout(step) {
      const pid = step.args[0];
      const page = w.data.web?.pages?.[pid] ?? fail(step, `signout: no page "${pid}"`);
      w.data.web.sessions = (w.data.web.sessions ?? []).filter(id => id !== pid);
      w.data.web.typed = { ...(w.data.web.typed ?? {}), [pid]: Model.pageFields(page).map(() => 0) };
    },
    // QUESTS.md §2: what the trainee should flag. hard: part of the attack (graded); soft: odd only because this is a
    // training desktop (rewarded, not graded). The target names a thing on screen; the | line says why.
    flag(step) {
      const [grade, kind, ...rest] = step.args;
      if (!['hard', 'soft'].includes(grade)) fail(step, 'flag hard|soft <target>');
      const ref = rest.join(' ');
      const pageOf = id => w.data.web?.pages?.[id] ?? fail(step, `flag: no page "${id}"`);
      let key, label;
      if (kind === 'file') { const at = split(step, ref); const node = nodes().find(n => n.parentId === at.folder && n.name === at.name) ?? fail(step, `flag: no file ${ref}`); key = `file:${node.id}`; label = node.name; }
      else if (kind === 'mail' || kind === 'link') { const m = w.data.mail.messages.find(item => item.id === `m-${ref}`) ?? fail(step, `flag: no mail "${ref}"`); key = `${kind}:${m.id}`; label = kind === 'mail' ? `The email “${m.subject}”` : `The link in “${m.subject}”`; }
      else if (kind === 'page') { pageOf(ref); key = `page:${ref}`; label = pageOf(ref).url; }
      else if (kind === 'section' || kind === 'field' || kind === 'choice') {
        const [id, n] = rest;
        const page = pageOf(id);
        const at = Number(n) - 1;
        const list = kind === 'section' ? page.sections ?? [] : kind === 'field' ? Model.pageFields(page) : page.choices;
        if (!(at >= 0 && at < list.length)) fail(step, `flag ${kind} ${id} ${n}: no such ${kind} (count from 1)`);
        key = kind === 'choice' ? `choice:${page.choices[at].choiceId}` : `${kind}:${id}:${at}`;
        label = kind === 'section' ? list[at].heading ?? 'A section of the page' : kind === 'field' ? `The "${list[at].label}" box` : `The “${list[at].label}” button`;
      } else if (kind === 'dialog') {
        const [dkind, pid] = rest;
        if (!Model.DIALOG_KINDS.includes(dkind) || !w.data.programs?.[pid]) fail(step, 'flag dialog <kind> <program id>');
        key = `dialog:${dkind}:${pid}`; label = `The ${dkind.replace('-', ' ')} window for ${w.data.programs[pid].name}`;
      } else if (kind === 'process' || kind === 'startup') { if (!ref) fail(step, `flag ${kind} <name>`); key = `${kind}:${ref}`; label = ref; }
      else if (kind === 'net') { key = 'net'; label = 'Network activity while typing'; }
      // notice <app> <title words>: a notification banner the scene raised (a blocked connection, a start-up notice).
      else if (kind === 'notice') {
        const [app, ...words] = rest;
        const text = words.join(' ').toLowerCase();
        const item = [...w.notifications.history].reverse().find(n => n.app === app && n.title.toLowerCase().includes(text))
          ?? fail(step, `flag notice ${app} ${words.join(' ')}: no ${app} notification with that title (raise it first: notify, block, …)`);
        key = `notification:${item.id}`; label = `The “${item.title}” notice`;
      }
      // view <id>: a program window as a whole (a fake scan, a ransom note, a message box).
      else if (kind === 'view') {
        const view = w.data.views?.[ref] ?? fail(step, `flag view: no view "${ref}" (define it first)`);
        key = `view:${ref}`; label = `The “${view.title ?? ref}” window`;
      }
      // line <view> <words>: a line in a program window (a console, a request log), found by its words.
      else if (kind === 'line') {
        const [vid, ...words] = rest;
        const view = w.data.views?.[vid] ?? fail(step, `flag line: no view "${vid}" (define it first)`);
        const text = words.join(' ').toLowerCase();
        const pages = view.pages?.length ? view.pages : [view];
        const at = pages.flatMap((p, pi) => (p.lines ?? []).map((line, n) => ({ line, at: `${pi}.${n}` }))).find(item => text && item.line.toLowerCase().includes(text))
          ?? fail(step, `flag line ${vid} ${words.join(' ')}: no line of that view contains those words`);
        key = `line:${vid}:${at.at}`; label = `The line “${at.line.slice(0, 60)}”`;
      }
      else fail(step, 'flag target is file, mail, link, page, section, field, choice, dialog, process, startup, notice, view, line or net');
      if (!Model.isKey(key)) fail(step, `flag: "${key}" is not a valid key`);
      guide.flags = [...(guide.flags ?? []).filter(item => item.key !== key), { key, hard: grade === 'hard', label: prop(step, 'label') ?? label, why: body(step) }];
    },
    mail(step) {
      const mid = `m-${step.args[0] ?? fail(step, 'mail needs an id')}`;
      const attachments = props(step, 'attach').map(path => makeFile(step, path).id);
      const link = prop(step, 'link');
      if (link && !w.data.web?.pages?.[link]) fail(step, `mail links to page "${link}": define it first with page`);
      w.data.mail.messages = [...w.data.mail.messages.filter(m => m.id !== mid), {
        id: mid, folder: prop(step, 'folder') ?? 'inbox', from: prop(step, 'from') ?? fail(step, 'mail needs from'), to: prop(step, 'to') ?? w.user.email,
        subject: prop(step, 'subject') ?? fail(step, 'mail needs subject'), body: body(step), time: sentAt(step), read: prop(step, 'read') === 'yes', flagged: false, attachments,
        ...(link ? { link: `scene:${link}` } : {}),
      }];
      w.dock.badges = Object.fromEntries(Object.entries({ ...w.dock.badges, mail: w.data.mail.messages.filter(m => !m.read && m.folder === 'inbox').length }).filter(([, n]) => n > 0));
    },
    // text <thread>: a message in Messages (macOS) / Chat (Windows), e.g. a phone text that Messages shows on the Mac too.
    text(step) {
      const tid = `t-${step.args[0] ?? fail(step, 'text needs a thread id')}`;
      const from = prop(step, 'from') ?? fail(step, 'text needs from <name>');
      const threads = w.data.messages.threads;
      const old = threads.find(thread => thread.id === tid);
      const item = { id: id('i'), from, text: body(step) || fail(step, 'text needs | lines'), time: sentAt(step) };
      const thread = { ...(old ?? { id: tid, with: prop(step, 'with') ?? from }), items: [...(old?.items ?? []), item] };
      w.data.messages = { ...w.data.messages, threads: [thread, ...threads.filter(entry => entry.id !== tid)] };
      if (from !== w.user.name) notify('messages', from, step.text[0] ?? '');
    },
    page(step) {
      const [pid, url] = step.args;
      if (!pid || !url) fail(step, 'page needs an id and a .example or .invalid address');
      // Lines after the first `section` build the page's sections (PROGRAMS.md §3b); `| text` before it is the body.
      const sections = [];
      const bodyLines = [];
      const pageFields = [];
      let section = null;
      for (const { key, value, text, where } of step.lines) {
        const bad = message => { throw new SyntaxError(`${where}: ${message}`); };
        if (key === 'section') sections.push(section = value ? { heading: value } : {});
        else if (key === 'field') {
          // field [secret] [reveal] <label> = <value>: a box the trainee types into (QUESTS.md §3).
          const m = /^((?:(?:secret|reveal)\s+)*)(.+?)\s*=\s*(.+)$/.exec(value) ?? bad('field [secret] [reveal] <label> = <value>');
          const field = { label: m[2], value: m[3], ...(/secret/.test(m[1]) ? { secret: true } : {}), ...(/reveal/.test(m[1]) ? { reveal: true } : {}) };
          if (section) section.fields = [...(section.fields ?? []), field];
          else pageFields.push(field);
        } else if (text !== undefined) {
          if (section) section.text = section.text === undefined ? text : `${section.text}\n${text}`;
          else bodyLines.push(text);
        } else if (section && !['title', 'heading', 'brand', 'insecure', 'button', 'toolbar', 'issuer', 'warning', 'requires', 'favorite'].includes(key)) {
          if (!sectionLine(section, key, value, bad)) bad(`page: unknown section line "${key}"`);
        }
      }
      const warning = prop(step, 'warning');
      if (warning !== undefined && !['cert', 'deceptive', 'malware'].includes(warning)) fail(step, 'warning is cert, deceptive or malware');
      w.data.web = { ...(w.data.web ?? {}), pages: { ...(w.data.web?.pages ?? {}), [pid]: {
        title: prop(step, 'title') ?? fail(step, 'page needs title'), url, body: bodyLines.join('\n'),
        ...(sections.length ? { sections } : {}), ...(props(step, 'toolbar').length ? { toolbars: props(step, 'toolbar') } : {}),
        ...(prop(step, 'issuer') ? { issuer: prop(step, 'issuer') } : {}), ...(warning ? { warning } : {}),
        choices: props(step, 'button').map((line, n) => {
          // button <label> [-> <page id>]: the page the tab shows after it (define that page first).
          const [label, target] = line.split(/\s*->\s*/);
          const goto = ['none', 'close'].includes(target) ? undefined : target;
          if (goto && !w.data.web?.pages?.[goto] && goto !== pid) fail(step, `button ${label} -> ${goto}: define page "${goto}" first`);
          return { label, choiceId: `${pid}-${n + 1}`, ...(n ? {} : { style: 'primary' }), ...(goto ? { goto } : {}) };
        }),
        ...(pageFields.length ? { fields: pageFields } : {}),
        ...(prop(step, 'requires') ? { requires: w.data.web?.pages?.[prop(step, 'requires')] ? prop(step, 'requires') : fail(step, `requires "${prop(step, 'requires')}": define the sign-in page first`) } : {}),
        ...(prop(step, 'heading') ? { heading: prop(step, 'heading') } : {}), ...(prop(step, 'brand') ? { brand: prop(step, 'brand') } : {}),
        ...(step.props.some(([k]) => k === 'insecure') ? { insecure: true } : {}),
      } } };
      // favorite: the page is on the browser's favourites bar (a bank clerk keeps the bank there). A quest's bar holds only
      // these, so both browsers show the same bar and no later page is given away.
      const favorites = (w.data.web.favorites ?? []).filter(item => item.url !== `scene:${pid}`);
      if (step.props.some(([k]) => k === 'favorite')) favorites.push({ title: (prop(step, 'title') ?? pid).slice(0, 80), url: `scene:${pid}` });
      if (favorites.length || steps.some(item => item.cmd === 'story')) w.data.web.favorites = favorites.slice(0, 16);
    },
    // A path is the rest of the line, so names may hold spaces ("Downloads/Install Flash Player.pkg").
    file(step) { fileProps(step, makeFile(step, step.args.join(' ') || fail(step, 'file <path>'), body(step))); },
    folder(step) {
      const archive = prop(step, 'archive');
      if (archive !== undefined && !Model.ARCHIVE_KINDS.includes(archive)) fail(step, `archive is one of ${Model.ARCHIVE_KINDS.join(' ')}`);
      const node = makeFolder(step, step.args.join(' ') || fail(step, 'folder <path>'), archive ?? (/\.(zip|rar|iso|img|dmg)$/i.exec(step.args.join(' '))?.[1].toLowerCase()));
      if (step.props.some(([k]) => k === 'hidden')) node.hidden = true;
    },
    // A removable drive, CD or network share at the top of the computer (This PC / Finder sidebar).
    drive(step) {
      const label = step.args.join(' ') || fail(step, 'drive <label>');
      const kind = prop(step, 'kind') ?? 'usb';
      if (!['usb', 'cd', 'share'].includes(kind)) fail(step, 'drive kind is usb, cd or share');
      const id = `fs-drive-${slug(label)}`;
      w.fs.nodes[id] ??= { id, parentId: 'root', name: label.slice(0, 120), kind: 'folder', mime: null, size: 0, modified: time(), trashed: false, archive: kind };
      w.fs.nodes[id].drive = prop(step, 'as') ?? label.split(/\s+/)[0];
    },
    program(step) {
      const [pid, ...nameWords] = step.args;
      if (!/^[a-z0-9-]{1,40}$/.test(pid ?? '')) fail(step, 'program <id> <display name…>');
      const publisher = prop(step, 'publisher');
      const proc = prop(step, 'process');
      const startupLine = prop(step, 'startup');
      const notifyLine = prop(step, 'notify');
      const program = {
        name: (nameWords.join(' ') || pid).slice(0, 80), publisher: publisher === undefined || publisher === 'none' ? null : publisher,
        signed: prop(step, 'signed') === 'yes', prompts: props(step, 'prompt'),
      };
      if (program.prompts.some(kind => !Model.PROMPT_KINDS.includes(kind))) fail(step, `prompt is one of ${Model.PROMPT_KINDS.join(' ')}`);
      if (proc) program.process = { name: proc, ...Object.fromEntries(['cpu', 'mem'].filter(k => prop(step, k) !== undefined).map(k => [k, Number(prop(step, k))])),
        ...Object.fromEntries(['parent', 'command', 'net'].filter(k => prop(step, k) !== undefined).map(k => [k, prop(step, k)])),
        ...(prop(step, 'keylog') === 'yes' ? { keylog: true } : {}) };
      if (startupLine) {
        const [sname, ...command] = startupLine.split(/\s+/);
        program.startup = { name: sname, command: command.join(' ') || sname, ...(prop(step, 'location') ? { location: prop(step, 'location') } : {}) };
      }
      const viewId = prop(step, 'view');
      if (viewId) program.view = w.data.views?.[viewId] ? viewId : fail(step, `program view "${viewId}": define the view first`);
      if (step.props.some(([k]) => k === 'selfdelete')) program.selfDelete = true;
      if (prop(step, 'detected')) program.detected = prop(step, 'detected');
      if (prop(step, 'description')) program.description = prop(step, 'description');
      if (notifyLine) {
        const [app, ...title] = notifyLine.split(/\s+/);
        program.notify = { app, title: title.join(' '), body: body(step) };
      }
      w.data.programs = { ...(w.data.programs ?? {}), [pid]: program };
    },
    view(step) {
      const [vid, layout] = step.args;
      if (!/^[a-z0-9-]{1,40}$/.test(vid ?? '')) fail(step, 'view <id> <layout>');
      if (!Model.VIEW_LAYOUTS.includes(layout)) fail(step, `view layout is one of ${Model.VIEW_LAYOUTS.join(' ')}`);
      w.data.views = { ...(w.data.views ?? {}), [vid]: buildView(step, layout) };
    },
    // The trainee's answer to the newest dialog: run, cancel, ok, trash or option:N.
    answer(step) {
      const answer = step.args[0] ?? 'run';
      const dialog = (w.dialogs ?? []).at(-1) ?? fail(step, 'answer: no dialog is open');
      gesture(step, { kind: 'dialog-answer', id: dialog.id, answer });
    },
    // A program runs without its prompts (it was already started, or another program started it).
    launch(step) {
      const pid = step.args[0];
      if (!w.data.programs?.[pid]) fail(step, `launch: no program "${pid}"`);
      const file = nodes().find(n => n.program === pid && !n.trashed);
      ops(step, () => Model.ops.runProgram(w, pid, file?.id ?? null, new Date(START + clock * 60_000).toISOString().replace(/\.\d+Z$/, 'Z')));
    },
    show(step) {
      const vid = step.args[0];
      if (!w.data.views?.[vid]) fail(step, `show: no view "${vid}"`);
      ops(step, () => Model.ops.openView(w, vid));
      const page = prop(step, 'page');
      if (page !== undefined) {
        const win = w.windows.find(item => item.app === 'program' && item.payload.view === vid);
        const n = Number(page);
        if (!(n >= 0 && n < (w.data.views[vid].pages?.length ?? 0))) fail(step, 'show … page <n>: no such page');
        win.payload = n ? { view: vid, page: n } : { view: vid };
      }
    },
    // The trainee presses a button in a view: show <view> first.
    press(step) {
      const [vid, ...rest] = step.args;
      const win = w.windows.find(item => item.app === 'program' && item.payload.view === vid) ?? fail(step, `press: view "${vid}" is not open`);
      gesture(step, { kind: 'view-action', windowId: win.id, action: rest.join(' ') || 'next' });
    },
    close(step) {
      const target = step.args[0];
      const keep = win => !(win.app === target || (win.app === 'program' && win.payload.view === target));
      if (w.windows.every(keep)) fail(step, `close: nothing open for "${target}"`);
      w.windows = w.windows.filter(keep);
      w.order = w.order.filter(id => w.windows.some(win => win.id === id));
      w.focusedId = w.order.at(-1) ?? null;
    },
    // An OS dialog: cant-open, properties or detected for a file; autoplay for a drive; message for a view.
    dialog(step) {
      const [kind, ...rest] = step.args;
      if (!Model.DIALOG_KINDS.includes(kind)) fail(step, `dialog is one of ${Model.DIALOG_KINDS.join(' ')}`);
      const target = rest.join(' ');
      const dialog = { kind };
      if (kind === 'message') dialog.view = w.data.views?.[target] ? target : fail(step, `dialog message <view-id>: no view "${target}"`);
      else if (kind === 'autoplay') {
        const drive = nodes().find(n => n.parentId === 'root' && n.drive === target) ?? fail(step, `dialog autoplay <drive>: no drive "${target}"`);
        dialog.fileId = drive.id;
        dialog.options = props(step, 'option').map(line => {
          const [label, action] = line.split(/\s*->\s*/);
          return { label, action: action ?? 'none' };
        });
      } else if (target) {
        const { folder, name: fileName } = split(step, target);
        const node = find(folder, fileName) ?? fail(step, `dialog: no file ${target}`);
        dialog.fileId = node.id;
        if (node.program && w.data.programs?.[node.program]) dialog.programId = node.program;
        if (Model.PROMPT_KINDS.includes(kind)) dialog.step = 0;
      }
      if (prop(step, 'threat')) dialog.threat = prop(step, 'threat');
      ops(step, () => Model.ops.pushDialog(w, dialog));
    },
    open(step) { open(step, step.args.join(' ') || fail(step, 'open what?')); },
    run(step) {
      const pname = step.args.join(' ') || fail(step, 'run needs a program name');
      const extra = Object.fromEntries(['parent', 'command', 'net', 'disk'].filter(k => prop(step, k) !== undefined).map(k => [k, prop(step, k)]));
      w.data.processes = [...(w.data.processes ?? []).filter(p => p.name !== pname), { id: id('p'), name: pname, cpu: Number(prop(step, 'cpu') ?? 2), mem: Number(prop(step, 'mem') ?? 40), publisher: prop(step, 'publisher') ?? 'Unknown publisher', suspicious: prop(step, 'trusted') === undefined, ...extra, ...(prop(step, 'keylog') === 'yes' ? { keylog: true } : {}) }];
    },
    startup(step) {
      const [sname, ...command] = step.args;
      w.data.startup = [...(w.data.startup ?? []), { id: id('s'), name: sname ?? fail(step, 'startup needs a name'), command: command.join(' ') || sname,
        ...(prop(step, 'location') ? { location: prop(step, 'location') } : {}), ...(prop(step, 'publisher') ? { publisher: prop(step, 'publisher') } : {}) }];
      // The OS notices, as it does for a program's own start-up entry.
      Model.ops.startupNotice(w, sname, null, time());
    },
    encrypt(step) {
      const [where, ext] = step.args;
      if (ext !== undefined && !/^\.[A-Za-z0-9_@-]{1,16}$/.test(ext)) fail(step, 'encrypt <folder> [.extension]');
      for (const node of docsIn(step, where)) Object.assign(node, { name: `${node.name}${ext ?? ''}`.slice(0, 120), encrypted: true, modified: time() });
    },
    delete(step) { for (const node of docsIn(step, step.args.join(' '))) Object.assign(node, { trashed: true, modified: time() }); },
    rename(step) {
      const [node] = docsIn(step, step.args[0] ?? '');
      node.name = step.args.slice(1).join(' ') || fail(step, 'rename <path> <new name>');
      node.modified = time();
      // A photo renamed to .vbs is a script now: no photo thumbnail, no opening in Photos (ILOVEYOU).
      if (/^(image|audio|video)\//.test(node.mime ?? '') && !['image', 'audio', 'video'].includes(Model.fileTypeOf(node).type)) node.mime = 'application/octet-stream';
    },
    homepage(step) {
      const pid = step.args[0];
      if (!w.data.web?.pages?.[pid]) fail(step, `homepage "${pid}": define the page first`);
      w.data.web = { ...w.data.web, homepage: `scene:${pid}` };
    },
    wallpaper(step) { w.sys.wallpaperUrl = wallpaper(/^#[0-9a-f]{6}$/i.test(step.args[0] ?? '') ? step.args[0] : fail(step, 'wallpaper #rrggbb'), step.text); },
    notify(step) {
      const [app, ...title] = step.args;
      if (!APPS.has(app) && app !== 'texteditor') fail(step, `notify: unknown app "${app}"`);
      notify(app, title.join(' ') || fail(step, 'notify needs a title'), body(step));
    },
    block(step) {
      const [host, port] = step.args;
      notify('taskmanager', `Connection blocked: ${host ?? fail(step, 'block <host> [port]')}`, `The program tried to reach ${host}${port ? ` on port ${port}` : ''}. The training desktop has no network, so nothing left it.`);
    },
    update(step) {
      w.data.updates = [...(w.data.updates ?? []), { id: id('u'), title: step.args.join(' ') || fail(step, 'update needs a title'), kb: prop(step, 'kb') ?? 'KB000000', size: prop(step, 'size') ?? '12 MB', status: prop(step, 'status') ?? 'available' }];
    },
  };

  // The guide: `step` starts a group, `lesson` is the takeaway shown at the end. Neither changes the desktop.
  const guide = { about: '', lesson: '', setup: null, steps: [], story: '', flags: [] };
  let group = null, groupStart = clone(sceneStartWorld());
  const starts = [];
  const warnings = [];
  const closeGroup = () => {
    // when done <view>: Finish closes the window, so a step Next plays closes it too (both end on the same desktop).
    if (group?.when?.kind === 'done' && w.windows.some(win => win.app === 'program' && win.payload.view === group.when.ref)) {
      w.windows = w.windows.filter(win => !(win.app === 'program' && win.payload.view === group.when.ref));
      w.order = w.order.filter(id => w.windows.some(win => win.id === id));
      if (!w.windows.some(win => win.id === w.focusedId)) w.focusedId = w.order.at(-1) ?? null;
    }
    const patch = stepPatch(groupStart, w);
    if (group) {
      const { events, intents, ...done } = group;
      // when page <view> <n>: n counts from 1, like a button number; the world counts pages from 0.
      if (done.when?.kind === 'page' && Number.isInteger(done.when.page)) {
        const view = w.data.views?.[done.when.ref];
        const count = view?.pages?.length ?? 0;
        if (!view || done.when.page < 1 || done.when.page > count) fail(group.step, `when page ${done.when.ref} ${done.when.page}: the view has ${count} page(s), counted from 1`);
        done.when = { ...done.when, page: done.when.page - 1 };
        const turned = events.filter(item => item.kind === 'view-page' && item.view === done.when.ref);
        if (turned.length && !turned.some(item => item.page === done.when.page)) {
          fail(group.step, `when page ${done.when.ref} ${done.when.page + 1}: this step turns to page ${turned.map(item => item.page + 1).join(', ')} (pages count from 1)`);
        }
      }
      delete done.step;
      if (done.when && !reachable(done.when, groupStart, events, intents)) warnings.push(`${group.step.where}: "when ${done.when.kind} ${done.when.ref ?? ''}" cannot be done when the step starts: only Next plays it`);
      const when = done.when ?? inferWhen(events, groupStart, intents);
      guide.steps.push({ ...done, ...(when ? { when } : {}), patch });
      starts.push(groupStart);
    } else guide.setup = patch;
    groupStart = clone(w);
  };
  run.step = step => {
    closeGroup();
    group = { title: step.args.join(' ') || fail(step, 'step needs a title'), text: body(step), look: prop(step, 'look') ?? '', events: [], intents: [], step };
    // move: the "Your move" line while this step is on screen (else the guide works it out from the next step's when);
    // cue: the ocean keys the desktop glows while this step is on screen (else worked out the same way).
    if (prop(step, 'move')) group.move = prop(step, 'move');
    if (prop(step, 'cue')) group.cue = prop(step, 'cue').split(/\s+/).map(key => key.replace(/^mail:(?!m-)/, 'mail:m-').replace(/^link:(?!m-)/, 'link:m-'));
    if ((group.cue ?? []).some(key => !Model.isKey(key))) fail(step, 'cue <key …>: see QUESTS.md §2 for keys');
    // when <prompt|run|cancel|detected|page|done|choose> [ref] [page]: the step plays itself when the trainee does that.
    const when = prop(step, 'when');
    if (when !== undefined) {
      const [kind, ref, page] = when.split(/\s+/);
      if (!['prompt', 'run', 'cancel', 'detected', 'remove', 'open', 'page', 'done', 'choose', 'mail', 'visit'].includes(kind)) fail(step, 'when is prompt, run, cancel, detected, remove, open, page, done, choose, mail or visit [id] [page]');
      if (kind === 'open') {
        // when open <app>[:<pane>]: the trainee opened that app (Task Manager to see the process, settings:startup for the list).
        const [app, pane] = String(ref ?? '').split(':');
        if (!Model.CANONICAL_APPS.includes(app) || (pane && (app !== 'settings' || !Model.SETTINGS_PANES.includes(pane)))) fail(step, `when open <app>[:pane]: apps are ${Model.CANONICAL_APPS.join(', ')}; panes (settings only) are ${Model.SETTINGS_PANES.join(', ')}`);
      }
      if (kind === 'mail') {
        // when mail <id>: the trainee opened that message. when visit <page>: the browser showed that page (or its sign-in).
        if (!w.data.mail.messages.some(m => m.id === `m-${ref}`)) fail(step, `when mail ${ref}: define the mail first`);
        group.when = { kind, ref: `m-${ref}` };
      } else if (kind === 'visit') {
        if (!w.data.web?.pages?.[ref]) fail(step, `when visit ${ref}: define the page first`);
        group.when = { kind, ref };
      } else if (kind === 'choose' && page === 'any') {
        // when choose <page> any: whichever button the trainee presses on that page.
        if (!ref || !w.data.web?.pages?.[ref]?.choices?.length) fail(step, 'when choose <page> any needs a page with buttons');
        group.when = { kind, ref: `${ref}-*` };
      } else if (kind === 'choose') {
        // when choose <page id> [button number]: the trainee pressed that button (1 = the first) on a scene web page.
        if (!ref || !w.data.web?.pages?.[ref]) fail(step, 'when choose needs a page id defined earlier');
        const n = page === undefined ? 1 : Number(page);
        if (!Number.isInteger(n) || n < 1 || n > (w.data.web.pages[ref].choices?.length ?? 0)) fail(step, `when choose ${ref}: that page has no button ${page ?? 1}`);
        group.when = { kind, ref: `${ref}-${n}` };
      } else group.when = { kind, ...(ref ? { ref } : {}), ...(page !== undefined ? { page: Number(page) } : {}) };
    }
  };
  run.lesson = step => { guide.lesson = body(step) || fail(step, 'lesson needs | text'); };
  run.attack = step => {
    const kind = step.args[0];
    if (!Model.ATTACK_KINDS.includes(kind)) fail(step, `attack is one of ${Model.ATTACK_KINDS.join(', ')}`);
    if (!group) fail(step, 'attack belongs inside a step');
    if (group.attack) fail(step, 'one attack per step');
    group.attack = { kind, beats: step.text.slice(0, 8).map(line => line.slice(0, 60)) };
  };

  // A fish plays on a lived-in desktop: the furnishing arrives with the scene's first change (the sign-in setup).
  furnish(w);
  let world = sceneStartWorld(), before = clone(sceneStartWorld());
  const patches = [], commands = [];
  for (const step of steps) {
    if (!Object.hasOwn(run, step.cmd)) fail(step, `unknown command "${step.cmd}" (see docs/desktop-parity/FISH-SCENES.md)`);
    if (step.cmd === 'about') guide.about = body(step);
    const own = clone(w);
    run[step.cmd](step);
    // A command that changes nothing (os, title, step) adds no patch; the furnishing rides on the first one that does.
    if (!Object.keys(diff(own, w)).length) continue;
    const patch = diff(before, w);
    before = clone(w);
    try {
      world = Model.createWorld(world, patch);
    } catch (error) {
      fail(step, `the desktop refuses this step: ${String(error.message).replace(/^Invalid world: /, '')}`);
    }
    patches.push(patch);
    commands.push(step.cmd);
  }
  if (!steps.some(step => step.cmd === 'about')) throw new SyntaxError(`${name}: a scene needs "about" (what the illustration shows)`);
  if (group || !guide.steps.length) closeGroup();
  // A scene with no `step`: every command after the first change is its own step, titled by what it did.
  if (!steps.some(step => step.cmd === 'step')) Object.assign(guide, autoGuide(patches, commands));
  // "Your move": what the trainee can do to reach each next step themselves (null: only Next plays it).
  else {
    guide.next = hintFor(guide.steps[0]?.when, starts[0]);
    guide.steps.forEach((item, k) => {
      item.next = item.move ? { windows: item.move, macos: item.move } : hintFor(guide.steps[k + 1]?.when, starts[k + 1]);
      delete item.move;
    });
  }
  // The event hub keeps a run's last 32 events: neighbouring steps merge until a scene fits in 30.
  let merged = patches;
  while (merged.length > 30) merged = merged.flatMap((patch, n) => (n % 2 ? [] : [n + 1 < merged.length ? Model.mergeProfile(patch, merged[n + 1]) : patch]));
  return { name: label, os, patches: merged, guide, warnings, world: w };
}

// The quest rules (docs/desktop-parity/QUESTS.md §6), for a scene with a story: problems a checker reports, [] when none.
export function questProblems({ guide, world }) {
  const problems = [];
  if (!guide.story) return ['needs a "story": who the trainee is and what they were doing'];
  const steps = guide.steps;
  if (steps.length < 4) problems.push('a quest needs at least 4 steps (a safe task, the lure, what it does, the reveal)');
  if (steps[0]?.attack) problems.push('the first step is the safe task: no attack there');
  const hard = guide.flags.filter(item => item.hard);
  if (hard.length < 3) problems.push(`needs at least 3 "flag hard" lines (has ${hard.length})`);
  for (const item of guide.flags) if (!item.why) problems.push(`flag ${item.key} needs a | line saying why`);
  // Every flag must name something that is on the desktop by the end, or the trainee could never place it.
  const names = list => new Set((list ?? []).map(entry => entry.name));
  const procs = names(world.data.processes), starts = names(world.data.startup);
  for (const item of guide.flags) {
    const [kind, ref] = [item.key.split(':')[0], item.key.slice(item.key.indexOf(':') + 1)];
    if (kind === 'process' && !procs.has(ref)) problems.push(`flag process ${ref}: no process of that name ever runs`);
    if (kind === 'startup' && !starts.has(ref)) problems.push(`flag startup ${ref}: no start-up item of that name is added`);
    if (kind === 'net' && !(world.data.processes ?? []).some(entry => entry.keylog)) problems.push('flag net: only a keylog process makes network activity while typing (keylog yes)');
    if (kind === 'dialog') {
      const [dkind, pid] = ref.split(':');
      const program = world.data.programs?.[pid];
      const shows = program && (program.prompts.includes(dkind) || (dkind === 'detected' && program.detected) || ['firewall', 'message', 'properties'].includes(dkind));
      if (!shows) problems.push(`flag dialog ${dkind} ${pid}: that program never shows that dialog`);
    }
  }
  // Playable without Next: most steps after the first wait for the trainee's own gesture.
  const middle = steps.slice(1).filter(step => !step.attack);
  const followed = middle.filter(step => step.when).length;
  if (middle.length && followed / middle.length < 0.6) problems.push(`only ${followed} of ${middle.length} steps play from the trainee's own gesture (when): aim for most`);
  if (!steps.some(step => step.next || step.when)) problems.push('no step says what to do next');
  return problems;
}

// A step with no `when` still follows the trainee: it plays when they make the last gesture the step makes (open the file,
// answer the warning, press the view's button), if they could make it when the step starts (the file, dialog or window is
// already there). Otherwise only Next plays it.
const WHEN_OF = { 'program-prompt': 'prompt', 'program-run': 'run', 'program-cancelled': 'cancel', 'program-detected': 'detected', 'program-removed': 'remove', 'view-page': 'page', 'view-done': 'done' };
function inferWhen(events, start, intents) {
  const event = [...events].reverse().find(item => WHEN_OF[item.kind] && (item.programId || item.view));
  if (!event) return null;
  const kind = WHEN_OF[event.kind];
  const when = event.programId ? { kind, ref: event.programId } : { kind, ref: event.view, ...(kind === 'page' ? { page: event.page } : {}) };
  return reachable(when, start, events, intents) ? when : null;
}

// Can the trainee make this gesture on the desktop the step starts on? A file to open, a warning to answer, a window or
// a page with the button. The step's own gestures count as a chain: if its first one (open the file, answer the warning
// already on screen, press a button in an open window) can be made, so can the event it leads to. A step whose trigger is
// out of reach only plays with Next (check-fish-scenes reports it).
function reachable(when, start, events = [], intents = []) {
  if (when.kind === 'mail') return start.data.mail.messages.some(message => message.id === when.ref);
  if (when.kind === 'choose' || when.kind === 'visit') {
    // A page is reachable when it is open in a tab, linked from a mail, or the home page; a sign-in page when a reachable
    // page requires it; a page another reachable page's button leads to.
    const pages = start.data.web?.pages ?? {};
    const pid = when.kind === 'visit' ? when.ref : when.ref.replace(/-(\d+|\*)$/, '');
    // ... or on the favourites bar (a page the trainee keeps there, like their bank).
    const direct = id => (start.data.browser?.tabs ?? []).some(tab => tab.url === `scene:${id}`)
      || start.data.mail.messages.some(message => message.link === `scene:${id}`) || start.data.web?.homepage === `scene:${id}`
      || (start.data.web?.favorites ?? []).some(item => item.url === `scene:${id}`);
    const open = new Set(Object.keys(pages).filter(direct));
    for (let grew = true; grew;) {
      grew = false;
      for (const id of [...open]) for (const next of [pages[id].requires, ...pages[id].choices.map(c => c.goto)]) if (next && pages[next] && !open.has(next)) { open.add(next); grew = true; }
    }
    return Boolean(pages[pid]) && open.has(pid);
  }
  const first = intents[0];
  const produced = events.some(event => WHEN_OF[event.kind] === when.kind && (!when.ref || (event.programId ?? event.view) === when.ref));
  if (first && produced) {
    const chain = first.kind === 'open-file' ? Boolean(start.fs.nodes[first.fileId] && !start.fs.nodes[first.fileId].trashed)
      : first.kind === 'dialog-answer' ? (start.dialogs ?? []).some(dialog => dialog.id === first.id)
        : first.kind === 'view-action' && start.windows.some(win => win.id === first.windowId);
    if (chain) return true;
  }
  const live = Object.values(start.fs.nodes).filter(node => node && !node.trashed);
  const openViews = start.windows.filter(win => win.app === 'program').map(win => start.data.views?.[win.payload.view]).filter(Boolean);
  const actions = view => (view.pages?.length ? view.pages : [view]).flatMap(page => [...(page.buttons ?? []).map(b => b.action), page.bar?.action]);
  if (['page', 'done'].includes(when.kind)) return start.windows.some(win => win.app === 'program' && win.payload.view === when.ref);
  // when open: an app can always be opened from the dock or taskbar.
  if (when.kind === 'open') return true;
  // when remove: the antivirus alert is up, or its file is still there to be caught.
  if (when.kind === 'remove') return (start.dialogs ?? []).some(d => d.kind === 'detected' && (!when.ref || d.programId === when.ref))
    || Boolean(start.data.programs?.[when.ref]?.detected && Object.values(start.fs.nodes).some(node => node && !node.trashed && node.program === when.ref));
  if (!when.ref) return true;
  return live.some(node => node.program === when.ref) || (start.dialogs ?? []).some(d => d.programId === when.ref)
    || openViews.some(view => actions(view).includes(`run:${when.ref}`));
}

// The gesture that plays a step, in each OS's words: { windows, macos }, or null. world: the desktop the step starts on.
function hintFor(when, world) {
  if (!world) return null;
  // A firewall alert waits for an answer whatever the next step is: say what each button means.
  if (!when && (world.dialogs ?? []).some(dialog => dialog.kind === 'firewall')) {
    return { windows: 'In the Windows Security Alert, Cancel keeps the program out; Allow access lets it in. Choose, then press Next.',
      macos: 'In the alert, Deny keeps the program out; Allow lets it in. Choose, then press Next.' };
  }
  if (!when) return null;
  const q = text => `“${text}”`;
  // A window by the name a person would use: "Budget.doc", not "Budget.doc [Protected View] - Word".
  const winName = title => String(title).replace(/\s*\[Protected View\]/, '').replace(/\s+-\s+[^-]+$/, '') || title;
  const both = text => ({ windows: text, macos: text });
  const live = Object.values(world.fs.nodes).filter(node => node && !node.trashed);
  const TOP = { desktop: 'the desktop', documents: 'Documents', downloads: 'Downloads', pictures: 'Pictures', music: 'Music', home: 'your home folder' };
  const where = (node, os) => {
    const parts = [];
    for (let at = world.fs.nodes[node.parentId]; at && at.id !== 'root'; at = world.fs.nodes[at.parentId]) {
      if (TOP[at.id]) { parts.unshift(TOP[at.id]); break; }
      parts.unshift(Model.displayName(at, os));
    }
    return `${parts[0] === 'the desktop' ? 'on' : 'in'} ${parts.join(' › ')}`;
  };
  const fileHint = node => {
    const mail = world.data.mail.messages.find(message => message.attachments.includes(node.id));
    const text = os => `Double-click ${q(Model.displayName(node, os, !!world.sys.showExtensions))} ${where(node, os)}${mail ? `, or open it from the email ${q(mail.subject)}` : ''}.`;
    return { windows: text('windows'), macos: text('macos') };
  };
  const views = world.windows.filter(win => win.app === 'program').map(win => ({ win, view: world.data.views?.[win.payload.view] })).filter(item => item.view);
  const pageOf = ({ win, view }) => (view.pages?.length ? { ...view, ...view.pages[win.payload.page ?? 0] } : view);
  // A button (or the bar's button) in an open program window whose action passes the test.
  const buttonHint = test => {
    for (const item of [...views].reverse()) {
      const page = pageOf(item);
      const button = (page.buttons ?? []).find(b => test(b.action ?? 'close'));
      const label = button?.label ?? (page.bar?.button && test(page.bar.action ?? 'next') ? page.bar.button : null)
        ?? (!page.buttons?.length && item.view.layout === 'wizard' && test('next') ? 'Next' : null);
      if (label) return both(`Click ${q(label.replace(/^< |\s>$/g, ''))} in the ${q(winName(item.view.title))} window.`);
    }
    return null;
  };
  // A button on a later page of an open window: the buttons that turn the pages first (“Enable Editing”, then “Enable Content”).
  const laterHint = test => {
    for (const { win, view } of [...views].reverse()) {
      const pages = view.pages ?? [];
      const labelOn = (page, t) => (page.buttons ?? []).find(b => t(b.action ?? 'close'))?.label ?? (page.bar?.button && t(page.bar.action ?? 'next') ? page.bar.button : null);
      const target = pages.findIndex((page, n) => n > (win.payload.page ?? 0) && labelOn(page, test));
      if (target < 0) continue;
      const path = pages.slice(win.payload.page ?? 0, target).map(page => labelOn(page, a => a === 'next'));
      if (path.some(label => !label)) continue;
      return both(`In the ${q(winName(view.title))} window, click ${[...path, labelOn(pages[target], test)].map(q).join(', then ')}.`);
    }
    return null;
  };
  const dialogHint = dialog => {
    const program = dialog.programId ? world.data.programs?.[dialog.programId] : null;
    const node = dialog.fileId ? world.fs.nodes[dialog.fileId] : live.find(item => item.program === dialog.programId);
    const type = node ? Model.fileTypeOf(node) : { type: 'program', ext: 'exe' };
    const winExe = ['program', 'script', 'installer', 'library'].includes(type.type) && !['sh', 'command', 'pkg'].includes(type.ext);
    const more = (program?.prompts.length ?? 1) - (dialog.step ?? 0) > 1 ? ' Then say yes to the warnings that follow.' : '';
    const label = { 'open-warning': ['Run', winExe ? 'Show what it does' : 'Open'], reputation: ['More info, then Run anyway', 'Open Anyway'], elevation: ['Yes', 'OK'] }[dialog.kind];
    return { windows: `In the warning, click ${label[0]}.${more}`, macos: `In the warning, click ${label[1]}.${more}` };
  };
  const openPrompt = [...(world.dialogs ?? [])].reverse().find(item => Model.PROMPT_KINDS.includes(item.kind));
  return direct() ?? (openPrompt ? dialogHint(openPrompt) : null);

  function direct() {
  const { kind, ref } = when;
  if (kind === 'mail') {
    const message = world.data.mail.messages.find(m => m.id === ref);
    return message ? { windows: `Open Mail on the taskbar and click the email ${q(message.subject)}.`, macos: `Open Mail in the Dock and click the email ${q(message.subject)}.` } : null;
  }
  if (kind === 'visit') {
    const message = world.data.mail.messages.find(m => m.link === `scene:${ref}`);
    const page = world.data.web?.pages?.[ref];
    return message && page ? both(`In the email ${q(message.subject)}, click the link ${q(page.url)}.`) : null;
  }
  if (kind === 'choose') {
    const [pid, n] = [ref.replace(/-(\d+|\*)$/, ''), ref.split('-').pop()];
    const page = world.data.web?.pages?.[pid];
    const labels = n === '*' ? (page?.choices ?? []).map(c => q(c.label)).join(' or ') : page?.choices?.[Number(n) - 1]?.label && q(page.choices[Number(n) - 1].label);
    if (!labels) return null;
    const typeFirst = Model.pageFields(page).length && !Model.formComplete(world, pid) ? 'Click each box and press any keys to type the details, then click ' : 'Click ';
    return { windows: `${typeFirst}${labels} on the ${q(page.title)} page in Edge.`, macos: `${typeFirst}${labels} on the ${q(page.title)} page in Safari.` };
  }
  if (kind === 'page') return buttonHint(action => action === 'next' || action === `page:${when.page}`);
  if (kind === 'done') return buttonHint(action => action === 'done') ?? laterHint(action => action === 'done');
  if (kind === 'cancel') return { windows: 'Click Cancel in the warning.', macos: 'Click Cancel in the warning.' };
  if (kind === 'remove') return { windows: 'Click Remove in the Windows Security alert.', macos: 'Click Move to Trash in the alert.' };
  if (kind === 'open') {
    const [app, pane] = ref.split(':');
    // Neither is pinned by default: the guide's glowing chip opens it, as does the OS's own way.
    if (app === 'taskmanager') return { windows: 'Open Task Manager: click the glowing ⚙ chip below, or press Ctrl+Shift+Esc.', macos: 'Open Activity Monitor: click the glowing ⚙ chip below, or find it with Spotlight.' };
    if (pane === 'startup') return { windows: 'Open the start-up list: click the glowing chip below, or Settings › Apps › Startup.', macos: 'Open Login Items: click the glowing chip below, or System Settings › Login Items.' };
    const name = Model.APP_NAMES?.[app] ?? app;
    return { windows: `Open ${typeof name === 'object' ? name.windows : name} from the taskbar.`, macos: `Open ${typeof name === 'object' ? name.macos : name} from the Dock.` };
  }
  const program = world.data.programs?.[ref];
  const file = live.find(node => node.program === ref);
  if (kind === 'run') {
    const dialog = [...(world.dialogs ?? [])].reverse().find(item => item.programId === ref && Model.PROMPT_KINDS.includes(item.kind));
    if (dialog) return dialogHint(dialog);
    const viaButton = buttonHint(action => action === `run:${ref}`) ?? laterHint(action => action === `run:${ref}`);
    if (viaButton) return viaButton;
  }
  // prompt, detected, or a run with no warning: open the file.
  return file ? fileHint(file) : null;
  }
}

// Dana's desktop for a fish: real-looking documents (so a spreadsheet opens as a spreadsheet and ransomware has something to
// take), on top of the replay profile's files. Fictional throughout.
const FURNISH_TEXT = {
  'Q3-report.docx': 'Q3 report: Northwind Traders\n\nRevenue grew 6% on the quarter, led by the new wholesale accounts. Costs stayed within budget except travel.\n\nNext quarter we open the second warehouse and hire two more drivers. Priya leads the hiring; Marcus owns the warehouse fit-out.\n\nOpen questions: the delivery van lease, and whether to move payroll to the new provider.',
  'budget.xlsx': 'Line,Q1,Q2,Q3,Q4,Total\nSalaries,"41,200","41,200","42,800","42,800","168,000"\nTravel,"3,150","2,480","4,020","3,600","13,250"\nSoftware,"1,900","1,900","2,150","2,150","8,100"\nOffice,"6,000","6,000","6,000","6,000","24,000"\nTraining,800,"1,250",600,"1,400","4,050"\nTotal,"53,050","52,830","55,570","55,950","217,400"',
  'notes.txt': 'Monday stand-up\n- Van lease: Marcus to call the dealer\n- Q3 report due Friday\n- Priya out Thursday\n\nIT: remember the new VPN app is on the intranet, not by email.',
  'photos-list.csv': 'File,Taken,Album\nholiday-01.png,2026-08-03,Summer\nholiday-02.png,2026-08-04,Summer\nteam-lunch.jpg,2026-09-12,Work\nwarehouse.jpg,2026-10-01,Work',
  'todo.txt': 'To do\n- Send Q3 report to Priya\n- Check the budget travel line\n- Book the offsite room\n- Renew parking permit',
};
const FURNISH_FILES = [
  ['documents', 'Client contacts.xlsx', 'Name,Company,Email,Phone\nAna Ruiz,Contoso Foods,ana.ruiz@contoso.example,555-0102\nTom Becker,Fabrikam Ltd,tom.becker@fabrikam.example,555-0190\nLi Wei,Tailspin Toys,li.wei@tailspin.example,555-0133\nSara Holm,Litware Inc,sara.holm@litware.example,555-0158'],
  ['documents', 'Team offsite.pptx', 'Team offsite 2026\nNorthwind Traders\n\nAgenda\nWhere we are after Q3\nThe second warehouse\nHiring plan\n\nNext steps\nBook the room by 14 November\nEveryone sends one idea to Dana'],
  ['documents', 'Invoice INV-1042.pdf', 'Invoice INV-1042\nFabrikam Ltd\nAmount due: 3,815.50\nDue: 9 November 2026\nPay by bank transfer to the account on your contract.'],
  ['documents', 'Contract draft.docx', 'Supply agreement (draft)\n\nBetween Northwind Traders and Contoso Foods. Contoso supplies dried goods weekly; Northwind pays within 30 days of each invoice.\n\nThis draft is for review only.'],
  ['desktop', 'Expenses October.xlsx', 'Date,Item,Amount\n2026-10-03,Train to depot,42.80\n2026-10-09,Client lunch,61.50\n2026-10-21,Parking,12.00\n2026-10-28,Printer ink,34.99'],
];
const FURNISH_MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const FURNISH_MAIL = [
  ['fu-mail-1', 'Priya Shah <priya.shah@northwind.example>', 'Offsite room', 'Hi Dana,\n\nThe big meeting room is free on the 20th. Shall I book it for the offsite?\n\nPriya', '2026-11-01T15:12:00Z'],
  ['fu-mail-2', 'Marcus Lee <marcus.lee@northwind.example>', 'Van lease', 'Dana, the dealer can do the van for 389 a month. I will bring the paperwork on Tuesday.\n\nMarcus', '2026-11-02T07:48:00Z'],
  ['fu-mail-3', 'Northwind IT <servicedesk@northwind.example>', 'Password reminder', 'Reminder: IT never asks for your password by email or phone. Report anything odd to the service desk.\n\nNorthwind IT', '2026-11-02T08:30:00Z'],
];
function furnish(w) {
  const stamp = '2026-10-30T16:20:00Z';
  const mails = FURNISH_MAIL.filter(([id]) => !w.data.mail.messages.some(message => message.id === id)).map(([id, from, subject, body, time]) =>
    ({ id, folder: 'inbox', from, to: w.user.email, subject, body, time, read: true, flagged: false, attachments: [] }));
  w.data.mail.messages = [...mails, ...w.data.mail.messages];
  for (const node of Object.values(w.fs.nodes)) {
    const text = node && node.kind === 'file' && FURNISH_TEXT[node.name];
    if (!text) continue;
    node.contentId ??= `c-${node.id}`.slice(0, 40);
    w.data.contents[node.contentId] = { text };
    node.size = Math.max(node.size, text.length * 9);
  }
  for (const [folder, name, text] of FURNISH_FILES) {
    const nid = `fu-${slug(name)}-${hash(name)}`;
    if (Object.values(w.fs.nodes).some(node => node?.parentId === folder && node.name === name)) continue;
    w.fs.nodes[nid] = { id: nid, parentId: folder, name, kind: 'file', mime: FURNISH_MIME[name.split('.').pop()] ?? 'application/octet-stream', size: text.length * 31, modified: stamp, trashed: false, contentId: `c-${nid}` };
    w.data.contents[`c-${nid}`] = { text };
  }
}

const AUTO_TITLES = { mail: 'A message arrives', text: 'A text message arrives', open: 'A window opens', run: 'A program starts', startup: 'It sets itself to start with the computer',
  encrypt: 'Files are locked', delete: 'Files are deleted', rename: 'A file is renamed', homepage: "The browser's home page changes",
  wallpaper: 'The wallpaper changes', file: 'A file appears', page: 'A web page is ready', update: 'An update appears' };

// One guide step per patch after the first (the first, with the illustration notice, is the setup). A step's title is its newest
// notification when it has one. Used for scenes with no `step` and for the uploaded-fish illustrations (fish-replays.mjs).
export function autoGuide(patches, commands = []) {
  let world = sceneStartWorld();
  const after = patches.map(patch => (world = Model.createWorld(world, patch)));
  const steps = patches.slice(1).map((patch, n) => {
    const known = new Set(after[n].notifications.history.map(item => item.id));
    const note = (patch.notifications?.history ?? []).filter(item => !known.has(item.id)).at(-1);
    return { title: note?.title ?? AUTO_TITLES[commands[n + 1]] ?? `Step ${n + 1}`, text: note?.body ?? '', look: '', patch: stepPatch(after[n], after[n + 1]) };
  });
  return { setup: patches.length ? stepPatch(sceneStartWorld(), after[0]) : null, steps };
}

// The change from one world to the next, with only the new notification banners.
function stepPatch(from, to) {
  const patch = diff(from, to);
  if (patch.notifications) {
    const old = new Set(from.notifications.banners.map(item => item.id));
    patch.notifications = { ...patch.notifications, banners: to.notifications.banners.filter(item => !old.has(item.id)) };
  }
  return patch;
}

// Only what changed, as whole values: nodes and contents by id, the stores and lists whole (lists replace in a patch).
function diff(before, after) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const patch = {};
  const byId = (a = {}, b = {}) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !same(a[k], b[k])).map(k => [k, b[k] ?? null]));
  const nodes = byId(before.fs.nodes, after.fs.nodes);
  if (Object.keys(nodes).length) patch.fs = { nodes };
  const data = {};
  const contents = byId(before.data.contents, after.data.contents);
  if (Object.keys(contents).length) data.contents = contents;
  if (!same(before.data.mail.messages, after.data.mail.messages)) data.mail = { messages: after.data.mail.messages };
  for (const key of ['web', 'processes', 'startup', 'updates', 'quota', 'captured', 'net']) if (!same(before.data[key], after.data[key])) data[key] = after.data[key];
  // The browser's tabs (a scene `open <page>`); the trainee's bookmarks and history stay (patches merge deeply).
  const tabsOf = world => ({ tabs: world.data.browser?.tabs ?? [], activeTabId: world.data.browser?.activeTabId ?? null });
  if (!same(tabsOf(before), tabsOf(after))) data.browser = tabsOf(after);
  for (const key of ['programs', 'views']) {
    const changed = byId(before.data[key], after.data[key]);
    if (Object.keys(changed).length) data[key] = changed;
  }
  if (Object.keys(data).length) patch.data = data;
  if (!same(before.notifications, after.notifications)) patch.notifications = after.notifications;
  if (!same(before.windows, after.windows)) Object.assign(patch, { windows: after.windows, order: after.order, focusedId: after.focusedId });
  if (!same(before.sys, after.sys)) patch.sys = Object.fromEntries(Object.keys(after.sys).filter(key => !same(before.sys[key], after.sys[key])).map(key => [key, after.sys[key]]));
  if (!same(before.user, after.user)) patch.user = after.user;
  if (!same(before.dialogs ?? [], after.dialogs ?? [])) patch.dialogs = after.dialogs ?? [];
  if (!same(before.dock, after.dock)) patch.dock = { badges: after.dock.badges };
  return clone(patch); // a copy: the compiler keeps changing the objects it was taken from
}

// The scene file for a base fish (data/ocean-base.json "scene"), or null.
export function sceneSource(sceneName) {
  if (!/^[a-z0-9-]{1,40}$/.test(sceneName ?? '')) return null;
  const file = join(SCENE_DIR, `${sceneName}.scene`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}
