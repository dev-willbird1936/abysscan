// Shared by preview.mjs and run.mjs: a headless browser whose pages get the pixelfx overlay, without touching the site's files.
// The overlay and the vendored library are served from this folder at /__pfx/*; bypassCSP lets the injected module load.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'C:/Temp/pw-kimi/node_modules/playwright-core');
export const shell = 'C:/Users/<you>/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe';
// The GPU renders the site at 60 fps at 1080p; the software renderer manages about 10. PFX_SOFTWARE=1 forces it (a machine with no GPU).
const gpuArgs = process.env.PFX_SOFTWARE ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
export const launch = () => chromium.launch({ executablePath: shell, args: gpuArgs });

export async function withOverlay(context) {
  await context.route('**/__pfx/**', route => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/__pfx\//, '');
    // overlay.js and our own effects (fx/) live here; the library's core is vendored.
    const file = rel === 'overlay.js' ? join(here, 'overlay.js') : rel.startsWith('own/') ? join(here, 'fx', rel.slice(4)) : join(here, 'vendor', rel);
    if (rel.includes('..') || !existsSync(file) || extname(file) !== '.js') return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(file) });
  });
}

// Adds the overlay to a page that has loaded (the site's CSP blocks module scripts it did not ship; the context bypasses it).
export async function addOverlay(page) {
  await page.evaluate(() => new Promise((done, fail) => {
    const s = document.createElement('script');
    s.type = 'module'; s.src = '/__pfx/overlay.js';
    s.onerror = () => fail(new Error('overlay failed to load'));
    document.head.append(s);
    const wait = () => (window.__pfx ? done() : setTimeout(wait, 50));
    wait();
  }));
}
