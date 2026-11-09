import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rootUrl = new URL('../', import.meta.url);

function git(args) {
  const run = spawnSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr?.toString());
  return run.stdout.toString().split('\0').filter(Boolean);
}

// Every path Git would show: tracked plus untracked-but-not-ignored.
const visible = [...git(['ls-files', '-z']), ...git(['ls-files', '--others', '--exclude-standard', '-z'])];

const isEmpty = path => {
  const stat = statSync(new URL(encodeURI(path), rootUrl), { throwIfNoEntry: false });
  return stat?.isFile() && stat.size === 0;
};

// Quoting, braces and redirections, but NOT parentheses or commas: generated
// depth masks are legitimately named "viperfish-trench-(52, 74, 93).png".
const SHELL_CHARS = /[{}'"<>|*?$\\]/;

// Running a JS one-liner through a shell turns `>`, `{` and quotes into
// redirections and globs, dropping fragments of the snippet into the tree as
// empty files: "{const", "x.app", "desktop-comparison/0", "src/{".
// Match on the signature rather than on emptiness alone, so an intentional
// placeholder or a run that produced no log output does not fail the suite.
test('no shell-redirection debris in the tree', () => {
  const debris = visible.filter(path => {
    const name = path.split('/').pop();
    if (name === '.keep' || name === '.gitkeep') return false;
    if (!isEmpty(path)) return false;
    return SHELL_CHARS.test(name) || /^\d+$/.test(name) || !name.includes('.');
  });
  assert.deepEqual(debris, [], `empty files from shell quoting accidents; delete them: ${debris.join(', ')}`);
});

// These break checkout, archiving and tooling on Windows even when non-empty.
test('no paths carrying shell metacharacters', () => {
  const bad = visible.filter(path => SHELL_CHARS.test(path) || /[ .]$/.test(path.split('/').pop()));
  assert.deepEqual(bad, [], `paths unusable on Windows or born of shell quoting: ${bad.join(', ')}`);
});

// .tmp-review holds contact sheets, recordings and md5 logs - over a gigabyte.
// docs/evidence cites paths inside it, but committing it would bloat the repo,
// so the ignore rule is load-bearing and `git add -A` must stay safe.
test('scratch review output stays ignored', () => {
  for (const path of ['.tmp-review/rec/loop6.mp4', '.tmp-review/pixelfx-demo.mp4']) {
    const run = spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root });
    assert.equal(run.status, 0, `${path} is not ignored: a stray "git add -A" would commit scratch media`);
  }
});
