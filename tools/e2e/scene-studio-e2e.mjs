// Real browser authoring -> validated guide -> both desktop forks. No external requests are permitted.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSceneStudio } from '../scene-studio.mjs';
import { assertSynced } from './assert-synced.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'C:/Temp/pw-kimi/node_modules/playwright-core');
let ctx, origin, stop;
let origins;
if (process.env.E2E_SCENE_STUDIO === 'true') {
  const harness = await import('./desktops-e2e-lib.mjs');
  ({ ctx, stop } = await harness.start());
  origin = harness.PARENT;
  origins = [origin, harness.SHELLS];
} else {
  const server = createSceneStudio({ env: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  origins = [origin];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Users/<you>/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  stop = async () => { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
}
const out = mkdtempSync(join(tmpdir(), 'scene-studio-e2e-'));
let count = 0, page;
const external = [], errors = [];
const check = (name, value) => { assert.ok(value, name); count++; console.log('PASS', name); };
try {
  await ctx.route(url => !origins.some(base => url.href.startsWith(base + '/')) && !/^(data:|blob:|about:)/.test(url.href), route => { external.push(route.request().url()); route.abort(); });
  page = await ctx.newPage();
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/api/scene-studio/validate')) errors.push(`${response.status()} ${response.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(origin + '/scene-studio');
  await page.waitForFunction(() => document.getElementById('source').value.includes('The unexpected invoice'));
  await page.evaluate(() => document.fonts.ready);
  check('pixel headings and readable body type are loaded', await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily.includes('Jersey 10') && !getComputedStyle(document.body).fontFamily.includes('Jersey 10') && document.fonts.check('18px "Jersey 10"')));
  check('controls use the main hard-edged theme', await page.locator('#preview').evaluate(button => getComputedStyle(button).borderRadius === '0px'));
  if (process.env.E2E_SCENE_STUDIO === 'true') check('main app navigation includes Studio', await page.evaluate(async () => (await (await fetch('/')).text()).includes('href="/scene-studio"')));
  const original = await page.locator('#source').inputValue();
  await page.locator('#validate').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Valid:'));
  check('starter compiles through the actual authoring endpoint', await page.locator('#steps li').count() === 2);
  await page.locator('#source').fill(original.replace('run invoice-helper', 'rum invoice-helper'));
  await page.locator('#validate').click();
  await page.waitForFunction(() => !document.getElementById('error').hidden);
  check('typo produces a line-numbered diagnostic', /script:\d+: unknown command "rum"/.test(await page.locator('#error').innerText()));
  await page.locator('#source').fill(original);
  await page.locator('#os').selectOption('macos');
  await page.locator('#preview').click();
  await page.locator('#full-preview:not([hidden])').waitFor();
  const desktop = await (await page.locator('#desktop').elementHandle()).contentFrame();
  await desktop.waitForSelector('#gate-opt-in');
  await desktop.waitForFunction(() => document.getElementById('gate-points').textContent.includes('Alex Rivera'));
  await desktop.locator('#gate-opt-in').check();
  await desktop.locator('#gate-enter').click();
  await desktop.waitForSelector('body[data-session-state="profile-scene"]');
  check('script config sets the fictional user and theme before sign-in', await desktop.evaluate(() => OceanDesktop.getWorld().user.name === 'Alex Rivera' && OceanDesktop.getWorld().sys.theme === 'dark'));
  check('preview OS override starts on macOS', await desktop.locator('body').getAttribute('data-os') === 'macos');
  const mac = page.frames().find(frame => frame.url().includes('/previews/macos-final/'));
  await mac.getByText('Click to log in').click();
  await desktop.waitForFunction(() => OceanDesktop.getScene()?.auth === 'desktop');
  await desktop.locator('#guide-next').click();
  await desktop.waitForFunction(() => OceanDesktop.getWorld().data.mail.messages.some(message => message.id === 'm-invoice'));
  check('Next creates the scripted mail and attachment', await desktop.evaluate(() => Object.values(OceanDesktop.getWorld().fs.nodes).some(node => node.name === 'invoice.txt')));
  await desktop.locator('#guide-next').click();
  await desktop.waitForFunction(() => OceanDesktop.getWorld().data.processes?.some(process => process.name === 'invoice-helper'));
  check('Next simulates the process without execution', await desktop.evaluate(() => OceanDesktop.getWorld().data.processes.some(process => process.name === 'invoice-helper')));
  await desktop.locator('#guide-back').click();
  await desktop.waitForFunction(() => !OceanDesktop.getWorld().data.processes?.some(process => process.name === 'invoice-helper'));
  check('Back undoes the step', true);
  await page.locator('#frame-wrap').scrollIntoViewIfNeeded();
  await desktop.locator('#os-windows').click();
  await desktop.waitForSelector('body[data-os="windows"]');
  const problems = await assertSynced({
    page: desktop,
    frame: os => page.frames().find(frame => frame.url().includes(os === 'windows' ? '/previews/win11-final/' : '/previews/macos-final/')),
    world: () => desktop.evaluate(() => OceanDesktop.getWorld()),
    swap: async os => { await page.locator('#frame-wrap').scrollIntoViewIfNeeded(); await desktop.locator(`#os-${os}`).click(); await desktop.waitForTimeout(500); },
  });
  assert.deepEqual(problems, [], 'both shells must match the current parent world after OS switches');
  check('switching OS preserves the whole scripted world', true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(out, 'studio-desktop.png'), fullPage: true });
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const saved = await download;
  check('download preserves the editable script exactly', readFileSync(await saved.path(), 'utf8') === original);
  await page.reload();
  await page.waitForFunction(text => document.getElementById('source').value === text, original);
  check('draft survives a reload', true);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#file').setInputFiles({ name: 'imported.scene', mimeType: 'text/plain', buffer: Buffer.from(original.replace('The unexpected invoice', 'Imported scenario')) });
  await page.waitForFunction(() => document.getElementById('source').value.includes('Imported scenario'));
  check('local .scene file imports without server filesystem access', true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, 'studio-mobile.png'), fullPage: true });
  check('editor fits a narrow viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('no browser errors', errors.length === 0);
  check('zero external requests', external.length === 0);
  console.log(`${count}/${count} checks passed. Screenshots: ${out}`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(out, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('Browser errors:', errors);
    console.error('External requests:', external);
    console.error('Frames:', page.frames().map(frame => frame.url()));
    const frame = page.frames().find(item => item.url().includes('/desktop.html'));
    if (frame) console.error('Desktop:', await frame.locator('body').innerText().catch(() => 'unavailable'));
    console.error('Failure screenshot:', join(out, 'failure.png'));
  }
  throw error;
} finally {
  await stop();
}
