// Actual UI and synthetic failure-state regression checks. No real upload, execution, cloud or remote request.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, PARENT, PROJECT } from './desktops-e2e-lib.mjs';
const out = process.env.UX_REVIEW_OUT;
assert.ok(out, 'UX_REVIEW_OUT must name an external evidence directory');
mkdirSync(out, { recursive: true });
const { ctx, external, stop } = await start();
const results = [], errors = [];
const pass = (name, data = {}) => { results.push({ name, ...data }); console.log('PASS', name, JSON.stringify(data)); };
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.text().includes('pixel-lit: no normal map')) errors.push(m.text()); });
const screenshot = name => page.screenshot({ path: join(out, name + '.png'), timeout: 60000 });
const ready = async () => { await page.evaluate(() => document.fonts.ready); if (await page.locator('#gl').count()) await page.waitForFunction(() => window.__boot?.done, null, { timeout: 60000 }); await page.waitForTimeout(550); };
try {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    for (const [name, path] of [['home', '/#upload'], ['about', '/about'], ['bestiary', '/bestiary'], ['report-recovery', '/job/j-missing'], ['studio', '/scene-studio'], ['guide', '/scene-studio/help'], ['catalogue', '/ocean-profiles.html'], ['entry', '/ocean-entry.html?profile=network-abuse-abyss'], ['desktop-gate', '/desktop.html?profile=network-abuse-abyss'], ['archive', '/chamber.html']]) {
      await page.goto(PARENT + path); await ready();
      if (name === 'bestiary') await page.waitForSelector('#creatures .card');
      if (name === 'catalogue') await page.waitForSelector('.profile-button');
      if (name === 'entry') await page.waitForSelector('#safety-card:not([hidden])');
      if (name === 'desktop-gate') await page.waitForSelector('#gate-opt-in');
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, surface: document.body.dataset.site }));
      assert.ok(geometry.content <= width + 2, `${name} at${width}: horizontal overflow ${geometry.content}`);
      assert.ok(geometry.surface, name + ' has shared design');
      const style = await page.locator('link[href="/ui/abyss/site.css"]').evaluate(n => Boolean(n.sheet?.cssRules.length) && getComputedStyle(document.body).getPropertyValue('--ui-panel').trim() === '#0b2133');
      assert.equal(style, true, name + ' stylesheet loaded');
      if (await page.locator('.site-nav-toggle').count()) assert.equal(await page.locator('.site-nav-toggle').isVisible(), width <= 960, 'menu breakpoint is intentional');
      if (name === 'home') assert.equal(await page.locator('.premise').evaluate(n => getComputedStyle(n).opacity), '1', 'premise must not remain hidden behind the intro');
      await screenshot(`${width}-${name}`); pass(`${width} ${name}`, geometry);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  let health = false, healthFailure = false, posts = 0;
  await page.route('**/api/health', route => healthFailure ? route.abort() : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acceptingJobs: health }) }));
  await page.route('**/api/jobs', route => { posts++; return route.fulfill({ status: 503, body: '{}' }); });
  await page.goto(PARENT + '/#upload'); await ready();
  await page.waitForSelector('.drop-availability[data-state="unavailable"]');
  await page.locator('.drop-file').setInputFiles({ name: 'harmless-review.txt', mimeType: 'text/plain', buffer: Buffer.from('A harmless UX check; never submitted.') });
  await page.locator('#drop-consent').check();
  assert.equal(await page.locator('.drop-go').isDisabled(), true);
  assert.equal(posts, 0); await screenshot('390-upload-paused');
  health = true;
  await page.locator('.drop-recheck').click();
  await page.waitForSelector('.drop-availability[data-state="ready"]');
  assert.equal(await page.locator('.drop-go').isEnabled(), true);
  assert.equal(await page.locator('#drop-consent').isChecked(), true);
  assert.match(await page.locator('.drop-name').innerText(), /harmless-review/);
  pass('availability blocks POST and manual recovery preserves file/consent');
  health = false; await page.locator('.drop-recheck').click();
  await page.waitForSelector('.drop-availability[data-state="unavailable"]');
  healthFailure = true; await page.locator('.drop-recheck').click();
  await page.waitForFunction(() => document.querySelector('.drop-availability').textContent.includes('remain paused'));
  assert.equal(await page.locator('.drop-go').isDisabled(), true);
  assert.equal(posts, 0); pass('failed health refresh never silently reopens known paused uploads');
  await page.locator('.site-nav-toggle').click();
  assert.equal(await page.locator('nav a').first().evaluate(n => n === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.site-nav-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.site-nav-toggle').evaluate(n => n === document.activeElement), true);
  pass('mobile menu keyboard focus and Escape recovery');
  await page.unroute('**/api/health'); await page.unroute('**/api/jobs');
  const fixture = JSON.parse(readFileSync(join(PROJECT, 'tests/fixtures/detonation/events/clean-chart.json'), 'utf8'));
  for (const event of fixture.events) {
    if (event.event === 'receipt') event.data.hostCanary = 'unknown';
    if (event.event === 'report') event.data.receipt.hostCanary = 'unknown';
  }
  await page.route('**/tests/fixtures/detonation/events/clean-chart.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(PARENT + '/job/j-ux?mock=clean-chart&speed=.01&rm=1');
    await page.waitForSelector('#jv-report:not([hidden])');
    assert.match(await page.locator('.jv-result-heading').innerText(), /inconclusive/i);
    assert.doesNotMatch(await page.locator('#jv-depth-badge').innerText(), /clean/i);
    assert.match(await page.locator('.jv-integrity-alert').innerText(), /integrity/i);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#jv-report-download').click()]);
    const exportPath = join(out, width + '-integrity-export.json');
    await download.saveAs(exportPath);
    const data = JSON.parse(readFileSync(exportPath, 'utf8'));
    assert.equal(data.result.status, 'integrity'); assert.equal(data.verdict.complete, false);
    await page.locator('.jv-result-heading').scrollIntoViewIfNeeded();
    await screenshot(`${width}-integrity-report`); pass(`${width} integrity summary and export agree`);
  }
  await page.unroute('**/tests/fixtures/detonation/events/clean-chart.json');
  await page.route('**/ui/abyss/assets/index-retro.js', route => route.abort());
  await page.goto(PARENT + '/');
  await page.locator('.loader-upload').click();
  assert.equal(await page.locator('.loader').isVisible(), false);
  assert.equal(await page.locator('.drop-file').evaluate(n => n === document.activeElement), true);
  assert.equal(await page.locator('#upload').isVisible(), true);
  pass('upload remains reachable when the optional ocean renderer cannot load');
  await screenshot('390-renderer-unavailable-upload');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors, external, synthetic_states: true, real_uploads: posts }, null, 2));
} catch (error) {
  await screenshot('failure').catch(() => {});
  writeFileSync(join(out, 'failure.json'), JSON.stringify({ message: error.message, results, errors, external }, null, 2));
  throw error;
} finally { await stop(); }
