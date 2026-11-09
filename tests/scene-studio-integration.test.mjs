import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createAppServer } from '../server.mjs';
import { STARTERS } from '../backend/scene-studio.mjs';

const quietDetonation = () => ({ handle: async () => false, stop() {} });
async function serve(options, fn) {
  const server = createAppServer({ production: false, publicShells: false, templateShellsEnabled: true,
    sceneStudioEnabled: false, detonation: quietDetonation(), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const post = (base, path, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ source: STARTERS[0].source }) });
const raw = (url, method, headers, value) => new Promise((resolve, reject) => {
  const body = value === undefined ? null : JSON.stringify(value);
  const request = httpRequest(url, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) } }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString() }));
  });
  request.on('error', reject); request.end(body);
});

test('normal app keeps authoring off unless explicitly enabled', async () => serve({}, async base => {
  assert.equal((await fetch(base + '/scene-studio')).status, 404);
  assert.equal((await post(base, '/api/scene-studio/preview')).status, 404);
  assert.doesNotMatch(await (await fetch(base)).text(), /href="\/scene-studio"/);
}));

test('enabled app serves the real theme, navigation, docs and preview compiler', async () => serve({ sceneStudioEnabled: true }, async base => {
  for (const page of ['/', '/about', '/bestiary']) assert.match(await (await fetch(base + page)).text(), /href="\/scene-studio"/);
  const html = await (await fetch(base + '/scene-studio')).text();
  assert.match(html, /class="pg studio"/);
  assert.match(html, /class="pg-bar"/);
  assert.match(html, /href="\/ui\/abyss\/retro-pixel.css"/);
  assert.match(html, /Jersey10-Regular.woff/);
  assert.equal((await fetch(base + '/scene-studio/studio.css')).status, 200);
  assert.equal((await fetch(base + '/scene-studio/studio.js')).status, 200);
  const help = await fetch(base + '/scene-studio/help');
  assert.match(help.headers.get('content-type'), /text\/html/);
  const guideHtml = await help.text();
  assert.match(guideHtml, /<title>Scene Studio guide/);
  assert.match(guideHtml, /class="pg-bar"/);
  assert.match(guideHtml, /href="\/scene-studio"/);
  assert.equal((await fetch(base + '/ui/abyss/fonts/Jersey10-Regular.woff')).status, 200);
  const result = await post(base, '/api/scene-studio/preview');
  assert.equal(result.status, 201);
  const { url } = await result.json();
  const run = new URL(url, base).searchParams.get('job');
  const guide = await (await fetch(base + `/api/desktop/guide?run=${run}`)).json();
  assert.equal(guide.initialWorld.user.name, 'Alex Rivera');
  assert.equal(guide.steps.length, 2);
  assert.equal((await post(base, '/api/scene-studio/validate', { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await post(base, '/api/scene-studio/validate', { Origin: 'null' })).status, 403);
  assert.equal((await fetch(base + '/scene-studio', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
}));

test('production integration requires public origin and enabled shells', () => {
  assert.throws(() => createAppServer({ production: true, publicShells: false, templateShellsEnabled: true,
    sceneStudioEnabled: true, detonation: quietDetonation() }), /requires enabled desktop shells/);
  assert.throws(() => createAppServer({ production: true, publicShells: true, sceneStudioEnabled: true,
    publicOrigin: undefined, detonation: quietDetonation() }), /requires APP_PUBLIC_ORIGIN/);
});

test('production-like host validates exact HTTPS origin behind the loopback proxy', async () => serve({ production: true,
  publicShells: true, sceneStudioEnabled: true, publicOrigin: 'https://demo.abysscan.com' }, async base => {
  const headers = { Host: 'demo.abysscan.com', Origin: 'https://demo.abysscan.com' };
  const allowed = await raw(base + '/api/scene-studio/preview', 'POST', headers, { source: STARTERS[1].source });
  assert.equal(allowed.status, 201);
  const { url } = JSON.parse(allowed.text);
  const run = new URL(url, base).searchParams.get('job');
  assert.equal((await raw(base + '/api/desktop/guide?run=' + run, 'GET', { Host: headers.Host })).status, 200);
  assert.equal((await raw(base + '/scene-studio', 'GET', { Host: headers.Host })).status, 200);
  assert.equal((await raw(base + '/api/scene-studio/validate', 'POST', { ...headers, Origin: 'https://evil.example' }, { source: STARTERS[0].source })).status, 403);
  assert.equal((await raw(base + '/api/scene-studio/validate', 'POST', { ...headers, Host: 'evil.example' }, { source: STARTERS[0].source })).status, 403);
  assert.equal((await raw(base + '/api/scene-studio/validate', 'POST', { ...headers, 'Sec-Fetch-Site': 'cross-site' }, { source: STARTERS[0].source })).status, 403);
}));
