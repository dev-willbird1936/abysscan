// Contact sheet of candidate effects in the site's palette: node preview.mjs <outDir> <id> [<id> ...]. Writes <outDir>/<id>.png (a row of stills).
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, withOverlay, addOverlay } from './lib.mjs';

const [out, ...ids] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch();
const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 720 } });
await withOverlay(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(process.env.BASE ?? 'http://127.0.0.1:4173/');
await addOverlay(page);
for (const id of ids) {
  const meta = await page.evaluate(async id => (await window.__pfx.still(id, [0])).duration, id);
  const times = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map(k => +(k * meta).toFixed(2));
  const { size, shots } = await page.evaluate(([id, times]) => window.__pfx.still(id, times), [id, times]);
  // Tile the stills in a page-side canvas, scaled 2x with hard pixels.
  const tiled = await page.evaluate(async ([shots, size]) => {
    const cv = document.createElement('canvas');
    cv.width = size[0] * 2 * shots.length; cv.height = size[1] * 2;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    for (const [n, src] of shots.entries()) {
      const im = new Image(); im.src = src; await im.decode();
      c.drawImage(im, n * size[0] * 2, 0, size[0] * 2, size[1] * 2);
    }
    return cv.toDataURL('image/png');
  }, [shots, size]);
  writeFileSync(`${out}/${id.replace('/', '-')}.png`, Buffer.from(tiled.split(',')[1], 'base64'));
  console.log(id, size.join('x'), `${meta}s`);
}
console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
