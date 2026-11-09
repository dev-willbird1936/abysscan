// Detonation Ocean main menu glue (surface page only). Runs at the end of <body>, before the renderer module.
// The renderer is built around a list of "attack" records; tools/patch-abyss-sprites.mjs hands it the shared
// ocean instead: real records from GET /api/ocean (one creature per eaten finding, one anchor per fish school),
// the octopus, and invisible "ghost" records that keep the camera framing and the seabed in place when the ocean
// is empty. Nothing here touches the renderer's logic; every network failure degrades to an empty ocean.
(() => {
  'use strict';

  // ---- Environment ------------------------------------------------------------------------------------------
  // Production = the server sets <meta name="do-env" content="production">, or nothing forces development and the
  // page is not served from a loopback host. content="development" forces development anywhere.
  const isProduction = (flag, hostname) =>
    flag === 'production' || (flag !== 'development' && !/^(localhost|127\.0\.0\.1|\[::1\]|::1|.+\.localhost)$/.test(hostname));
  const production = isProduction(document.querySelector('meta[name="do-env"]')?.content, location.hostname);
  document.documentElement.dataset.env = production ? 'production' : 'development';
  if (production) {
    // Links go; sections stay in the DOM (the renderer fills them) but are hidden and left out of the dive.
    document.querySelectorAll('nav [data-dev-only]').forEach((node) => node.remove());
    document.querySelectorAll('section[data-dev-only]').forEach((node) => { node.hidden = true; });
  }

  // ---- Tiers (SPEC 9.4) -------------------------------------------------------------------------------------
  const TIERS = {
    5: { name: 'Sunlight', depth: '0–200 m', meaning: 'Clean', line: 'The run finished and no harmful or suspicious behaviour was observed.' },
    4: { name: 'Twilight', depth: '200–1,000 m', meaning: 'Risky', line: 'Suspicious but unproven, or the run was inconclusive. The light is going.' },
    3: { name: 'Midnight', depth: '1,000–4,000 m', meaning: 'Steals', line: 'The file read credentials, browser data or keys, logged keystrokes, captured the screen or tried to send data out.' },
    2: { name: 'Abyss', depth: '4,000–6,000 m', meaning: 'Takes control', line: 'The file planted itself, took remote control, injected code, switched off defences or fetched a second stage.' },
    1: { name: 'Trench', depth: '6,000–11,000 m', meaning: 'Destroys', line: 'The file encrypted, wiped or deleted data, dropped a ransom note or tried to spread.' },
  };
  const SEV = { sunlight: 5, twilight: 4, midnight: 3, abyss: 2, trench: 1 };
  const tier = (sev) => TIERS[sev] ?? TIERS[1];
  const meaning = Object.fromEntries(Object.entries(TIERS).map(([sev, entry]) => [sev, entry.meaning]));

  // ---- Ocean records ----------------------------------------------------------------------------------------
  const MAX_CREATURES = 22; // SPEC 9.7: more are listed in the Bestiary only
  const MAX_SCHOOLS = 24;
  const BASE_SIZE = 0.7; // renderer units: the octopus and the fish schools are 0.7 x the renderer's nominal size
  // A finding creature starts small and each file it eats makes it 14% bigger (x0.4 for one file, x2.1 from 14 files on).
  const FIRST_SIZE = 0.4, GROWTH = 1.14, MAX_SIZE = 2.1;
  const SCHOOL_BACK = 14, SCHOOL_SPREAD = 2.5; // schools sit this far behind the creatures, spread this much wider (see the patch tool)
  const grownSize = (eaten) => Math.min(MAX_SIZE, FIRST_SIZE * GROWTH ** (Math.max(1, eaten) - 1));
  const SHEET_VECTOR = { cookiecutter: 'theft', anglerfish: 'phishing', siphonophore: 'botnet', viperfish: 'exploit', 'isopod-host': 'supply-chain', octopus: 'ransomware' };
  const sheetOf = (path) => /\/([a-z-]+)-(?:sunlight|twilight|midnight|abyss|trench)-spritesheet\.png$/.exec(path ?? '')?.[1];
  const hash = (text) => [...text].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
  const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
  const files = (count) => `${count} ${count === 1 ? 'file' : 'files'}`;

  // The renderer reads these legacy fields; the rest is the Detonation Ocean record.
  const record = (fields) => ({ attacker_cost: 3, lure: false, type: '', cls: '', stages: 0, summary: '', lesson: '', confidence: '', source_urls: [], impact: 3, ...fields });

  // Ghosts: two per band at the extremes of the band, plus the floor Kraken the seabed scene is built around.
  const ghost = (sev, year, extra = {}) => record({ id: `ghost-${sev}-${year}`, name: '', year, vector: 'bec', sev, ghost: true, ...extra });
  const GHOSTS = [
    ...[5, 4, 3, 2, 1].flatMap((sev) => [ghost(sev, 0), ghost(sev, 100)]),
    ghost(1, 50, { id: 'ghost-floor', vector: 'ransomware', impact: 5 }),
  ];

  // Trench creatures live in the first Trench band: the renderer's floor scene reads every Kraken in the deepest band.
  // The renderer draws a featured creature at a fixed share of the screen, so it scales that share by this: its size over the cap.
  const fit = (a) => (a.kind === 'creature' ? a.sizeMul / MAX_SIZE : 1);

  function creatureRecord(entry, { eaten, recent }) {
    const sprite = entry.sprite ?? entry.fallbackSprite ?? 'ui/abyss/pixel/creatures/viperfish-abyss-spritesheet.png';
    // The renderer needs a family for its hidden body; sheets without a legacy family take one by depth.
    const vector = SHEET_VECTOR[sheetOf(sprite)] ?? { midnight: 'theft', abyss: 'exploit', trench: 'ransomware' }[entry.depth] ?? 'exploit';
    return record({
      id: entry.findingId, anchor: entry.findingId, kind: 'creature', name: entry.creature, year: 8 + (hash(entry.findingId) % 85),
      vector, sev: SEV[entry.depth] ?? SEV.abyss, sprite, eaten, recent: Array.isArray(recent) ? recent : [], plainWords: entry.plainWords,
      sizeMul: grownSize(eaten),
    });
  }

  const octopus = (entry) => record({
    id: 'octopus', anchor: 'octopus', kind: 'system', name: entry.creature, year: 50, vector: 'ransomware', sev: SEV.sunlight,
    sprite: entry.fallbackSprite, plainWords: entry.plainWords, sizeMul: BASE_SIZE,
  });

  // Sunlight records must use a species whose model the renderer preloads before the shallows are built (bec: octopus).
  function schoolRecord(school, fishByName) {
    const entry = fishByName.get(school.species);
    return record({
      id: `school-${school.species}-${school.depth}`, anchor: `fish-${school.species}`, kind: 'school', name: `${titleCase(school.species)} school`,
      year: 8 + (hash(school.species + school.depth) % 85), vector: 'bec', impact: 1, sev: SEV[school.depth] ?? SEV.sunlight, back: SCHOOL_BACK, spread: SCHOOL_SPREAD,
      school: { species: school.species, count: school.count, types: entry?.types ?? [], art: arts.get(school.species) ?? null, known: Array.isArray(school.known) ? school.known : [], knownRefs: Array.isArray(school.knownRefs) ? school.knownRefs : [] }, sizeMul: BASE_SIZE,
    });
  }

  // First frame of a species' swim sheet, cropped to the fish (sheets face left). Null when missing: the renderer
  // then draws the stand-in from pixel-fish.js.
  const arts = new Map();
  function fishArt(entry) {
    if (!entry?.sprite) return Promise.resolve(null);
    // Colour and normal map of the first frame, cropped to the same box so the lit fish keeps its alignment.
    return window.PixelLit.pair(`/${entry.sprite}`).then(({ color, normal }) => {
      const size = color.height;
      const frame = (source) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        cv.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, size, size, 0, 0, size, size);
        return cv;
      };
      const src = frame(color), map = frame(normal);
      const alpha = src.getContext('2d').getImageData(0, 0, size, size).data;
      let x0 = size, y0 = size, x1 = -1, y1 = -1;
      for (let i = 3; i < alpha.length; i += 4) if (alpha[i]) {
        const p = (i - 3) / 4, x = p % size, y = (p / size) | 0;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (x1 < 0) return null;
      const crop = (from) => {
        const cv = document.createElement('canvas');
        cv.width = x1 - x0 + 1; cv.height = y1 - y0 + 1;
        cv.getContext('2d').drawImage(from, x0, y0, cv.width, cv.height, 0, 0, cv.width, cv.height);
        return cv;
      };
      return { color: crop(src), normal: crop(map) };
    }, () => null);
  }

  const getJson = (url) => fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const state = { records: [] };

  async function creatures() {
    const [ocean, roster, fish] = await Promise.all([getJson('/api/ocean'), getJson('/data/creatures.json'), getJson('/data/fish.json')]);
    const entries = new Map((roster?.creatures ?? []).map((entry) => [entry.findingId, entry]));
    const fishByName = new Map((fish?.fish ?? []).map((entry) => [entry.species, entry]));
    const found = (Array.isArray(ocean?.creatures) ? ocean.creatures : [])
      .filter((item) => entries.has(item.findingId) && Number.isFinite(item.eaten) && item.eaten > 0)
      .sort((a, b) => b.eaten - a.eaten).slice(0, MAX_CREATURES)
      .map((item) => creatureRecord(entries.get(item.findingId), item));
    const schools = (Array.isArray(ocean?.schools) ? ocean.schools : [])
      .filter((school) => typeof school.species === 'string' && school.depth in SEV && SEV[school.depth] >= 4 && Number.isFinite(school.count) && school.count > 0)
      .sort((a, b) => b.count - a.count).slice(0, MAX_SCHOOLS);
    await Promise.all([...new Set(schools.map((s) => s.species))].filter((name) => !arts.has(name))
      .map(async (name) => arts.set(name, await fishArt(fishByName.get(name)))));
    const schoolRecords = schools.map((school) => schoolRecord(school, fishByName));
    const agent = (roster?.system ?? []).find((entry) => entry.creature === 'Octopus' && entry.fallbackSprite);
    state.records = [...found.filter(Boolean), ...schoolRecords, ...(agent ? [octopus(agent)] : [])];
    return [...GHOSTS, ...state.records];
  }

  // ---- Hover tag, click and zone cards ---------------------------------------------------------------------
  const firstSentence = (text) => {
    const sentence = text.split(/(?<=\.)\s/)[0];
    return sentence.length > 70 ? `${sentence.slice(0, sentence.lastIndexOf(' ', 66))}…` : sentence;
  };

  function meta(a) {
    if (a.kind === 'creature') return `${firstSentence(a.plainWords)} · has eaten ${files(a.eaten)}`;
    if (a.kind === 'school') return `${a.school.types.map((type) => `.${type}`).join(' ') || 'file fish'} · ${files(a.school.count)} in this school`;
    return firstSentence(a.plainWords ?? '');
  }

  const coarse = matchMedia('(pointer: coarse)').matches;
  const hint = (a) => `${coarse ? 'Tap' : 'Click'} ${a?.kind === 'creature' ? 'to see the fish inside it' : a?.kind === 'school' ? 'to see the fish in this school' : 'to open its Bestiary card'}`;

  function open(a) {
    if (!a?.anchor) return false;
    // A creature or a fish school opens the creature panel over the ocean (creature-panel.js); anything else its Bestiary card.
    if ((a.kind === 'creature' || a.kind === 'school') && window.__creaturePanel) {
      window.__creaturePanel.open(a, tier(a.sev));
      return true;
    }
    location.assign(`/bestiary#${encodeURIComponent(a.anchor)}`);
    return true;
  }

  // What a creature ate (GET /api/ocean `recent`: uploads newest first, then the base fish): a base fish by its name, an upload by its
  // file type, or its species when the type is withheld. A school lists its well-known base members (`known`).
  const fishKind = (fish) => fish.name ?? (fish.type ? `.${fish.type}` : titleCase(fish.species));
  const ateLine = (a) => {
    const kinds = [...new Set(a.kind === 'school' ? a.school.known : (a.recent ?? []).map(fishKind))];
    if (!kinds.length) return '';
    const day = a.recent?.[0]?.day;
    return `${a.kind === 'school' ? 'incl.' : 'ate'} ${kinds.slice(0, 3).join(', ')}${kinds.length > 3 ? ` +${kinds.length - 3}` : ''}${day ? ` · last ${new Date(`${day}T00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(' ', ' ')}` : ''}`;
  };

  // The name in a zone-card row; a creature that ate fish gets a second line saying which.
  function rowName(a) {
    const name = document.createElement('span');
    name.className = 'nb-name';
    name.textContent = a.name;
    const line = ateLine(a);
    if (line) {
      const ate = document.createElement('small');
      ate.className = 'nb-ate mono';
      ate.textContent = line;
      name.append(ate);
    }
    return name;
  }

  // The renderer pings whenever the pointer lands on a creature; pointing at another one within 3 s stays silent.
  // The renderer's ping is a bright 1.1 kHz sonar bell: right for sunlit water, wrong in the dark. From Midnight down the sound gets
  // lower, softer and slower the deeper the creature lives (sev 3 Midnight, 2 Abyss, 1 Trench): a distant sonar blip, a slow low pulse,
  // then a deep swell with a sub tone and no top end. Sunlight and Twilight keep the bell.
  const PING_COOLDOWN_MS = 3000;
  const DEEP_VOICE = {
    3: { f: 560, f2: 470, wave: 'sine', lp: 1100, peak: 0.14, attack: 0.03, decay: 1.1, echo: 0.42, echoGain: 0.38, sub: 0 },
    2: { f: 250, f2: 180, wave: 'triangle', lp: 760, peak: 0.22, attack: 0.09, decay: 1.7, echo: 0.62, echoGain: 0.36, sub: 0.35 },
    1: { f: 118, f2: 74, wave: 'triangle', lp: 560, peak: 0.32, attack: 0.22, decay: 2.6, echo: 0.9, echoGain: 0.3, sub: 0.6 },
  };
  let pingedAt = -Infinity;
  // Plays the deep voice for a zone; false when the renderer did not lend its audio context (then the caller falls back to the bell).
  function deepPing(audio, sev) {
    const voice = DEEP_VOICE[sev], ctx = audio.ctx, out = audio.out;
    if (!voice || !ctx || !out) return false;
    const t = ctx.currentTime, end = t + voice.decay + 0.15;
    const swell = ctx.createGain(), tone = ctx.createBiquadFilter(), echo = ctx.createDelay(1.5), feedback = ctx.createGain();
    swell.gain.setValueAtTime(1e-4, t);
    swell.gain.exponentialRampToValueAtTime(voice.peak, t + voice.attack);
    swell.gain.exponentialRampToValueAtTime(1e-4, t + voice.decay);
    tone.type = 'lowpass'; tone.frequency.value = voice.lp; tone.Q.value = 0.6;
    echo.delayTime.value = voice.echo; feedback.gain.value = voice.echoGain;
    swell.connect(tone); tone.connect(out); tone.connect(echo); echo.connect(feedback); feedback.connect(echo); feedback.connect(out);
    const voices = [[voice.wave, voice.f, voice.f2, 1]];
    if (voice.sub) voices.push(['sine', voice.f / 2, voice.f2 / 2, voice.sub]); // the sub tone an octave down
    for (const [wave, from, to, level] of voices) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = wave; gain.gain.value = level;
      osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + voice.decay);
      osc.connect(gain); gain.connect(swell); osc.start(t); osc.stop(end);
    }
    setTimeout(() => { for (const node of [swell, tone, echo, feedback]) node.disconnect(); }, (voice.decay + voice.echo * 6 + 1) * 1000);
    return true;
  }
  function ping(audio, creature) {
    const now = performance.now();
    if (!audio.on || now - pingedAt < PING_COOLDOWN_MS) return;
    pingedAt = now;
    if (!deepPing(audio, creature?.a?.sev)) audio.ping();
  }

  const badge = (a) => (a.kind === 'creature' ? `×${a.eaten}` : a.kind === 'school' ? `×${a.school.count}` : '');

  function counts(sev) {
    const here = state.records.filter((a) => a.sev === sev);
    const found = here.filter((a) => a.kind === 'creature').length;
    const schools = here.filter((a) => a.kind === 'school');
    const parts = [];
    if (found) parts.push(`${found} ${found === 1 ? 'creature' : 'creatures'}`);
    if (schools.length) parts.push(`${schools.length} fish ${schools.length === 1 ? 'school' : 'schools'}`);
    return parts.length ? parts.join(' · ') : 'Nothing here yet';
  }

  const FLOOR = { 6: ['Trench', 'the deepest water', 'Destroys', 'The deepest water of the dive. The light is long gone.'], 7: ['Trench', 'the floor', 'Destroys', 'The floor of the dive. Hot water vents from black smokers, and nothing goes deeper.'] };

  function zones() {
    for (const card of document.querySelectorAll('.zone-card')) {
      const st = +card.dataset.st;
      const sev = [0, 5, 4, 3, 2, 1, 1, 1][st];
      const info = tier(sev);
      const [name, place, word, line] = FLOOR[st] ?? [info.name, info.depth, info.meaning, info.line];
      card.querySelector('.eyebrow').textContent = `${name} · ${place}`;
      card.querySelector('h2').textContent = word;
      card.querySelector('.lede').textContent = line;
      const count = card.querySelector('.zone-count');
      if (count) { count.textContent = FLOOR[st] ? '' : counts(sev); count.hidden = Boolean(FLOOR[st]); }
      card.setAttribute('aria-label', `${name} ${word}`);
      card.closest('.zone')?.setAttribute('aria-label', `${name} ${word}`);
    }
    const found = state.records.filter((a) => a.kind === 'creature').length;
    // The base fish (data/ocean-base.json) are named history; uploads join them without names.
    document.querySelector('.end-line').textContent = found ? 'Explore historical illustrations and anonymous results from analysed uploads.' : 'The ocean is waiting for its first file.';
    document.querySelector('.end-sub').textContent = 'It began with 60 well-known files and attacks, named. Uploads join them anonymously: only counts, and the type and day of the files creatures ate, in batches.';
    document.querySelector('.legend-lede').textContent = 'Depth is the tier: the deeper the water, the more harm the file did. Each form is a creature family.';
  }

  function gaugeItem(sev) {
    const info = tier(sev);
    const item = document.createElement('li');
    const name = document.createElement('b');
    name.className = 'gauge-name';
    if (sev === 5) {
      const sun = document.createElement('i');
      sun.className = 'gauge-sun';
      sun.setAttribute('aria-hidden', 'true');
      name.append(sun);
    }
    name.append(info.name);
    const sub = document.createElement('span');
    sub.className = 'gauge-sub';
    sub.textContent = `${info.depth} · ${info.meaning}`;
    item.append(name, sub);
    return item;
  }

  // Gauge labels sit at their zone's camera stop (stops[1..5] = Sunlight..Trench, renderer camera heights; range = the
  // gauge's full depth), so the dot rests on the zone on screen. Stops move with what the ocean holds and can crowd, so
  // a label that would overlap the one above is pushed down just enough, and the column is pushed back up off the floor.
  function placeGauge(stops, range) {
    const box = document.querySelector('.gauge');
    const items = [...document.querySelectorAll('.gauge-zones li')].sort((a, b) => b.dataset.sev - a.dataset.sev);
    const H = box?.clientHeight ?? 0;
    const at = items.map((li) => Math.min(1, Math.max(0, -(stops[6 - li.dataset.sev]?.pos?.y ?? 0) / range)));
    if (H > 0) {
      const half = items.map((li) => li.offsetHeight / 2 / H), gap = 4 / H;
      for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i], at[i - 1] + half[i - 1] + half[i] + gap);
      at[at.length - 1] = Math.min(at[at.length - 1], 1 - half[at.length - 1]);
      for (let i = at.length - 2; i >= 0; i--) at[i] = Math.min(at[i], at[i + 1] - half[i + 1] - half[i] - gap);
    }
    items.forEach((li, i) => li.style.setProperty('--p', at[i].toFixed(3)));
    // Label heights change once the pixel font loads: place again then (the renderer re-runs this on resize).
    if (!placeGauge.fonts) placeGauge.fonts = document.fonts?.ready.then(() => placeGauge(stops, range));
  }

  // ---- Section snap -----------------------------------------------------------------------------------------
  // The renderer has a camera stop per ocean stage (window.__ocean.anchors()) but no snap, and the gaps differ: Midnight to Abyss
  // moves the camera twice as far as the others, and the Trench has three stages. So when a scroll gesture settles between two
  // stages it glides on to the next stop in the scroll direction: one scroll of any size, even a single wheel notch, moves one
  // stage (a scroll under 30 px springs back). The surface hero and the zones snap; the end of the dive, the legend and the
  // index scroll freely.
  let snapDir = 0, snapTimer = 0, gestureFrom = null;
  function stops() {
    const ocean = window.__ocean, range = document.documentElement.scrollHeight - innerHeight;
    if (!ocean?.anchors || range <= 0) return null;
    const zones = document.querySelectorAll('.stage.zone:not([hidden])').length;
    return ocean.anchors().slice(0, zones + 1).map((a) => a * range);
  }
  // The stop one stage on from where the gesture began; a fling that runs past it by over half the next gap keeps going to
  // the stop nearest where it landed.
  function snapTarget(at, from, y, dir) {
    if (Math.abs(y - from) < 30) return at.reduce((best, stop) => (Math.abs(stop - from) < Math.abs(best - from) ? stop : best));
    const ahead = dir > 0 ? at.filter((stop) => stop > from + 2) : at.filter((stop) => stop < from - 2).reverse();
    if (!ahead.length) return null;
    const [one, two] = ahead;
    if (two !== undefined && Math.abs(y - one) > Math.abs(two - one) / 2 && Math.sign(y - one) === dir) {
      return ahead.reduce((best, stop) => (Math.abs(stop - y) < Math.abs(best - y) ? stop : best));
    }
    return one;
  }
  function settle() {
    const lenis = window.__lenis, at = stops(), from = gestureFrom;
    gestureFrom = null;
    if (!lenis || !at || at.length < 2 || from === null || document.documentElement.classList.contains('os-on')) return;
    const y = lenis.targetScroll ?? scrollY, last = at[at.length - 1];
    if (from > last + 2 && y > last + 2) return; // below the floor stop the page scrolls freely
    const to = snapTarget(at, Math.min(from, last), y, snapDir);
    if (to === null || Math.abs(to - y) < 2 || (y > last + 2 && snapDir > 0)) return;
    lenis.scrollTo(to, { duration: Math.min(1.2, 0.5 + Math.abs(to - y) / 2000), easing: (k) => 1 - (1 - k) ** 3 });
  }
  const queueSettle = (dir, ms) => {
    gestureFrom ??= window.__lenis?.targetScroll ?? scrollY;
    if (dir) snapDir = dir;
    clearTimeout(snapTimer);
    snapTimer = setTimeout(settle, ms);
  };
  addEventListener('wheel', (event) => { if (!event.ctrlKey) queueSettle(Math.sign(event.deltaY), 220); }, { passive: true });
  addEventListener('touchmove', () => { clearTimeout(snapTimer); }, { passive: true });
  let touchY = 0;
  addEventListener('touchstart', (event) => { touchY = event.touches[0]?.clientY ?? 0; gestureFrom = scrollY; }, { passive: true });
  addEventListener('touchend', (event) => queueSettle(Math.sign(touchY - (event.changedTouches[0]?.clientY ?? touchY)), 450), { passive: true });
  const SCROLL_KEYS = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 };
  addEventListener('keydown', (event) => {
    if (SCROLL_KEYS[event.key] && !event.target.closest?.('input, textarea, select, [contenteditable]')) queueSettle(event.shiftKey && event.key === ' ' ? -1 : SCROLL_KEYS[event.key], 260);
  });

  // ---- Sound on by default ---------------------------------------------------------------------------------
  // Browsers allow audio only after a user gesture, so the first click, tap or key press turns the sound on, unless the
  // visitor turned it off before (remembered here). A first click on the sound button itself decides on its own.
  const SOUND_KEY = 'ocean-sound';
  const soundButton = document.querySelector('.snd');
  if (soundButton) {
    let pref = null;
    try { pref = localStorage.getItem(SOUND_KEY); } catch { /* storage blocked: default on */ }
    const kinds = ['pointerdown', 'keydown'];
    const arm = (event) => {
      kinds.forEach((kind) => removeEventListener(kind, arm, true));
      if (pref === 'off' || event.target.closest?.('.snd') || soundButton.getAttribute('aria-pressed') === 'true') return;
      soundButton.click();
    };
    kinds.forEach((kind) => addEventListener(kind, arm, true));
    soundButton.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      setTimeout(() => { try { localStorage.setItem(SOUND_KEY, soundButton.getAttribute('aria-pressed') === 'true' ? 'on' : 'off'); } catch { /* ignore */ } });
    });
  }

  // The renderer supplies distance to the current camera band. Re-sort after any jump, including a jump straight
  // to the Trench; waiting for one fixed intermediate band would deadlock. Thumbnail export deliberately loads all.
  function waitForNearby(records, distance) {
    if (new URLSearchParams(location.search).has('bake-thumbs') || records.some(record => distance(record.band) <= 1.5)) return Promise.resolve();
    return new Promise(done => {
      const check = () => {
        if (records.some(record => distance(record.band) <= 1.5)) { removeEventListener('scroll', queue); done(); }
      };
      const queue = () => requestAnimationFrame(check);
      addEventListener('scroll', queue, { passive: true });
      queue();
    });
  }

  window.__menu = { waitForNearby, isProduction, production, tier, tiers: TIERS, meaning, creatures, meta, hint, open, badge, rowName, ping, fit, zones, gaugeItem, placeGauge, state };
})();
