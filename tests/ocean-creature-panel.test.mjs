// The creature panel (ui/abyss/creature-panel.js): clicking a creature or school shows the fish inside it, and each fish can be
// loaded into the training desktop as an illustration (backend/detonation/fish-replays.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FINDING_IDS, fishGuide, fishOfRun, fishPatches } from '../backend/detonation/fish-replays.mjs';
import { publish } from '../backend/detonation/replay.mjs';
import { DesktopEventHub } from '../backend/desktop-world-events.mjs';
import { loadBase } from '../backend/detonation/ocean-state.mjs';
import { compileScene, parseScene, sceneSource, sceneStartWorld } from '../backend/detonation/fish-scenes.mjs';
import { createRequire } from 'node:module';

const Model = createRequire(import.meta.url)('../ui/desktop/world-model.js');

const read = relative => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

test('every base fish with a scene, and every creature behaviour, plays as valid desktop patches, labelled an illustration', async () => {
  const base = loadBase();
  const hub = new DesktopEventHub({ maxRuns: 200 });
  const runs = [...base.filter(fish => fish.scene).map(fish => `fish-${fish.ref}`), ...FINDING_IDS.map(id => `fish-f-${id}-exe`), 'fish-f-encrypt-any', 'fish-s-sunlight-pdf', 'fish-s-twilight-exe'];
  for (const run of runs) {
    const fish = fishOfRun(run, base);
    assert.ok(fish, run);
    const patches = fishPatches(fish);
    await publish(run, patches, { hub }); // checked against the world model, patch by patch
    // A quest (a scene with `story`, QUESTS.md) opens on its story card instead of the illustration banner.
    if (fish.scene && /^story$/m.test(sceneSource(fish.scene))) continue;
    const first = patches[0].notifications.history.find(note => note.title.endsWith(': an illustration'));
    assert.equal(first?.title, `${fish.name}: an illustration`, run);
    if (!fish.scene) assert.match(first.body, /Not a recording of a real run/, run);
  }
  const wannacry = fishPatches(fishOfRun('fish-b0', base));
  assert.ok(wannacry.some(patch => Object.values(patch.fs?.nodes ?? {}).some(node => node?.encrypted === true)), 'WannaCry encrypts the seeded documents');
});

test('a run id that names no fish is refused', () => {
  const base = loadBase();
  assert.equal(fishOfRun(`fish-${base.find(fish => fish.noDesktop).ref}`, base), null, 'a fish with no desktop has no run');
  for (const run of ['fish-b999', 'fish-f-made-up-exe', 'fish-f-encrypt-EXE', 'fish-s-abyss-exe', 'fish-x', 'fish-b1x']) assert.equal(fishOfRun(run, base), null, run);
  const server = read('server.mjs');
  assert.match(server, /if \(run\.startsWith\('fish-'\) && !desktopEvents\.has\(run\)\) \{\n\s+const fish = fishOfRun\(run, oceanBase\);\n\s+if \(!fish\) \{\n\s+sendJson\(response, 404/);
});

test('clicking a creature or a school opens the panel over the ocean; the octopus still opens its Bestiary card', () => {
  const menu = read('ui/abyss/detonation-menu.js');
  assert.match(menu, /if \(\(a\.kind === 'creature' \|\| a\.kind === 'school'\) && window\.__creaturePanel\) \{\n\s+window\.__creaturePanel\.open\(a, tier\(a\.sev\)\);\n\s+return true;/);
  for (const page of ['index.html', 'ui/abyss/index.html']) {
    const html = read(page);
    assert.ok(html.indexOf('/ui/abyss/creature-panel.js') > html.indexOf('/ui/abyss/detonation-menu.js'), page);
  }
  assert.ok(JSON.parse(read('ui/abyss/manifest.json')).files.some(file => file.path === 'ui/abyss/creature-panel.js'), 'served and hash-checked');
});

test('the panel offers the desktop only where the server serves it, and writes text only', () => {
  const panel = read('ui/abyss/creature-panel.js');
  assert.match(panel, /fetch\('\/api\/desktop-templates\/status'[^\n]*\n[^\n]*s\?\.enabled === true/);
  assert.match(panel, /if \(canLoad && fish\.run\)/);
  assert.match(panel, /frame\.src = `\/desktop\.html\?job=\$\{fish\.run\}\$\{fish\.os \? `&os=\$\{fish\.os\}` : ''\}`;/);
  assert.match(panel, /if \(fish\.why\) text\.append\(make\('small', 'cp-fish-why', `No desktop demo: \$\{fish\.why\}`\)\);/);
  assert.doesNotMatch(panel, /innerHTML|outerHTML|insertAdjacentHTML|eval\(/);
  // Run ids are built only from checked parts: a base ref, a finding id and a file type.
  assert.match(panel, /\/\^b\\d\{1,3\}\$\/\.test\(fish\.ref \?\? ''\)/);
  assert.match(panel, /const RUN_PART = \/\^\[a-z0-9-\]\{1,30\}\$\/;/);
});

test('every base fish has a desktop scene that compiles, or says why it has none', () => {
  const base = loadBase();
  assert.equal(base.filter(fish => fish.scene).length, 59, "59 of 60 base fish have a scene (Jerusalem is DOS-only)");
  for (const fish of base) {
    if (!fish.scene) { assert.ok(fish.noDesktop && fish.noDesktop !== 'No desktop scene yet.', `${fish.name}: needs a scene or a reason`); continue; }
    const { os, patches } = compileScene(sceneSource(fish.scene), fish, fish.scene);
    assert.equal(os, fish.os, fish.name);
    assert.ok(patches.length >= 2 && patches.length <= 30, `${fish.name}: ${patches.length} steps`);
    // Something to see: a window, a wallpaper or changed files besides the first notification.
    const end = patches.reduce((world, patch) => Model.createWorld(world, patch), sceneStartWorld());
    assert.ok(end.windows.length || end.sys.wallpaperUrl || Object.values(end.fs.nodes).some(node => node?.encrypted || node?.trashed), `${fish.name}: shows nothing`);
  }
});

test('scene scripts: errors name the line, and nothing outside the fictional world gets through', () => {
  const bad = [
    ['about\n  | x\nopen Desktop/missing.txt', /scene:3: open: no file Desktop\/missing\.txt/],
    ['about\n  | x\nfrobnicate', /scene:3: unknown command "frobnicate"/],
    ['  | orphan', /scene:1: an indented line needs a command above it/],
    ['run x', /needs "about"/],
    ['about\n  | x\nmail m\n  from A <a@real-company.com>\n  subject Hi', /scene:3: the desktop refuses this step/],
    ['about\n  | x\npage p https://real-bank.com/login\n  title Bank', /scene:3: the desktop refuses this step/],
    ['about\n  | x\nfile Windows/System32/x.dll', /must be <Desktop\|Documents\|Downloads\|Pictures\|Music\|Home\|a drive>\/\[folder\/…\]<name>/],
  ];
  for (const [source, error] of bad) assert.throws(() => compileScene(source), error, source);
  assert.deepEqual(parseScene('# c\nrun a b\n  cpu 5\n  | t').map(s => [s.cmd, s.args, s.props, s.text]), [['run', ['a', 'b'], [['cpu', '5']], ['t']]]);
});

test('every fish plays as a step-by-step guide: each step changes the desktop and shows only its own new banners', () => {
  const base = loadBase();
  const runs = [...base.filter(fish => fish.scene).map(fish => `fish-${fish.ref}`), 'fish-f-encrypt-exe', 'fish-f-steal-browser-any', 'fish-s-twilight-exe'];
  for (const run of runs) {
    const fish = fishOfRun(run, base);
    const guide = fishGuide(fish);
    assert.equal(guide.name, fish.name, run);
    assert.ok(guide.about && guide.steps.length >= 1, `${run}: about and steps`);
    if (fish.scene) assert.ok(guide.lesson && guide.steps.length >= 2 && guide.steps.every(step => step.title && step.text && step.look), `${run}: authored steps and a lesson`);
    // Walk it as the desktop page does: setup at sign-in, then each step on top of the world the last one left.
    let world = guide.setup ? Model.createWorld(sceneStartWorld(), guide.setup) : sceneStartWorld();
    for (const step of guide.steps) {
      assert.ok(Object.keys(step.patch).length, `${run}: "${step.title}" changes nothing`);
      const shown = new Set(world.notifications.banners.map(item => item.id));
      assert.ok((step.patch.notifications?.banners ?? []).every(item => !shown.has(item.id)), `${run}: "${step.title}" repeats a banner`);
      world = Model.createWorld(world, step.patch);
    }
    // The guide ends where the streamed replay ends.
    const streamed = fishPatches(fish).reduce((w, patch) => Model.createWorld(w, patch), sceneStartWorld());
    const key = w => JSON.stringify([w.windows.map(win => win.id), w.notifications.history.map(n => n.id), w.data.processes, w.data.mail.messages.map(m => m.id), w.fs.nodes, w.sys.wallpaperUrl]);
    assert.equal(key(world), key(streamed), `${run}: the guide and the stream end on the same desktop`);
  }
});

test('the desktop page plays a fish guide step by step and keeps a replay through Restart', () => {
  const page = read('ui/desktop/desktop.js');
  const html = read('ui/desktop/index.html');
  for (const id of ['ocean-guide', 'guide-next', 'guide-back', 'guide-all', 'guide-hide', 'ocean-guide-toggle', 'gate-points', 'gate-back']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(page, /request\(`\/api\/desktop\/guide\?run=\$\{run\}`\)/);
  assert.match(page, /if \(!state\.guide\.data\) subscribeWorldEvents\(\);/, 'a guided fish does not stream');
  assert.match(page, /for \(const event of state\.replayEvents\) applyStreamEvent\(event\);/, 'Restart re-applies a streamed replay');
  assert.match(page, /link\.hidden = embedded;/, 'no Exit inside the ocean panel');
});

test('a step can play its creature attack: a known kind, inside a step, with beats; the guide names the lit creature sheet', () => {
  const { guide } = compileScene('about\n  | x\nstep One\n  look here\n  | t\nattack macro-dropper\n  | the document\n  | PowerShell\nopen Documents\nstep Two\n  look there\n  | u\nopen taskmanager');
  assert.deepEqual(guide.steps[0].attack, { kind: 'macro-dropper', beats: ['the document', 'PowerShell'] });
  assert.equal(guide.steps[1].attack, undefined);
  assert.throws(() => compileScene('about\n  | x\nattack scareware'), /attack belongs inside a step/);
  assert.throws(() => compileScene('about\n  | x\nstep A\n  | t\nattack wipe-everything'), /attack is one of/);
  const base = loadBase();
  const emotet = fishGuide(fishOfRun(`fish-${base.find(fish => fish.name === 'Emotet').ref}`, base));
  assert.deepEqual(emotet.creature, { name: 'Gulper eel', sprite: '/ui/abyss/pixel/creatures/gulper-eel-spritesheet.png' });
  assert.equal(emotet.steps.filter(step => step.attack).length, 1);
  const withAttack = base.filter(fish => fish.scene && fishGuide(fish).steps.some(step => step.attack));
  assert.ok(withAttack.length >= 30, `${withAttack.length} scenes play an attack`);
  for (const fish of withAttack) assert.ok(fishGuide(fish).creature?.sprite?.startsWith('/ui/abyss/pixel/'), `${fish.name}: a lit pixel creature`);
  const page = read('ui/desktop/desktop.js');
  assert.match(page, /window\.PixelLit\.relight\(/, 'the creature is lit with its normal map');
  assert.match(read('ui/desktop/index.html'), /<script src="\/ui\/abyss\/pixel-lit\.js" defer><\/script>/);
});

test('Windows opens a document in the WordPad view, the Windows idiom of TextEdit rich text', () => {
  const notepad = read('desktop-comparison/win11-final/src/containers/applications/apps/notepad.jsx');
  assert.match(notepad, /const DOCUMENT = \/\\.\(docx\?\|docm\|rtf\|odt\)\$\/i;/);
  assert.match(notepad, /- WordPad/);
});

test('an uploaded fish plays a written scene for its file type and its creature: named steps, a lesson, the guide follows the trainee', () => {
  const types = ['exe', 'any', 'docm', 'xlsm', 'pdf', 'js-wsh', 'ps1', 'zip', 'dmg', 'macho', 'scr', 'jpeg'];
  const runs = [...FINDING_IDS.flatMap(id => types.map(type => `fish-f-${id}-${type}`)), ...types.flatMap(type => [`fish-s-sunlight-${type}`, `fish-s-twilight-${type}`])];
  for (const run of runs) {
    const fish = fishOfRun(run, []);
    assert.ok(fish, run);
    const guide = fishGuide(fish);
    assert.ok(guide.steps.length >= 2 && guide.lesson, `${run}: steps and a lesson`);
    assert.ok(guide.steps.every(step => step.title && !/^Step \d+$/.test(step.title) && step.text && step.look), `${run}: every step is named and explained`);
  }
  assert.deepEqual(fishOfRun('fish-f-steal-credentials-js-wsh', []), { name: 'An uploaded file', type: 'js-wsh', findingId: 'steal-credentials' }, 'hyphens in both parts');
  const macro = fishGuide(fishOfRun('fish-f-encrypt-docm', []));
  assert.deepEqual(macro.steps.slice(1, 3).map(step => step.when?.kind), ['run', 'run'], 'opening the document and Enable Content are followed');
  assert.match(macro.steps[0].next.windows, /Double-click/);
  assert.equal(fishGuide(fishOfRun('fish-f-spread-dmg', [])).os, 'macos');
});
