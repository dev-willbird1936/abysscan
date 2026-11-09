import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAbyssAssets } from '../backend/abyss-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../ui/abyss/manifest.json', import.meta.url), 'utf8'));

test('renderer hashes and text checkout bytes match the Git line-ending policy', () => {
  assert.equal(loadAbyssAssets(root).size, manifest.files.length);
  const paths = manifest.files.map(file => file.path).filter(path => /\.(?:css|html|js|json|txt)$/.test(path));
  const check = spawnSync('git', ['check-attr', '--stdin', '-z', 'eol'], {
    cwd: root, input: Buffer.from(`${paths.join('\0')}\0`), maxBuffer: 1024 * 1024,
  });
  assert.equal(check.status, 0, check.stderr?.toString());
  const entries = check.stdout.toString().split('\0');
  assert.equal(entries.length, paths.length * 3 + 1);
  for (let i = 0; i < paths.length; i++) {
    const [path, attribute, eol] = entries.slice(i * 3, i * 3 + 3);
    assert.equal(path, paths[i]);
    assert.equal(attribute, 'eol');
    const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    if (eol === 'lf') assert.ok(!text.includes('\r\n'), `${path}: checkout converts CRLF to LF`);
    else if (eol === 'crlf') assert.ok(!/(^|[^\r])\n/.test(text), `${path}: checkout converts LF to CRLF`);
    else assert.fail(`${path}: explicit eol policy required`);
  }
});
