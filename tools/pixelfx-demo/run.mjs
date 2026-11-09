// Plays the whole site end to end and records it as an MP4, with effects of our own drawn over the evidence tags of the ocean show. Each
// one depicts what its tag says, and tags that say nothing visual get none:
//   own/blocked   "Connection blocked": a dashed line runs into a wall
//   own/scramble  "Encrypted ..." and "Ransom note ...": pixel noise eats the text
// It records at 1920x1080 and 30 fps on the GPU (the software renderer manages about 10 fps at this size), and puts the site's own sound
// under the picture. It plays the local fixture (?oceanshow=invoice-py), so it needs no upload and no sandbox. Everything else is the site as it is.
// Usage: node tools/pixelfx-demo/run.mjs [out.mp4]   Needs the local site (node tools/start-desktops.mjs) on RECORD_BASE_URL (default 127.0.0.1:4173).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launch, withOverlay, addOverlay } from './lib.mjs';

const out = resolve(process.argv[2] ?? '.tmp-review/pixelfx-demo.mp4');
const base = (process.env.RECORD_BASE_URL ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
// About 3 GB of frames while recording: PFX_TMP points at a drive with room (default: the system temp folder).
const dir = mkdtempSync(join(process.env.PFX_TMP ?? tmpdir(), 'pfx-'));
const size = { width: 1920, height: 1080 }; // the overlay draws 4 screen pixels per art pixel at any size
const wait = ms => new Promise(done => setTimeout(done, ms));
const t0 = Date.now();
const log = text => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${text}`);

const browser = await launch();
const context = await browser.newContext({ viewport: size, bypassCSP: true });
await withOverlay(context);
// The live site hides the Windows and macOS training desktops (the Win11React artwork is not cleared for redistribution); a local server enables them. Answer
// that one endpoint as live does, so the recording shows what a visitor to the live site sees.
await context.route('**/api/desktop-templates/status', route => route.fulfill({ json: { enabled: false, source: 'custom fallback desktop', osModes: ['windows-style', 'macos-style'] } }));
// The show starts by importing mock.mjs once the renderer is up. Holding that one file back keeps the landing page (title, tagline, drop panel)
// on screen for a moment first, with nothing in the site changed.
let startShow;
const showHeld = new Promise(done => { startShow = done; });
await context.route('**/ui/job/mock.mjs', async route => { await showHeld; await route.continue(); });
await context.addInitScript({ path: join(dirname(fileURLToPath(import.meta.url)), 'audio-tap.js') });
const page = await context.newPage();
let loaderGone = Promise.resolve(0), audio = { startedAt: 0, data: '' }; // epoch ms

// Frames come straight from Chrome's screencast as JPEGs (quality 92, every frame: about 55 a second on the GPU, resampled to 30), not from
// Playwright's recordVideo, which encodes VP8 at a fixed 1 Mbps and looks soft at 1080p. `at` is the browser's clock in seconds, `seen` ours.
const FPS = 30;
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ at: metadata.timestamp, seen: Date.now() / 1000, name: file.slice(dir.length + 1) });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
let beginMs = 0; // when the first page load started: earlier frames are the blank tab
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// In the page: play the effect that fits each evidence tag the moment it appears.
async function watchEvidence() {
  await page.evaluate(() => {
    const seen = new WeakSet();
    const react = tag => {
      if (seen.has(tag)) return;
      seen.add(tag);
      // The tag is placed a frame after it is added, and fades in: read where it is once it has a size.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const text = tag.textContent.trim();
        // The tags drift upward as they live: the effect follows the tag's box every frame. edge: which side it hangs from.
        const on = edge => () => {
          if (!tag.isConnected) return null;
          const r = tag.getBoundingClientRect();
          return r.width ? { x: (edge === 'right' ? r.right + 4 : r.left) / 4, y: (r.top + r.height / 2) / 4, w: r.width / 4, h: r.height / 4 } : null;
        };
        if (/blocked/i.test(text)) window.__pfx.play('own/blocked', { follow: on('right') });
        else if (/^encrypted|^ransom note/i.test(text)) setTimeout(() => window.__pfx.play('own/scramble', { follow: on('left') }), 250);
      }));
    };
    new MutationObserver(records => {
      for (const rec of records) for (const node of rec.addedNodes) if (node.nodeType === 1) {
        if (node.matches?.('.os-ev')) react(node);
        node.querySelectorAll?.('.os-ev').forEach(react);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}


try {
  beginMs = Date.now();
  await page.goto(`${base}/?oceanshow=invoice-py&speed=1`);
  await addOverlay(page);
  await watchEvidence();
  log('landing');
  // When the loader is gone: that stretch is played fast in the cut.
  loaderGone = page.waitForFunction(() => { const e = document.querySelector('.loader-title'); return !e || !e.checkVisibility({ opacityProperty: true, visibilityProperty: true }); }, null, { polling: 500, timeout: 60000 }).then(() => Date.now(), () => 0);
  // The site makes sound from the first click or key press (browsers allow nothing before). Click empty water once the loader is gone, so the
  // soundscape runs from the landing page on, then park the pointer in the corner: below 1,000 m the pointer is a torch.
  await loaderGone;
  await page.mouse.click(1300, 250);
  await page.mouse.move(0, 0);
  await wait(4500); // the landing page, as a visitor first sees it
  startShow();
  await page.waitForSelector('.os-bar', { timeout: 60000 });
  // The ocean show, as the site plays it. Dwell times let each step's narration be read; Next is pressed once it is ready.
  const dwell = [5000, 4000, 4500, 6500, 6000, 8500];
  for (const [n, ms] of dwell.entries()) {
    log(`step ${n + 1}`);
    await wait(ms);
    // Running: the fixture reports four things, one after another; stay until the last one has had its moment.
    if (n === 2) { await page.waitForFunction(() => /4 things observed/.test(document.body.innerText), null, { polling: 500, timeout: 60000 }); await wait(3200); }
    await page.waitForSelector('.os-next:not([disabled])', { timeout: 240000 });
    await page.click('.os-next');
  }
  // Done: the receipt, as the site shows it.
  await page.waitForFunction(() => /sandbox destroyed/i.test(document.querySelector('.os-title')?.textContent ?? ''), null, { polling: 500, timeout: 120000 });
  log('done');
  await wait(3500);
  audio = await page.evaluate(() => window.__recStop()); // the report page has its own, silent, document
  // The fixture has no real job to open, so go to the report the job view plays from the same fixture.
  await page.goto(`${base}/job/mock-invoice?mock=invoice-py&speed=0.5`);
  // The page replays the job (ocean, creatures, terminal), then the creature swallows the camera, then the report appears: let all of it play.
  await page.waitForSelector('#jv-depth-badge', { state: 'visible', timeout: 120000 });
  await wait(2000);
  log('report');
  // Scroll down the report in eased steps of the page itself (a wheel notch jumps in one frame, which reads as a freeze).
  for (let n = 0; n < 6; n++) {
    await page.evaluate(() => new Promise(done => {
      const from = scrollY, by = 380, t0 = performance.now(), ms = 900;
      const tick = now => { const k = Math.min(1, (now - t0) / ms); scrollTo(0, from + by * (k * k * (3 - 2 * k))); k < 1 ? requestAnimationFrame(tick) : done(); };
      requestAnimationFrame(tick);
    }));
    await wait(700);
  }
  await wait(1500);
} finally {
  await cdp.send('Page.stopScreencast').catch(() => {});
  await context.close();
  await browser.close();
}

// Frames -> video. The browser's clock and ours differ by a few milliseconds; the median of the gaps converts one to the other.
const skew = frames.map(f => f.seen - f.at).sort((x, y) => x - y)[frames.length >> 1];
const used = frames.slice(frames.findIndex(f => f.at >= beginMs / 1000 - skew));
const start = used[0].at;
const toCut = ms => ms / 1000 - skew - start; // an epoch time of ours -> seconds in the capture
const total = used.at(-1).at - start + 0.5;
// ffmpeg's concat list: each frame is held until the next one arrived. Bare names: the list sits in the same folder as the frames.
const hold = (f, i) => ['file ' + "'" + f.name + "'", 'duration ' + ((used[i + 1]?.at ?? f.at + 0.5) - f.at).toFixed(4)];
const list = [...used.flatMap(hold), 'file ' + "'" + used.at(-1).name + "'", ''].join(String.fromCharCode(10));
writeFileSync(join(dir, 'frames.txt'), list);
const raw = join(dir, 'raw.mp4');
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'), '-vf', `fps=${FPS},scale=in_range=pc:out_range=tv,format=yuv420p`, '-color_range', 'tv', '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', raw]);
log(`${used.length} frames over ${total.toFixed(1)} s (${(used.length / total).toFixed(1)} fps captured)`);

// The cut: the loader (a fixed wait) plays 3x; the rest is the site at its own speed. The site's sound, if it made any, goes under it.
const LOADER_SPEED = 3;
const loaderEnd = Math.max(0, toCut(await loaderGone));
const segs = loaderEnd > 1
  ? [{ a: 0, b: loaderEnd, speed: LOADER_SPEED }, { a: loaderEnd, b: total, speed: 1 }]
  : [{ a: 0, b: total, speed: 1 }];
const where = t => segs.reduce((out, { a, b, speed }) => out + Math.max(0, Math.min(t, b) - a) / speed, 0); // capture time -> time in the cut
const args = ['-y', '-loglevel', 'error', '-i', raw];
let graph = segs.map(({ a, b, speed }, k) => `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=(PTS-STARTPTS)/${speed}[v${k}]`).join(';')
  + `;${segs.map((_, k) => `[v${k}]`).join('')}concat=n=${segs.length}:v=1:a=0,fps=${FPS}[v]`;
const maps = ['-map', '[v]'];
if (audio.data) {
  writeFileSync(join(dir, 'sound.webm'), Buffer.from(audio.data, 'base64'));
  args.push('-i', join(dir, 'sound.webm'));
  const at = where(toCut(audio.startedAt));
  graph += `;[1:a]loudnorm=I=-20:TP=-2:LRA=7,aresample=48000,adelay=${Math.round(at * 1000)}:all=1[s]`; // the site's bed is quiet: bring it to a normal level
  maps.push('-map', '[s]', '-c:a', 'aac', '-b:a', '160k');
  log(`sound from ${at.toFixed(1)}s in the cut, ${Math.round(audio.data.length * 0.75 / 1024)} KB`);
}
execFileSync(ffmpeg, [...args, '-filter_complex', graph, ...maps, '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
rmSync(dir, { recursive: true, force: true });
console.log('saved', out, errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors');
