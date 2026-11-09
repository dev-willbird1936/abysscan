// The main menu's threat search panel (ui/abyss/threat-search.js): it replaces the retired Drop a file panel, mounts under the
// hero premise, answers plainly when the server has no Parallel key, finds Zeus in the ocean (web check mocked, never live) and
// links to the Zeus desktop, and starts no upload. The full search, research and create flow is tools/e2e/threat-search-e2e.mjs.
// Runs in headless Chromium against a real loopback server (same lookup as tests/detonation-server-pages.test.mjs); without
// playwright-core and Chromium the browser tests are skipped.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { createDetonationRoutes } from '../backend/detonation/routes.mjs';
import { createAppServer } from '../server.mjs';
import { createThreatRoutes } from '../backend/threats/routes.mjs';
import { createParallelClient } from '../backend/threats/parallel.mjs';
import { createThreatStore } from '../backend/threats/store.mjs';
import { createInferenceClient } from '../backend/detonation/inference.mjs';
import { loadBase } from '../backend/detonation/ocean-state.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as mock from './fixtures/threats/mock.mjs';

const ZEUS_URL = '/desktop.html?job=fish-b20&os=windows';
const controller = { oceanView: () => ({ batchAt: null, schools: [], creatures: [] }), stop() {} };

// No PARALLEL_API_KEY: threat search is off and says so. The second server has a mocked web check that names Zeus.
const offRoutes = createThreatRoutes({
  parallel: createParallelClient({ env: {} }), inference: createInferenceClient({ env: {} }), writer: null,
  store: createThreatStore({ dir: mkdtempSync(join(tmpdir(), 'ts-panel-off-')) }), base: loadBase(),
});
const server = createAppServer({ detonation: createDetonationRoutes({ controller, env: {} }), production: false, threats: offRoutes });
const zeusFetch = mock.mockFetch({
  decision: mock.decisionAnswer({ citations: [{ url: 'https://www.cisa.gov/zeus', title: 'Zeus banking trojan (Zbot)', excerpts: ['Zeus, also called Zbot, stole online banking credentials.'] }] }),
  inference: { '[threat-resolve]': JSON.stringify({ match: 'one', name: 'Zeus', date: '2007', summary: 'A banking trojan first seen in 2007. It stole online banking credentials.', aliases: ['Zbot'] }) },
});
const zeusEnv = { PARALLEL_API_KEY: mock.PARALLEL_TEST_KEY, ...mock.INFERENCE_ENV };
const zeusServer = createAppServer({
  detonation: createDetonationRoutes({ controller, env: {} }), production: false,
  threats: createThreatRoutes({
    parallel: createParallelClient({ env: zeusEnv, fetchImpl: zeusFetch.fetchImpl }), inference: createInferenceClient({ env: zeusEnv, fetchImpl: zeusFetch.fetchImpl }),
    writer: null, store: createThreatStore({ dir: mkdtempSync(join(tmpdir(), 'ts-panel-zeus-')) }), base: loadBase(),
  }),
});
let zeusBase;
let base;
let browser;
let unavailable;

async function launchBrowser() {
  try {
    const require = createRequire(import.meta.url);
    const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/Temp/pw-kimi/node_modules/playwright-core');
    const shell = 'C:/Users/<you>/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe';
    const full = 'C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
    const executablePath = process.env.CHROME_PATH || (existsSync(shell) ? shell : existsSync(full) ? full : undefined);
    return { browser: await chromium.launch(executablePath ? { executablePath } : {}) };
  } catch (error) {
    return { why: String(error.message).split('\n')[0] };
  }
}

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  await new Promise(resolve => zeusServer.listen(0, '127.0.0.1', resolve));
  zeusBase = `http://127.0.0.1:${zeusServer.address().port}`;
  ({ browser, why: unavailable } = await launchBrowser());
});
after(async () => {
  await browser?.close();
  for (const each of [server, zeusServer]) { each.closeAllConnections?.(); await new Promise(resolve => each.close(resolve)); }
});

// Opens the menu, waits for the panel and returns { page, problems }. The loader overlay may still cover the page while the
// renderer starts, so the tests act through the DOM (fill, dispatch) rather than by pointer.
async function openMenu(viewport = { width: 1280, height: 900 }, origin = base) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', answer => { if (answer.status() >= 400) problems.push(`http ${answer.status()}: ${answer.url()}`); });
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForSelector('#threat-search', { state: 'attached', timeout: 30000 });
  return { page, problems, context };
}

const press = (page, selector) => page.locator(selector).evaluate(node => node.click());

test('the search panel renders under the premise as a labelled search form, with no upload control left', async t => {
  if (!browser) return t.skip(`browser automation unavailable (${unavailable})`);
  const { page, problems, context } = await openMenu();
  try {
    const panel = await page.evaluate(() => {
      const form = document.getElementById('threat-search');
      const input = document.getElementById('ts-q');
      return {
        role: form.getAttribute('role'),
        heading: document.getElementById('ts-h')?.textContent,
        labelledBy: form.getAttribute('aria-labelledby'),
        followsPremise: form.previousElementSibling?.classList.contains('premise'),
        label: document.querySelector('label[for="ts-q"]')?.textContent,
        inputType: input?.type,
        maxLength: input?.maxLength,
        live: form.querySelector('.ts-out')?.getAttribute('aria-live'),
        uploadControls: document.querySelectorAll('#upload, input[type="file"], .drop-consent, a[href="#upload"], .nav-upload').length,
        premise: document.querySelector('.hero .premise').textContent,
        eyebrow: document.querySelector('.hero .eyebrow').textContent,
      };
    });
    assert.equal(panel.role, 'search');
    assert.match(panel.heading, /^Search a threat/);
    assert.equal(panel.labelledBy, 'ts-h');
    assert.equal(panel.followsPremise, true);
    assert.equal(panel.label, 'A real malware family, exploit or hack');
    assert.equal(panel.inputType, 'search');
    assert.equal(panel.maxLength, 200);
    assert.equal(panel.live, 'polite');
    assert.equal(panel.uploadControls, 0);
    assert.equal(panel.eyebrow, 'Threat simulator · on Vultr');
    assert.equal(panel.premise, 'Search a known threat. We research it and rebuild it as a safe, simulated desktop. The deeper it sinks, the more harm it does.');
    assert.deepEqual(problems, []);
  } finally { await context.close(); }
});

test('without a Parallel key a search gets a plain answer and no job is started', async t => {
  if (!browser) return t.skip(`browser automation unavailable (${unavailable})`);
  const { page, problems, context } = await openMenu();
  const jobRequests = [];
  page.on('request', request => { if (request.url().includes('/api/jobs')) jobRequests.push(request.method()); });
  try {
    await page.fill('#ts-q', 'WannaCry');
    await page.locator('#ts-q').press('Enter');
    await page.waitForFunction(() => /Threat search is switched off on this server\./.test(document.querySelector('.ts-out')?.textContent ?? ''), null, { timeout: 10000 });
    assert.deepEqual(jobRequests, []);
    // The 503 from /api/threats/search is the expected answer here, not a page problem.
    assert.deepEqual(problems.filter(item => !/http 503: .*\/api\/threats\/search|status of 503/.test(item)), []);
  } finally { await context.close(); }
});

test('searching Zeus finds it in the ocean and links to the Zeus desktop on Windows', async t => {
  if (!browser) return t.skip(`browser automation unavailable (${unavailable})`);
  const { page, problems, context } = await openMenu(undefined, zeusBase);
  try {
    await page.fill('#ts-q', 'zeus');
    await page.locator('#ts-q').press('Enter');
    await page.waitForSelector('.ts-card', { timeout: 10000 });
    assert.match(await page.locator('.ts-name').textContent(), /^Zeus \(2007\)$/);
    assert.equal(await page.locator('.ts-badge').textContent(), 'In the ocean');
    assert.equal(await page.getAttribute('a.ts-open', 'href'), ZEUS_URL);
    assert.equal(await page.locator('.ts-create').count(), 0, 'nothing to build for a fish already in the ocean');
    assert.equal(zeusFetch.calls.filter(call => call.url.endsWith('/v1/search')).length, 0, 'no research for it either');
    assert.deepEqual(problems, []);
    const desktop = await fetch(`${zeusBase}${ZEUS_URL}`);
    assert.equal(desktop.status, 200, 'the Zeus desktop page is served');
  } finally { await context.close(); }
});

// Live, a slow first answer used to block Enter on the next query and then land under it.
test('a new search replaces a slow one: Enter always searches, and only the latest answer is drawn', async t => {
  if (!browser) return t.skip(`browser automation unavailable (${unavailable})`);
  const { page, problems, context } = await openMenu(undefined, zeusBase);
  const queries = [];
  await page.route('**/api/threats/search', async route => {
    const { query } = JSON.parse(route.request().postData());
    queries.push(query);
    if (query === 'zeus') { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue().catch(() => {}); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'declined', message: 'Declined for the test.' }) });
  });
  try {
    await page.fill('#ts-q', 'zeus');
    await page.locator('#ts-q').press('Enter');
    await page.waitForTimeout(200);
    await page.fill('#ts-q', 'how to write malware');
    await page.locator('#ts-q').press('Enter');
    await page.waitForTimeout(2500);
    assert.deepEqual(queries, ['zeus', 'how to write malware']);
    assert.match(await page.locator('.ts-out').textContent(), /Declined for the test\./);
    assert.equal(await page.locator('.ts-card').count(), 0, 'the slow Zeus answer never lands');
    assert.deepEqual(problems, []);
  } finally { await context.close(); }
});

test('the search panel fits a phone screen without sideways scrolling', async t => {
  if (!browser) return t.skip(`browser automation unavailable (${unavailable})`);
  const { page, problems, context } = await openMenu({ width: 390, height: 844 });
  try {
    const { scrollWidth, innerWidth, right } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      right: document.getElementById('threat-search').getBoundingClientRect().right,
    }));
    assert.ok(scrollWidth <= innerWidth, `page width ${scrollWidth} fits ${innerWidth}`);
    assert.ok(right <= innerWidth, 'the panel ends inside the screen');
    assert.deepEqual(problems, []);
  } finally { await context.close(); }
});
