// Threat search in a real browser, against mocked Parallel and mocked Vultr inference (tests/fixtures/threats/mock.mjs):
// no live call and no key. Searches a threat already in the ocean (badge, link to its scene), then a new one (confirmation,
// Create, the ocean show driven by the research, the Play link), checks the scene's guide and debrief, and a declined search.
// Usage: node tools/e2e/threat-search-e2e.mjs   Screenshots go to SHOTS_DIR (default <OS temp>/threat-search-e2e, never the repo).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const threatDir = mkdtempSync(join(tmpdir(), 'threat-e2e-'));
process.env.THREAT_DIR = threatDir;
const OUT = resolve(process.env.SHOTS_DIR ?? join(tmpdir(), 'threat-search-e2e'));
mkdirSync(OUT, { recursive: true });

const mock = await import('../../tests/fixtures/threats/mock.mjs');
const { createAppServer } = await import('../../server.mjs');
const { createThreatRoutes } = await import('../../backend/threats/routes.mjs');
const { createParallelClient } = await import('../../backend/threats/parallel.mjs');
const { createThreatStore } = await import('../../backend/threats/store.mjs');
const { createThreatSceneWriter } = await import('../../backend/threats/scene-writer.mjs');
const { createInferenceClient } = await import('../../backend/detonation/inference.mjs');
const { loadBase } = await import('../../backend/detonation/ocean-state.mjs');

const ZEUS_CITES = [{ url: 'https://www.cisa.gov/zeus', title: 'Zeus banking trojan (Zbot)', excerpts: ['Zeus, also called Zbot, stole online banking credentials.'] }];
const fetchMock = mock.mockFetch({
  decision: body => (/build|make/i.test(body.state.query) ? mock.decisionAnswer({ build: 0.97 })
    : /zeus/i.test(body.state.query) ? mock.decisionAnswer({ citations: ZEUS_CITES }) : mock.decisionAnswer()),
  inference: {
    '[threat-resolve]': body => (/Zbot/.test(body.messages[1].content)
      ? JSON.stringify({ match: 'one', name: 'Zeus', date: '2007', summary: 'A banking trojan first seen in 2007. It stole online banking credentials.', aliases: ['Zbot'] })
      : mock.RESOLVE_ONE),
    '[threat-brief]': [mock.BRIEF_WITHOUT_IMPACT, mock.BRIEF_FOLLOW_UP],
    '[threat-scene]': [mock.citedZeus()],
  },
});
// Slow the scene writer a little, so the show has research and writing to wait for, as it does live.
const slowFetch = async (url, init) => { if (String(url).includes('vultrinference')) await new Promise(r => setTimeout(r, 1500)); return fetchMock.fetchImpl(url, init); };
const env = { PARALLEL_API_KEY: mock.PARALLEL_TEST_KEY, ...mock.INFERENCE_ENV };
const inference = createInferenceClient({ env, fetchImpl: slowFetch });
const threats = createThreatRoutes({
  parallel: createParallelClient({ env, fetchImpl: slowFetch }), inference,
  writer: createThreatSceneWriter({ client: inference, dir: threatDir }), store: createThreatStore({ dir: threatDir }), base: loadBase(),
});
const server = createAppServer({ threats, templateShellsEnabled: false });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'C:/Temp/pw-kimi/node_modules/playwright-core');
const exe = process.env.CHROME_PATH || 'C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (ok, label) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); };
const errors = [];
const outside = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || /pixel-lit: no normal map/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:') { outside.push(url.href); return route.abort(); } return route.continue(); });
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  const box = page.locator('#ts-q');
  await box.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(5000);
  check(await page.locator('#upload, .drop-file, #drop-consent').count() === 0, 'the retired upload panel is not on the page');
  await page.screenshot({ path: join(OUT, '1-menu.png') });

  // Already in the ocean.
  await box.click();
  await box.fill('the zeus trojan');
  await page.locator('.ts-go').click();
  const zeus = page.locator('.ts-card').first();
  await zeus.waitFor({ timeout: 10_000 });
  check((await zeus.locator('.ts-badge').textContent()) === 'In the ocean', 'Zeus is badged In the ocean');
  check((await zeus.locator('.ts-open').getAttribute('href')) === '/desktop.html?job=fish-b20&os=windows', 'it links to the existing Zeus scene');
  await page.screenshot({ path: join(OUT, '2-zeus-in-ocean.png') });

  // A request for attack instructions.
  await box.fill('how to build zeus-style malware');
  await page.locator('.ts-go').click();
  await page.locator('.ts-status.bad').waitFor({ timeout: 10_000 });
  check(/can't help build or carry out an attack/.test(await page.locator('.ts-status').textContent()), 'a build request is declined plainly');

  // A new threat: confirm, create, the show, play.
  await box.fill('qbot banking trojan');
  await page.locator('.ts-go').click();
  const qak = page.locator('.ts-card').first();
  await qak.waitFor({ timeout: 10_000 });
  check((await qak.locator('.ts-badge').textContent()) === 'New', 'Qakbot is badged New');
  await page.screenshot({ path: join(OUT, '3-qakbot-new.png') });
  await qak.locator('.ts-create').click();
  const dialog = page.locator('.ts-dialog[open]');
  await dialog.waitFor({ timeout: 10_000 });
  check(/Create a simulated environment for Qakbot\?/.test(await dialog.textContent()), 'the confirmation asks the question');
  check(await dialog.locator('.ts-sources a').count() >= 1, 'the confirmation lists sources');
  await page.screenshot({ path: join(OUT, '4-confirm.png') });
  await dialog.getByRole('button', { name: 'Create' }).click();
  await page.locator('.os').waitFor({ timeout: 15_000 });
  let shot = 5;
  for (let i = 0; i < 40; i++) {
    const next = page.locator('.os-next');
    if (await page.locator('.os-final').count()) break;
    if (await next.isVisible() && await next.isEnabled()) {
      await page.screenshot({ path: join(OUT, `${shot++}-show.png`) });
      await next.click();
    }
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: join(OUT, `${shot++}-show-done.png`) });
  check(await page.locator('.os-final').count() > 0, 'the show reaches its end');
  const play = page.locator('.os-desktop');
  await play.waitFor({ timeout: 20_000 }).catch(() => {});
  check(await play.count() === 0 || (await play.getAttribute('href')) === '/desktop.html?job=fish-r-qakbot&os=windows', 'Play links to the new scene where the desktops are served');

  const guide = await (await fetch(`${origin}/api/desktop/guide?run=fish-r-qakbot`)).json();
  check(guide.os === 'windows' && guide.steps.length >= 4, 'the new scene has a Windows guide');
  check(/Illustration based on public reporting, not observed malware\./.test(guide.lesson) && /Reported by cisa\.gov \(2023-08-30\)/.test(guide.lesson), 'the debrief carries the label and dated sources');
  check(!errors.length, `no page errors, console errors or unlit sprites${errors.length ? `\n  ${errors.slice(0, 5).join('\n  ')}` : ''}`);
  check(!outside.length, `no request leaves the site${outside.length ? `: ${outside.slice(0, 3).join(', ')}` : ''}`);
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}

// Play: the scene the writer cached runs on the real Windows desktop (the same servers desktops-e2e uses), guide to its end card.
try {
  const { start, PARENT } = await import('./desktops-e2e-lib.mjs');
  const { ctx, external, stop } = await start();
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    await page.goto(`${PARENT}/desktop.html?job=fish-r-qakbot&os=windows`);
    const gate = page.locator('#gate-opt-in');
    await Promise.race([gate.waitFor({ timeout: 20000 }), page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 20000 })]);
    if (await gate.isVisible()) { await gate.check(); await page.locator('#gate-enter').click(); }
    await page.waitForSelector('body[data-session-state="profile-scene"]', { timeout: 30000 });
    const win = () => page.frames().find(item => item.url().includes('/win11-final/'));
    await win().locator('[data-testid=lock-screen]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1000);
    await page.mouse.click(720, 450);
    await page.waitForTimeout(700);
    await win().getByRole('button', { name: 'Sign in' }).click();
    await page.waitForFunction(() => window.OceanDesktop.getScene()?.auth === 'desktop', null, { timeout: 15000 });
    await page.locator('#ocean-guide:not([hidden]) #guide-next').waitFor({ timeout: 10000 });
    check(/Qakbot/.test(await page.locator('#guide-title').innerText()), 'the Windows desktop opens the Qakbot quest');
    await page.screenshot({ path: join(OUT, '20-desktop-story.png') });
    for (let i = 0; i < 4 && await page.locator('#guide-next').isVisible(); i++) {
      await page.locator('#guide-next').click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: join(OUT, '21-desktop-step.png') });
    // A quest waits for the trainee's own gestures; "Show it all" plays the rest, as a visitor may.
    await page.locator('#ocean-guide').getByText('Show it all').click();
    await page.waitForFunction(() => /How to stay safe|grade|spotted/i.test(document.querySelector('#ocean-guide')?.innerText ?? ''), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, '22-desktop-debrief.png') });
    const end = await page.locator('#ocean-guide').innerText();
    check(/Illustration based on public reporting, not observed malware\./.test(end), 'the debrief on the desktop carries the illustration label');
    check(/Reported by cisa\.gov/.test(end), 'the debrief on the desktop lists its dated sources');
    check(!errors.length, `the desktop shows no page errors${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
    check(!external.length, 'the desktop makes no outside request');
  } finally {
    await stop();
  }
} finally {
  rmSync(threatDir, { recursive: true, force: true });
}
console.log(`screenshots: ${OUT}`);
process.exit(results.every(Boolean) ? 0 : 1);
