import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootUrl = new URL('../', import.meta.url);
const root = fileURLToPath(rootUrl);
const manifest = JSON.parse(readFileSync(new URL('package.json', rootUrl), 'utf8'));
const scripts = manifest.scripts ?? {};
const entries = Object.entries(scripts);

const resolveRepo = path => fileURLToPath(new URL(path, rootUrl));

// A token is a repo path if it carries a known source extension. Globs are
// checked by their directory instead, and flags/arguments are ignored.
const SOURCE = /\.(mjs|js|py|json|sh|cjs)$/;
const tokensOf = script => script.split(/\s+/).map(t => t.replace(/^"|"$/g, '')).filter(Boolean);

// package.json is the only discoverable entry point into ~90 test files, 12 e2e
// harnesses and ~40 build tools. A script naming a file that has been renamed or
// deleted is worse than no script at all: it sends an agent down a dead end and
// reports a failure that has nothing to do with the change under test.
test('every file a script names still exists', () => {
  const missing = [];
  for (const [name, script] of entries) {
    for (const token of tokensOf(script)) {
      if (!SOURCE.test(token) || token.includes('*')) continue;
      if (!existsSync(resolveRepo(token))) missing.push(`${name} -> ${token}`);
    }
  }
  assert.deepEqual(missing, [], `package.json scripts name files that are gone; fix or drop the script: ${missing.join(', ')}`);
});

test('every glob a script uses sits in a real directory and matches at least one file', () => {
  const broken = [];
  for (const [name, script] of entries) {
    for (const token of tokensOf(script)) {
      if (!token.includes('*')) continue;
      const cut = token.lastIndexOf('/');
      // A bare pattern with no directory resolves against the repo root.
      const dir = cut === -1 ? '.' : token.slice(0, cut);
      const stat = statSync(resolveRepo(dir), { throwIfNoEntry: false });
      if (!stat?.isDirectory()) { broken.push(`${name} -> ${token} (no such directory)`); continue; }
      // An empty match is the failure that matters: `npm test` would exit 0
      // having run nothing at all.
      const pattern = token.slice(cut + 1);
      const re = new RegExp(`^${pattern.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      if (!readdirSync(resolveRepo(dir)).some(entry => re.test(entry))) broken.push(`${name} -> ${token} (matches nothing)`);
    }
  }
  assert.deepEqual(broken, [], `globs that are missing or match nothing: ${broken.join(', ')}`);
});

// tools/CHECKS.md is the prose half of the same surface. A script renamed in
// package.json leaves the doc telling an agent to run a command that no longer
// exists, which is the exact dead end the manifest was added to remove.
test('every npm script named in tools/CHECKS.md exists', () => {
  const doc = readFileSync(new URL('tools/CHECKS.md', rootUrl), 'utf8');
  const named = [...doc.matchAll(/npm run ([a-z0-9:-]+)/g)].map(m => m[1]);
  assert.ok(named.length > 5, 'the doc should still be naming scripts; did it move?');
  const unknown = [...new Set(named)].filter(name => !(name in scripts));
  assert.deepEqual(unknown, [], `tools/CHECKS.md names scripts that package.json does not define: ${unknown.join(', ')}`);
});

// Load-bearing omission. Several UMD files are .js and are loaded by Node
// through createRequire: ui/desktop/world-model.js, desktop-model.js,
// scene-world.js, program-ui.js, ui/bestiary/render.js. world-model.js is the
// one the backend depends on (backend/detonation/fish-scenes.mjs, replay.mjs,
// desktop-world-events.mjs, desktop-world-source.mjs, scene-studio.mjs), and it
// exports through `if (typeof module !== 'undefined' && module.exports)`.
// Under "type": "module" that guard is false, so on Node >= 22.12 the require
// succeeds but yields an empty namespace and the failure surfaces much later as
// `createWorld is not a function`. The .mjs files gain nothing either way.
test('package.json declares no module type', () => {
  assert.equal('type' in manifest, false, 'adding "type" reinterprets every .js file in the repo; the UMD exports in ui/desktop/world-model.js would silently export nothing');
  assert.equal(manifest.private, true, 'this repo is never published');
});

// Node expands the --test glob itself from v22; sh and cmd must not get the
// chance to, which is why the pattern stays quoted in the script.
test('the test scripts rely on a Node version that expands globs', () => {
  const major = Number(process.versions.node.split('.')[0]);
  assert.ok(major >= 22, `Node ${process.versions.node} predates native --test glob expansion`);
  assert.match(manifest.engines?.node ?? '', />=\s*2[2-9]/, 'engines.node must record the glob requirement');
  assert.match(scripts.test ?? '', /"tests\/\*\.test\.mjs"/, 'the glob stays quoted so Node, not the shell, expands it');
});

// `npm run check` is the broadest single command, but it deliberately omits
// test:py, so tools/CHECKS.md has to keep saying so.
test('check runs both halves and its Python gap stays documented', () => {
  const doc = readFileSync(new URL('tools/CHECKS.md', rootUrl), 'utf8');
  assert.match(doc, /does not cover it/, 'the doc must keep warning that check excludes test:py');
  assert.match(doc, /test:py/, 'the doc must name the script that covers the gap');
  const check = scripts.check ?? '';
  assert.match(check, /node --test/, 'check must run the Node suite');
  assert.match(check, /check-fish-scenes/, 'check must also compile every scene');
  assert.match(check, /&&/, 'check must fail fast rather than mask a failing half');
});

test('no script shells out to anything but node, npm or python', () => {
  const odd = entries.filter(([, script]) => !script.split('&&').every(part => /^\s*(node|npm|python)\b/.test(part)));
  assert.deepEqual(odd.map(([name]) => name), [], 'scripts stay portable: no shell builtins, no bash-only syntax');
});
