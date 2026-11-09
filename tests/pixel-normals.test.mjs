import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const pixelRoot = fileURLToPath(new URL('../ui/abyss/pixel/', import.meta.url));
const normalsRoot = join(pixelRoot, 'normals');

function pngFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.png')) continue;
    found.push(relative(pixelRoot, join(entry.parentPath, entry.name)).split(sep).join('/'));
  }
  return found.sort();
}

// Width and height from the IHDR chunk, without pulling in an image library.
function pngSize(path) {
  const head = readFileSync(path).subarray(0, 24);
  assert.ok(head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `${path}: not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

// The alpha channel of an 8-bit PNG, one byte per pixel.  Enough of the format
// for the files the art pipeline writes; anything else fails loudly.
function pngAlpha(path) {
  const data = readFileSync(path);
  const { width, height } = pngSize(path);
  const depth = data[24], type = data[25], interlace = data[28];
  assert.equal(depth, 8, `${path}: bit depth ${depth} not supported`);
  assert.equal(interlace, 0, `${path}: interlaced PNG not supported`);
  const idat = [];
  let trns = null;
  for (let at = 8; at < data.length;) {
    const length = data.readUInt32BE(at), kind = data.toString('latin1', at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    if (kind === 'IDAT') idat.push(body);
    if (kind === 'tRNS') trns = body;
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  assert.ok(channels, `${path}: colour type ${type} not supported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    assert.ok(filter <= 4, `${path}: bad filter ${filter}`);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0, b = up[x];
      let predict = 0;
      if (filter === 1) predict = a;
      else if (filter === 2) predict = b;
      else if (filter === 3) predict = (a + b) >> 1;
      else if (filter === 4) {
        const c = x >= channels ? up[x - channels] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predict = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = (line[x] + predict) & 0xff;
    }
  }
  const alpha = Buffer.alloc(width * height, 255);
  for (let i = 0; i < width * height; i++) {
    if (type === 6 || type === 4) alpha[i] = pixels[i * channels + channels - 1];
    else if (type === 3 && trns) alpha[i] = pixels[i] < trns.length ? trns[pixels[i]] : 255;
  }
  return alpha;
}

const sprites = pngFiles(pixelRoot).filter(path => !path.startsWith('normals/'));
const normals = pngFiles(normalsRoot).map(path => path.replace(/^normals\//, ''));

// A sprite with no normal map still renders, but from a silhouette-derived
// normal, and it logs "pixel-lit: no normal map".  Every view in the site is
// required to show lit sprites, so a gap here is a visual regression that only
// shows up as a console warning at runtime.  Regenerate with
// `python tools/build-pixel-normals.py` then `node tools/refresh-abyss-manifest.mjs`.
test('every pixel sprite has a normal map', () => {
  assert.ok(sprites.length > 0, 'no sprites found: check ui/abyss/pixel/');
  const missing = sprites.filter(path => !normals.includes(path));
  assert.deepEqual(missing, [], `sprites without a normal map: ${missing.join(', ')}`);
});

// An orphan means a sprite was renamed or deleted and the normal was left
// behind, so the next regeneration silently keeps shipping a dead file.
test('no orphan normal maps', () => {
  const orphans = normals.filter(path => !sprites.includes(path));
  assert.deepEqual(orphans, [], `normal maps with no sprite: ${orphans.join(', ')}`);
});

// The renderer samples the normal at the sprite's own coordinates, so a size
// difference mislights every frame rather than failing outright.
test('each normal map matches its sprite dimensions', () => {
  const wrong = [];
  for (const path of sprites) {
    if (!normals.includes(path)) continue;
    const sprite = pngSize(join(pixelRoot, path));
    const normal = pngSize(join(normalsRoot, path));
    if (sprite.width !== normal.width || sprite.height !== normal.height) {
      wrong.push(`${path} (sprite ${sprite.width}x${sprite.height}, normal ${normal.width}x${normal.height})`);
    }
  }
  assert.deepEqual(wrong, [], `normal maps that do not match their sprite: ${wrong.join('; ')}`);
});

// build-pixel-normals.py copies the sprite's alpha into the normal.  If the art
// is redrawn and the normals are not rebuilt, the silhouettes stop matching and
// light falls on pixels that are no longer there.  Comparing alpha catches that
// from content alone; file times are useless because Git does not keep them.
test('each normal map has its sprite\'s alpha', () => {
  const stale = [];
  for (const path of sprites) {
    if (!normals.includes(path)) continue;
    const sprite = pngSize(join(pixelRoot, path)), normal = pngSize(join(normalsRoot, path));
    if (sprite.width !== normal.width || sprite.height !== normal.height) continue;
    if (!pngAlpha(join(pixelRoot, path)).equals(pngAlpha(join(normalsRoot, path)))) stale.push(path);
  }
  assert.deepEqual(stale, [], `stale normal maps, re-run tools/build-pixel-normals.py: ${stale.join(', ')}`);
});
