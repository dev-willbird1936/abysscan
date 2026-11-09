// Plays every quest (a scene with a `story`) with quest-play-e2e.mjs on both OSes, a few at a time, and writes a summary.
// Each lane gets its own port pair, so lanes never share a server. Screenshots go to SHOTS_DIR/<scene>/.
// Usage: node tools/e2e/quest-sweep.mjs [--lanes 3] [--port 4700] [scene ...]   (default: every quest)
// Output: SHOTS_DIR/quest-sweep.json and one line per scene: PASS/FAIL, steps by gesture, flags placed.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const at = argv.indexOf(name); return at >= 0 ? Number(argv.splice(at, 2)[1]) : fallback; };
const lanes = opt('--lanes', 3);
const portBase = opt('--port', 4700);
const OUT = resolve(process.env.SHOTS_DIR ?? join(ROOT, 'tools/e2e/shots'));
mkdirSync(OUT, { recursive: true });
const quests = readdirSync(join(ROOT, 'data/fish-scenes')).filter(file => file.endsWith('.scene'))
  .filter(file => /^story$/m.test(readFileSync(join(ROOT, 'data/fish-scenes', file), 'utf8'))).map(file => file.slice(0, -6));
const queue = argv.length ? argv.filter(scene => quests.includes(scene)) : quests;
const results = {};

function play(scene, port) {
  return new Promise(done => {
    const dir = join(OUT, scene);
    mkdirSync(dir, { recursive: true });
    const child = spawn(process.execPath, ['tools/e2e/quest-play-e2e.mjs', scene, 'both'], {
      cwd: ROOT, env: { ...process.env, SHOTS_DIR: dir, E2E_PARENT_PORT: String(port), E2E_SHELLS_PORT: String(port + 1) } });
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    const timer = setTimeout(() => child.kill(), 15 * 60_000);
    child.on('close', code => {
      clearTimeout(timer);
      writeFileSync(join(dir, 'quest-play.log'), log);
      const fails = log.split('\n').filter(line => line.startsWith('FAIL'));
      const summary = /^(OK|FAILED): (\[.*\])$/m.exec(log);
      results[scene] = { ok: code === 0, fails, runs: summary ? JSON.parse(summary[2]) : null };
      console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${scene} ${summary ? summary[2] : '(no summary)'}${fails.length ? `\n  ${fails.join('\n  ')}` : ''}`);
      done();
    });
  });
}

const workers = Array.from({ length: Math.min(lanes, queue.length) }, (_, lane) => (async () => {
  while (queue.length) await play(queue.shift(), portBase + lane * 2);
})());
await Promise.all(workers);
writeFileSync(join(OUT, 'quest-sweep.json'), JSON.stringify(results, null, 1));
const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([scene]) => scene);
console.log(`${Object.keys(results).length - failed.length}/${Object.keys(results).length} quests pass${failed.length ? `; failing: ${failed.join(' ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
