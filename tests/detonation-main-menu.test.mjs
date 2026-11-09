// AT-25 (R-UI2): the main menu shows the five tier names on the depth gauge, the threat search panel (file upload is retired) and the new
// navigation; no SEV labels, and no Chamber or All 50 links in production. Static checks on the served source and
// the built bundle, plus the menu script run against a stub page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => readFileSync(join(root, relative), 'utf8');
const source = read('ui/abyss/index.html');
const built = read('index.html');
const menuScript = read('ui/abyss/detonation-menu.js');
const searchScript = read('ui/abyss/threat-search.js');
const bundle = read('ui/abyss/assets/index-retro.js');
const roster = JSON.parse(read('data/creatures.json'));

const TIERS = [
  ['Sunlight', '0–200 m', 'Clean'], ['Twilight', '200–1,000 m', 'Risky'], ['Midnight', '1,000–4,000 m', 'Steals'],
  ['Abyss', '4,000–6,000 m', 'Takes control'], ['Trench', '6,000–11,000 m', 'Destroys'],
];

// Runs detonation-menu.js against a stub page and returns the context (window.__menu) and what it removed or hid.
function runMenu({ meta, hostname = 'localhost', ocean = null, fish = { fish: [] } } = {}) {
  const removed = [], hidden = [];
  const devLinks = ['Legend', 'All 50', 'Chamber'].map((text) => ({ text, remove() { removed.push(text); } }));
  const devSections = ['legend', 'index'].map((id) => ({ id, set hidden(value) { hidden.push(id); } }));
  const document = {
    documentElement: { dataset: {} },
    querySelector: (selector) => (selector === 'meta[name="do-env"]' && meta !== undefined ? { content: meta } : null),
    querySelectorAll: (selector) => (selector === 'nav [data-dev-only]' ? devLinks : selector === 'section[data-dev-only]' ? devSections : []),
    createElement: () => ({ children: [], append(...nodes) { this.children.push(...nodes); } }),
  };
  const clock = { now: 0 };
  const responses = { '/api/ocean': ocean, '/data/creatures.json': roster, '/data/fish.json': fish };
  const context = {
    document, performance: { now: () => clock.now }, location: { hostname }, matchMedia: () => ({ matches: false }), AbortSignal, addEventListener() {}, removeEventListener() {}, setTimeout() { return 0; },
    fetch: async (url) => ({ ok: responses[url] != null, json: async () => responses[url] }),
  };
  context.window = context;
  vm.runInNewContext(menuScript, context);
  return { menu: context.__menu, removed, hidden, document, clock };
}

test('the served page invites a threat search and does not promise a safety guarantee', () => {
  const premise = 'Search a known threat. We research it and rebuild it as a safe, simulated desktop. The deeper it sinks, the more harm it does.';
  assert.match(source, /<p class="eyebrow mono">Threat simulator · on Vultr<\/p>/);
  assert.ok(source.includes(`<p class="premise">${premise}</p>`));
  assert.ok(source.includes(`<meta name="description" content="${premise}">`));
  assert.ok(source.includes(`<p class="loader-premise" aria-hidden="true">${premise}</p>`));
  assert.doesNotMatch(source, /50 real cyberattacks|Every attack is a creature|safety guarantee/);
});

test('the five tier names, depths and meanings are on the depth gauge', () => {
  for (const [name, depth, meaning] of TIERS) {
    assert.ok(menuScript.includes(`name: '${name}', depth: '${depth}', meaning: '${meaning}'`), name);
  }
  assert.match(menuScript, /gauge-sub/);
  assert.match(menuScript, /gauge-sun/); // the sun mark on Sunlight
  assert.ok(bundle.includes('window.__menu.placeGauge(Tk,oA)'), 'labels move to the camera stops, spaced so they never overlap');
  assert.match(menuScript, /function placeGauge\(stops, range\)/);
  assert.ok(bundle.includes('window.__menu.gaugeItem(e)'), 'the built bundle builds the gauge from the tiers');
  const { menu } = runMenu();
  assert.deepEqual(Object.values(menu.tiers).map((tier) => tier.name).reverse(), TIERS.map(([name]) => name));
  assert.deepEqual({ ...menu.meaning }, { 5: 'Clean', 4: 'Risky', 3: 'Steals', 2: 'Takes control', 1: 'Destroys' });
});

test('no SEV labels in the page, the menu scripts or the built bundle', () => {
  for (const [name, text] of [['ui/abyss/index.html', source], ['index.html', built], ['detonation-menu.js', menuScript], ['threat-search.js', searchScript], ['index-retro.js', bundle]]) {
    assert.doesNotMatch(text, /\bSEV(?:\d|\$\{)/, name);
    if (name !== 'index-retro.js') assert.doesNotMatch(text, /“Nothing”|Open a File|One Click/, name); // the bundle keeps the old ladder as unused data
  }
});

test('file upload is retired: no Drop a file panel, picker, consent box or upload script on the menu', () => {
  for (const [name, text] of [['ui/abyss/index.html', source], ['index.html', built]]) {
    assert.doesNotMatch(text, /id="upload"|Drop a file|type="file"|drop-consent|drop-panel\.js|nav-upload|Skip to file upload|Go straight to upload/, name);
    assert.doesNotMatch(text, /href="#upload"/, name);
  }
  assert.equal(existsSync(join(root, 'ui/abyss/drop-panel.js')), false);
  assert.doesNotMatch(searchScript, /\/api\/jobs|FormData|type: 'file'/, 'the search panel starts no job');
});

test('the menu loads the threat search script and styles, and the search panel mounts under the hero premise', () => {
  assert.match(source, /<link rel="stylesheet" href="\/ui\/abyss\/threat-search\.css">/);
  assert.match(source, /<script src="\/ui\/abyss\/threat-search\.js"><\/script>/);
  assert.match(source, /<a class="site-skip" href="#threat-search">Skip to threat search<\/a>/);
  assert.match(source, /<a class="loader-search" href="#threat-search">Go straight to search →<\/a>/);
  assert.match(searchScript, /premise\.after\(form\)/);
  assert.match(searchScript, /form\.id = 'threat-search'/);
  assert.match(searchScript, /setAttribute\('role', 'search'\)/);
  const manifest = JSON.parse(read('ui/abyss/manifest.json'));
  const listed = new Map(manifest.files.map((file) => [file.path, file]));
  for (const path of ['ui/abyss/threat-search.js', 'ui/abyss/threat-search.css']) {
    const entry = listed.get(path);
    assert.ok(entry, `${path} is in the manifest, so the server will serve it`);
    assert.equal(entry.sha256, createHash('sha256').update(readFileSync(join(root, path))).digest('hex'), `${path} hash is current (run node tools/refresh-abyss-manifest.mjs)`);
  }
  assert.equal(listed.has('ui/abyss/drop-panel.js'), false);
});

test('navigation is Bestiary, How it works and Sound', () => {
  const nav = source.match(/<nav aria-label="Page">([\s\S]*?)<\/nav>/)[1];
  const labels = [...nav.matchAll(/<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, '').trim());
  assert.deepEqual(labels.slice(0, 3), ['Bestiary', 'How it works', 'Sound off']);
  assert.doesNotMatch(nav, /Upload/);
  assert.match(nav, /<a href="\/bestiary">Bestiary<\/a>/);
  assert.match(nav, /<a href="\/about">How it works<\/a>/);
  assert.match(nav, /<button class="snd"/);
});

test('Legend, All 50 and Chamber exist only as development-only elements', () => {
  const nav = source.match(/<nav aria-label="Page">([\s\S]*?)<\/nav>/)[1];
  const dev = nav.match(/<span class="nav-dev" data-dev-only>([\s\S]*?)<\/span>/)[1];
  assert.match(dev, /Legend/); assert.match(dev, /All 50/); assert.match(dev, /Chamber/);
  assert.doesNotMatch(nav.replace(dev, '').replace(/<!--[\s\S]*?-->/g, ''), /All 50|Chamber|chamber\.html|#index|#legend|Creature matrix/);
  assert.match(source, /<section class="stage legend"[^>]*data-dev-only>/);
  assert.match(source, /<section class="stage index"[^>]*data-dev-only>/);
  assert.doesNotMatch(source, /Explore all 50/);
  assert.equal(built, source, 'index.html is the build of ui/abyss/index.html (run node build.mjs)');
});

test('production rule: the do-env meta wins, otherwise a non-loopback host is production', () => {
  const { menu } = runMenu();
  assert.equal(menu.isProduction('production', 'localhost'), true);
  assert.equal(menu.isProduction('development', 'detonation.example'), false);
  assert.equal(menu.isProduction('auto', 'detonation.example'), true);
  assert.equal(menu.isProduction(undefined, 'detonation.example'), true);
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'demo.localhost']) assert.equal(menu.isProduction('auto', host), false, host);
});

test('with the production flag set, the Chamber and All 50 links and sections are gone', () => {
  const production = runMenu({ meta: 'production' });
  assert.equal(production.document.documentElement.dataset.env, 'production');
  assert.deepEqual(production.removed, ['Legend', 'All 50', 'Chamber']);
  assert.deepEqual(production.hidden, ['legend', 'index']);
  const development = runMenu({ meta: 'auto' });
  assert.equal(development.document.documentElement.dataset.env, 'development');
  assert.deepEqual(development.removed, []);
});

test('the shared ocean: empty water, one creature per eaten finding, sizes, caps', async () => {
  const empty = await runMenu().menu.creatures();
  const ghosts = empty.filter((record) => record.ghost);
  assert.equal(empty.filter((record) => !record.ghost).length, 1, 'only the octopus when /api/ocean returns nothing');
  assert.equal(ghosts.length, 11);

  const ocean = {
    schools: [{ species: 'pufferfish', depth: 'sunlight', count: 400 }, { species: 'barracuda', depth: 'twilight', count: 3 }],
    creatures: [{ findingId: 'encrypt', eaten: 8 }, { findingId: 'steal-credentials', eaten: 1 }, { findingId: 'keylog', eaten: 0 }, { findingId: 'not-a-finding', eaten: 5 }],
  };
  const { menu } = runMenu({ ocean });
  const records = (await menu.creatures()).filter((record) => !record.ghost);
  const byId = Object.fromEntries(records.map((record) => [record.id, record]));
  assert.ok(byId.encrypt && byId['steal-credentials'], 'eaten findings appear');
  assert.ok(!byId.keylog && !byId['not-a-finding'], 'undiscovered and unknown findings are absent');
  assert.equal(byId.encrypt.sev, 1);
  assert.equal(byId['steal-credentials'].sev, 3);
  assert.ok(byId.encrypt.sizeMul > byId['steal-credentials'].sizeMul, 'a creature that ate 8 files is bigger than one that ate 1');
  assert.equal(records.filter((record) => record.kind === 'school').length, 2);

  const many = { creatures: roster.creatures.map((entry) => ({ findingId: entry.findingId, eaten: 1 })) };
  const capped = (await runMenu({ ocean: many }).menu.creatures()).filter((record) => record.kind === 'creature');
  assert.equal(capped.length, 22);
});

test('hover tag, click and fish caps', async () => {
  const ocean = { schools: [{ species: 'pufferfish', depth: 'sunlight', count: 40 }], creatures: [{ findingId: 'encrypt', eaten: 42 }] };
  const fish = { fish: [{ species: 'pufferfish', types: ['zip', 'iso'] }] };
  const { menu } = runMenu({ ocean, fish });
  const records = (await menu.creatures()).filter((record) => !record.ghost);
  const kraken = records.find((record) => record.id === 'encrypt');
  assert.match(menu.meta(kraken), /^Scrambles your files so you cannot open them\b.* · has eaten 42 files$/);
  assert.equal(kraken.name, 'Kraken');
  assert.match(menu.meta(records.find((record) => record.kind === 'school')), /\.zip \.iso · 40 files in this school/);
  assert.ok(bundle.includes('window.__menu.open(t.a)'), 'canvas click opens the Bestiary card');
  assert.ok(bundle.includes('if(window.__menu.open(e.a))return;'), 'list and panel click open the Bestiary card');
  assert.match(menuScript, /location\.assign\(`\/bestiary#\$\{encodeURIComponent\(a\.anchor\)\}`\)/);
  assert.match(read('ui/abyss/retro-pixel.js'), /SCHOOL_FISH = 30/);
  assert.match(menuScript, /MAX_CREATURES = 22/);
});

test('accessibility: text is always present and the search panel is keyboard reachable', () => {
  assert.match(searchScript, /label\.htmlFor = 'ts-q'/); // a real label for the search box
  assert.match(searchScript, /out\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(source, /role="status"/);
  assert.match(read('ui/abyss/retro-pixel.js'), /prefers-reduced-motion: reduce/);
  assert.match(read('ui/abyss/retro-pixel.css'), /@media \(prefers-reduced-motion: reduce\)/);
});

test('a finding creature starts small, grows 14% with every file and stops at the cap', async () => {
  const eaten = roster.creatures.slice(0, 20).map((entry, i) => ({ findingId: entry.findingId, eaten: 1 + i }));
  const { menu } = runMenu({ ocean: { creatures: eaten } });
  const sizes = (await menu.creatures()).filter((record) => record.kind === 'creature').sort((a, b) => a.eaten - b.eaten).map((record) => record.sizeMul);
  assert.equal(sizes.length, 20);
  assert.equal(sizes[0], 0.4, 'the first file: 0.4 x nominal, well under the old 0.7');
  for (let i = 1; i < sizes.length; i++) {
    if (sizes[i - 1] < 2.1) assert.ok(sizes[i] / sizes[i - 1] >= 1.13 || sizes[i] === 2.1, `file ${i + 1} is a visible step up`);
    assert.ok(sizes[i] <= 2.1, 'capped');
  }
  assert.equal(sizes.filter((size) => size === 2.1).length, 20 - 13, 'the cap is reached with the 14th file');
});

test('a featured creature scales its share of the screen with its size; the octopus and schools keep theirs', async () => {
  const ocean = { schools: [{ species: 'pufferfish', depth: 'sunlight', count: 9 }], creatures: [{ findingId: 'encrypt', eaten: 1 }, { findingId: 'steal-credentials', eaten: 40 }] };
  const { menu } = runMenu({ ocean });
  const records = await menu.creatures();
  const of = (id) => records.find((record) => record.id === id);
  assert.ok(Math.abs(menu.fit(of('encrypt')) - 0.4 / 2.1) < 1e-9);
  assert.equal(menu.fit(of('steal-credentials')), 1);
  assert.equal(menu.fit(of('octopus')), 1);
  assert.equal(menu.fit(records.find((record) => record.kind === 'school')), 1);
  assert.ok(bundle.includes('*innerWidth*c*window.__menu.fit(i.a));'), 'the layout hook is in the built bundle');
});

test('hovering a creature pings at most once every 3 seconds', () => {
  const { menu, clock } = runMenu();
  let pings = 0;
  const audio = { on: true, ping() { pings++; } };
  const at = (ms) => { clock.now = ms; menu.ping(audio); return pings; };
  assert.equal(at(10_000), 1);
  assert.equal(at(10_001), 1);
  assert.equal(at(12_999), 1, 'still silent just under 3 s');
  assert.equal(at(13_000), 2, 'sounds again after 3 s');
  assert.equal(at(14_000), 2);
  audio.on = false;
  assert.equal(at(20_000), 2, 'sound off: nothing');
  audio.on = true;
  assert.equal(at(20_001), 3, 'a muted hover did not start a cooldown');
  assert.ok(bundle.includes('T&&window.__menu.ping(pE,y)') && !bundle.includes('pE.ping()'), 'the renderer pings through the cooldown, naming the creature');
  assert.ok(bundle.includes('get ctx(){return sE},get out(){return lE}'), 'the renderer lends its audio context and master output');
});

// A stand-in audio graph that records what is built, so the zone routing can be checked without a browser.
function fakeAudio() {
  const log = { oscillators: [], filters: [], pings: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect(next) { return next; }, disconnect() {} });
  const ctx = {
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param() }),
    createDelay: () => ({ ...node(), delayTime: param() }),
    createBiquadFilter: () => { const f = { ...node(), frequency: param(), Q: param(), type: '' }; log.filters.push(f); return f; },
    createOscillator: () => { const o = { ...node(), frequency: param(), type: '', start() {}, stop() {} }; log.oscillators.push(o); return o; },
  };
  return { log, audio: { on: true, ctx, out: node(), ping() { log.pings++; } } };
}

test('the hover sound follows the zone: the bell down to Twilight, a deeper voice below it', () => {
  const { menu, clock } = runMenu();
  const play = (sev, rig) => { clock.now += 5000; menu.ping(rig.audio, { a: { sev } }); };
  for (const sev of [5, 4]) { const rig = fakeAudio(); play(sev, rig); assert.equal(rig.log.pings, 1, `sev ${sev} keeps the bell`); assert.equal(rig.log.oscillators.length, 0); }
  const cutoff = {}, voices = {};
  for (const sev of [3, 2, 1]) {
    const rig = fakeAudio(); play(sev, rig);
    assert.equal(rig.log.pings, 0, `sev ${sev} does not use the bell`);
    cutoff[sev] = rig.log.filters[0].frequency.value; voices[sev] = rig.log.oscillators.length;
  }
  assert.ok(cutoff[3] > cutoff[2] && cutoff[2] > cutoff[1], 'the deeper the zone, the darker the sound');
  assert.deepEqual(voices, { 3: 1, 2: 2, 1: 2 }, 'Abyss and Trench add a sub tone');
  const unknown = fakeAudio(); play(undefined, unknown); assert.equal(unknown.log.pings, 1, 'an unknown creature gets the bell');
  // A renderer that does not lend its audio context still sounds: the bell.
  const bare = { on: true, pings: 0, ping() { this.pings++; } };
  clock.now += 5000; menu.ping(bare, { a: { sev: 1 } });
  assert.equal(bare.pings, 1, 'no audio context: the bell');
});

test('a creature row says which fish it ate; a creature counted before the list existed shows no line', async () => {
  const recent = [
    { species: 'pufferfish', type: 'zip', depth: 'abyss', day: '2026-03-02' }, { species: 'flounder', type: 'pdf', depth: 'trench', day: '2026-03-01' },
    { species: 'coelacanth', type: null, depth: 'abyss', day: '2026-03-01' }, { species: 'barracuda', type: 'exe', depth: 'abyss', day: '2026-02-28' },
    { species: 'barracuda', type: 'exe', depth: 'abyss', day: '2026-02-27' },
  ];
  const { menu } = runMenu({ ocean: { creatures: [{ findingId: 'encrypt', eaten: 30, recent }, { findingId: 'steal-credentials', eaten: 2 }] } });
  const records = await menu.creatures();
  const row = menu.rowName(records.find((record) => record.id === 'encrypt'));
  assert.equal(row.className, 'nb-name');
  assert.equal(row.textContent, 'Kraken');
  assert.equal(row.children[0].className, 'nb-ate mono');
  assert.equal(row.children[0].textContent, 'ate .zip, .pdf, Coelacanth +1 · last 2\u00a0Mar');
  assert.equal(menu.rowName(records.find((record) => record.id === 'steal-credentials')).children.length, 0);
  // The base fish (data/ocean-base.json) are named and have no day; a school lists its well-known members.
  const base = [{ species: 'barracuda', type: 'exe', depth: 'trench', name: 'WannaCry', year: 2017, base: true }, { species: 'barracuda', type: 'exe', depth: 'trench', name: 'CryptoLocker', base: true }];
  const seeded = runMenu({ ocean: { creatures: [{ findingId: 'encrypt', eaten: 2, recent: base }], schools: [{ species: 'barracuda', depth: 'twilight', count: 9, known: ['Bonzi Buddy', 'Hotbar', 'Comet Cursor', 'Gator'] }] } }).menu;
  const seededRecords = await seeded.creatures();
  assert.equal(seeded.rowName(seededRecords.find((record) => record.id === 'encrypt')).children[0].textContent, 'ate WannaCry, CryptoLocker');
  assert.equal(seeded.rowName(seededRecords.find((record) => record.kind === 'school')).children[0].textContent, 'incl. Bonzi Buddy, Hotbar, Comet Cursor +1');
  assert.ok(bundle.includes('window.__menu.rowName(e.a)'), 'the zone card rows use it');
});

test('fish schools sit at the back, spread wide and do not dodge the featured creature; one fish per file', async () => {
  const ocean = { schools: [{ species: 'pufferfish', depth: 'sunlight', count: 7 }, { species: 'flounder', depth: 'twilight', count: 3 }] };
  const school = (await runMenu({ ocean }).menu.creatures()).filter((record) => record.kind === 'school');
  assert.equal(school.length, 2, 'one school per species and depth');
  for (const record of school) assert.deepEqual([record.back, record.spread], [14, 2.5]);
  assert.deepEqual([...school.map((record) => record.school.count)].sort(), [3, 7], 'the record carries the file count: the renderer draws one fish per file');
  assert.ok(bundle.includes('*(X?1:e.spread??1)') && bundle.includes('-(e.back??0))'), 'the renderer places schools behind and wide');
  assert.ok(bundle.includes('e.a.kind!==`school`'), 'schools do not make way for featured creatures');
});
