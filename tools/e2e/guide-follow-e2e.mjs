// The fish guide follows the trainee (docs/desktop-parity/FISH-SCENES.md): a gesture made on the desktop plays its step, the
// trainee may run ahead several steps, and an off-path gesture (Cancel on a warning, "No thanks" on a lure) gets a note that
// replaces the stale move. The activity chips count what happened and open where it shows. Real clicks where reachable,
// shell intents otherwise (the same messages the shells send). Usage: node tools/e2e/guide-follow-e2e.mjs
import { start, OUT, PARENT } from './desktops-e2e-lib.mjs';
import { loadBase } from '../../backend/detonation/ocean-state.mjs';

const { ctx, external, stop } = await start();
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, detail); };

async function open(scene, os) {
  const fish = loadBase().find(f => f.scene === scene);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${PARENT}/desktop.html?job=fish-${fish.ref}&os=${os}`);
  const gate = page.locator('#gate-opt-in');
  await Promise.race([gate.waitFor({ timeout: 20000 }), page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 20000 })]);
  if (await gate.isVisible()) { await gate.check(); await page.locator('#gate-enter').click(); }
  await page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 30000 });
  const frame = w => page.frames().find(i => i.url().includes(w === 'windows' ? '/win11-final/' : '/macos-final/'));
  if (os === 'windows') { await frame('windows').locator('[data-testid=lock-screen]').waitFor({ timeout: 20000 }); await page.waitForTimeout(1000); await page.mouse.click(720, 450); await page.waitForTimeout(700); await frame('windows').getByRole('button', { name: 'Sign in' }).click(); }
  else await frame('macos').getByText('Click to log in').click({ timeout: 20000 });
  await page.waitForFunction(() => window.OceanDesktop.getScene()?.auth === 'desktop', null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.locator('#guide-next').click();
  await page.waitForTimeout(700);
  const emit = intent => frame(os).evaluate(v => window.__oceanEmit(v), intent);
  const world = () => page.evaluate(() => window.OceanDesktop.getWorld());
  const title = () => page.locator('#guide-title').innerText();
  const stepText = () => page.locator('#guide-step').innerText();
  return { page, errors, emit, world, title, stepText, frame };
}

// 1. CryptoLocker on Windows: open the disguised file, then Cancel the warning.
{
  const s = await open('cryptolocker', 'windows');
  let w = await s.world();
  const file = Object.values(w.fs.nodes).find(n => n?.program === 'cryptolocker');
  await s.emit({ kind: 'open-file', fileId: file.id });
  await s.page.waitForTimeout(800);
  check('cryptolocker: opening the file plays step 2 ("The label is a program")', /label/.test(await s.title()), await s.title());
  w = await s.world();
  await s.emit({ kind: 'dialog-answer', id: w.dialogs.at(-1).id, answer: 'cancel' });
  await s.page.waitForTimeout(800);
  const text = await s.stepText();
  check('cryptolocker: cancel shows the safe-choice note', /You cancelled .* safe choice/.test(text), text.slice(-220));
  check('cryptolocker: cancel does not advance the guide', /label/.test(await s.title()));
  check('cryptolocker: the stale move line is hidden while the note shows', !/In the warning, click Run/.test(await s.stepText()));
  await s.page.screenshot({ path: `${OUT}/guide-follow-cancel-windows.png` });
  // Run ahead: open again and run it; the guide jumps to "Nothing seems to happen".
  await s.emit({ kind: 'open-file', fileId: file.id });
  await s.page.waitForTimeout(600);
  w = await s.world();
  await s.emit({ kind: 'dialog-answer', id: w.dialogs.at(-1).id, answer: 'run' });
  await s.page.waitForTimeout(900);
  check('cryptolocker: running it plays "Nothing seems to happen"', /Nothing seems to happen/.test(await s.title()), await s.title());
  check('cryptolocker: "You did this step yourself" shown', /did this step yourself/i.test(await s.stepText()));
  const chips = await s.page.locator('#guide-activity').innerText();
  check('cryptolocker: activity counts the running program and the start-up entry', /program running/.test(chips) && /starts with the PC/.test(chips), chips.replace(/\n/g, ' | '));
  const tip = await s.page.locator('#guide-activity button', { hasText: 'starts with' }).getAttribute('title');
  check('cryptolocker: the start-up chip says where it shows', /CryptoLocker.*Settings › Apps › Startup/.test(tip ?? ''), tip);
  await s.page.locator('#guide-activity button', { hasText: 'starts with' }).click();
  await s.page.waitForTimeout(700);
  w = await s.world();
  check('cryptolocker: the start-up chip opens Settings on the start-up pane', w.windows.at(-1).app === 'settings' && w.windows.at(-1).payload?.pane === 'startup', JSON.stringify(w.windows.at(-1).payload));
  await s.page.waitForTimeout(800);
  const winItems = await s.frame('windows').locator('[data-testid=settings-startup-item]').allInnerTexts();
  check('cryptolocker: Windows Settings › Apps › Startup lists CryptoLocker', winItems.some(text => /CryptoLocker/.test(text)), winItems.join(' | '));
  await s.page.screenshot({ path: `${OUT}/guide-follow-startup-windows.png` });
  // The same window on macOS: System Settings on Login Items.
  await s.page.locator('#os-macos').click();
  await s.page.waitForTimeout(2500);
  const mac = s.frame('macos');
  if (await mac.getByText('Click to log in').isVisible().catch(() => false)) { await mac.getByText('Click to log in').click(); await s.page.waitForTimeout(1500); }
  const macText = await mac.locator('body').innerText();
  check('cryptolocker: macOS shows Login Items with CryptoLocker after the swap', /Login Items/.test(macText) && /CryptoLocker/.test(macText));
  w = await s.world();
  check('cryptolocker: the pane survives the OS swap', w.windows.some(x => x.app === 'settings' && x.payload?.pane === 'startup'));
  await s.page.screenshot({ path: `${OUT}/guide-follow-startup-macos.png` });
  check('cryptolocker: no page errors', s.errors.length === 0, s.errors.join(' | '));
  await s.page.close();
}

// 2. Comet Cursor on macOS: press "No thanks", then "Yes, install".
{
  const s = await open('comet-cursor', 'macos');
  check('comet-cursor macOS: the move names Safari', /Your move:.*in Safari/s.test(await s.stepText()));
  await s.emit({ kind: 'scene-choice', choiceId: 'cursors-2' });
  await s.page.waitForTimeout(800);
  let text = await s.stepText();
  check('comet-cursor macOS: "No thanks" explains the attack would stop', /You clicked “No thanks”.*“Yes, install”/s.test(text), text.slice(-220));
  await s.page.screenshot({ path: `${OUT}/guide-follow-nothanks-macos.png` });
  await s.emit({ kind: 'scene-choice', choiceId: 'cursors-1' });
  await s.page.waitForTimeout(800);
  check('comet-cursor macOS: "Yes, install" plays the next step', /asks to install/.test(await s.title()), await s.title());
  check('comet-cursor macOS: no page errors', s.errors.length === 0, s.errors.join(' | '));
  await s.page.close();
}

// 3. Emotet on Windows: run ahead from step 1 by pressing both document buttons straight away.
{
  const s = await open('emotet', 'windows');
  let w = await s.world();
  const doc = Object.values(w.fs.nodes).find(n => n?.program === 'emotet-word');
  await s.emit({ kind: 'open-file', fileId: doc.id });
  await s.page.waitForTimeout(700);
  w = await s.world();
  const win = w.windows.find(x => x.app === 'program' && x.payload.view === 'emotet-doc');
  await s.emit({ kind: 'view-action', windowId: win.id, action: 'next' });
  await s.page.waitForTimeout(400);
  await s.emit({ kind: 'view-action', windowId: win.id, action: 'run:emotet-powershell' });
  await s.page.waitForTimeout(900);
  check('emotet: Enable Content jumps the guide to "The macro starts PowerShell"', /macro starts PowerShell/.test(await s.title()), await s.title());
  w = await s.world();
  check('emotet: powershell.exe is in the world', (w.data.processes ?? []).some(p => p.name === 'powershell.exe'));
  check('emotet: no page errors', s.errors.length === 0, s.errors.join(' | '));
  await s.page.close();
}
check('zero non-loopback requests', external.length === 0, external.join(' '));
await stop();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
if (results.some(ok => !ok)) process.exit(1);
