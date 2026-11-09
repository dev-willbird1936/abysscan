// Plays every fish scene (data/fish-scenes, docs/desktop-parity/FISH-SCENES.md) on the real desktops, the way the ocean's
// creature panel opens it: /desktop.html?job=fish-b<n>&os=<os>. For each scene: sign in on its own OS, walk the guide with Next
// (each step must change the world, Back must undo it), then check that the live world holds everything the scene produced (windows, mail, pages, processes, files, notifications, wallpaper), that the
// shell draws its windows, then switch OS and check the other shell. Screenshots go to SHOTS_DIR/fish-<scene>-<os>.png.
// Usage: node tools/e2e/fish-scenes-e2e.mjs [scene ...]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { start, OUT, PARENT } from './desktops-e2e-lib.mjs';
import { compileScene, sceneSource, sceneStartWorld } from '../../backend/detonation/fish-scenes.mjs';
import { loadBase } from '../../backend/detonation/ocean-state.mjs';

const Model = createRequire(import.meta.url)('../../ui/desktop/world-model.js');
const only = process.argv.slice(2);
const base = loadBase().filter(fish => fish.scene && (!only.length || only.includes(fish.scene)));
const results = [];
const check = (name, ok, detail = '') => { results.push([ok, name, detail]); if (!ok) console.log('FAIL', name, detail); };

// What the scene should leave in the world: compared field by field with the live world.
function expected(fish) {
  const { os, patches } = compileScene(sceneSource(fish.scene), fish, fish.scene);
  const world = patches.reduce((w, patch) => Model.createWorld(w, patch), sceneStartWorld());
  return { os, world };
}
const summary = w => ({
  windows: w.windows.map(win => `${win.app}:${win.title}`).sort(),
  notes: w.notifications.history.map(n => n.title).filter(t => t !== 'Welcome, Dana').sort(),
  mail: w.data.mail.messages.map(m => m.id).filter(id => id.startsWith('m-') && id !== 'm-welcome').sort(),
  pages: Object.keys(w.data.web?.pages ?? {}).sort(),
  homepage: w.data.web?.homepage ?? null,
  processes: (w.data.processes ?? []).map(p => p.name).sort(),
  startup: (w.data.startup ?? []).map(s => s.name).sort(),
  updates: (w.data.updates ?? []).map(u => u.title).sort(),
  encrypted: Object.values(w.fs.nodes).filter(n => n?.encrypted).map(n => n.name).sort(),
  trashed: Object.values(w.fs.nodes).filter(n => n?.trashed).map(n => n.name).sort(),
  files: Object.values(w.fs.nodes).filter(n => n?.id?.startsWith('fs-')).map(n => n.name).sort(),
  wallpaper: w.sys.wallpaperUrl ? w.sys.wallpaperUrl.length : 0,
  // Quests (QUESTS.md): sign-ins, typed boxes, the task counter, what a keylogger took, the browser's tabs.
  web: JSON.stringify([w.data.web?.sessions ?? [], w.data.web?.typed ?? {}, w.data.quota ?? null, w.data.captured ?? [], (w.data.browser?.tabs ?? []).map(tab => tab.url)]),
  // OS prompts and program windows (docs/desktop-parity/PROGRAMS.md).
  dialogs: (w.dialogs ?? []).map(d => `${d.kind}:${d.programId ?? d.fileId ?? ''}:${d.step ?? 0}`),
  views: w.windows.filter(win => win.app === 'program').map(win => `${win.payload.view}:${win.payload.page ?? 0}`).sort(),
});

const { ctx, external, stop } = await start();
for (const fish of base) {
  const { os, world: want } = expected(fish);
  const other = os === 'windows' ? 'macos' : 'windows';
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message.slice(0, 200)}`));
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && /refused|error/i.test(message.text())) errors.push(`console: ${message.text().slice(0, 200)}`); });
  const label = `${fish.scene} (${fish.name})`;
  try {
    await page.goto(`${PARENT}/desktop.html?job=fish-${fish.ref}&os=${os}`);
    const gate = page.locator('#gate-opt-in');
    await Promise.race([gate.waitFor({ timeout: 20000 }), page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 20000 })]);
    if (await gate.isVisible()) { await gate.check(); await page.locator('#gate-enter').click(); }
    await page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 30000 });
    const frame = which => page.frames().find(item => item.url().includes(which === 'windows' ? '/win11-final/' : '/macos-final/'));
    // Sign in on the scene's own OS.
    if (os === 'windows') {
      await frame('windows').locator('[data-testid=lock-screen]').waitFor({ timeout: 20000 });
      await page.waitForTimeout(1000);
      await page.mouse.click(720, 450);
      await page.waitForTimeout(700);
      await frame('windows').getByRole('button', { name: 'Sign in' }).click();
    } else {
      await frame('macos').getByText('Click to log in').click({ timeout: 20000 });
    }
    await page.waitForFunction(() => window.OceanDesktop.getScene()?.auth === 'desktop', null, { timeout: 15000 });
    // The guide: Start, then Next through every step. Each step changes the world; Back returns to the previous one.
    const { guide } = compileScene(sceneSource(fish.scene), fish, fish.scene);
    const worldKey = async () => JSON.stringify(summary(await page.evaluate(() => window.OceanDesktop.getWorld())));
    await page.locator('#ocean-guide:not([hidden]) #guide-next').waitFor({ timeout: 10000 });
    // A quest opens on its story card ("<user>: <name>") and ends on its grade card.
    check(`${label}: guide opens on its introduction`, guide.story ? (await page.locator('#guide-title').innerText()).endsWith(`: ${fish.name}`) : (await page.locator('#guide-title').innerText()) === `What ${fish.name} did`);
    const seen = [await worldKey()];
    for (let k = 1; k <= guide.steps.length; k++) {
      await page.locator('#guide-next').click();
      await page.waitForTimeout(250);
      seen.push(await worldKey());
      check(`${label}: guide step ${k} shows "${guide.steps[k - 1].title}" and changes the desktop`,
        (await page.locator('#guide-title').innerText()) === guide.steps[k - 1].title && seen[k] !== seen[k - 1]);
      if (k === 2) {
        await page.locator('#guide-back').click();
        await page.waitForTimeout(250);
        check(`${label}: Back undoes step 2`, (await worldKey()) === seen[1]);
        await page.locator('#guide-next').click();
        await page.waitForTimeout(250);
      }
    }
    await page.locator('#guide-next').click();
    check(`${label}: guide ends on the lesson`, (await page.locator('#guide-title').innerText()) === (guide.flags?.length ? 'How did you do?' : 'How to stay safe'));
    // Every step is now on the desktop: wait until the world holds them all.
    const target = JSON.stringify(summary(want));
    const deadline = Date.now() + 15000;
    let live;
    do { live = summary(await page.evaluate(() => window.OceanDesktop.getWorld())); } while (JSON.stringify(live) !== target && Date.now() < deadline && !(await page.waitForTimeout(300)));
    for (const key of Object.keys(live)) check(`${label}: world ${key}`, JSON.stringify(live[key]) === JSON.stringify(summary(want)[key]), `live ${JSON.stringify(live[key])} want ${JSON.stringify(summary(want)[key])}`);
    check(`${label}: starts on ${os}`, (await page.locator(`#os-${os}`).getAttribute('aria-pressed')) === 'true'
      && (await page.evaluate(() => document.body.dataset.os)) === os);
    await page.waitForTimeout(1500);
    // The shell draws one window per world window.
    const drawn = async which => which === 'windows' ? frame('windows').locator('.oceanWin').count() : frame('macos').locator('[role=dialog]').count();
    check(`${label}: ${os} draws its ${want.windows.length} window(s)`, (await drawn(os)) >= want.windows.length, `${await drawn(os)} drawn`);
    await page.screenshot({ path: `${OUT}/fish-${fish.scene}-${os}.png` });
    // The same world on the other OS.
    await page.locator(`#os-${other}`).click();
    await page.waitForTimeout(2500);
    check(`${label}: switches to ${other}`, (await page.locator(`#os-${other}`).getAttribute('aria-pressed')) === 'true'
      && (await page.evaluate(() => document.body.dataset.os)) === other);
    if (other === 'macos' && await frame('macos').getByText('Click to log in').isVisible().catch(() => false)) await frame('macos').getByText('Click to log in').click();
    await page.waitForTimeout(1500);
    check(`${label}: ${other} draws its ${want.windows.length} window(s)`, (await drawn(other)) >= want.windows.length, `${await drawn(other)} drawn`);
    await page.screenshot({ path: `${OUT}/fish-${fish.scene}-${other}.png` });
    check(`${label}: no page errors or refused events`, errors.length === 0, errors.join(' | '));
  } catch (error) {
    check(`${label}: played`, false, error.message.split('\n')[0]);
    await page.screenshot({ path: `${OUT}/fish-${fish.scene}-FAILED.png` }).catch(() => {});
  }
  console.log(`${results.filter(r => r[1].startsWith(label) && !r[0]).length ? 'FAIL' : 'ok  '} ${label}`);
  await page.close();
}
check('zero non-loopback requests', external.length === 0, external.slice(0, 5).join(' '));
await stop();
const failed = results.filter(r => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed across ${base.length} scenes`);
process.exit(failed.length ? 1 : 0);
