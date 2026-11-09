import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createComparisonServer } from '../desktop-comparison/server.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ocean-fork-mount-'));
  for (const os of ['windows', 'macos']) {
    mkdirSync(join(root, os, 'assets'), { recursive: true });
    writeFileSync(join(root, os, 'index.html'), `<html><title>${os} candidate</title></html>`);
    writeFileSync(join(root, os, 'assets', 'shell.js'), `window.shell = '${os}';`);
    for (const folder of ['node_modules', 'sources', 'archive', 'check', 'test', 'tests', 'evidence', 'screenshots']) {
      mkdirSync(join(root, os, folder));
      writeFileSync(join(root, os, folder, 'private.json'), '{}');
    }
  }
  writeFileSync(join(root, 'outside.json'), '{"private":true}');
  return root;
}

test('local fork mounts use the same shell routes without exposing source trees or changing default previews', async () => {
  const root = fixture();
  const server = createComparisonServer({ shellRoots: { windows: join(root, 'windows'), macos: join(root, 'macos') } });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [os, name] of [['windows', 'win11-final'], ['macos', 'macos-final']]) {
      const response = await fetch(`${base}/previews/${name}/index.html`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), new RegExp(`${os} candidate`));
      assert.match(response.headers.get('content-security-policy'), /frame-src 'none'/);
      assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      const asset = await fetch(`${base}/previews/${name}/assets/shell.js`);
      assert.equal(asset.status, 200);
      assert.match(await asset.text(), new RegExp(os));
      for (const folder of ['node_modules', 'sources', 'archive', 'check', 'test', 'tests', 'evidence', 'screenshots']) {
        assert.equal((await fetch(`${base}/previews/${name}/${folder}/private.json`)).status, 404);
      }
    }
    assert.equal((await fetch(`${base}/previews/ocean-scenes.js`)).status, 200);
    assert.equal((await fetch(`${base}/outside.json`)).status, 404);
    assert.equal((await fetch(`${base}/previews/macos-final/index.html`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/previews/macos-final/..%2f..%2foutside.json`)).status, 404);
  } finally {
    server.closeAllConnections?.(); await new Promise(done => server.close(done));
  }
});

test('fork roots reject unknown OS names, relative paths and incomplete builds', () => {
  const root = fixture();
  assert.throws(() => createComparisonServer({ shellRoots: { linux: root } }), /only windows and macos/);
  assert.throws(() => createComparisonServer({ shellRoots: { windows: './relative' } }), /absolute local build/);
  assert.throws(() => createComparisonServer({ shellRoots: { windows: root } }), /ENOENT|regular index/);
});

test('a symlink cannot add a file outside the selected fork build', t => {
  const root = fixture();
  try { symlinkSync(join(root, 'outside.json'), join(root, 'windows', 'linked.json')); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('OS does not permit symlink creation'); throw error; }
  const server = createComparisonServer({ shellRoots: { windows: join(root, 'windows') } });
  return new Promise((resolve, reject) => server.listen(0, '127.0.0.1', async () => {
    try { assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/previews/win11-final/linked.json`)).status, 404); resolve(); }
    catch (error) { reject(error); }
    finally { server.closeAllConnections?.(); server.close(); }
  }));
});
