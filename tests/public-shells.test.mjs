import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createAppServer } from '../server.mjs';

async function withServer(options, run) {
  const server = createAppServer({ production: true, ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
}
const get = async (base, path, init) => { const response = await fetch(base + path, init); const body = Buffer.from(await response.arrayBuffer()); return { response, body }; };
const mountOf = async base => (await (await fetch(`${base}/api/desktop-templates/status`)).json()).shellOrigin;
const previews = name => readdirSync(new URL(`../desktop-comparison/previews/${name}`, import.meta.url));

test('production without the public switch keeps the shells off', async () => {
  await withServer({ publicShells: false }, async base => {
    const status = await (await fetch(`${base}/api/desktop-templates/status`)).json();
    assert.equal(status.enabled, false);
    assert.equal(status.shellOrigin, undefined);
    assert.equal((await get(base, '/previews/win11-final/index.html')).response.status, 404);
    assert.equal((await get(base, '/s/anything-at-all-xxxxxxxx/previews/win11-final/index.html')).response.status, 404);
  });
});

test('the public switch serves both final shells under an unguessable path on this origin', async () => {
  await withServer({ publicShells: true }, async base => {
    const status = await (await fetch(`${base}/api/desktop-templates/status`)).json();
    assert.equal(status.enabled, true);
    assert.match(status.shellOrigin, /^\/s\/[A-Za-z0-9_-]{32}$/, 'a path on this origin, with a 32-character token');
    assert.deepEqual(status.osModes, ['win11-final', 'macos-final']);
    const mount = status.shellOrigin;
    for (const page of ['/previews/win11-final/index.html', '/previews/macos-final/index.html']) {
      const { response, body } = await get(base, `${mount}${page}?oceanShell=1`);
      assert.equal(response.status, 200, page);
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'(;|$)/);
      assert.doesNotMatch(response.headers.get('content-security-policy'), /127\.0\.0\.1/);
      assert.match(response.headers.get('content-security-policy'), /frame-src 'none'/);
      assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
      assert.equal(response.headers.get('access-control-allow-origin'), '*', 'the sandboxed frame fetches its own files cross-origin');
      assert.ok(body.length > 200);
    }
    // The shells are reachable only on the token path.
    assert.equal((await get(base, '/previews/win11-final/index.html')).response.status, 404);
    // The page that frames them allows only this origin.
    const desktop = await get(base, '/desktop.html');
    assert.match(desktop.response.headers.get('content-security-policy'), /frame-src 'self'(;|$)/);
    assert.doesNotMatch(desktop.response.headers.get('content-security-policy'), /127\.0\.0\.1:\d+/);
    for (const script of ['/ocean-scenes.js', '/ocean-fx.js', '/ocean-scenarios/trench.js']) assert.equal((await get(base, script)).response.status, 200, script);
  });
});

test('the token is required, and every asset a shell page names is served on it', async () => {
  await withServer({ publicShells: true }, async base => {
    const mount = await mountOf(base);
    const wrong = mount.slice(0, -1) + (mount.endsWith('a') ? 'b' : 'a');
    for (const bad of [wrong, '/s/short', '/s/', '/s', '/s/' + 'x'.repeat(32), '/s/' + 'x'.repeat(200)]) {
      assert.equal((await get(base, `${bad}/previews/win11-final/index.html`)).response.status, 404, bad);
    }
    for (const file of previews('win11-final/assets').filter(name => /\.(js|css)$/.test(name))) assert.equal((await get(base, `${mount}/previews/win11-final/assets/${file}`)).response.status, 200, file);
    for (const file of previews('macos-final/assets').filter(name => /\.(js|css)$/.test(name))) assert.equal((await get(base, `${mount}/previews/macos-final/assets/${file}`)).response.status, 200, file);
    // A name with spaces and an ampersand, as the settings images have, is found however the browser encodes it.
    const odd = existsSync(new URL('../desktop-comparison/previews/win11-final/img/settings', import.meta.url)) ? previews('win11-final/img/settings').find(name => name.includes('&')) : undefined; // the artwork is withheld from the public repository
    if (odd) for (const path of [`/previews/win11-final/img/settings/${encodeURIComponent(odd)}`, `/previews/win11-final/img/settings/${odd.replaceAll(' ', '%20')}`]) {
      assert.equal((await get(base, mount + path)).response.status, 200, path);
    }
  });
});

test('nothing outside the shells is served on the token path', async () => {
  await withServer({ publicShells: true }, async base => {
    const mount = await mountOf(base);
    for (const path of [
      '/previews/macos-final/README.md', '/previews/macos-final/check/polish.mjs', '/previews/macos-final/check/', '/previews/win11-final/', '/previews/',
      '/previews/win11-final/../../server.mjs', '/previews/win11-final/%2e%2e/%2e%2e/server.mjs', '/previews/win11-final/..%2f..%2fserver.mjs',
      '/desktop-comparison/server.mjs', '/previews/archive/x.html', '/api/health', '/server.mjs', '/ui/abyss/index.html', '/previews/ocean-scenes.js',
    ]) {
      const { response } = await get(base, mount + path);
      assert.ok([400, 404].includes(response.status), `${path} -> ${response.status}`);
    }
    assert.equal((await get(base, `${mount}/previews/win11-final/index.html`, { method: 'POST' })).response.status, 404);
    assert.equal((await get(base, `${mount}/previews/win11-final/index.html`, { method: 'OPTIONS' })).response.status, 204);
    assert.equal((await get(base, '/api/desktop-templates/status')).response.headers.get('access-control-allow-origin'), null, 'CORS only on shell files');
  });
});

test('the token changes with every start and is not in any other response', async () => {
  let first, second;
  await withServer({ publicShells: true }, async base => { first = await mountOf(base); });
  await withServer({ publicShells: true }, async base => {
    second = await mountOf(base);
    const home = (await get(base, '/')).body.toString('utf8') + (await get(base, '/desktop.html')).body.toString('utf8') + JSON.stringify([...(await get(base, '/api/health')).response.headers]);
    assert.ok(!home.includes(second.slice(3)), 'the token is only in the status answer');
  });
  assert.notEqual(first, second);
});

test('the public switch is ignored in hackathon-controller mode', async () => {
  await withServer({ publicShells: true, hackathonControllerMode: true }, async base => {
    assert.equal((await (await fetch(`${base}/api/desktop-templates/status`)).json()).enabled, false);
    assert.equal((await get(base, '/s/' + 'x'.repeat(32) + '/previews/win11-final/index.html')).response.status, 404);
  });
});

// A same-origin GET carries no Origin header; fetch() cannot set Host, so this talks HTTP directly.
const rawGet = (base, path, headers) => new Promise((resolve, reject) => {
  const req = httpRequest(base + path, { headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject); req.end();
});

test('the fish guide and the event stream read from the page itself on the public host, and from nowhere else', async () => {
  await withServer({ publicShells: true, publicOrigin: 'https://demo.example' }, async base => {
    const guide = '/api/desktop/guide?run=fish-b21';
    assert.equal(await rawGet(base, guide, { Host: 'demo.example' }), 200, 'same-origin GET: no Origin, the public Host');
    assert.equal(await rawGet(base, guide, { Host: 'demo.example', Origin: 'https://demo.example' }), 200);
    assert.equal(await rawGet(base, guide, { Host: 'demo.example', Origin: 'https://evil.example' }), 403, 'a foreign origin is refused');
    assert.equal(await rawGet(base, guide, { Host: 'evil.example' }), 403, 'no Origin and a foreign Host is refused');
  });
});
