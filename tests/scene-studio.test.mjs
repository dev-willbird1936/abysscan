import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { compileAuthorScene, MAX_SOURCE_BYTES, STARTERS } from '../backend/scene-studio.mjs';
import { compileScene, sceneStartWorld } from '../backend/detonation/fish-scenes.mjs';
import { createSceneStudio } from '../tools/scene-studio.mjs';
const Model = createRequire(import.meta.url)('../ui/desktop/world-model.js');
const source = STARTERS[0].source;
const small = action => `title Example\nabout\n  | Fictional illustration.\nstep Change\n  look The desktop\n  | A visible change.\n${action}\nlesson\n  | Use caution.\n`;

for (const starter of STARTERS) test(`studio starter ${starter.id} compiles into valid shared worlds`, () => {
  const result = compileAuthorScene(starter.source);
  assert.equal(Model.validate(result.initialWorld).ok, true);
  assert.equal(result.initialWorld.phase, 'lock');
  assert.equal(result.steps.length, 2);
  let world = Model.createWorld(sceneStartWorld(), result.setup);
  for (const step of result.steps) { world = Model.createWorld(world, step.patch); assert.equal(Model.validate(world).ok, true); }
});

test('title, fictional user and theme configure lock and guide without changing the seed', () => {
  const before = JSON.stringify(sceneStartWorld());
  const result = compileAuthorScene(source);
  assert.equal(result.name, 'The unexpected invoice');
  assert.equal(result.initialWorld.user.name, 'Alex Rivera');
  assert.equal(result.initialWorld.user.short, 'alex');
  assert.equal(result.initialWorld.fs.nodes.home.name, 'alex');
  assert.equal(result.initialWorld.user.email, 'alex@northwind.example');
  assert.equal(result.initialWorld.sys.theme, 'dark');
  assert.equal(result.steps[0].patch.data.mail.messages.at(-1).to, 'alex@northwind.example');
  assert.equal(JSON.stringify(sceneStartWorld()), before);
  assert.equal(compileAuthorScene('\uFEFF' + source.replace(/\n/g, '\r\n')).name, result.name);
});

test('every canonical app can be opened by the same script', () => {
  for (const app of Model.CANONICAL_APPS) assert.equal(compileAuthorScene(small(`open ${app}`)).steps[0].patch.windows[0].app, app);
});

test('strict author validation rejects typos, unknown settings and ambiguous setup', () => {
  for (const [script, pattern] of [
    [source.replace('run invoice-helper', 'rn invoice-helper'), /script:\d+: unknown command "rn"/],
    [source.replace('cpu 68', 'cpo 68'), /unknown run setting "cpo"/],
    [source.replace('theme dark', 'theme purple'), /script:\d+: theme is light or dark/],
    [source.replace('theme dark', 'theme dark extra'), /wrong number of arguments/],
    [source.replace('theme dark', 'theme dark\n  | extra'), /does not take/],
    [source.replace('theme dark', 'theme dark\ntheme light'), /theme is repeated/],
    [source.replace('step The message arrives', 'theme light\nstep The message arrives'), /belongs before/],
    [source.replace('from Accounts', 'from Accounts\n  from Other'), /from is repeated/],
    [small('constructor'), /unknown command/], [small('__proto__'), /unknown command/],
    [source.replace('alex@northwind.example', 'alex@external.com'), /desktop refuses.*user/],
    [source + '\nopen files\n', /lesson must be the last/],
    [source.replace('  look Mail: the unexpected invoice\n', ''), /needs.*look/],
    [source.replace('open taskmanager', 'open Missing/file.txt'), /must be.*Desktop/],
  ]) assert.throws(() => compileAuthorScene(script), pattern);
});

test('missing guide copy, empty changes and bounded source fail without execution', () => {
  assert.throws(() => compileAuthorScene(''), /needs about/);
  assert.throws(() => compileAuthorScene('about\n  | Text\nlesson\n  | End'), /at least one step/);
  assert.throws(() => compileAuthorScene(small('')), /changes nothing/);
  assert.throws(() => compileAuthorScene(source.replace(/lesson[\s\S]+$/, '')), /needs a lesson/);
  assert.throws(() => compileAuthorScene('x'.repeat(MAX_SOURCE_BYTES + 1)), /64 KiB/);
  assert.throws(() => compileAuthorScene({}), /must be text/);
  assert.throws(() => compileAuthorScene('open files\n'.repeat(201)), /200 commands/);
  const run = compileAuthorScene(small('run echo NO_EXECUTION\nopen taskmanager'));
  assert.equal(run.steps[0].patch.data.processes.at(-1).name, 'echo NO_EXECUTION');
  assert.throws(() => compileScene('constructor'), /unknown command/);
});

async function withStudio(fn) {
  const server = createSceneStudio({ env: {}, shellRoots: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  try { await fn(base, post); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('studio validates, creates isolated immutable previews and serves configured lock world', async () => withStudio(async (base, post) => {
  const response = await post('/api/scene-studio/validate', { source });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).steps.length, 2);
  const one = await (await post('/api/scene-studio/preview', { source })).json();
  const two = await (await post('/api/scene-studio/preview', { source: STARTERS[1].source })).json();
  assert.notEqual(one.url, two.url);
  assert.match(one.url, /^\/desktop\.html\?job=author-[a-f0-9]{24}&os=windows$/);
  const run = new URL(one.url, base).searchParams.get('job');
  const guide = await (await fetch(`${base}/api/desktop/guide?run=${run}`)).json();
  assert.equal(guide.name, 'The unexpected invoice');
  assert.equal(guide.initialWorld.user.name, 'Alex Rivera');
  assert.equal((await fetch(base + '/api/desktop/guide?run=author-unknown')).status, 404);
}));

test('preview storage is capped without changing newer previews', async () => withStudio(async (base, post) => {
  const links = [];
  for (let i = 0; i < 21; i++) links.push((await (await post('/api/scene-studio/preview', { source })).json()).url);
  for (const [index, status] of [[0, 404], [20, 200]]) {
    const run = new URL(links[index], base).searchParams.get('job');
    assert.equal((await fetch(`${base}/api/desktop/guide?run=${run}`)).status, status);
  }
}));

test('local authoring boundary refuses foreign origins, oversized/malformed bodies and execution routes', async () => withStudio(async (base, post) => {
  assert.equal((await fetch(base, { headers: { Origin: 'https://foreign.example' } })).status, 403);
  const rawStatus = headers => new Promise((resolve, reject) => {
    const request = httpRequest(base, { headers }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(await rawStatus({ Host: 'foreign.example' }), 403);
  assert.equal(await rawStatus({ 'Sec-Fetch-Site': 'cross-site' }), 403);
  assert.equal((await fetch(base + '/api/scene-studio/templates', { headers: { Origin: 'null' } })).status, 403);
  assert.equal((await fetch(base + '/previews/macos-final/world-seed.js', { headers: { Origin: 'null' } })).status, 200);
  assert.equal((await post('/api/scene-studio/validate', { source, extra: true })).status, 400);
  assert.equal((await fetch(base + '/api/scene-studio/validate', { method: 'POST', body: source })).status, 415);
  assert.equal((await fetch(base + '/api/scene-studio/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await post('/api/scene-studio/validate', { source: 'x'.repeat(MAX_SOURCE_BYTES + 1) })).status, 422);
  assert.equal((await post('/api/scene-studio/validate', { source: 'x'.repeat(MAX_SOURCE_BYTES * 2) })).status, 413);
  for (const path of ['/api/desktop/sandbox/run', '/api/jobs', '/api/desktop/events?run=anything']) assert.equal((await post(path, {})).status, 405);
  assert.equal((await fetch(base + '/api/desktop/events?run=anything')).status, 404);
  assert.equal((await fetch(base + '/backend/scene-studio.mjs')).status, 404);
  const invalid = await post('/api/scene-studio/preview', { source: source.replace('cpu 68', 'cpo 68') });
  assert.equal(invalid.status, 422);
  assert.ok((await invalid.json()).line > 1);
}));

test('studio serves its editor, shared model and read-only desktop without exposing source', async () => withStudio(async base => {
  for (const path of ['/', '/studio.js', '/studio.css', '/world-model.js', '/desktop.html', '/api/desktop-templates/status']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
  }
  const html = await (await fetch(base)).text();
  assert.match(html, /id="source"/);
  assert.match(html, /id="preview"/);
  assert.match((await fetch(base)).headers.get('content-security-policy'), /script-src 'self';/);
  assert.equal((await fetch(base + '/api/jobs')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
}));

test('cloud/production mode cannot start an authoring host; no executable browser injection', () => {
  for (const env of [{ NODE_ENV: 'production' }, { DETONATION_PRODUCTION: 'true' }, { VULTR_SANDBOX_MODE: 'vultr' }, { VULTR_HACKATHON_MODE: 'true' }]) assert.throws(() => createSceneStudio({ env }), /local-only/);
  const ui = readFileSync(new URL('../ui/scene-studio/studio.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
});
