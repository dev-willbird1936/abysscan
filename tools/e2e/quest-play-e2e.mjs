// Plays a quest (docs/desktop-parity/QUESTS.md) the way a trainee would, with real clicks and keys: each turn it clicks
// what the guide's cue glows on screen (double-clicks a file icon, types into a box until it is full), and presses Next
// only when nothing is cued or a click moved nothing. On the way it flags every hard flag it can see. It checks that the
// guide reaches the grade card, that most steps were played by the trainee's own gestures, that every hard flag could be
// placed, and that no page error happened. Screenshots of each turn go to SHOTS_DIR/quest-<scene>-<os>-<n>.png.
// Usage: node tools/e2e/quest-play-e2e.mjs <scene> [windows|macos|both]
// Starts its own servers (E2E_PARENT_PORT / E2E_SHELLS_PORT, default 4370 / 4371: give each parallel run its own pair).
import { mkdirSync } from 'node:fs';
import { loadBase } from '../../backend/detonation/ocean-state.mjs';
import { compileScene, sceneSource } from '../../backend/detonation/fish-scenes.mjs';
import { PARENT, start } from './desktops-e2e-lib.mjs';

const [scene, which = 'both'] = process.argv.slice(2);
const OUT = process.env.SHOTS_DIR ?? 'tools/e2e/shots';
mkdirSync(OUT, { recursive: true });
const fishIndex = loadBase().findIndex(entry => entry.scene === scene);
if (!scene || fishIndex < 0) { console.error('Usage: node tools/e2e/quest-play-e2e.mjs <scene> [windows|macos|both]  (a scene a base fish uses)'); process.exit(2); }
const fish = loadBase()[fishIndex];
const { guide, os: ownOs } = compileScene(sceneSource(scene), fish, scene);
if (!guide.story) { console.error(`${scene} is not a quest (no story)`); process.exit(2); }
const hardKeys = guide.flags.filter(item => item.hard).map(item => item.key);
const results = [];
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`); };

const { ctx, external, stop } = await start();
for (const os of which === 'both' ? [ownOs, ownOs === 'windows' ? 'macos' : 'windows'] : [which]) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  await page.goto(`${PARENT}/desktop.html?job=fish-b${fishIndex}&os=${os}`);
  const gate = page.locator('#gate-opt-in');
  await Promise.race([gate.waitFor({ timeout: 20000 }), page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 20000 })]);
  if (await gate.isVisible()) { await gate.check(); await page.locator('#gate-enter').click(); }
  await page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 30000 });
  const frame = () => page.frames().find(item => item.url().includes(os === 'windows' ? '/win11-final/' : '/macos-final/'));
  if (os === 'windows') {
    await frame().locator('[data-testid=lock-screen]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.mouse.click(720, 450);
    await page.waitForTimeout(600);
    await frame().getByRole('button', { name: 'Sign in' }).click();
  } else await frame().getByText('Click to log in').click({ timeout: 20000 });
  await page.waitForFunction(() => window.OceanDesktop.getScene()?.auth === 'desktop', null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.locator('#guide-next').click(); // Start
  await page.waitForTimeout(900);
  const world = () => page.evaluate(() => window.OceanDesktop.getWorld());
  const title = () => page.locator('#guide-title').innerText();
  let followed = 0, nexted = 0, turn = 0, stuck = 0;
  const flagged = new Set();
  const tryFlags = async () => {
    for (const key of hardKeys.filter(item => !flagged.has(item))) {
      const target = frame().locator(`[data-ocean-key="${key.replace(/"/g, '\\"')}"]`).first();
      if (!(await target.isVisible().catch(() => false))) continue;
      try {
        // Aim where a person would: a point of the target itself, not of a flaggable part inside it (a page's sponsored box).
        const position = await target.evaluate(el => {
          const r = el.getBoundingClientRect();
          for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.12], [0.1, 0.1], [0.9, 0.9], [0.5, 0.9], [0.1, 0.5]]) {
            const hit = el.ownerDocument.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
            if (hit && hit.closest('[data-ocean-key]') === el) return { x: r.width * fx, y: r.height * fy };
          }
          return null;
        }).catch(() => null);
        await target.hover({ timeout: 1500, ...(position ? { position } : {}) });
        await page.waitForTimeout(150);
        await frame().locator('.oql-flag:not([hidden])').click({ timeout: 1500 });
        await page.waitForTimeout(120);
        if ((await world()).data.flags?.some(item => item.key === key)) flagged.add(key);
      } catch { /* covered or moving: try again next turn */ }
    }
  };
  // A curious trainee follows the guide's "What it has done so far" chips (Task Manager, Login Items) to find more to flag.
  // Each chip is tried up to three times while hard flags remain (a later window may have covered what it opened).
  const chipsSeen = new Map();
  const exploreChips = async () => {
    if (hardKeys.every(key => flagged.has(key))) return;
    for (const chip of await page.locator('#guide-activity button').all()) {
      const label = await chip.innerText().catch(() => '');
      if (!label || (chipsSeen.get(label) ?? 0) >= 3) continue;
      chipsSeen.set(label, (chipsSeen.get(label) ?? 0) + 1);
      await chip.click().catch(() => {});
      await page.waitForTimeout(900);
      await tryFlags();
    }
  };
  // Playwright's checks can refuse an element a person could click (an endless fade-in, an ancestor it thinks intercepts).
  // A person clicks the middle of what glows: do that with the mouse, if the middle really is that element.
  const mouseFallback = async (cued, key) => {
    const box = await cued.boundingBox().catch(() => null);
    const ours = await cued.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(hit && (el === hit || el.contains(hit))); }).catch(() => false);
    if (!box || !ours) return false;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    const twice = key.startsWith('file:') && !(await cued.evaluate(el => Boolean(el.closest('.ml-attach, [data-native-app="mail"]'))).catch(() => false));
    if (twice) await page.mouse.dblclick(x, y); else await page.mouse.click(x, y);
    return true;
  };
  while (turn++ < 90) {
    const now = await title();
    if (now === 'How did you do?') break;
    await tryFlags();
    await exploreChips();
    await page.waitForTimeout(250); // the overlay moves the cue on its next frame, after whatever exploring opened
    const w = await world();
    const cued = frame().locator('.ocean-cue').first();
    if (w.scene.cue && !(await cued.isVisible().catch(() => false))) await page.waitForTimeout(700); // the glow lands a frame after the window opens
    const key = (await cued.isVisible().catch(() => false)) ? await cued.getAttribute('data-ocean-key') : null;
    let acted = false;
    if (key) {
      try {
        if (key.startsWith('field:')) {
          const [, pageId, n] = key.split(':');
          const field = (await page.evaluate(([id, at]) => {
            const M = window.OceanWorldModel; const p = window.OceanDesktop.getWorld().data.web.pages[id];
            return M.pageFields(p)[Number(at)];
          }, [pageId, n]));
          await cued.click({ timeout: 3000 });
          for (let k = 0; k < (field?.value.length ?? 0); k++) await page.keyboard.press('a');
        // A file opens with a double-click on its icon (desktop, Explorer, Finder); a mail attachment opens with one click.
        } else if (key.startsWith('file:') && !(await cued.evaluate(el => Boolean(el.closest('.ml-attach, [data-native-app="mail"]'))))) {
          await cued.dblclick({ timeout: 3000 });
        } else {
          await cued.click({ timeout: 3000 });
        }
        acted = true;
      } catch (error) {
        acted = await mouseFallback(cued, key);
        if (process.env.QUEST_TRACE) console.log(`  click on ${key} failed (${error.message.split(/\n/)[0]}); mouse fallback ${acted ? 'worked' : 'found the point covered'}`);
      }
    }
    await page.waitForTimeout(900);
    const after = await title();
    if (process.env.QUEST_TRACE) console.log(`  turn ${turn} [${now}] cue=${JSON.stringify(w.scene.cue)} clicked=${key} acted=${acted} -> [${after}]`);
    if (acted && after !== now) { followed++; stuck = 0; }
    else if (acted && JSON.stringify((await world()).scene.cue) !== JSON.stringify(w.scene.cue)) { stuck = 0; } // progress inside a step (a box filled)
    else if (++stuck >= (acted ? 2 : 1)) {
      await page.locator('#guide-next').click();
      await page.waitForTimeout(900);
      nexted++;
      stuck = 0;
    }
    if (turn % 3 === 0) await page.screenshot({ path: `${OUT}/quest-${scene}-${os}-${String(turn).padStart(2, '0')}.png` });
  }
  await tryFlags();
  await page.screenshot({ path: `${OUT}/quest-${scene}-${os}-end.png` });
  const end = await title();
  const w = await world();
  const steps = guide.steps.length;
  const middle = guide.steps.filter(step => step.when).length;
  check(`${scene} ${os}: reaches the grade card`, end === 'How did you do?', end);
  check(`${scene} ${os}: the trainee played most steps (${followed} by their own gestures, ${nexted} by Next, of ${steps})`, followed >= Math.ceil(middle * 0.6), `${middle} steps have a when`);
  check(`${scene} ${os}: every hard flag could be placed (${flagged.size}/${hardKeys.length})`, flagged.size === hardKeys.length, hardKeys.filter(item => !flagged.has(item)).join(', '));
  check(`${scene} ${os}: the grade card counts them`, (await page.locator('.grade-big').innerText().catch(() => '')).includes(`/ ${hardKeys.length}`));
  check(`${scene} ${os}: the quota is complete`, !w.data.quota || w.data.quota.done === w.data.quota.total, JSON.stringify(w.data.quota));
  check(`${scene} ${os}: no page errors and no network`, !errors.length && !external.length, [...errors, ...external].slice(0, 3).join(' | '));
  results.push({ os, followed, nexted, flags: flagged.size });
  await page.close();
}
await stop();
console.log(`${failures ? 'FAILED' : 'OK'}: ${JSON.stringify(results)}`);
process.exit(failures ? 1 : 0);
