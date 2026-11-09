// Records one upload as an MP4: main menu, drop panel, the ocean show step by step (octopus, clam, fish, dive), then the full
// report page. Usage: node tools/record-upload.mjs <file> <out.mp4>. Records the local demo (start-hackathon-demo.bat) by
// default; set RECORD_BASE_URL and RECORD_AUTH=user:password for the live site. Needs playwright-core, its headless shell and
// ffmpeg. The blank tab before the site's first paint is cut, so the clip opens on the loader.
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [file, out] = process.argv.slice(2).map((p) => resolve(p));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'C:/Temp/pw-kimi/node_modules/playwright-core');
const shell = 'C:/Users/<you>/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe';
const dir = mkdtempSync(join(tmpdir(), 'record-'));
const size = { width: 1280, height: 800 };
const base = process.env.RECORD_BASE_URL || 'http://127.0.0.1:4173/'; // set RECORD_BASE_URL (and RECORD_AUTH=user:password) to record the live site

const browser = await chromium.launch({ executablePath: shell, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size }, ...(process.env.RECORD_AUTH && { httpCredentials: { username: process.env.RECORD_AUTH.split(':')[0], password: process.env.RECORD_AUTH.split(':').slice(1).join(':') } }) });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.waitForTimeout(6000); // the dive-in intro
  await page.setInputFiles('.drop-file', file);
  await page.check('#drop-consent');
  await page.waitForTimeout(1000);
  await page.click('.drop-go');
  await page.waitForSelector('.os-bar', { timeout: 30000 });
  // The ocean show: let each step play, then press Next once the sandbox has reached the following one.
  const dwell = [9000, 5500, 6000, 5500, 9000, 6500];
  for (const ms of dwell) {
    await page.waitForTimeout(ms);
    await page.waitForSelector('.os-next:not([disabled])', { timeout: 240000 });
    await page.click('.os-next');
  }
  await page.waitForTimeout(4500); // teardown step: receipt and the report buttons
  await Promise.all([page.waitForURL(/\/job\//, { timeout: 30000 }), page.click('.os-primary')]);
  await page.waitForFunction(() => /Sandbox destroyed|Teardown/i.test(document.body.innerText), null, { timeout: 120000 });
  await page.waitForTimeout(7000); // the full report page
  console.log('final URL', page.url());
  console.log('verdict text:', (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 400));
} finally {
  await context.close(); // flushes the video
  await browser.close();
}
const webm = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
// The video starts with an empty white tab. Inverted, that is black, and blackdetect reports where it ends.
const probe = spawnSync('ffmpeg', ['-hide_banner', '-t', '15', '-i', webm, '-vf', 'negate,blackdetect=d=0.04:pix_th=0.02', '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const trim = Number(/black_start:0(?:\.0+)?\s+black_end:([\d.]+)/.exec(probe)?.[1] ?? 0);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', trim.toFixed(2), '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
rmSync(dir, { recursive: true, force: true });
console.log('saved', out, `(blank tab before the first paint cut: ${trim.toFixed(1)} s)`, errors.length ? `page errors: ${errors.slice(0, 3)}` : 'no page errors');
