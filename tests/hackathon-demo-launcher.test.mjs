import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const launcher = readFileSync(new URL('../start-hackathon-demo.bat', import.meta.url), 'utf8');
const local = readFileSync(new URL('../deploy/local-wsl/start-local.sh', import.meta.url), 'utf8');

test('local upload launcher requires WSL/gVisor and clears cloud inference before starting', () => {
  assert.match(launcher, /^setlocal\s*$/m);
  assert.match(launcher, /127\.0\.0\.1:4173/);
  assert.match(launcher, /wsl -d detonation-ocean -u root -- bash -lc/);
  assert.match(launcher, /deploy\/local-wsl\/start-local\.sh/);
  assert.match(launcher, /execute inside the local gVisor sandbox/);
  assert.match(local, /deploy\/local-wsl\/check\.sh/);
  assert.match(local, /VULTR_\[A-Z_\]\*/);
  assert.match(local, /DETONATION_INFERENCE_ENABLED/);
  assert.match(local, /export DETONATION_ENABLED=true/);
  assert.match(local, /PORT="\$\{PORT:-4173\}" SHELLS_PORT="\$\{SHELLS_PORT:-4189\}"/);
  assert.match(local, /exec node tools\/start-desktops\.mjs/);
  assert.doesNotMatch(launcher, /(?:setx|taskkill|curl|Invoke-WebRequest|build\.mjs)/i);
});
