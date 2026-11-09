// Quests (docs/desktop-parity/QUESTS.md) in the shared world: typed sign-in forms, sessions behind a sign-in, a keylogger
// that records what is typed, the trainee's flags, the task counter and the ocean keys both shells use to point at things.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compileScene, sceneSource } from '../backend/detonation/fish-scenes.mjs';

const M = createRequire(import.meta.url)('../ui/desktop/world-model.js');
const seed = JSON.parse(readFileSync(new URL('../data/desktop-world-seed.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-02T10:00:00Z');

function world() {
  const w = { ...M.createWorld(seed), phase: 'desktop' };
  w.data.web = { pages: {
    login: { title: 'Bank: sign in', url: 'bank.example/sign-in', heading: 'Sign in', body: 'Welcome back.',
      fields: [{ label: 'User ID', value: 'dana' }, { label: 'Password', value: 'pw1', secret: true }],
      choices: [{ label: 'Sign in', choiceId: 'login-1', style: 'primary' }] },
    inv: { title: 'Approve payment', url: 'bank.example/pay/1', heading: 'Approve', body: 'A payment.', requires: 'login',
      choices: [{ label: 'Approve', choiceId: 'inv-1', style: 'primary', goto: 'paid' }, { label: 'Reject', choiceId: 'inv-2', goto: 'held' }] },
    paid: { title: 'Payment approved', url: 'bank.example/pay/done', body: 'Approved.', choices: [] },
    held: { title: 'Payment held', url: 'bank.example/pay/held', body: 'Held.', choices: [] },
  } };
  w.data.quota = { label: 'Invoices approved today', done: 8, total: 10 };
  return w;
}
function step(w, intent) {
  const result = M.applyIntent(w, intent, NOW);
  assert.equal(result.ok, true, `${intent.kind}: ${result.reason}`);
  assert.equal(M.validate(result.world).ok, true);
  return result;
}
const typeAll = (w, page, field, n) => { for (let k = 0; k < n; k++) w = step(w, { kind: 'page-type', page, field }).world; return w; };

test('a page behind a sign-in shows the sign-in page, titled as such, until the trainee signs in', () => {
  let w = world();
  assert.equal(M.shownPage(w, 'inv'), 'login');
  const opened = step(w, { kind: 'open-app', app: 'browser', payload: { url: 'scene:inv' } });
  assert.deepEqual(opened.forward, { kind: 'page-open', page: 'inv', shown: 'login' });
  w = opened.world;
  assert.equal(w.data.browser.tabs.find(tab => tab.url === 'scene:inv').title, 'Bank: sign in');
  // The form must be filled before Sign in does anything.
  assert.equal(M.applyIntent(w, { kind: 'scene-choice', choiceId: 'login-1' }, NOW).reason, 'form-incomplete');
  w = typeAll(w, 'login', 0, 4);
  w = typeAll(w, 'login', 1, 3);
  assert.equal(M.formComplete(w, 'login'), true);
  assert.equal(M.applyIntent(w, { kind: 'page-type', page: 'login', field: 1 }, NOW).changed, false, 'a full box takes no more keys');
  w = step(w, { kind: 'scene-choice', choiceId: 'login-1' }).world;
  assert.deepEqual(w.data.web.sessions, ['login']);
  assert.equal(M.shownPage(w, 'inv'), 'inv');
  assert.equal(w.data.browser.tabs.find(tab => tab.url === 'scene:inv').title, 'Approve payment');
  // Approve follows its goto in the active tab.
  w = step(w, { kind: 'scene-choice', choiceId: 'inv-1' }).world;
  const active = w.data.browser.tabs.find(tab => tab.id === w.data.browser.activeTabId);
  assert.deepEqual([active.url, active.title], ['scene:paid', 'Payment approved']);
});

test('typing while a keylogger runs counts what is sent and records each finished box', () => {
  let w = world();
  w = typeAll(w, 'login', 0, 2);
  assert.equal(w.data.net, undefined, 'nothing is sent without a keylogger');
  w.data.processes = [{ id: 'p-zeus', name: 'sdra64.exe', cpu: 1, mem: 10, keylog: true }];
  assert.equal(M.validate(w).ok, true);
  const last = step(typeAll(w, 'login', 0, 2), { kind: 'page-type', page: 'login', field: 1 });
  assert.equal(last.forward.logged, true);
  w = typeAll(last.world, 'login', 1, 2);
  assert.equal(w.data.net.sent, 5);
  assert.deepEqual(w.data.captured, [{ label: 'User ID', value: 'dana' }, { label: 'Password', value: 'pw1' }]);
});

test('flags are the trainee\'s own keys: placed once, removable, and only for real ocean keys', () => {
  let w = world();
  w = step(w, { kind: 'flag', key: 'file:fs-invoice', label: 'invoice.pdf', on: true }).world;
  assert.equal(M.applyIntent(w, { kind: 'flag', key: 'file:fs-invoice', label: 'invoice.pdf', on: true }, NOW).changed, false);
  w = step(w, { kind: 'flag', key: 'field:login:1', label: 'Password', on: true }).world;
  assert.deepEqual(w.data.flags.map(item => item.key), ['file:fs-invoice', 'field:login:1']);
  w = step(w, { kind: 'flag', key: 'file:fs-invoice', label: 'invoice.pdf', on: false }).world;
  assert.deepEqual(w.data.flags.map(item => item.key), ['field:login:1']);
  for (const key of ['Field:login:1', 'x', 'file:', 'app:<b>', 'page:"x"']) assert.equal(M.isKey(key), false, key);
  for (const key of ['app:mail', 'mail:m-1', 'section:login:0', 'dialog:open-warning:zeus', 'dialog-btn:run', 'net']) assert.equal(M.isKey(key), true, key);
});

test('Remove in the antivirus alert trashes the file and tells the guide (when remove)', () => {
  let w = world();
  w.fs.nodes['f-test'] = { id: 'f-test', parentId: 'downloads', name: 'eicar.com', kind: 'file', mime: 'application/octet-stream', size: 68, modified: '2026-11-02T09:00:00Z', trashed: false, program: 'eicar' };
  w.data.programs = { eicar: { name: 'eicar.com', publisher: null, signed: false, prompts: [], detected: 'EICAR_Test_File' } };
  const opened = step(w, { kind: 'open-file', fileId: 'f-test' });
  assert.equal(opened.forward.kind, 'program-detected');
  const alert = opened.world.dialogs.find(item => item.kind === 'detected');
  const removed = step(opened.world, { kind: 'dialog-answer', id: alert.id, answer: 'trash' });
  assert.deepEqual(removed.forward, { kind: 'program-removed', programId: 'eicar', fileId: 'f-test' });
  assert.equal(removed.world.fs.nodes['f-test'].trashed, true);
});

test('scene language: spotted renames the grade, sent dates a mail, when remove follows the antivirus alert', () => {
  const zeus = sceneSource('zeus');
  assert.equal(compileScene(zeus.replace(/^story$/m, 'spotted signs it was only a test\nstory'), { name: 'Zeus' }, 'zeus').guide.spotted, 'signs it was only a test');
  const dated = compileScene(zeus.replace(/^(mail mail-2209\n)/m, '$1  sent 2026-10-30 09:12\n'), { name: 'Zeus' }, 'zeus');
  assert.equal(dated.world.data.mail.messages.find(item => item.id === 'm-mail-2209').time, '2026-10-30T09:12:00Z');
  assert.throws(() => compileScene(zeus.replace(/^(mail mail-2209\n)/m, '$1  sent next week\n'), { name: 'Zeus' }, 'zeus'), /sent is/);
  const source = [
    'story', '  | You are Dana, testing the antivirus.', 'quota 1 2 Checks done', 'about', '  | A harmless test file.',
    'program eicar', '  name eicar.com', '  detected EICAR_Test_File',
    'step It arrives', '  look Downloads', '  | The test file arrives.', 'file Downloads/eicar.com', '  program eicar', 'open Downloads',
    'step The alert', '  look the alert', '  | The antivirus names it.', 'open Downloads/eicar.com',
    'step Remove it', '  look Downloads', '  when remove eicar', '  | It goes to the bin.', 'answer trash', 'open Downloads',
    'lesson', '  | A test alert means the antivirus works.',
  ].join('\n');
  const compiled = compileScene(source, { name: 'EICAR' }, 'eicar-probe');
  assert.deepEqual(compiled.guide.steps[2].when, { kind: 'remove', ref: 'eicar' });
  const looked = compileScene(source.replace('  when remove eicar', '  when open taskmanager'), { name: 'EICAR' }, 'eicar-probe');
  assert.equal(looked.guide.steps[2].when.kind, 'open');
  assert.throws(() => compileScene(source.replace('  when remove eicar', '  when open taskmanager:startup'), { name: 'EICAR' }, 'eicar-probe'), /when open/);
  // flag notice: a banner the scene raised, by app and words of its title.
  const noticed = compileScene(source.replace('lesson', 'block cdn.invalid 443\nflag hard notice taskmanager connection blocked\n  | It tried to call home.\nlesson'), { name: 'EICAR' }, 'eicar-probe');
  assert.match(noticed.guide.flags.at(-1).key, /^notification:fs-n-\d+$/);
  assert.throws(() => compileScene(source.replace('lesson', 'flag hard notice mail nothing like this\n  | x\nlesson'), { name: 'EICAR' }, 'eicar-probe'), /flag notice/);
  // flag line / flag view: one line of a program window, or the window as a whole.
  const viewed = [
    'about', '  | A skimmer.', 'view net console', '  title Network', '  line GET shop.example/pay 200', '  line POST collect.invalid/c 200 (card number)',
    'step One', '  look the log', '  | Look.', 'show net',
    'flag hard line net collect.invalid', '  | Card data sent to a site that is not the shop.',
    'flag hard view net', '  | The log shows the skimmer.',
    'lesson', '  | Done.',
  ].join('\n');
  const flags = compileScene(viewed, { name: 'Probe' }, 'probe').guide.flags;
  assert.deepEqual(flags.map(flag => flag.key), ['line:net:0.1', 'view:net']);
  assert.equal(flags[1].label, 'The “Network” window');
  assert.throws(() => compileScene(viewed.replace('flag hard view net', 'flag hard view nowhere'), { name: 'Probe' }, 'probe'), /flag view/);
});

test('opening an app tells a waiting guide, even when it is already open', () => {
  let w = world();
  const first = step(w, { kind: 'open-app', app: 'taskmanager' });
  assert.deepEqual(first.forward, { kind: 'app-open', app: 'taskmanager' });
  const again = M.applyIntent(first.world, { kind: 'open-app', app: 'taskmanager' }, NOW);
  assert.equal(again.forward?.kind, 'app-open');
  assert.deepEqual(step(first.world, { kind: 'open-app', app: 'settings', payload: { pane: 'startup' } }).forward, { kind: 'app-open', app: 'settings', pane: 'startup' });
});

test('the task counter, cue and effects level are validated world and scene data', () => {
  const w = world();
  assert.equal(M.validate(w).ok, true);
  assert.equal(M.validate({ ...w, data: { ...w.data, quota: { label: 'x', done: 11, total: 10 } } }).ok, false, 'done never passes total');
  assert.equal(M.validate({ ...w, data: { ...w.data, captured: [{ label: 'PIN', value: 7 }] } }).ok, false);
});
