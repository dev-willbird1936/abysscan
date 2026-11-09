// The program layer (docs/desktop-parity/PROGRAMS.md): file types, hidden extensions, prompts, program windows and
// dialogs live in the shared world, so both shells show the same thing and a scene can follow the trainee.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compileScene } from '../backend/detonation/fish-scenes.mjs';

const M = createRequire(import.meta.url)('../ui/desktop/world-model.js');
const seed = JSON.parse(readFileSync(new URL('../data/desktop-world-seed.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-02T10:00:00Z');

const file = (id, name, extra = {}) => ({ id, parentId: 'downloads', name, kind: 'file', mime: 'application/octet-stream', size: 1024, modified: '2026-11-02T09:00:00Z', trashed: false, ...extra });
function world() {
  const w = { ...M.createWorld(seed), phase: 'desktop' };
  w.fs.nodes['f-inv'] = file('f-inv', 'invoice.pdf.exe', { icon: 'pdf', program: 'trojan' });
  w.fs.nodes['f-pdf'] = file('f-pdf', 'report.pdf');
  w.fs.nodes['f-dll'] = file('f-dll', 'helper.dll');
  w.fs.nodes['f-bare'] = file('f-bare', 'setup.exe');
  w.data.views = { wiz: { layout: 'wizard', title: 'Setup', pages: [{ heading: 'One' }, { heading: 'Two' }] } };
  w.data.programs = {
    trojan: { name: 'invoice.pdf', publisher: null, signed: false, prompts: ['open-warning', 'elevation'],
      process: { name: 'svc.exe', cpu: 4, mem: 30, parent: 'winlogon.exe' }, startup: { name: 'Svc', command: 'svc.exe' }, selfDelete: true },
    setup: { name: 'Setup', publisher: 'Example Ltd', signed: true, prompts: [], view: 'wiz' },
    caught: { name: 'Bad', publisher: null, signed: false, prompts: [], detected: 'Trojan:Win32/Example' },
  };
  return w;
}
function step(w, intent) {
  const result = M.applyIntent(w, intent, NOW);
  assert.equal(result.ok, true, `${intent.kind}: ${result.reason}`);
  assert.equal(M.validate(result.world).ok, true);
  return result;
}

test('file types: Windows hides known extensions, macOS hides only .app; a disguised program keeps its disguise icon', () => {
  const w = world();
  assert.equal(M.fileTypeOf(w.fs.nodes['f-inv']).type, 'program');
  assert.equal(M.fileTypeOf(w.fs.nodes['f-pdf']).type, 'pdf');
  assert.equal(M.displayName(w.fs.nodes['f-inv'], 'windows'), 'invoice.pdf');
  assert.equal(M.displayName(w.fs.nodes['f-inv'], 'macos'), 'invoice.pdf.exe');
  assert.equal(M.displayName({ name: 'Notes.app', kind: 'file' }, 'macos'), 'Notes');
  assert.equal(M.iconTypeOf(w.fs.nodes['f-inv']), 'pdf');
  assert.equal(M.iconTypeOf(w.fs.nodes['f-dll']), 'library');
  // File name extensions on (Explorer's toggle, Finder's View menu): the real ending shows.
  assert.equal(M.displayName(w.fs.nodes['f-inv'], 'windows', true), 'invoice.pdf.exe');
  const on = M.applyIntent(w, { kind: 'set-sys', patch: { showExtensions: true } }, NOW);
  assert.equal(on.ok, true);
  assert.equal(on.world.sys.showExtensions, true);
});

test('opening a disguised program walks its prompts, then runs it: process, start-up entry, self-delete', () => {
  let r = step(world(), { kind: 'open-file', fileId: 'f-inv' });
  assert.deepEqual(r.forward, { kind: 'program-prompt', programId: 'trojan', fileId: 'f-inv' });
  assert.equal(r.world.dialogs[0].kind, 'open-warning');
  r = step(r.world, { kind: 'dialog-answer', id: r.world.dialogs[0].id, answer: 'run' });
  assert.equal(r.world.dialogs[0].kind, 'elevation', 'the second prompt follows the first');
  r = step(r.world, { kind: 'dialog-answer', id: r.world.dialogs[0].id, answer: 'run' });
  assert.deepEqual(r.forward, { kind: 'program-run', programId: 'trojan', fileId: 'f-inv' });
  assert.equal(r.world.dialogs, undefined);
  assert.ok(r.world.data.processes.some(item => item.name === 'svc.exe' && item.parent === 'winlogon.exe'));
  assert.ok(r.world.data.startup.some(item => item.name === 'Svc'));
  assert.equal(r.world.fs.nodes['f-inv'].trashed, true);
});

test('cancel stops a program; a detected program raises the antivirus dialog and can be quarantined', () => {
  let r = step(world(), { kind: 'open-file', fileId: 'f-inv' });
  r = step(r.world, { kind: 'dialog-answer', id: r.world.dialogs[0].id, answer: 'cancel' });
  assert.equal(r.forward.kind, 'program-cancelled');
  assert.equal(r.world.data.processes?.some(item => item.name === 'svc.exe') ?? false, false);
  const w = world();
  w.fs.nodes['f-bare'].program = 'caught';
  r = step(w, { kind: 'open-file', fileId: 'f-bare' });
  assert.equal(r.world.dialogs[0].kind, 'detected');
  r = step(r.world, { kind: 'dialog-answer', id: r.world.dialogs[0].id, answer: 'trash' });
  assert.equal(r.world.fs.nodes['f-bare'].trashed, true);
});

test('files without a scene program still open the way the OS would', () => {
  let r = step(world(), { kind: 'open-file', fileId: 'f-pdf' });
  const pdf = r.world.windows.at(-1);
  assert.equal(pdf.app, 'program', 'a PDF opens read-only, not in a text editor');
  assert.equal(r.world.data.views[pdf.payload.view].layout, 'document');
  r = step(world(), { kind: 'open-file', fileId: 'f-dll' });
  assert.equal(r.world.dialogs[0].kind, 'cant-open');
  r = step(world(), { kind: 'open-file', fileId: 'f-bare' });
  assert.equal(r.world.dialogs[0].kind, 'open-warning', 'a downloaded program warns even with no scene behaviour');
  r = step(world(), { kind: 'file-properties', fileId: 'f-inv' });
  assert.equal(r.world.dialogs[0].kind, 'properties');
});

test('a program window pages through its view and closes with done', () => {
  const w = world();
  w.fs.nodes['f-bare'].program = 'setup';
  let r = step(w, { kind: 'open-file', fileId: 'f-bare' });
  const win = r.world.windows.at(-1);
  assert.deepEqual(win.payload, { view: 'wiz' });
  r = step(r.world, { kind: 'view-action', windowId: win.id, action: 'next' });
  assert.deepEqual(r.forward, { kind: 'view-page', view: 'wiz', page: 1 });
  assert.deepEqual(r.world.windows.find(item => item.id === win.id).payload, { view: 'wiz', page: 1 });
  r = step(r.world, { kind: 'view-action', windowId: win.id, action: 'done' });
  assert.deepEqual(r.forward, { kind: 'view-done', view: 'wiz' });
  assert.equal(r.world.windows.some(item => item.id === win.id), false);
});

test('an invitation and a contact card open in a Calendar / Contacts card, not a text editor', () => {
  const cases = [
    ['invite.ics', 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Quarterly review\nDTSTART:20261113T090000Z\nLOCATION:Room 4\nORGANIZER;CN=Priya:mailto:priya.shah@northwind.example\nEND:VEVENT\nEND:VCALENDAR', 'Calendar', ['Event', 'Quarterly review']],
    ['card.vcf', 'BEGIN:VCARD\nFN:Ana Ruiz\nEMAIL;TYPE=work:ana.ruiz@contoso.example\nTEL:+1 555 0102\nEND:VCARD', 'Contacts', ['Name', 'Ana Ruiz']],
  ];
  for (const [name, text, app, row] of cases) {
    const w = world();
    w.fs.nodes['f-bare'].name = name;
    w.fs.nodes['f-bare'].contentId = 'c-card';
    w.data.contents['c-card'] = { text };
    const r = step(w, { kind: 'open-file', fileId: 'f-bare' });
    const win = r.world.windows.at(-1);
    const view = r.world.data.views[win.payload.view];
    assert.equal(view.app, app);
    assert.deepEqual(view.sections[0].rows[0], row);
  }
});

test('an installer checkbox can be unticked; the flip survives paging and is forwarded', () => {
  const w = world();
  w.fs.nodes['f-bare'].program = 'setup';
  w.data.views.wiz.pages[0].sections = [{ checks: [{ label: 'Install the toolbar', checked: true }] }];
  let r = step(w, { kind: 'open-file', fileId: 'f-bare' });
  const win = r.world.windows.at(-1);
  r = step(r.world, { kind: 'view-action', windowId: win.id, action: 'check:0' });
  assert.deepEqual(r.forward, { kind: 'view-check', view: 'wiz', page: 0, check: 0, label: 'Install the toolbar', checked: false });
  r = step(r.world, { kind: 'view-action', windowId: win.id, action: 'next' });
  assert.deepEqual(r.world.windows.find(item => item.id === win.id).payload, { view: 'wiz', page: 1, flips: ['0.0'] });
  r = step(r.world, { kind: 'view-action', windowId: win.id, action: 'check:0' });
  assert.equal(r.forward ?? null, null, 'page 2 has no checkbox');
  r = step(r.world, { kind: 'view-action', windowId: win.id, action: 'back' });
  r = step(r.world, { kind: 'view-action', windowId: win.id, action: 'check:0' });
  assert.equal(r.forward.checked, true);
  assert.deepEqual(r.world.windows.find(item => item.id === win.id).payload, { view: 'wiz' });
});

test('the world refuses malformed programs, views and dialogs', () => {
  const bad = [
    w => { w.data.programs.trojan.prompts = ['click-yes']; },
    w => { w.data.views.wiz.layout = 'iframe'; },
    w => { w.fs.nodes['f-inv'].icon = 'banana'; },
    w => { w.dialogs = [{ id: 'd1', kind: 'password-prompt' }]; },
    w => { w.windows.push({ id: 'w-x', app: 'program', payload: { view: 'missing' }, mode: 'normal', rect: [10, 10, 300, 200] }); w.order.push('w-x'); },
  ];
  for (const edit of bad) {
    const w = world();
    edit(w);
    assert.equal(M.validate(w).ok, false, edit.toString());
  }
  assert.equal(M.validate(world()).ok, true);
});

test('scene scripts declare programs and views, and a step can wait for the trainee', () => {
  const { guide } = compileScene([
    'about', '  | x',
    'view wiz wizard', '  title Setup', '  page', '  heading One', '  page', '  heading Two',
    'program trojan invoice.pdf', '  publisher none', '  prompt open-warning', '  process svc.exe', '  view wiz',
    'step Mail', '  | t',
    'file Downloads/invoice.pdf.exe', '  icon pdf', '  program trojan',
    'step Warn', '  when prompt trojan', '  | u',
    'open Downloads/invoice.pdf.exe',
    'step Run', '  when run trojan', '  | v',
    'answer run',
  ].join('\n'));
  assert.equal(guide.steps.length, 3);
  assert.deepEqual(guide.steps[1].when, { kind: 'prompt', ref: 'trojan' });
  assert.equal(guide.steps[1].patch.dialogs?.[0]?.kind, 'open-warning');
  assert.throws(() => compileScene('about\n  | x\nprogram p P\n  prompt click-yes'), /prompt is one of/);
});

test('a web page can carry injected sections, adware toolbars, a certificate issuer and a browser warning', () => {
  const { guide } = compileScene([
    'about', '  | x',
    'step Bank', '  look the fields', '  | t',
    'page bank bank.example/login', '  title Bank', '  toolbar SearchBar', '  issuer Superfish, Inc.', '  | Sign in.',
    '  section For your security', '  tone injected', '  row Card PIN = ••••', '  | Added text.', '  button Continue',
    'page warn bank.example/x', '  title Warn', '  warning cert', '  | Body.',
    'open bank',
  ].join('\n'));
  const pages = guide.steps[0].patch.data.web.pages;
  assert.equal(pages.bank.body, 'Sign in.');
  assert.deepEqual(pages.bank.sections, [{ heading: 'For your security', tone: 'injected', rows: [['Card PIN', '••••']], text: 'Added text.' }]);
  assert.deepEqual(pages.bank.toolbars, ['SearchBar']);
  assert.equal(pages.bank.issuer, 'Superfish, Inc.');
  assert.equal(pages.bank.choices[0].label, 'Continue');
  assert.equal(pages.warn.warning, 'cert');
  assert.throws(() => compileScene('about\n  | x\npage p a.example/x\n  title T\n  warning scary'), /warning is cert, deceptive or malware/);
});

test('a step can wait for a scene web page button: when choose <page> [n]', () => {
  const { guide } = compileScene([
    'about', '  | x',
    'step Page', '  | t',
    'page login bank.example/login', '  title Bank', '  | Sign in.', '  button Sign in', '  button Cancel',
    'open login',
    'step Signed', '  when choose login', '  | u',
    'step Cancelled', '  when choose login 2', '  | v',
  ].join('\n'));
  assert.deepEqual(guide.steps[1].when, { kind: 'choose', ref: 'login-1' });
  assert.deepEqual(guide.steps[2].when, { kind: 'choose', ref: 'login-2' });
  assert.throws(() => compileScene('about\n  | x\nstep A\n  when choose nowhere\n  | t'), /page id defined earlier/);
});

test('scene open follows the OS: a one-window app is brought forward, not opened twice', () => {
  const { guide } = compileScene([
    'about', '  | x',
    'step One', '  | t', 'open taskmanager',
    'step Two', '  | u', 'open taskmanager',
  ].join('\n'));
  // Step two changes no window list at all (the patch only carries what changed), or keeps one Task Manager.
  assert.equal((guide.steps[1].patch.windows ?? guide.steps[0].patch.windows).filter(win => win.app === 'taskmanager').length, 1);
});

test('scene paths may hold spaces; a renamed photo becomes a script; a full-screen view clears OS dialogs', () => {
  const { guide } = compileScene([
    'about', '  | x',
    'view boot screen', '  title Repairing', '  | CHKDSK',
    'step One', '  | t',
    'file Downloads/Install Flash Player.pkg',
    'file Documents/locked report.docx', '  | text',
    'encrypt Documents',
    'open Documents/locked report.docx',
    'step Two', '  | u',
    'show boot',
  ].join('\n'));
  const nodes = Object.values(guide.steps[0].patch.fs.nodes);
  assert.ok(nodes.some(node => node?.name === 'Install Flash Player.pkg'));
  assert.equal(guide.steps[0].patch.dialogs?.[0]?.kind, 'cant-open');
  assert.deepEqual(guide.steps[1].patch.dialogs, [], 'the boot screen replaces the dialog');
  const renamed = compileScene(['about', '  | x', 'step A', '  | t', 'file Pictures/holiday.png', 'rename Pictures/holiday.png holiday.png.vbs'].join('\n'));
  const pic = Object.values(renamed.guide.steps[0].patch.fs.nodes).find(node => node?.name === 'holiday.png.vbs');
  assert.equal(pic.mime, 'application/octet-stream', 'no photo thumbnail for a script');
});

test('every common document type opens in its app, read-only, never in a text editor', () => {
  const w = world();
  const add = (id, name, parentId, text) => {
    w.fs.nodes[id] = file(id, name, { parentId, ...(text ? { contentId: `c-${id}` } : {}) });
    if (text) w.data.contents[`c-${id}`] = { text };
  };
  add('f-csv', 'sales.csv', 'documents', 'Region,Total\nNorth,120\nSouth,"1,400"');
  add('f-xlsx', 'budget.xlsx', 'documents');
  add('f-xlsm', 'payroll.xlsm', 'downloads');
  add('f-pptx', 'deck.pptx', 'documents', 'Welcome\nNorthwind\n\nAgenda\nOne\nTwo');
  add('f-htm', 'page.htm', 'documents', '<title>Saved page</title><p>Hello <b>there</b></p><script>x()</script>');
  add('f-eml', 'old.eml', 'documents', 'From: Priya <priya.shah@northwind.example>\nSubject: Lunch\n\nSee you at noon. Write to boss@corp.com.');
  add('f-cer', 'root.cer', 'downloads');
  add('f-zip', 'photos.zip', 'documents');
  add('f-iso', 'setup.iso', 'downloads');
  add('f-doc', 'letter.docx', 'downloads', 'Dear Dana\nPlease sign.');
  const open = id => {
    const r = step(w, { kind: 'open-file', fileId: id });
    const win = r.world.windows.at(-1);
    assert.equal(win.app, 'program', `${id} opens in a program window`);
    return r.world.data.views[win.payload.view];
  };
  const csv = open('f-csv');
  assert.equal(csv.layout, 'sheet');
  assert.deepEqual(csv.sections[0].table, { columns: ['Region', 'Total'], rows: [['North', '120'], ['South', '1,400']] });
  assert.equal(open('f-xlsx').sections[0].table.columns[0], 'Line', 'a spreadsheet with no text gets a fictional table that fits its name');
  const xlsm = open('f-xlsm');
  assert.deepEqual(xlsm.pages.map(page => page.bar?.button ?? null), ['Enable Editing', 'Enable Content', null], 'a downloaded macro workbook: Protected View, then the macro bar');
  assert.deepEqual(open('f-pptx').pages.map(page => page.heading), ['Welcome', 'Agenda']);
  const htm = open('f-htm');
  assert.equal(htm.heading, 'Saved page');
  assert.match(htm.text, /Hello there/);
  assert.doesNotMatch(htm.text, /x\(\)/, 'scripts are dropped');
  const eml = open('f-eml');
  assert.equal(eml.heading, 'Lunch');
  assert.equal(eml.sections[0].rows[0][0], 'From', 'headers come first');
  assert.doesNotMatch(eml.sections.at(-1).text, /@corp\.com/, 'an address outside the fictional domains is defused');
  assert.equal(open('f-cer').layout, 'panel');
  assert.equal(open('f-zip').app, 'Archive');
  assert.equal(open('f-iso').app, 'Disc');
  const doc = open('f-doc');
  assert.equal(doc.pages[0].bar.button, 'Enable Editing', 'a Word file from the Internet opens in Protected View');
  // The same Word file kept in Documents is the user's own: it opens in the editor.
  w.fs.nodes['f-doc'].parentId = 'documents';
  assert.equal(step(w, { kind: 'open-file', fileId: 'f-doc' }).world.windows.at(-1).app, 'texteditor');
  assert.equal(step(w, { kind: 'open-file', fileId: 'f-dll' }).world.dialogs[0].kind, 'cant-open', 'a DLL still cannot open');
  // Scripts with no scene program: PowerShell opens in the editor, a batch file shows its commands in a console.
  add('f-ps1', 'fix.ps1', 'downloads', 'Get-Process');
  assert.equal(step(w, { kind: 'open-file', fileId: 'f-ps1' }).world.windows.at(-1).app, 'texteditor');
  add('f-bat', 'clean.bat', 'downloads', '@echo off\ndel /q %TEMP%\\*\nstart notepad');
  const bat = step(w, { kind: 'open-file', fileId: 'f-bat' });
  const con = bat.world.data.views[bat.world.windows.at(-1).payload.view];
  assert.equal(con.layout, 'console');
  assert.equal(con.lines[0], 'C:\\Users\\alex> del /q %TEMP%\\*'.replace('alex', w.user.short));
  assert.equal(bat.forward.kind, 'program-run');
  // A .reg file: Registry Editor's warning, then its success message.
  add('f-reg', 'fix.reg', 'downloads', 'Windows Registry Editor Version 5.00\n[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run]\n"Helper"="C:\\\\x.exe"');
  const reg = step(w, { kind: 'open-file', fileId: 'f-reg' });
  const regView = reg.world.data.views[reg.world.windows.at(-1).payload.view];
  assert.equal(regView.title, 'Registry Editor');
  assert.match(regView.pages[0].text, /Are you sure you want to continue\?/);
  assert.match(regView.pages[0].sections[0].code, /CurrentVersion\\Run/);
});

test('a program that adds itself to start-up raises the OS notice (Startup apps / Login Items)', () => {
  let r = step(world(), { kind: 'open-file', fileId: 'f-inv' });
  r = step(r.world, { kind: 'dialog-answer', id: r.world.dialogs[0].id, answer: 'run' });
  r = step(r.world, { kind: 'dialog-answer', id: r.world.dialogs[0].id, answer: 'run' });
  const notice = r.world.notifications.banners.find(item => item.title === 'New startup item: Svc');
  assert.ok(notice, 'banner shown');
  assert.equal(notice.app, 'settings');
  assert.match(notice.body, /invoice\.pdf added Svc/);
});

test('the guide says what to do next on each OS, and follows steps the trainee can play themselves', () => {
  const scene = `os windows
about
  | A demo.
program demo invoice.pdf
  prompt open-warning
  process demo.exe
step It arrives
  look Downloads
  | A file arrives.
file Downloads/invoice.pdf.exe
  icon pdf
  program demo
open Downloads
step The warning
  look the warning
  | Windows asks first.
open Downloads/invoice.pdf.exe
step It runs
  look Task Manager
  | It runs.
answer run
open taskmanager
lesson
  | Do not.`;
  const { guide } = compileScene(scene, { name: 'Demo' }, 'demo');
  assert.deepEqual(guide.steps.map(item => item.when ?? null), [null, { kind: 'prompt', ref: 'demo' }, { kind: 'run', ref: 'demo' }], 'triggers inferred from the gestures');
  assert.deepEqual(guide.steps[0].next, { windows: 'Double-click “invoice.pdf” in Downloads.', macos: 'Double-click “invoice.pdf.exe” in Downloads.' });
  assert.deepEqual(guide.steps[1].next, { windows: 'In the warning, click Run.', macos: 'In the warning, click Show what it does.' });
  assert.equal(guide.steps[2].next, null);
  // A fish desktop is lived in: real documents and a normal inbox.
  const setup = JSON.stringify(guide.setup);
  assert.match(setup, /Client contacts\.xlsx/);
  assert.match(setup, /Van lease/);
});

test('a firewall alert is a shared OS dialog: Allow or Cancel closes it, and both shells draw it', () => {
  const w = world();
  M.ops.pushDialog(w, { kind: 'firewall', fileId: 'f-bare' });
  assert.equal(M.validate(w).ok, true);
  const r = step(w, { kind: 'dialog-answer', id: w.dialogs[0].id, answer: 'cancel' });
  assert.equal(r.world.dialogs, undefined);
  const UI = createRequire(import.meta.url)('../ui/desktop/program-ui.js');
  assert.equal(typeof UI.appName, 'function');
  assert.equal(UI.appName('Spreadsheet', 'macos'), 'Numbers');
  assert.equal(UI.appName('Spreadsheet', 'windows'), 'Excel');
});

test('a dialog names a file\'s folder as each OS writes it: home, a lettered drive, a USB stick, a share', () => {
  const UI = createRequire(import.meta.url)('../ui/desktop/program-ui.js');
  const w = world();
  const short = w.user.short;
  const top = (id, name, drive, archive) => ({ id, parentId: 'root', name, kind: 'folder', mime: 'inode/directory', size: 0, modified: '2026-11-02T09:00:00Z', trashed: false, drive, archive });
  w.fs.nodes['d-c'] = top('d-c', 'Local Disk (C:)', 'C', 'share');
  w.fs.nodes['d-usb'] = top('d-usb', 'Kestrel Plans', 'KESTREL', 'usb');
  w.fs.nodes['d-net'] = top('d-net', 'Shared', 'fileserver', 'share');
  w.fs.nodes['tools'] = { ...file('tools', 'Tools'), parentId: 'd-c', kind: 'folder', mime: 'inode/directory' };
  const at = parentId => ({ parentId });
  assert.equal(UI.pathOf(w, w.fs.nodes['f-pdf'], 'windows'), `C:\\Users\\${short}\\Downloads`);
  assert.equal(UI.pathOf(w, w.fs.nodes['f-pdf'], 'macos'), `/Users/${short}/Downloads`);
  assert.equal(UI.pathOf(w, at('tools'), 'windows'), 'C:\\Tools');
  assert.equal(UI.pathOf(w, at('d-usb'), 'windows'), 'E:\\');
  assert.equal(UI.pathOf(w, at('d-usb'), 'macos'), '/Volumes/Kestrel Plans');
  assert.equal(UI.pathOf(w, at('d-net'), 'windows'), '\\\\fileserver\\');
  assert.equal(UI.pathOf(w, at('tools'), 'macos'), '/Volumes/Local Disk (C:)/Tools');
});

test('a Settings window can open on a shared pane (startup, privacy, network); no other app takes a pane', () => {
  let r = step(world(), { kind: 'open-app', app: 'settings', payload: { pane: 'startup' } });
  assert.deepEqual(r.world.windows.at(-1).payload, { pane: 'startup' });
  r = step(r.world, { kind: 'open-app', app: 'settings', payload: { pane: 'privacy' } });
  assert.equal(r.world.windows.filter(win => win.app === 'settings').length, 1, 'the one Settings window moves to the new pane');
  assert.deepEqual(r.world.windows.at(-1).payload, { pane: 'privacy' });
  assert.equal(M.applyIntent(world(), { kind: 'open-app', app: 'mail', payload: { pane: 'startup' } }, NOW).ok, false);
  assert.equal(M.applyIntent(world(), { kind: 'open-app', app: 'settings', payload: { pane: 'wallpaper' } }, NOW).ok, false);
  assert.deepEqual([...M.SETTINGS_PANES], ['startup', 'privacy', 'network']);
});
