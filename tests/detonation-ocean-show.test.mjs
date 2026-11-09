// The ocean show (ui/job/ocean-show.mjs): the code-drawn arm matches the octopus sprite's art, the dive is a long fall, and the creature
// that eats the fish is the ocean's own creature coming forward. Static checks on the served source, plus the arm drawn in node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ARMS, armSkin, drawTentacle } from '../ui/job/tentacle.mjs';

const read = relative => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
const show = read('ui/job/ocean-show.mjs');
const hex = (data, i) => [...data.slice(i, i + 3)].map(v => v.toString(16).padStart(2, '0')).join('');

// Every colour the octopus sheets' own arms use (the reach1-left-far pose): lit skin down to deep teal, sucker discs, olive, dark edge.
const SHEET_ARM_COLOURS = new Set(['98c197', '5db5a0', '4eb09f', '46a298', '438a7f', '20838a', '0e6e7f', 'cdc569', 'cecea2', 'b2a966', '838d65', '556149', '212c29']);
const arm = (x = 0) => drawTentacle({ root: { x: 20 + x, y: 30 }, dir: { x: 1, y: 0 }, tip: { x: 70 + x, y: 40 }, side: -1, width: 1.9 });
const filledColours = ({ sheet }) => {
  const out = [];
  for (let k = 0; k < sheet.w * sheet.h; k++) if (sheet.color[k * 4 + 3]) out.push(hex(sheet.color, k * 4));
  return out;
};

test('the drawn arm uses only the octopus sheet\'s own arm colours and has no outline', () => {
  const colours = filledColours(arm());
  assert.ok(colours.length > 100);
  for (const colour of new Set(colours)) assert.ok(SHEET_ARM_COLOURS.has(colour), `${colour} is not an octopus arm colour`);
  assert.ok(!colours.includes('0e2124'), 'the old black outline is gone');
});

test('the arm is lit like the sprites: every pixel has a unit normal, and its dither stays put on the screen grid', () => {
  const { sheet } = arm();
  for (let k = 0; k < sheet.w * sheet.h; k++) {
    if (!sheet.color[k * 4 + 3]) continue;
    const n = [0, 1, 2].map(c => sheet.normal[k * 4 + c] / 127.5 - 1);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 0.06, `normal at ${k}`);
  }
  // The same arm four pixels along the grid (the dither's period) is drawn identically, so it does not crawl as the octopus moves.
  const a = arm(0), b = arm(4);
  assert.deepEqual(filledColours(a), filledColours(b));
});

test('with the pose sheet\'s own arm as its skin, the drawn arm takes its pixels and normals from it', () => {
  // A stand-in sheet: the arm of reach1-left-far runs left from x 32 to x 12 round y 66; each column one cross-section.
  const w = 128, color = new Uint8ClampedArray(w * 128 * 4), normal = new Uint8ClampedArray(w * 128 * 4), used = new Set();
  for (let x = 12; x <= 32; x++) for (let y = 62; y <= 70; y++) {
    const k = (y * w + x) * 4, c = [x * 4, y * 2, 100 + y];
    color.set([...c, 255], k); normal.set([128, 128 + (66 - y) * 12, 250, 255], k); used.add(hex(c, 0));
  }
  const skin = armSkin({ w, color, normal }, 2);
  assert.equal(skin.cols.length, 21);
  const drawn = drawTentacle({ root: { x: 20, y: 30 }, dir: { x: 1, y: 0 }, tip: { x: 70, y: 40 }, side: -1, width: 1.9, skin });
  const colours = filledColours(drawn);
  assert.ok(colours.length > 100);
  for (const colour of new Set(colours)) assert.ok(used.has(colour) || colour === '212c29', `${colour} is not from the sheet`);
  for (let k = 0; k < drawn.sheet.w * drawn.sheet.h; k++) {
    if (!drawn.sheet.color[k * 4 + 3]) continue;
    assert.ok(Math.abs(Math.hypot(...[0, 1, 2].map(c => drawn.sheet.normal[k * 4 + c] / 127.5 - 1)) - 1) < 0.06, `normal at ${k}`);
  }
  assert.equal(armSkin(null), null);
  assert.match(show, /skin = armSkin\(sheet, 128 \/ OCT\)/);
  assert.match(read('ui/abyss/menu-octopus.js'), /skin = mod\.armSkin\(s, CELL \/ ART\)/);
});

test('each reaching arm has its pose, root and heading', () => {
  for (const [name, entry] of Object.entries(ARMS)) {
    assert.equal(entry.pose, `reach1-${name}-far`);
    assert.equal(entry.root.length, 2);
    assert.ok(Math.abs(Math.hypot(...entry.dir) - 1) < 0.03, name);
  }
});

test('the dive is a long eased fall, and the reduced-motion path stays instant', () => {
  const seconds = new Function('st', `return ${/const seconds = ([^;]+);/.exec(show)[1]};`);
  assert.ok(seconds(5) >= 12, 'the Trench takes at least twelve seconds');
  assert.ok(seconds(2) >= 6 && seconds(3) > seconds(2) && seconds(4) > seconds(3) && seconds(5) > seconds(4), 'each deeper zone takes longer');
  assert.match(show, /lenis\.scrollTo\(top, \{ duration: reduced \? 0 : seconds, easing: [^}]*immediate: reduced/);
  assert.match(show, /zone passes|nameZone\(\+\+named\)/); // each zone is named as the camera passes its stop
  assert.match(show, /if \(!reduced\) tasks\.add/); // no per-frame fall effects without motion
});

test('the creature that eats the fish is the ocean\'s own, coming forward', () => {
  assert.match(show, /function backdrop\(findingId\)/);
  assert.match(show, /hiddenEnt\.hiddenByShow = true/); // the ocean's own copy steps aside while the show draws it
  assert.match(show, /if \(hiddenEnt\) hiddenEnt\.hiddenByShow = false;\n\s+root\.remove\(\)/); // and comes back if the show closes mid-strike
  const retro = read('ui/abyss/retro-pixel.js');
  assert.match(retro, /if \(e\.hiddenByShow\) \{ c\.group\.visible = false; return; \}/);
});

test('the show plays the job\'s network stream by default, and the menu no longer opens it from an upload', () => {
  assert.match(show, /source = createNetworkSource\(\{ jobId, token \}\)/);
  assert.doesNotMatch(read('ui/abyss/index.html'), /drop-panel\.js/);
});

test('Back from the report brings the show back at the step it reached', () => {
  // Leaving for the report remembers the show in this page's own history entry (never in web storage: the token stays
  // where the job URL already keeps it); closing it forgets it.
  assert.match(show, /win\.history\.replaceState\(\{ \.\.\.win\.history\.state, \[RESUME_KEY\]: \{ jobId, token, fileName \} \}, ''\)/);
  assert.match(show, /skip\.addEventListener\('click', remember\)/);
  assert.match(show, /open\.addEventListener\('click', remember\)/);
  assert.match(show, /closed = true;\n\s+forget\(\);/);
  // It resumes through the reduced-motion path (every tween at once), from the surface, then motion comes back.
  assert.match(show, /let reduced = prefersReduced \|\| resume;/);
  assert.match(show, /if \(resume\) fastForward\(\); else play\(0\);/);
  assert.match(show, /reduced = prefersReduced;\n\s+sync\(\);/);
});

test('the creature that comes forward to eat has no outline', () => {
  assert.doesNotMatch(show, /creature\.rim/);
  assert.match(show, /const opts = \{ alpha: creature\.a, fog: creature\.fog,/);
});

test('an eaten fish can be replayed on the simulated desktop, only where the server serves the desktops', () => {
  // The Windows and macOS shells are private local assets: the button waits for /api/desktop-templates/status.
  assert.match(show, /fetch\('\/api\/desktop-templates\/status'[^\n]*s\?\.enabled === true/);
  assert.match(show, /if \(!\(eatenFish \|\| story\) \|\| typeof replayId !== 'string' \|\| !\/\^\[a-z0-9-\]\{1,40\}\$\/\.test\(replayId\) \|\| !\(await desktops\)\) return null;/);
  assert.match(show, /if \(story && !state\.finished\) return null;/, 'a searched threat links to its scene only once it is written');
  assert.match(show, /link\.href = `\/desktop\.html\?job=\$\{replayId\}\$\{story \? '&os=windows' : ''\}`;\n\s+link\.addEventListener\('click', remember\);/);
  // The mock fixture names its replay; the server publishes the fixture's evidence there (loopback, outside production).
  assert.match(read('ui/job/mock.mjs'), /replayId: `mock-\$\{name\}`/);
  const server = read('server.mjs');
  assert.match(server, /if \(mockName\) publishMockReplay\(mockName, body\);/);
  assert.match(server, /mockName && !production && LOOPBACK_PEERS\.has\(request\.socket\.localAddress\)/);
  assert.match(server, /const fromStart = replay \|\| run\.startsWith\('mock-'\) \|\| run\.startsWith\('fish-'\);/);
});
