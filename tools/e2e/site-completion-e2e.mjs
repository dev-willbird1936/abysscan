// Regression checks for the site-review fixes. UI fixtures below are synthetic; no upload or cloud call is made.
// File upload is retired: the main menu opens on the threat search, and nothing on the page may post to /api/jobs.
// Run: E2E_SCENE_STUDIO=true node tools/e2e/site-completion-e2e.mjs (the Studio checks need Scene Studio on).
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { start, PARENT } from './desktops-e2e-lib.mjs';

const out = process.env.SITE_REVIEW_OUT || join(tmpdir(), 'abysscan-site-completion');
mkdirSync(out, { recursive: true });
const { ctx, external, stop } = await start();
const errors = [], results = [];
const check = (name, detail = '') => { results.push({ name, detail }); console.log('PASS', name, detail); };
const observe = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error' || e.text().includes('pixel-lit: no normal map')) errors.push(e.text()); });
};
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`), timeout: 60000 });
const ready = page => page.waitForFunction(() => window.__boot?.done === true, null, { timeout: 60000 });
const atSurface = async page => {
  await page.waitForFunction(() => { const form = document.querySelector('#threat-search'); return scrollY < 4 && form && getComputedStyle(form).visibility === 'visible' && Number(getComputedStyle(form).opacity) > .95; }, null, { timeout: 10000 });
  assert.equal(await page.locator('#threat-search input[type=search]').isVisible(), true);
  assert.ok(await page.locator('#threat-search').evaluate(node => Number(getComputedStyle(node).opacity) > .95), 'search form must be opaque, not merely visibility:visible');
  assert.equal(await page.locator('#upload, .drop-file, #drop-consent').count(), 0, 'the retired upload panel must not be on the page');
};
try {
  const page = await ctx.newPage(); observe(page);
  // Health is synthetic; uploads are retired, so the site reports it is not accepting jobs.
  let jobPosts = 0;
  await page.route('**/api/health', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acceptingJobs: false }) }));
  await page.route('**/api/jobs', route => { if (route.request().method() === 'POST') jobPosts++; return route.fulfill({ status: 410, contentType: 'application/json', body: '{}' }); });
  await page.goto(PARENT + '/#threat-search'); await ready(page); await atSurface(page);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => ({ name: new URL(r.name).pathname, bytes: r.transferSize, duration: r.duration })).sort((a, b) => b.bytes - a.bytes));
  writeFileSync(join(out, 'home-resources.json'), JSON.stringify(resources, null, 2));
  check('incoming search hash reveals the threat search', `${resources.reduce((sum, r) => sum + r.bytes, 0)} resource bytes`);
  await page.waitForTimeout(3500); await shot(page, 'desktop-home');
  await page.goto(PARENT + '/#threat-search'); await page.waitForTimeout(500); await atSurface(page);
  check('same-document search hash cannot reapply native anchor scrolling');
  await page.locator('.site-tools summary').click();
  assert.equal(await page.locator('.site-tools').evaluate(node => node.open), true);
  assert.equal(await page.locator('.site-tools a[href="/scene-studio"]').isVisible(), true);
  await page.locator('.site-tools summary').click(); check('separate operator tools remain clickable above the ocean canvas');
  for (const path of ['/about', '/bestiary']) {
    await page.goto(PARENT + path); await page.locator('a[href="/#threat-search"]').first().click(); await ready(page); await atSurface(page);
    check(`${path} → Search stays at surface`);
  }
  await page.mouse.wheel(0, 2200); await page.waitForTimeout(1300);
  await page.locator('.site-skip').focus(); await page.keyboard.press('Enter'); await atSurface(page); check('search from a deep scroll stays at surface');
  await page.locator('a[href="/about"]').first().click(); await page.goBack(); await ready(page); await atSurface(page); check('browser Back preserves a usable search form');
  assert.equal(jobPosts, 0); check('the main menu never posts to the retired upload route');
  await page.unroute('**/api/jobs');
  await page.goto(PARENT + '/bestiary'); await page.waitForSelector('#creatures .card');
  assert.equal(await page.locator('[data-bestiary-section]').first().getAttribute('aria-labelledby'), 'h-creatures');
  await page.locator('#bestiary-search').fill('.pdf');
  assert.equal(await page.locator('[data-bestiary-section] .card:not([hidden])').count(), 1);
  assert.match(await page.locator('.card:not([hidden])').innerText(), /Flounder/);
  await page.locator('#bestiary-search').fill('no-such-creature-zzzz');
  assert.match(await page.locator('#bestiary-results').innerText(), /No matches/);
  await page.locator('.bestiary-search button').click();
  await page.locator('#bestiary-depth').selectOption('trench');
  assert.ok(await page.locator('#creatures .card:not([hidden])').count() > 0);
  assert.equal(await page.locator('#fish .card:not([hidden])').count(), 0);
  await page.goto(PARENT + '/bestiary#steal-credentials'); await page.waitForSelector('#steal-credentials.picked');
  assert.equal(await page.locator('#steal-credentials').isVisible(), true);
  const contrast = await page.locator('#depths .pg-tag').evaluateAll(nodes => nodes.map(node => {
    const c = getComputedStyle(node);
    const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    const a = luminance(c.color), b = luminance(c.backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }));
  assert.ok(contrast.every(ratio => ratio >= 4.5)); check('Bestiary search, empty state, depth filter, deep link and badge contrast', contrast.map(n => n.toFixed(2)).join(', '));
  await shot(page, 'desktop-bestiary');
  await page.goto(PARENT + '/ocean-profiles.html'); await page.waitForSelector('.profile-button');
  assert.match(await page.locator('#depth-title').innerText(), /not sandbox severity/);
  assert.equal(await page.locator('.morphology-status').count(), 0);
  assert.equal(await page.locator('.scenario-research[open]').count(), 0);
  assert.ok(await page.locator('.scenario-research').count() === 60); check('training categories separated, research preserved in details');
  await page.goto(PARENT + '/scene-studio/help');
  assert.equal(await page.title(), 'Scene Studio guide — The Abyss');
  assert.equal(await page.locator('.pg-nav a[href="/scene-studio"]').isVisible(), true);
  const source = await page.locator('pre code').innerText();
  const { compileAuthorScene } = await import('../../backend/scene-studio.mjs');
  assert.equal(compileAuthorScene(source).steps.length, 1); check('styled Studio guide includes a valid complete example');
  await page.goto(PARENT + '/scene-studio');
  await page.getByRole('button', { name: 'Preview scene →', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('iframe')?.getAttribute('src')?.includes('author-'));
  const preview = page.frameLocator('#desktop'); // auto-waits for the iframe document, not just its assigned src
  await preview.locator('#gate-opt-in').check();
  await preview.locator('#gate-enter').click();
  await preview.locator('body[data-session-state="profile-scene"]').waitFor({ timeout: 45000 });
  await preview.locator('#ocean-guide:not([hidden])').waitFor({ timeout: 45000 });
  assert.match(await preview.locator('#guide-step').innerText(), /Alex Rivera/);
  assert.doesNotMatch(await preview.locator('#guide-step').innerText(), /Dana Okafor/); check('Studio guide uses scene user identity');
  await page.goto(PARENT + '/job/j-missing');
  await page.locator('#jv-recovery:not([hidden])').waitFor();
  assert.equal(await page.locator('#jv-grid').isVisible(), false); check('incomplete job link has recovery, not a waiting pipeline');

  // Real UI over a synthetic incomplete inspection result: exercise show, report and export without execution.
  const fixture = JSON.parse(readFileSync(new URL('../../tests/fixtures/detonation/events/clean-chart.json', import.meta.url), 'utf8'));
  const jobId = 'j-review-inspected', token = 'review-token-0123456789';
  const verdict = { depth: 'twilight', family: 'unclassified', signals: ['incomplete'], findings: [], complete: false, statement: 'Inconclusive: the script format could not be confirmed. Inspected only; script behaviour was not tested.' };
  const coverage = [{ item: 0, parent: null, steps: [{ step: 'generic', status: 'done', detail: 'Static text inspection only.' }] }];
  const receipt = { jobId, teardownConfirmed: true, hostCanary: 'unchanged', containers: [], volumesRemoved: true, uploadDeleted: true, inference: { calls: 0 } };
  const report = { jobId, verdict, coverage, receipt, evidence: [], analysis: { attempts: [] }, explanation: 'Model unavailable. Evidence and rules only.' };
  const events = fixture.events.filter(e => !['analysis-attempt', 'evidence'].includes(e.event)).map((e, index) => ({ ...e, id: index + 1,
    data: e.event === 'typed' ? { detectedType: 'text', claimedExtension: 'py', species: 'plaice', label: 'Inspected', path: 'inspect', recognitionUncertain: true }
      : e.event === 'verdict' ? verdict : e.event === 'coverage' ? coverage[0] : e.event === 'receipt' ? receipt
        : e.event === 'report' ? report : e.event === 'explanation' ? { text: report.explanation, modelAvailable: false } : e.data }));
  await page.route('**/api/jobs', route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ jobId, token }) }));
  await page.route('**/api/jobs/' + jobId + '**', route => route.fulfill({ status: 200,
    contentType: route.request().url().endsWith('/events') ? 'text/event-stream' : 'application/json',
    body: route.request().url().endsWith('/events') ? events.map(e => `id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('') : JSON.stringify({ status: 'done', report }) }));
  // Uploads are retired, so the report of an earlier job is opened directly from its private link.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${PARENT}/job/${jobId}?seen#${token}`); await page.locator('#jv-report-download').waitFor({ timeout: 45000 });
  assert.equal(await page.locator('#jv-octopus-status').innerText(), 'Not run');
  assert.doesNotMatch(await page.locator('#jv-terminal').innerText(), /Writing analysis code/);
  assert.equal(await page.locator('.jv-stage-row[data-status=skipped]').count(), 2);
  const download = page.waitForEvent('download'); await page.locator('#jv-report-download').click();
  const file = await download; await file.saveAs(join(out, 'exported-report.json'));
  const exported = JSON.parse(readFileSync(join(out, 'exported-report.json'), 'utf8'));
  assert.equal(exported.verdict.depth, 'twilight'); assert.equal(exported.receipt.confirmed, true);
  assert.ok(exported.coverage.length); assert.ok(exported.actions.length);
  assert.ok(!JSON.stringify(exported).includes(token)); check('inconclusive inspection, no-model terminal and full report export agree');
  await shot(page, 'inconclusive-report');
  await page.close();

  const mobile = await ctx.newPage(); observe(mobile);
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(PARENT + '/#threat-search'); await ready(mobile); await atSurface(mobile);
  assert.equal(await mobile.locator('header nav').isVisible(), false);
  await mobile.getByRole('button', { name: 'Menu', exact: true }).click();
  assert.equal(await mobile.locator('header nav').isVisible(), true);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot(mobile, 'mobile-menu');
  await mobile.locator('a[href="/about"]').click();
  await mobile.getByRole('button', { name: 'Menu', exact: true }).click(); await mobile.locator('a[href="/#threat-search"]').first().click();
  await ready(mobile); await atSurface(mobile); check('mobile menu and About → Search have no horizontal overflow');
  await mobile.waitForTimeout(3500); await shot(mobile, 'mobile-home');
  await mobile.goto(PARENT + '/bestiary'); await mobile.locator('#creatures .card').first().waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot(mobile, 'mobile-bestiary'); await mobile.close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []); check('zero JavaScript errors, missing normals or external requests');
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors, external }, null, 2));
  await stop();
}
