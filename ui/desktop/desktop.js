// Creature desktop parent (WORLD-CONTRACT v3). The parent owns two states:
//   world  (OceanWorldModel)   apps, windows, files, data and settings both OS shells render;
//   desk   (OceanDesktopModel) the CONTRACT-V2 scene machine: lure, choice, attack, debrief.
// OceanSceneWorld projects every desk change into the world. Shell gestures arrive as world intents; the parent applies
// them and maps the ones that matter to the scene back to V2 intents. Swapping OS changes only which shell is visible.
(() => {
  'use strict';

  const SHELL_PATHS = Object.freeze({
    windows: '/previews/win11-final/index.html?oceanShell=1',
    macos: '/previews/macos-final/index.html?oceanShell=1',
  });
  const DEFAULT_SHELL_ORIGIN = 'http://127.0.0.1:4189';
  // The local shell server's origin, or on the live site a path on this origin (/s/<token>) the app serves the shells from.
  const SHELL_ORIGIN_RE = /^(?:http:\/\/127\.0\.0\.1:\d{2,5}|\/s\/[A-Za-z0-9_-]{16,64})$/;
  const DEPTH_IDS = Object.freeze(['sunlight', 'twilight', 'midnight', 'abyss', 'trench']);
  const WORLD_VERSION = 3;
  const CREATURE_MAX_BYTES = 1_500_000;
  const CONNECT_TIMEOUT_MS = 15000;
  const ATTACH_RETRY_MS = 2000;
  const FX_FAILURE_DONE_MS = 1500;
  const SANDBOX_RUN_PATH = '/api/desktop/sandbox/run';
  const ATTACK_FX_TIMEOUT_MS = 26000;
  const OPT_IN_STORAGE_KEY = 'ocean-opt-in';
  // A job replay (?job=<jobId>) plays a neutral desktop: the world is data/desktop-profiles/detonation-replay.json and the
  // scene never advances, so no lure, process or attack appears. The state machine still needs a catalog entry to start on.
  const REPLAY_PROFILE = 'detonation-replay';
  const REPLAY_CATALOG_ENTRY = 'network-abuse-abyss';
  const PROOF_URL = '/chamber.html?demo=oauth-2023&profile=deception-abyss';
  const state = {
    profile: null,
    replay: false,
    profileExecutionMode: 'unknown',
    profileSimulationEnabled: false,
    hackathonProofAvailable: false,
    templatesEnabled: false,
    shellOrigin: DEFAULT_SHELL_ORIGIN,
    optedIn: false,
    reducedMotion: false,
    creatureSrc: null,
    scene: null,
    desk: null,
    world: null,
    baseWorld: null,
    shellsReady: false,
    shellPorts: new Map(),
    osMode: 'windows',
    lastSeq: new Map(),
    pushQueued: false,
    tickTimer: null,
    debriefKey: null,
    showedKey: null,
    showedClosed: null,
    fx: { id: null, run: null, startedIds: new Set(), unsubscribers: new Set() },
    eraStart: null,
    sandboxRun: 'none',
    sandboxSignature: 'null',
    sandboxListeners: new Set(),
    replayEvents: [],
    // The step-by-step guide of a fish run (/api/desktop/guide): at -1 before sign-in, 0 the introduction, 1..n the steps
    // applied so far, n + 1 the end. base is the world right after sign-in, which Back rebuilds from.
    // followed: the trainee's own gesture played the step; note: what the guide says about a gesture it did not expect.
    guide: { data: null, at: -1, base: null, hidden: false, frames: [], fx: null, followed: false, note: null },
    // Effects (QUESTS.md §5): none is what a real OS does (its own sounds only); low and high add game feel.
    effects: (() => { try { return ['none', 'low', 'high'].includes(localStorage.getItem('ocean-fx')) ? localStorage.getItem('ocean-fx') : 'low'; } catch { return 'low'; } })(),
  };
  const dom = Object.fromEntries([
    'ocean-stage', 'template-shell-host', 'windows-shell-frame', 'macos-shell-frame', 'ocean-status',
    'ocean-fx-layer', 'ocean-fx-caption', 'ocean-hint', 'ocean-debrief', 'ocean-showed', 'ocean-intro', 'intro-title', 'intro-line', 'intro-next',
    'intro-dismiss', 'ocean-brief', 'ocean-guide', 'guide-eyebrow', 'guide-count', 'guide-hide', 'guide-title', 'guide-step', 'guide-activity', 'guide-dots',
    'guide-back', 'guide-next', 'guide-all', 'ocean-guide-toggle', 'gate-points', 'gate-back', 'ocean-exit',
    'ocean-unavailable', 'unavailable-title', 'unavailable-detail', 'unavailable-proof',
    'ocean-gate', 'gate-title', 'gate-summary', 'gate-mode', 'gate-opt-in', 'gate-enter',
    'ocean-chrome', 'os-windows', 'os-macos', 'ocean-chip', 'ocean-chip-detail', 'ocean-chip-creature',
    'ocean-proof-link', 'ocean-restart', 'screen-reader-announcer', 'ocean-fx-toggle', 'guide-hud',
  ].map(id => [id, document.getElementById(id)]));

  class ApiError extends Error {
    constructor(message, status = 0, code = '') {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  const clone = value => JSON.parse(JSON.stringify(value));

  function announce(message) {
    dom['screen-reader-announcer'].textContent = message;
  }

  const FETCH_OPTIONS = Object.freeze({ cache: 'no-store', credentials: 'same-origin', mode: 'same-origin', redirect: 'error' });

  async function request(endpoint, { method = 'GET', body } = {}) {
    const options = { ...FETCH_OPTIONS, method, headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(endpoint, options);
    } catch {
      throw new ApiError('The training API could not be reached. Check the local server and retry.');
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiError('The training API returned an unreadable response.', response.status);
    }
    if (!response.ok) {
      const message = isRecord(result) && typeof result.error === 'string'
        ? result.error
        : `The training API returned status ${response.status}.`;
      const code = isRecord(result) && typeof result.code === 'string' ? result.code : '';
      throw new ApiError(message, response.status, code);
    }
    return result;
  }

  function boundedText(value, max = 160) {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
  }

  function hasExactKeys(value, keys) {
    return isRecord(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
  }

  function validateProfile(value, profileId) {
    const anchor = isRecord(value) ? value.anchor : null;
    if (!isRecord(value) || value.id !== profileId ||
        !['familyId', 'family', 'creature', 'depthId', 'depth', 'action'].every(key => boundedText(value[key])) ||
        !DEPTH_IDS.includes(value.depthId) ||
        typeof value.assetUrl !== 'string' ||
        !/^\/ocean-creatures\/[a-z-]+\/(sunlight|twilight|midnight|abyss|trench)\.gif$/.test(value.assetUrl) ||
        !isRecord(anchor) || !boundedText(anchor.id) || !boundedText(anchor.name) ||
        !(anchor.year === null || Number.isInteger(anchor.year)) ||
        !boundedText(anchor.victimAction, 240) || !boundedText(anchor.status, 40)) {
      throw new ApiError('This creature profile is not available.');
    }
    return value;
  }

  function anchorLabel(profile) {
    return profile.anchor.year ? `${profile.anchor.name} (${profile.anchor.year})` : profile.anchor.name;
  }

  function readOptIn(profileId) {
    try { return window.sessionStorage.getItem(OPT_IN_STORAGE_KEY) === profileId; }
    catch { return false; }
  }

  function writeOptIn(profileId) {
    try { window.sessionStorage.setItem(OPT_IN_STORAGE_KEY, profileId); }
    catch { /* Opt-in still applies to this page view when storage is unavailable. */ }
  }

  function showUnavailable(title, detail, { proof = false } = {}) {
    dom['ocean-status'].hidden = true;
    dom['unavailable-title'].textContent = title;
    dom['unavailable-detail'].textContent = detail;
    dom['unavailable-proof'].hidden = !proof;
    dom['unavailable-proof'].textContent = state.profileSimulationEnabled
      ? 'Open the separate OAuth exercise'
      : 'Open the gated OAuth worker proof';
    dom['ocean-unavailable'].hidden = false;
    document.body.dataset.sessionState = 'preview-error';
    announce(`${title}. ${detail}`);
  }

  function proofIsAvailable() {
    return state.profile?.id === 'deception-abyss' && (state.profileSimulationEnabled || state.hackathonProofAvailable);
  }

  async function loadCreatureSrc(profile) {
    try {
      const response = await fetch(profile.assetUrl, { credentials: 'same-origin', mode: 'same-origin', redirect: 'error' });
      if (!response.ok || response.headers.get('content-type') !== 'image/gif') return null;
      const blob = await response.blob();
      if (blob.size === 0 || blob.size > CREATURE_MAX_BYTES) return null;
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' && reader.result.startsWith('data:image/gif;base64,') ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function scriptsAreLoaded() {
    return typeof window.OceanDesktopModel?.createState === 'function' && typeof window.OceanWorldModel?.applyIntent === 'function' &&
      typeof window.OceanSceneWorld?.project === 'function' && typeof window.OceanScenes?.get === 'function' &&
      typeof window.OceanFx?.play === 'function';
  }

  // GET /api/desktop/world: the seed plus the profile overlay. A broken overlay falls back to the plain seed.
  // Without an overlay the wallpaper follows the scene depth.
  async function loadWorld(profile) {
    for (const endpoint of [`/api/desktop/world?profile=${encodeURIComponent(state.replay ? REPLAY_PROFILE : profile.id)}`, '/api/desktop/world']) {
      try {
        const response = await fetch(endpoint, { ...FETCH_OPTIONS, headers: { Accept: 'application/json' } });
        if (!response.ok) continue;
        const world = await response.json();
        if (!window.OceanWorldModel.validate(world).ok) continue;
        if (response.headers.get('x-desktop-profile') !== 'applied' && !world.sys.wallpaperUrl) world.sys.wallpaper = `depth-${profile.depthId}`;
        return world;
      } catch {
        // Try the next source.
      }
    }
    return null;
  }

  async function loadProfile(profileId) {
    let templates;
    try {
      const [catalog, health, status] = await Promise.all([
        request('/api/ocean/profiles'),
        request('/api/healthz'),
        request('/api/desktop-templates/status').catch(() => null),
      ]);
      if (!isRecord(catalog) || !Array.isArray(catalog.profiles) || catalog.profiles.length !== 30) {
        throw new ApiError('The creature profile catalog is incomplete.');
      }
      if (!isRecord(health) || typeof health.mode !== 'string') throw new ApiError('Execution mode is unavailable.');
      state.profileExecutionMode = health.mode;
      state.profileSimulationEnabled = health.mode === 'local-synthetic';
      state.hackathonProofAvailable = health.mode === 'vultr-hackathon-ready' && health.inferenceConfigured === true;
      // One of the 30 creature profiles, or one of the 60 scenarios (it plays on the profile of its family and depth).
      state.replay = profileId === REPLAY_PROFILE;
      const catalogId = state.replay ? REPLAY_CATALOG_ENTRY : profileId;
      const entry = catalog.profiles.find(item => isRecord(item) && item.id === catalogId) ??
        window.OceanScenarioProfile?.resolve(catalog, catalogId);
      if (!entry) {
        window.location.replace('/ocean-profiles.html');
        return;
      }
      state.profile = validateProfile(entry, catalogId);
      templates = status;
      state.templatesEnabled = isRecord(templates) && templates.enabled === true;
      if (state.templatesEnabled && typeof templates.shellOrigin === 'string' && SHELL_ORIGIN_RE.test(templates.shellOrigin)) state.shellOrigin = templates.shellOrigin;
    } catch (error) {
      showUnavailable('Creature desktop unavailable', error.message);
      return;
    }
    const profile = state.profile;
    document.body.dataset.family = profile.familyId;
    document.body.dataset.depth = profile.depthId;
    renderChrome(profile);
    if (!state.templatesEnabled) {
      showUnavailable(
        'The OS desktops are not served in this mode',
        'The Windows and macOS desktops are private local assets, so this mode runs no scripted scene and no in-process session. Nothing on this page is a cloud or worker run.',
        { proof: proofIsAvailable() },
      );
      return;
    }
    state.scene = scriptsAreLoaded() ? window.OceanScenes.get(profile.id, profile.anchor) : null;
    if (!state.scene) {
      showUnavailable('The training scene did not load', 'The scripted scene files are unavailable, so no desktop is started. Reload the page or restart the local server.');
      return;
    }
    // A scenario scene shows the profile's creature in the wallpaper and starts on the OS its real victim used.
    if (state.scene.attackKind) state.scene.creature = { family: profile.familyId, depth: profile.depthId, sprite: profile.assetUrl };
    if (state.scene.os) state.osMode = state.scene.os;
    // A replay can start on the OS its victim used (?os=windows|macos, from the ocean's creature panel).
    const replayOs = new URLSearchParams(window.location.search).get('os');
    if (state.replay && (replayOs === 'windows' || replayOs === 'macos')) state.osMode = replayOs;
    state.baseWorld = await loadWorld(profile);
    if (!state.baseWorld) {
      showUnavailable('The desktop world did not load', 'The local server did not return a valid desktop world, so no desktop is started. Restart the local server, then reload.');
      return;
    }
    if (state.replay) await loadGuide();
    state.optedIn = readOptIn(profile.id);
    state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.desk = window.OceanDesktopModel.createState(profile, state.scene, { reducedMotion: state.reducedMotion });
    state.world = window.OceanSceneWorld.project(clone(state.baseWorld), { scene: state.scene, desk: state.desk, now: sceneNow() }).world;
    if (state.optedIn) setStatus('Preparing the desktop…');
    else openGate(profile);
    const creature = loadCreatureSrc(profile);
    const ready = await Promise.all(['windows', 'macos'].map(os => connectShell(os)));
    if (!ready.every(Boolean)) {
      for (const port of state.shellPorts.values()) port.close();
      state.shellPorts.clear();
      dom['windows-shell-frame'].src = 'about:blank';
      dom['macos-shell-frame'].src = 'about:blank';
      dom['ocean-gate'].hidden = true;
      showUnavailable('The OS desktops did not connect', 'The local Windows and macOS shells did not respond. Check that the local preview server is running, then reload.');
      return;
    }
    state.creatureSrc = await creature;
    state.shellsReady = true;
    // A fish with a guide plays step by step; every other replay streams its events.
    if (!state.guide.data) subscribeWorldEvents();
    // Both shells start from the same world; afterwards only the visible one is kept current.
    for (const os of ['windows', 'macos']) {
      postToShell(os, worldMessage());
      postToShell(os, { type: 'world-active', version: WORLD_VERSION, active: os === state.osMode });
    }
    setShellOs(state.osMode);
    dom['ocean-status'].hidden = true;
    dom['ocean-chrome'].hidden = !state.optedIn;
    syncBrief();
    renderGuide();
    document.body.dataset.sessionState = 'profile-scene';
    document.body.dataset.auth = state.desk.auth;
    if (state.optedIn) announce(`${profile.creature} desktop ready at ${profile.depth}. This is a fictional local training simulation. ${AUTH_ANNOUNCEMENTS.locked}`);
  }

  function setStatus(message) {
    dom['ocean-status'].textContent = message;
    dom['ocean-status'].hidden = false;
  }

  function renderChrome(profile) {
    const mode = state.profileSimulationEnabled ? 'Local simulation' : `Local simulation only (mode ${state.profileExecutionMode})`;
    const detail = state.replay ? 'Detonation replay' : `${profile.creature} · ${profile.depth} · ${anchorLabel(profile)}`;
    dom['ocean-chip'].title = `${mode}. Fictional, scripted and local; no camera, real accounts or files. ${detail}.`;
    dom['ocean-chip'].setAttribute('aria-label', `Training only. ${detail}. ${mode}.`);
    dom['ocean-chip-detail'].textContent = detail;
    dom['ocean-chip-creature'].src = profile.assetUrl;
    dom['ocean-chip-creature'].hidden = state.replay;
    dom['ocean-proof-link'].hidden = !proofIsAvailable();
    dom['ocean-proof-link'].textContent = state.profileSimulationEnabled ? 'OAuth exercise' : 'Gated proof';
    dom['ocean-proof-link'].title = state.profileSimulationEnabled
      ? 'Open the separate local OAuth consent exercise.'
      : 'Open the gated OAuth worker proof. It needs its own explicit opt-ins.';
    dom['ocean-proof-link'].href = PROOF_URL;
    // A replay comes from the ocean: back there, or nothing when it is shown inside the ocean's creature panel (it has Close).
    if (state.replay) {
      const embedded = window.top !== window.self;
      for (const link of [dom['gate-back'], dom['ocean-exit']]) {
        link.hidden = embedded;
        link.href = '/';
      }
      dom['gate-back'].textContent = 'Back to the ocean';
    }
  }

  // What a replay's gate says: a fish is a guided illustration, a job replay is the sandbox's evidence. The scenario wording in
  // index.html (lure, choice, creature animation) does not apply to either.
  const REPLAY_POINTS = Object.freeze({
    fish: (name, user = 'Dana Okafor', quest = false) => (quest ? [
      // A quest (QUESTS.md): the trainee plays the victim's working day.
      ['What happens.', `You are ${user} at work. Do your tasks as usual; somewhere in them is ${name}. The guide (bottom left) always says what to do next and follows what you do.`],
      ['Flag what looks wrong.', 'Hover over anything on the desktop and click its flag. The last card shows which flags were right, and why.'],
      ['You stay in control.', 'Press Next to skip a step, Back to undo one, or switch between Windows and macOS. Effects (top right) turns game sounds and highlights off, low or high.'],
      ['A training scenario.', 'Based on what really happened, with made-up people, banks and details. Nothing on this desktop is real, and it has no network.'],
    ] : [
      ['What happens.', `You sign in as ${user}, a pretend office worker. A guide then plays what ${name} did, one step at a time, and says where to look. Do the steps yourself, or press Next.`],
      ['You stay in control.', 'Go back a step, show it all at once, hide the guide, restart, or switch between Windows and macOS. The desktop is the same on both.'],
      ['An illustration.', 'A simplified retelling, not a recording. Nothing on this desktop is real, and it has no network.'],
    ]),
    job: () => [
      ['What happens.', 'You sign in as Dana Okafor, a pretend user. What the file did in the sandbox then appears on her desktop: files it changed, programs it started and connections it tried.'],
      ['You stay in control.', 'Restart, or switch between Windows and macOS at any time. The desktop is the same on both.'],
    ],
  });

  function openGate(profile) {
    const gate = dom['ocean-gate'];
    const fish = state.guide.data;
    dom['gate-title'].textContent = fish?.story ? `Play ${fish.name}` : fish ? `Watch ${fish.name}, step by step` : state.replay ? 'Enter the replay desktop' : `Enter the ${profile.creature} desktop`;
    dom['gate-summary'].textContent = fish ? String(fish.about).replace(/\n/g, ' ')
      : state.replay ? 'A fictional desktop that replays what the uploaded file did in the sandbox. Nothing on it is real.'
        : `${profile.family} · ${profile.depth}. Inspired by ${anchorLabel(profile)}: ${profile.anchor.victimAction}.`;
    if (state.replay) {
      dom['gate-points'].replaceChildren(...REPLAY_POINTS[fish ? 'fish' : 'job'](fish?.name, state.baseWorld?.user?.name, Boolean(fish?.story)).map(([lead, text]) => {
        const item = element('li');
        item.append(element('strong', '', lead), ` ${text}`);
        return item;
      }));
      dom['gate-enter'].textContent = fish ? 'Start' : 'Enter the desktop';
    }
    dom['gate-mode'].textContent = state.profileSimulationEnabled
      ? 'Runs entirely in this browser tab against the local server.'
      : `Local simulation only: this server is in ${state.profileExecutionMode} mode and no in-process session or cloud worker is used.`;
    dom['gate-opt-in'].checked = false;
    dom['gate-enter'].disabled = true;
    dom['ocean-status'].hidden = true;
    gate.hidden = false;
    dom['template-shell-host'].inert = true;
    dom['gate-opt-in'].focus({ preventScroll: true });
  }

  // The stored opt-in only skips this card. The lock screen and sign-in always come next.
  function acceptGate() {
    if (!state.profile || !dom['gate-opt-in'].checked) return;
    state.optedIn = true;
    writeOptIn(state.profile.id);
    dom['ocean-gate'].hidden = true;
    dom['template-shell-host'].inert = false;
    renderShowed();
    renderGuide();
    if (state.shellsReady) {
      dom['ocean-chrome'].hidden = false;
      dom['os-' + state.osMode].focus({ preventScroll: true });
      announce(`Entering the fictional training desktop. ${AUTH_ANNOUNCEMENTS[state.desk.auth]}`);
    } else {
      setStatus('Preparing the desktop…');
    }
  }

  const AUTH_ANNOUNCEMENTS = Object.freeze({
    locked: 'The desktop is locked. Sign in as the training user.',
    'sign-in': 'Sign in as the training user.',
    desktop: 'Signed in. The fictional desktop is ready.',
  });
  const PHASE_ANNOUNCEMENTS = Object.freeze({
    lure: 'A message needs your attention.',
    action: 'Your choice is next.',
    attack: 'The simulated attack animation is playing. Nothing real is affected.',
    safe: 'You took the safe path.',
    debrief: 'Debrief: review what happened.',
    done: 'The training scene is complete.',
  });

  // ---- the world and the shells -----------------------------------------------------------------------------

  function postToShell(os, message) {
    try { state.shellPorts.get(os)?.postMessage(message); }
    catch { /* A reloading shell reconnects and receives the next world. */ }
  }

  function worldMessage() {
    return { type: 'world', version: WORLD_VERSION, revision: state.world.revision, world: state.world };
  }

  // One push per task to the visible shell, however many changes the task made.
  function setWorld(world) {
    const before = state.world;
    world = decorate(world);
    state.world = world;
    if (before && world.phase === 'desktop') worldSounds(before, world);
    notifySandbox();
    renderShowed();
    renderActivity();
    if (!state.shellsReady || state.pushQueued) return;
    state.pushQueued = true;
    queueMicrotask(() => {
      state.pushQueued = false;
      postToShell(state.osMode, worldMessage());
    });
  }

  // What the guide adds to the world the shells draw: the cue (the next thing to click, glowed on screen) and the effects
  // level. Both are presentation: a refused or stale cue only means nothing glows.
  function decorate(world) {
    // Only a guided fish has a cue; the scenario scenes keep their own highlight model untouched.
    if (!state.guide.data) return world;
    const cue = state.optedIn && world.phase === 'desktop' ? cueNow(world) : [];
    const scene = { ...world.scene, cue: cue.length ? cue : null, fx: state.effects };
    if (JSON.stringify(scene) === JSON.stringify(world.scene)) return world;
    const next = { ...world, scene };
    return window.OceanWorldModel.validate(next).ok ? next : world;
  }

  // The keys to glow for the guide's next move, most specific first (the shell glows the first one on screen).
  function cueNow(world) {
    const { guide } = state;
    if (!guide.data || guide.at < 0 || guide.note) return [];
    const step = guide.data.steps[guide.at - 1];
    if (step?.cue) return step.cue;
    const when = guide.data.steps[guide.at]?.when;
    if (!when) return [];
    const mails = world.data.mail.messages;
    if (when.kind === 'mail') return [`mail:${when.ref}`, 'app:mail'];
    if (when.kind === 'visit') {
      const message = mails.find(item => item.link === `scene:${when.ref}`);
      if (message) return [`link:${message.id}`, `mail:${message.id}`, 'app:mail'];
      // A page on the favourites bar: glow its favourite (fav:<page>), then the browser that shows the bar.
      const fav = (world.data.web?.favorites ?? []).some(item => item.url === `scene:${when.ref}`);
      return fav ? [`fav:${when.ref}`, 'app:browser'] : ['app:browser'];
    }
    if (when.kind === 'choose') {
      const pid = when.ref.replace(/-(\d+|\*)$/, '');
      const page = world.data.web?.pages?.[pid];
      if (!page) return [];
      const M = window.OceanWorldModel;
      const typed = M.typedOf(world, pid);
      const empty = M.pageFields(page).findIndex((field, at) => typed[at] < field.value.length);
      const choice = when.ref.endsWith('-*') ? page.choices[0]?.choiceId : when.ref;
      return [...(empty >= 0 ? [`field:${pid}:${empty}`] : []), ...(choice ? [`choice:${choice}`] : []), 'app:browser'];
    }
    if (when.kind === 'prompt' || when.kind === 'detected') {
      const node = Object.values(world.fs.nodes).find(item => item && !item.trashed && item.program === when.ref);
      const message = node && mails.find(item => item.attachments.includes(node.id));
      return node ? [`file:${node.id}`, ...(message ? [`mail:${message.id}`, 'app:mail'] : ['app:files'])] : [];
    }
    // A program runs from its warning's Run button, or from a window's button that runs it (Enable Content, an installer).
    if (when.kind === 'run') return ['dialog-btn:run', 'dialog-btn:ok', ...(when.ref ? [`view-btn:run:${when.ref}`] : [])];
    if (when.kind === 'cancel') return ['dialog-btn:cancel'];
    if (when.kind === 'remove') return ['dialog-btn:trash'];
    if (when.kind === 'open') return [`app:${when.ref.split(':')[0]}`];
    if (when.kind === 'page' || when.kind === 'done') {
      // The button on the window's current page that does it (a wizard's Next or Finish, an Office bar's button); else the window.
      const win = world.windows.find(item => item.app === 'program' && item.payload?.view === when.ref);
      const view = world.data.views?.[when.ref];
      const page = view?.pages?.length ? view.pages[win?.payload?.page ?? 0] : view;
      const actions = [...(page?.buttons ?? []).map(button => button.action), page?.bar?.action].filter(Boolean);
      const wanted = when.kind === 'done' ? ['done'] : ['next', `page:${when.page}`];
      const hit = actions.find(action => wanted.includes(action)) ?? (view?.layout === 'wizard' && !page?.buttons?.length ? wanted[0] : null);
      return [...(hit ? [`view-btn:${hit}`] : []), `view:${when.ref}`];
    }
    return [];
  }

  // Sounds for what just changed. OS sounds play at every effects level (they are what the OS does); game cues only at low
  // and high. Played by the parent for the OS on screen, so the hidden shell stays quiet.
  function worldSounds(before, after) {
    const UI = window.OceanProgramUI;
    if (!UI?.sound) return;
    const opts = { os: state.osMode, volume: after.sys.volume, muted: after.sys.muted };
    const game = state.effects !== 'none';
    const seen = new Set(before.notifications.banners.map(item => item.id));
    const fresh = after.notifications.banners.filter(item => !seen.has(item.id));
    if (fresh.length) UI.sound(fresh.some(item => item.app === 'mail') ? 'mail' : 'notify', opts);
    const had = new Set((before.dialogs ?? []).map(item => item.id));
    const dialog = (after.dialogs ?? []).find(item => !had.has(item.id));
    if (dialog) UI.sound(dialog.kind === 'detected' || dialog.kind === 'cant-open' ? 'error' : dialog.kind === 'elevation' ? 'uac' : 'alert', opts);
    const trashed = node => node?.trashed;
    if (Object.entries(after.fs.nodes).some(([id, node]) => trashed(node) && before.fs.nodes[id] && !trashed(before.fs.nodes[id]))) UI.sound('trash', opts);
    if (!game) return;
    const flags = list => list?.length ?? 0;
    if (flags(after.data.flags) > flags(before.data.flags)) UI.sound('flag', opts);
    else if (flags(after.data.flags) < flags(before.data.flags)) UI.sound('unflag', opts);
    if ((after.data.quota?.done ?? 0) > (before.data.quota?.done ?? 0)) { UI.sound('task', opts); popHud(); }
    const typed = world => Object.values(world.data.web?.typed ?? {}).flat().reduce((a, b) => a + b, 0);
    if (typed(after) > typed(before)) UI.sound((after.data.net?.sent ?? 0) > (before.data.net?.sent ?? 0) ? 'leak' : 'type', { ...opts, pitch: 0.94 + Math.random() * 0.12 });
  }

  // The time stamped on scene content. A scenario with a `date` starts its clock there and runs in real time (so a 2010 lure
  // sits after the 2010 mail); other scenes use the real clock.
  function sceneNow() {
    const era = Date.parse(state.scene?.date ?? '');
    if (Number.isNaN(era)) return Date.now();
    state.eraStart ??= Date.now();
    return era + (Date.now() - state.eraStart);
  }

  // world.sandbox changes reach the attack animation (subscribeSandbox) and the debrief's receipt panel.
  function notifySandbox() {
    const signature = JSON.stringify(state.world.sandbox ?? null);
    if (signature === state.sandboxSignature) return;
    state.sandboxSignature = signature;
    const sandbox = JSON.parse(signature);
    for (const listener of [...state.sandboxListeners]) {
      try { listener(sandbox); } catch (error) { console.warn(`A sandbox listener failed: ${error?.message ?? error}`); }
    }
    if (state.desk) renderDebrief();
  }

  // Applies parent-side world intents (the windows a scene step opens) on top of a world.
  function applyWorldIntents(world, intents) {
    let next = world;
    for (const intent of intents) {
      const result = window.OceanWorldModel.applyIntent(next, intent, Date.now());
      if (result.ok && result.changed) next = result.world;
    }
    return next;
  }

  // ---- the scene state ---------------------------------------------------------------------------------------

  function adopt(result) {
    if (!result.ok || !result.changed) return false;
    adoptDesk(result.state);
    return true;
  }

  function adoptDesk(next) {
    const previous = state.desk;
    state.desk = next;
    document.body.dataset.auth = next.auth;
    document.body.dataset.scenePhase = next.scene.phase;
    if (previous.auth !== next.auth) announce(AUTH_ANNOUNCEMENTS[next.auth]);
    else if (previous.scene.phase !== next.scene.phase && PHASE_ANNOUNCEMENTS[next.scene.phase]) announce(PHASE_ANNOUNCEMENTS[next.scene.phase]);
    const projected = window.OceanSceneWorld.project(state.world, { scene: state.scene, desk: next, prevDesk: previous, now: sceneNow() });
    const world = applyWorldIntents(projected.world, projected.intents);
    if (world !== state.world) setWorld(world);
    syncIntro(previous);
    syncGuide(previous);
    renderHint();
    renderDebrief();
    syncEffect();
    scheduleTick();
  }

  // Runs one V2 intent and acts on the effects the model leaves to the parent.
  function reduceScene(intent) {
    const result = window.OceanDesktopModel.reduce(state.desk, intent, Date.now());
    if (!result.ok) return result;
    adopt(result);
    if (result.effect === 'pick-another') window.location.assign('/ocean-profiles.html');
    else if (result.effect === 'request-proof' && proofIsAvailable()) window.location.assign(PROOF_URL);
    return result;
  }

  function scheduleTick() {
    clearTimeout(state.tickTimer);
    state.tickTimer = null;
    const { auth, scene } = state.desk;
    if (state.replay || auth !== 'desktop' || scene.deadlineMs === null) return;
    state.tickTimer = setTimeout(runTick, Math.max(0, scene.deadlineMs - Date.now()));
  }

  function runTick() {
    state.tickTimer = null;
    if (!adopt(window.OceanDesktopModel.tick(state.desk, Date.now()))) scheduleTick();
  }

  // Restart: the profile's world again (locked) and a fresh scene run.
  function restartScene() {
    if (!state.shellsReady || !state.optedIn) return;
    state.sandboxRun = 'none';
    state.world = { ...clone(state.baseWorld), revision: state.world.revision + 1 };
    adoptDesk(window.OceanDesktopModel.restart(state.desk));
    setWorld(state.world);
    // A streamed replay is not sent again: re-apply what arrived. (A guided fish replays from its guide at sign-in.)
    for (const event of state.replayEvents) applyStreamEvent(event);
    announce(`Restarting the training scene. ${AUTH_ANNOUNCEMENTS.locked}`);
  }

  function renderHint() {
    const hint = state.optedIn ? window.OceanSceneWorld.hintFor(state.scene, state.desk) : null;
    dom['ocean-hint'].textContent = hint ?? '';
    dom['ocean-hint'].hidden = !hint;
  }

  // ---- the intro card (scenario scenes): shown after the one-click sign-in, reopened by the Brief button ----------

  function openIntro() {
    const intro = state.world.scene.intro ?? null;
    if (!intro || !state.optedIn) return;
    dom['intro-title'].textContent = intro.title;
    dom['intro-line'].textContent = intro.line;
    dom['intro-next'].textContent = intro.next;
    dom['ocean-intro'].hidden = false;
    dom['intro-dismiss'].focus({ preventScroll: true });
    announce(`${intro.title}. ${intro.line} ${intro.next}`);
  }

  function closeIntro() {
    if (dom['ocean-intro'].hidden) return;
    dom['ocean-intro'].hidden = true;
    dom['ocean-brief'].focus({ preventScroll: true });
  }

  function syncBrief() {
    dom['ocean-brief'].hidden = !state.world?.scene.intro;
  }

  // The card opens when the trainee signs in and closes when the desktop locks again (Restart).
  function syncIntro(previous) {
    syncBrief();
    if (state.desk.auth !== 'desktop') dom['ocean-intro'].hidden = true;
    else if (previous.auth !== 'desktop') openIntro();
  }

  // ---- the step-by-step guide (fish runs from the ocean's creature panel) --------------------------------------------

  async function loadGuide() {
    const run = pageRunId();
    const authored = run.startsWith('author-');
    if (!run.startsWith('fish-') && !authored) return;
    try {
      const data = await request(`/api/desktop/guide?run=${run}`);
      if (isRecord(data) && boundedText(data.name) && Array.isArray(data.steps) && data.steps.length) {
        if (authored) {
          if (!window.OceanWorldModel.validate(data.initialWorld).ok || data.initialWorld.phase !== 'lock') return;
          state.baseWorld = clone(data.initialWorld);
        }
        state.guide.data = data;
      }
    } catch {
      // No guide: the run streams its events like any replay.
    }
    if (!state.guide.data) return;
    dom['ocean-chip-detail'].textContent = `${state.guide.data.name} · ${state.guide.data.story ? 'training scenario' : 'illustration'}`;
    litCreatureFrames(state.guide.data.creature?.sprite);
  }

  // The fish's creature, lit with its normal map (pixel sprites are always lit): one data URL per frame of its sheet, which
  // is a row of square frames. The attack animation shows frame 0 and the guide cycles the rest.
  async function litCreatureFrames(sprite) {
    if (typeof sprite !== 'string' || !/^\/ui\/abyss\/pixel\/[a-z0-9/_-]+\.png$/.test(sprite) || !window.PixelLit) return;
    try {
      const sheet = await window.PixelLit.sheet(sprite);
      const count = Math.max(1, Math.min(32, Math.round(sheet.w / sheet.h)));
      state.guide.frames = Array.from({ length: count }, (_, f) => window.PixelLit.relight(sheet, f * sheet.h, 0, sheet.h, sheet.h, sheet.h, sheet.h).toDataURL('image/png'));
    } catch {
      // No creature: the animation draws its own pixel fish.
    }
  }

  // A step with an attack plays the creature's animation (OceanFx.playAttack) over the desktop. Its beats come from the scene,
  // one at a time, through the animation's sandbox feed; the badge says "simulated". Any other move of the guide stops it.
  const BEAT_START_MS = 2600;
  const BEAT_MS = 1100;
  function stopGuideAttack() {
    const fx = state.guide.fx;
    if (!fx) return;
    state.guide.fx = null;
    fx.timers.forEach(clearTimeout);
    clearInterval(fx.frameTimer);
    try { fx.run?.stop?.(); } catch { /* A broken animation must not block the guide. */ }
    dom['ocean-fx-layer'].replaceChildren();
    dom['ocean-fx-caption'].hidden = true;
    document.body.classList.remove('guide-attack');
  }

  // What a keylogger took (data.captured), as the animation's account cards: the value on the card, the field under it.
  // The most damaging first: passwords, card numbers and PINs.
  // Attacks whose theft is what the trainee typed or their account: a phishing form, a hijacked sign-in.
  const STEALS_SIGN_IN = ['credential-phish', 'mfa-fatigue', 'oauth-consent', 'account-takeover-post', 'sim-swap', 'money-transfer', 'wallet-drain'];
  const filledForm = world => Object.values(world?.data.web?.typed ?? {}).some(counts => counts.some(n => n > 0));

  // What the attack takes, in the trainee's own details: what a keylogger captured; for an attack that steals a sign-in,
  // every box they filled in on a page, else their own address. Never the animation's sample names.
  function stolenTargets(kind) {
    const world = state.world;
    const M = window.OceanWorldModel;
    let taken = world.data.captured ?? [];
    if (!STEALS_SIGN_IN.includes(kind)) taken = taken.length ? taken : [];
    else if (!taken.length && M?.pageFields) {
      taken = Object.entries(world.data.web?.pages ?? {}).flatMap(([pid, page]) => {
        const typed = M.typedOf(world, pid);
        return M.pageFields(page).filter((field, at) => typed[at] >= field.value.length).map(field => ({ label: field.label, value: field.value }));
      });
    }
    if (!taken.length && STEALS_SIGN_IN.includes(kind) && world.user?.email) taken = [{ label: 'Your account', value: world.user.email }];
    const rank = item => (/pass|pin|card|cvv|security|maiden|code/i.test(item.label) ? 0 : 1);
    return [...taken].sort((a, b) => rank(a) - rank(b)).slice(0, 3)
      .flatMap(item => [{ label: item.value, kind: 'account' }, { label: item.label, kind: 'secret' }]);
  }

  function playGuideAttack(step) {
    stopGuideAttack();
    const attack = step?.attack;
    if (!attack || typeof window.OceanFx?.playAttack !== 'function') return;
    const { frames } = state.guide;
    // {captured}: one beat per thing the keylogger took, in the trainee's own words (what they typed).
    const captured = (state.world.data.captured ?? []).map(item => `${item.label}: ${item.value}`.slice(0, 60));
    const beats = (attack.beats.length ? attack.beats : [step.title]).flatMap(line => (line === '{captured}' ? captured : [line])).slice(0, 8);
    if (state.effects !== 'none') window.OceanProgramUI?.sound('threat', { os: state.osMode, volume: state.world.sys.volume, muted: state.world.sys.muted });
    if (state.effects === 'high' && !state.reducedMotion) dom['ocean-stage'].animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,3px)' }, { transform: 'translate(5px,-4px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 380, easing: 'ease-out' });
    const sandbox = { mode: 'simulated', status: 'running', events: [] };
    const listeners = new Set();
    const fx = { run: null, timers: [], frameTimer: null };
    state.guide.fx = fx;
    const push = event => {
      sandbox.events = [...sandbox.events, { seq: sandbox.events.length + 1, ...event }];
      for (const listener of listeners) listener(clone(sandbox));
    };
    beats.forEach((label, n) => fx.timers.push(setTimeout(() => push({ kind: 'beat', label, count: n + 1, total: beats.length }), BEAT_START_MS + n * BEAT_MS)));
    fx.timers.push(setTimeout(() => {
      sandbox.status = 'done';
      push({ kind: 'summary', label: beats.at(-1), count: beats.length, total: beats.length });
    }, BEAT_START_MS + beats.length * BEAT_MS));
    const creature = state.guide.data.creature;
    // A quest names the malware; "what you typed" only when a keylogger or a filled form really took the trainee's typing.
    const typed = (state.world?.data.captured ?? []).length > 0 || (STEALS_SIGN_IN.includes(attack.kind) && filledForm(state.world));
    dom['ocean-fx-caption'].textContent = state.guide.data.story ? `${state.guide.data.name} ${typed ? 'takes what you typed' : 'strikes'}` : creature ? `The ${creature.name.toLowerCase()} attacks` : step.title;
    dom['ocean-fx-caption'].hidden = false;
    // Beside the guide card, not under it (desktop.css body.guide-attack).
    document.body.classList.toggle('guide-attack', !dom['ocean-guide'].hidden);
    try {
      fx.run = window.OceanFx.playAttack({
        attackKind: attack.kind,
        creature: { sprite: frames[0] ?? null },
        container: dom['ocean-fx-layer'],
        // The windows on screen now, so the creature goes for what the trainee is looking at.
        targets: [...windowTargetRects().slice(0, 4).map((rect, n) => ({ label: beats[n] ?? step.title, kind: 'window', rect })), ...stolenTargets(attack.kind)],
        reducedMotion: state.reducedMotion,
        timeoutMs: BEAT_START_MS + (beats.length + 4) * BEAT_MS,
        getSandbox: () => clone(sandbox),
        subscribe: listener => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        onDone: () => { if (state.guide.fx === fx) stopGuideAttack(); },
      });
    } catch {
      stopGuideAttack();
      return;
    }
    // The creature swims while it attacks: cycle its lit frames on the animation's sprite.
    if (frames.length > 1 && !state.reducedMotion) {
      let frame = 0;
      fx.frameTimer = setInterval(() => {
        const img = dom['ocean-fx-layer'].querySelector('[data-ocean-fx] img');
        if (img) img.src = frames[frame = (frame + 1) % frames.length];
      }, 110);
    }
  }

  // A step's patch carries only its new banners; the ones still on screen stay.
  function withBanners(patch, banners) {
    if (!patch?.notifications) return patch;
    // A step the trainee played themselves already raised some of these banners: one copy each.
    const fresh = new Set(patch.notifications.banners.map(item => item.id));
    return { ...patch, notifications: { ...patch.notifications, banners: [...banners.filter(item => !fresh.has(item.id)), ...patch.notifications.banners].slice(-8) } };
  }

  function applyGuidePatch(patch) {
    if (!patch || !Object.keys(patch).length) return;
    const result = patchWorld(withBanners(patch, state.world.notifications.banners));
    if (!result.ok) console.warn(`Guide step refused: ${result.error}`);
  }

  // Sign-in plays the setup and opens the introduction; locking again (Restart) goes back to the sign-in card.
  function syncGuide(previous) {
    const { guide } = state;
    if (!guide.data) return;
    if (state.desk.auth === 'desktop' && previous.auth !== 'desktop') {
      applyGuidePatch(guide.data.setup);
      guide.base = clone(state.world);
      guide.at = 0;
    } else if (state.desk.auth !== 'desktop') {
      stopGuideAttack();
      guide.at = -1;
    }
    renderGuide();
  }

  function guideGo(target, followed = false) {
    const { guide } = state;
    const steps = guide.data.steps;
    const to = Math.max(0, Math.min(target, steps.length + 1));
    if (guide.at < 0 || to === guide.at) return;
    stopGuideAttack();
    guide.followed = followed;
    guide.note = null;
    // The step's attack plays whenever the guide moves on to it, by Next or by the trainee's own gesture.
    const oneForward = to > guide.at;
    if (to > guide.at) {
      for (let k = guide.at + 1; k <= Math.min(to, steps.length); k++) applyGuidePatch(steps[k - 1].patch);
    } else {
      // Back: the world after sign-in plus steps 1..to; only the last of them shows its banners again.
      let world = guide.base;
      try {
        for (let k = 1; k <= to; k++) world = window.OceanWorldModel.createWorld(world, withBanners(steps[k - 1].patch, k === to ? world.notifications.banners : []));
        // The trainee's flags are theirs: Back does not take them away.
        setWorld({ ...world, data: { ...world.data, ...(state.world.data.flags ? { flags: state.world.data.flags } : {}) }, revision: state.world.revision + 1 });
      } catch (error) {
        console.warn(`Guide step refused: ${error.message}`);
      }
    }
    guide.at = to;
    renderGuide();
    const step = steps[to - 1];
    if (oneForward && step) playGuideAttack(step);
    announce(to === 0 ? `Back to the start of ${guide.data.name}.` : step ? `Step ${to} of ${steps.length}: ${step.title}. ${step.text}` : `End of the guide. ${guide.data.lesson}`);
  }

  function setGuideHidden(hidden) {
    state.guide.hidden = hidden;
    renderGuide();
    (hidden ? dom['ocean-guide-toggle'] : dom['guide-next']).focus({ preventScroll: true });
  }

  // Guide text may say a thing each OS's way: {Task Manager|Activity Monitor} reads "Task Manager" on Windows and
  // "Activity Monitor" on macOS (FISH-SCENES.md). Resolved once per OS for every string the guide shows.
  const OS_CHOICE = /\{([^{}|\n]*)\|([^{}|\n]*)\}/g;
  function guideFor(data, os) {
    if (!data) return data;
    if (data.__os?.os === os && data.__os.from === data) return data.__os.text;
    const pick = value => (typeof value === 'string' ? value.replace(OS_CHOICE, (_, win, mac) => (os === 'macos' ? mac : win))
      : Array.isArray(value) ? value.map(pick) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pick(v)])) : value);
    const text = pick(data);
    Object.defineProperty(data, '__os', { value: { os, from: data, text }, configurable: true });
    return text;
  }

  function renderGuide() {
    const { guide } = state;
    const data = guideFor(guide.data, state.osMode);
    const toggle = dom['ocean-guide-toggle'];
    toggle.hidden = !data;
    if (!data) return;
    const visible = state.optedIn && state.shellsReady && !guide.hidden;
    dom['ocean-guide'].hidden = !visible;
    toggle.setAttribute('aria-expanded', String(visible));
    const n = data.steps.length;
    toggle.textContent = guide.at > 0 && guide.at <= n ? `Guide ${guide.at}/${n}` : 'Guide';
    if (!visible) return;
    const at = guide.at;
    const step = at >= 1 && at <= n ? data.steps[at - 1] : null;
    const paragraphs = text => String(text ?? '').split('\n').filter(Boolean).map(line => element('p', '', line));
    dom['guide-eyebrow'].textContent = data.name;
    dom['guide-count'].textContent = step ? `· Step ${at} of ${n}` : at === 0 ? `· ${n} steps` : '';
    let title;
    let body = [];
    let look = '';
    if (at < 0) {
      title = 'Sign in to start';
      const user = state.world?.user?.name || 'the training user';
      body = paragraphs(state.osMode === 'macos'
        ? `Click "Click to log in" on the lock screen. You are ${user}, a fictional user; no password is needed.`
        : `Click the lock screen, then Sign in. You are ${user}, a fictional user; no password is needed.`);
    } else if (at === 0 && data.story) {
      // A quest (QUESTS.md §1): who you are and what you were doing, then the game rule: flag what looks wrong.
      title = `${state.world?.user?.name ?? 'You'}: ${data.name}`;
      body = [...paragraphs(data.story), element('p', 'guide-flag-rule', `Hover over anything on the desktop and click the flag to mark what looks suspicious. At the end you see which flags were right.`)];
      look = 'Press Start when you are ready.';
    } else if (at === 0) {
      title = `What ${data.name} did`;
      body = paragraphs(data.about);
      look = 'Press Start to play it, one step at a time.';
    } else if (step) {
      title = step.title;
      body = paragraphs(step.text);
      look = step.look;
    } else if (data.flags?.length) {
      title = 'How did you do?';
      body = [...gradeNodes(data, state.world), element('p', 'guide-lesson-head', 'How to stay safe'), ...paragraphs(data.lesson)];
      look = '';
    } else {
      title = data.lesson ? 'How to stay safe' : 'That is the whole illustration';
      body = paragraphs(data.lesson);
      look = `Everything ${data.name} did is now on the desktop. Look around, or switch to ${state.osMode === 'windows' ? 'macOS' : 'Windows'}: it is the same desktop.`;
    }
    dom['guide-title'].textContent = title;
    if (look) {
      const note = element('p', 'guide-look');
      if (step) note.append(element('b', '', 'Look at:'), ` ${look}`);
      else note.textContent = look;
      body.push(note);
    }
    // Your move: what plays the next step, so the trainee can do it on the desktop instead of pressing Next. While a note
    // about an off-path gesture shows, the note says how to carry on (the old move may point at a closed warning).
    if (step && !guide.note) {
      const move = element('p', 'guide-move');
      const hint = step.next?.[state.osMode];
      const following = data.steps[at];
      if (hint) move.append(element('b', '', 'Your move:'), ` ${hint} `, /press Next\.$/.test(hint) ? '' : element('span', 'guide-or', 'Or press Next.'));
      else if (following) move.append(element('b', '', 'Next:'), ` ${following.title}. Nothing for you to click: it happens by itself. Press Next to see it.`);
      else move.append(element('b', '', 'Last step.'), ' Press Finish for how to stay safe.');
      body.push(move);
    }
    if (guide.followed && step) body.unshift(element('p', 'guide-followed', 'You did this step yourself.'));
    if (guide.note) body.push(element('p', 'guide-note', guide.note));
    dom['guide-step'].replaceChildren(...body);
    renderHud();
    renderActivity();
    // The cue follows the guide: re-decorate the world the shells draw.
    if (state.world) setWorld(state.world);
    dom['guide-dots'].replaceChildren(...data.steps.map((_, k) => element('li', k < at ? 'done' : '')));
    dom['guide-dots'].hidden = at < 0;
    dom['guide-back'].hidden = at <= 0;
    dom['guide-next'].hidden = at < 0;
    dom['guide-next'].textContent = at === 0 ? 'Start' : at === n ? 'Finish' : at > n ? 'Play again' : 'Next';
    dom['guide-all'].hidden = at < 0 || at >= n;
  }

  // The shift's counter (data.quota) and the trainee's flags, above the step.
  function renderHud() {
    const hud = dom['guide-hud'];
    if (!hud) return;
    const quota = state.world?.data.quota;
    const flags = state.world?.data.flags?.length ?? 0;
    const show = state.guide.at >= 0 && (quota || state.guide.data?.flags?.length);
    hud.hidden = !show;
    if (!show) return;
    const parts = [];
    if (quota) {
      const bar = element('span', 'hud-bar');
      const fill = element('span', 'hud-fill');
      fill.style.width = `${Math.round((quota.done / quota.total) * 100)}%`;
      bar.append(fill);
      parts.push(element('span', 'hud-label', quota.label), element('b', 'hud-count', `${quota.done} / ${quota.total}`), bar);
    }
    if (state.guide.data?.flags?.length) parts.push(element('span', 'hud-flags', `⚑ ${flags} flagged`));
    hud.replaceChildren(...parts);
  }
  // Juice for a finished task (Game Polish: satisfying_level_up_and_xp_bar, resource_bar_state_readability): the count pops.
  function popHud() {
    const count = dom['guide-hud']?.querySelector('.hud-count');
    if (!count || state.reducedMotion) return;
    requestAnimationFrame(() => dom['guide-hud'].querySelector('.hud-count')?.animate([{ transform: 'scale(1)' }, { transform: `scale(${state.effects === 'high' ? 1.45 : 1.2})`, color: '#7ee787' }, { transform: 'scale(1)' }], { duration: state.effects === 'high' ? 420 : 260, easing: 'cubic-bezier(.2,1.6,.4,1)' }));
    if (state.effects === 'high') dom['guide-hud'].animate([{ boxShadow: '0 0 0 0 rgba(126,231,135,.8)' }, { boxShadow: '0 0 0 10px rgba(126,231,135,0)' }], { duration: 500 });
  }

  // The end card (QUESTS.md §2): every hard flag found or missed, with why; soft flags as a bonus; anything else flagged.
  function gradeNodes(data, world) {
    const mine = new Map((world?.data.flags ?? []).map(item => [item.key, item]));
    const known = new Set(data.flags.map(item => item.key));
    // A box on a graded page (its adverts, a form) that is not graded itself counts for the page: the trainee spotted the page.
    for (const item of [...mine.values()]) {
      const page = /^section:(.+):\d+$/.exec(item.key)?.[1];
      if (page && !known.has(item.key) && known.has(`page:${page}`) && !mine.has(`page:${page}`)) mine.set(`page:${page}`, item);
    }
    const hard = data.flags.filter(item => item.hard);
    const soft = data.flags.filter(item => !item.hard);
    const found = hard.filter(item => mine.has(item.key));
    const extra = [...new Set(mine.values())].filter(item => !known.has(item.key) && !data.flags.some(flag => mine.get(flag.key) === item));
    const score = element('div', 'grade-score');
    const big = element('b', 'grade-big', `${found.length} / ${hard.length}`);
    score.append(big, element('span', '', ` ${data.spotted ?? 'signs of the attack spotted'}${soft.some(item => mine.has(item.key)) ? `, plus ${soft.filter(item => mine.has(item.key)).length} bonus` : ''}`));
    // A found sign shows its name (the reason on hover); a missed one spells out why, so the lesson below stays in view.
    const row = (item, ok, cls) => {
      const li = element('li', cls);
      li.append(element('span', 'grade-mark', ok ? '✓' : '✗'), element('b', '', item.label), item.why && !ok ? element('span', 'grade-why', item.why) : '');
      if (item.why && ok) li.title = item.why;
      return li;
    };
    const list = element('ul', 'grade-list');
    for (const item of hard) list.append(row(item, mine.has(item.key), mine.has(item.key) ? 'found' : 'missed'));
    const nodes = [score, list];
    if (soft.length) {
      const bonus = element('ul', 'grade-list grade-soft');
      for (const item of soft) bonus.append(row(item, mine.has(item.key), mine.has(item.key) ? 'found' : 'missed'));
      nodes.push(element('p', 'guide-lesson-head', 'Bonus: careless, but only here to keep the training simple'), bonus);
    }
    if (extra.length) nodes.push(element('p', 'grade-extra', `Also flagged, but part of a normal day: ${extra.map(item => item.label).join('; ')}.`));
    // High effects: the score counts up (Game Polish: satisfying_level_up_and_xp_bar).
    if (state.effects !== 'none' && !state.reducedMotion) {
      let n = 0;
      big.textContent = `0 / ${hard.length}`;
      const tick = () => {
        if (n >= found.length) { big.animate?.([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.6,.4,1)' }); window.OceanProgramUI?.sound('score', { os: state.osMode, volume: world.sys.volume, muted: world.sys.muted }); return; }
        big.textContent = `${++n} / ${hard.length}`;
        window.OceanProgramUI?.sound('step', { os: state.osMode, volume: world.sys.volume, muted: world.sys.muted, pitch: 1 + n * 0.08 });
        setTimeout(tick, state.effects === 'high' ? 140 : 90);
      };
      setTimeout(tick, 350);
    }
    return nodes;
  }

  // What the malware has done so far, against the desktop at sign-in: one chip per kind of change. A chip opens the place
  // that shows it (Task Manager, Login Items, the folder, Mail), as a trainee would look for it.
  function activityOf(world, base) {
    const was = new Map(Object.entries(base.fs.nodes));
    const nodes = Object.values(world.fs.nodes).filter(Boolean);
    const isNew = (list, old, key = 'name') => (list ?? []).filter(item => !(old ?? []).some(other => other[key] === item[key]));
    // A suspicious new process, or any process the attack made busy (a miner hides in a trusted browser): CPU is the tell.
    const busyBefore = new Map((base.data.processes ?? []).map(item => [item.name, Number(item.cpu) || 0]));
    const procs = (world.data.processes ?? []).filter(item => (item.suspicious && !busyBefore.has(item.name))
      || (Number(item.cpu) >= 40 && (busyBefore.get(item.name) ?? 0) < 40));
    const startup = isNew(world.data.startup, base.data.startup);
    const locked = nodes.filter(node => node.encrypted && !was.get(node.id)?.encrypted);
    const deleted = nodes.filter(node => node.trashed && was.get(node.id) && !was.get(node.id).trashed);
    const added = nodes.filter(node => node.kind === 'file' && !node.trashed && !was.has(node.id));
    const blocked = isNew(world.notifications.history, base.notifications.history, 'id').filter(item => item.title.startsWith('Connection blocked'));
    const sent = isNew(world.data.mail.messages, base.data.mail.messages, 'id').filter(item => item.folder === 'sent');
    const mac = state.osMode === 'macos';
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const names = list => list.map(item => item.name ?? item.title ?? item.subject).slice(0, 8).join(', ');
    return [
      procs.length && { icon: '⚙', label: procs.every(item => !item.suspicious) ? plural(procs.length, 'program working hard', 'programs working hard') : plural(procs.length, 'program running', 'programs running'), title: names(procs), where: mac ? 'Activity Monitor' : 'Task Manager › Processes', open: ['taskmanager'] },
      startup.length && { icon: '↻', label: `starts with the ${mac ? 'Mac' : 'PC'}`, title: names(startup), where: mac ? 'System Settings › Login Items' : 'Settings › Apps › Startup', open: ['settings', { pane: 'startup' }] },
      locked.length && { icon: '🔒', label: plural(locked.length, 'file locked', 'files locked'), title: names(locked), open: ['files', { folderId: locked[0].parentId }], bad: true },
      deleted.length && { icon: '✕', label: plural(deleted.length, 'file deleted', 'files deleted'), title: names(deleted), open: ['files', { folderId: 'trash' }], bad: true },
      added.length && { icon: '+', label: plural(added.length, 'new file', 'new files'), title: names(added), open: ['files', { folderId: added.at(-1).parentId }] },
      sent.length && { icon: '✉', label: plural(sent.length, 'mail sent', 'mails sent'), title: names(sent), open: ['mail'], bad: true },
      blocked.length && { icon: '⛔', label: plural(blocked.length, 'connection blocked', 'connections blocked'), title: blocked.map(item => item.title.replace('Connection blocked: ', '')).join(', ') },
      world.data.web?.homepage && world.data.web.homepage !== base.data.web?.homepage && { icon: '⌂', label: 'home page changed', open: ['browser'], bad: true },
      world.sys.wallpaperUrl !== base.sys.wallpaperUrl && { icon: '▣', label: 'wallpaper changed', bad: true },
    ].filter(Boolean);
  }

  function renderActivity() {
    const box = dom['guide-activity'];
    const { guide } = state;
    if (!box) return;
    const items = guide.data && guide.base && guide.at > 0 && state.world && !dom['ocean-guide'].hidden ? activityOf(state.world, guide.base) : [];
    box.hidden = !items.length;
    if (!items.length) return box.replaceChildren();
    // A step waiting for the trainee to open an app (when open taskmanager): the chip that opens it glows, as the cue does.
    const want = guide.data.steps[guide.at]?.when?.kind === 'open' ? guide.data.steps[guide.at].when.ref : null;
    const cued = item => Boolean(want && item.open && (item.open[0] === want || `${item.open[0]}:${item.open[1]?.pane ?? ''}` === want));
    const signature = JSON.stringify([items, state.osMode, want]);
    if (box.dataset.signature === signature) return;
    box.dataset.signature = signature;
    box.replaceChildren(element('p', 'guide-activity-head', 'What it has done so far'), ...items.map(item => {
      const chip = element(item.open ? 'button' : 'span', `guide-chip${item.bad ? ' bad' : ''}${cued(item) ? ' guide-chip-cue' : ''}`);
      chip.append(element('span', 'guide-chip-icon', item.icon), item.label);
      // The tooltip names what changed and, for a chip that opens an app, the tab that shows it.
      const tip = [item.title, item.where && `Shown in ${item.where}`].filter(Boolean).join(' · ');
      if (tip) chip.title = tip;
      if (item.open) {
        chip.type = 'button';
        chip.addEventListener('click', () => openFromGuide(...item.open));
      }
      return chip;
    }));
  }

  // The guide opens an app the way the trainee would: an open-app intent through the world model, shown in both shells.
  function openFromGuide(app, payload) {
    if (state.world?.phase !== 'desktop') return;
    const result = window.OceanWorldModel.applyIntent(state.world, { kind: 'open-app', app, ...(payload ? { payload } : {}) }, Date.now());
    if (result.ok && result.changed) setWorld(result.world);
    // A chip the guide told the trainee to click is their own gesture: a step waiting on `when open` plays.
    if (result.ok && result.forward) guideFollow(result.forward);
  }

  // ---- the debrief window (parent-drawn, above the active shell) ------------------------------------------------

  // The sandbox receipt: what ran, where, that nothing left the sandbox and that it was torn down.
  function receiptNodes(sandbox) {
    const { receipt } = sandbox;
    const rows = [
      ['Provider', receipt.provider], ['Instance', receipt.instance], ['Mode', sandbox.mode], ['Started', receipt.startedAt],
      ['Destroyed', receipt.destroyedAt ?? 'not yet'], ['Teardown confirmed', receipt.teardownConfirmed ? 'yes' : 'no'],
      ['Network egress', receipt.egress], ['Data', receipt.dataset],
    ];
    const list = element('dl', 'ocean-receipt');
    for (const [label, value] of rows) list.append(element('dt', '', label), element('dd', '', String(value)));
    return [element('h3', '', 'Sandbox receipt'), list];
  }

  function element(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function debriefButton(label, intent, primary = false) {
    const button = element('button', primary ? 'ocean-button' : 'ocean-button ghost', label);
    button.type = 'button';
    button.addEventListener('click', () => reduceScene(intent));
    return button;
  }

  // Multi-stage scenes list each stage with its outcome; a safe exit is placed at the step the run stopped on.
  function journeyNodes(journey, safe) {
    const stopped = safe ? Math.max(0, journey.stages.findIndex(stage => stage.stepIds.includes(state.desk.scene.stepId))) : -1;
    const containment = journey.stages.find(stage => stage.id === 'containment');
    const list = element('ol', 'ocean-stages');
    list.setAttribute('aria-label', 'Stages of the attack');
    journey.stages.filter(stage => stage !== containment).forEach((stage, index) => {
      const outcome = safe ? (index < stopped ? 'passed' : index === stopped ? 'stopped' : 'skipped') : 'passed';
      const item = element('li', outcome);
      item.append(element('b', '', `${index + 1}. ${stage.title}`),
        element('em', '', { passed: stage.id === 'attack' ? 'Ran' : 'Passed', stopped: 'You stopped it here', skipped: 'Not reached' }[outcome]),
        element('span', '', stage.detail));
      if (stage.safeStep && outcome !== 'skipped') item.append(element('span', '', `Safe step: ${stage.safeStep}`));
      list.append(item);
    });
    const nodes = [element('h3', '', 'Stages'), list, element('p', 'ocean-fine', `Attack modelled: ${journey.attack}.`), element('p', 'ocean-fine', journey.consentNote)];
    if (containment) nodes.push(element('p', 'ocean-fine', `Containment. ${containment.detail}`));
    return nodes;
  }

  // "What the program showed" (sandbox replay, SPEC §9.1): the screenshots in world.data.screenshots, drawn above the active shell
  // like the debrief, so both desktops show them and an OS switch keeps them. Closing hides the current set; a new screenshot reopens it.
  function renderShowed() {
    const panel = dom['ocean-showed'];
    const shots = state.world?.data.screenshots ?? [];
    const ids = shots.map(item => item.id).join(',');
    const visible = state.optedIn && state.world?.phase === 'desktop' && shots.length > 0 && ids !== state.showedClosed;
    panel.hidden = !visible;
    const key = visible ? JSON.stringify(shots) : null;
    if (key === state.showedKey) return;
    state.showedKey = key;
    panel.replaceChildren();
    if (!visible) return;
    const title = element('h2', '', 'What the program showed');
    title.id = 'showed-title';
    const close = element('button', 'ocean-button ghost', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => { state.showedClosed = ids; renderShowed(); });
    panel.append(title, element('p', 'ocean-fine', 'Screenshots taken while the program ran under Wine in the sandbox.'));
    for (const shot of shots) {
      const figure = element('figure', 'ocean-shot');
      const image = element('img');
      image.src = shot.image;
      image.alt = shot.caption;
      figure.append(image, element('figcaption', '', shot.caption));
      panel.append(figure);
    }
    panel.append(close);
  }

  function renderDebrief() {
    const panel = dom['ocean-debrief'];
    const win = state.desk.windows.find(item => item.app === 'debrief');
    const visible = state.optedIn && state.desk.scene.phase === 'debrief' && win && win.mode !== 'minimized';
    const receipt = state.world.sandbox?.receipt ?? null;
    const sandboxMissing = !receipt && state.sandboxRun === 'unavailable' && state.desk.scene.path !== 'safe';
    const key = visible ? `${state.desk.runId}:${state.desk.scene.path}:${JSON.stringify(receipt)}:${sandboxMissing}` : null;
    panel.hidden = !visible;
    if (key === state.debriefKey) return;
    state.debriefKey = key;
    panel.replaceChildren();
    if (!visible) return;
    const { scene, profile } = state;
    const trench = !scene.safePath;
    const safe = state.desk.scene.path === 'safe';
    const block = safe ? scene.debrief.safe : scene.debrief.fell;
    const top = element('div', 'ocean-debrief-top');
    if (state.creatureSrc) {
      const img = element('img');
      img.src = state.creatureSrc;
      img.alt = `${profile.creature} illustration`;
      top.append(img);
    }
    const heading = element('div');
    const title = element('h2', '', block.headline);
    title.id = 'debrief-title';
    heading.append(element('span', `ocean-outcome ${safe ? 'safe' : 'fell'}`, safe ? (trench ? 'Patched' : 'Safe path') : (trench ? 'No action needed from you' : 'Attack path')), title);
    top.append(heading);
    const list = element('ul');
    for (const point of block.points) list.append(element('li', '', point));
    const body = element('div', 'ocean-debrief-body');
    body.append(top, list);
    if (scene.debrief.journey) body.append(...journeyNodes(scene.debrief.journey, safe));
    if (receipt) body.append(...receiptNodes(state.world.sandbox));
    else if (sandboxMissing) body.append(element('p', 'ocean-fine', 'Sandbox unavailable: this run did not reach a sandbox, so the attack animation was simulated.'));
    body.append(element('p', 'ocean-fine', scene.debrief.anchorNote), element('p', 'ocean-fine', `${profile.family} · ${profile.depth}: ${profile.action}.`));
    const actions = element('div', 'ocean-card-actions');
    if (!safe) actions.append(debriefButton(trench ? scene.patched.label : 'Try the safe path', { kind: 'replay', path: 'safe' }, true));
    actions.append(debriefButton('Replay', { kind: 'replay', path: 'normal' }, safe), debriefButton('Pick another creature', { kind: 'pick-another' }),
      debriefButton('Close', { kind: 'close', id: win.id }));
    if (proofIsAvailable()) actions.append(debriefButton('Open the separate OAuth consent exercise', { kind: 'request-proof' }));
    body.append(actions);
    panel.append(element('p', 'ocean-eyebrow', 'TRAINING DEBRIEF · FICTIONAL'), body);
  }

  // ---- the single attack overlay -------------------------------------------------------------------------

  // Window rects come from the world (1000x600 virtual work area), topmost first.
  function windowTargetRects() {
    const stage = dom['ocean-stage'].getBoundingClientRect();
    const { WORK } = window.OceanWorldModel;
    const { windows, order } = state.world;
    return [...order].reverse().map(id => windows.find(win => win.id === id)).filter(win => win && win.mode !== 'minimized').map(({ rect }) => ({
      x: rect.x * stage.width / WORK.w, y: rect.y * stage.height / WORK.h,
      width: rect.w * stage.width / WORK.w, height: rect.h * stage.height / WORK.h,
    }));
  }

  function clearEffect() {
    for (const unsubscribe of state.fx.unsubscribers) unsubscribe();
    state.fx.unsubscribers.clear();
    state.fx.id = null;
    state.fx.run = null;
    dom['ocean-fx-caption'].hidden = true;
  }

  function stopEffect() {
    const { run } = state.fx;
    clearEffect();
    try { run?.stop?.(); } catch { /* A broken effect must not block the scene. */ }
  }

  function finishEffect(effectId) {
    if (state.fx.id !== effectId) return;
    clearEffect();
    adopt(window.OceanDesktopModel.fxDone(state.desk, effectId, Date.now()));
  }

  // Asks the server to run this scenario in its sandbox for the page's run id. The run's events arrive over the event stream as
  // world.sandbox, so nothing here waits for them. Any failure leaves the scene intact: the animation falls back to its own
  // sequence and the debrief says the sandbox was unavailable.
  async function startSandboxRun() {
    state.sandboxRun = 'starting';
    if (state.world.sandbox) patchWorld({ sandbox: null });
    try {
      const response = await fetch(`${SANDBOX_RUN_PATH}?run=${pageRunId()}`, {
        ...FETCH_OPTIONS, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ scenarioId: state.profile.id }),
      });
      state.sandboxRun = response.status === 202 ? 'started' : 'unavailable';
    } catch {
      state.sandboxRun = 'unavailable';
    }
    renderDebrief();
  }

  // Started once per effectId. Switching OS never reaches this code, so the animation is never restarted.
  function startEffect(effectId) {
    const { attack } = state.scene;
    const rects = windowTargetRects();
    let windowTarget = 0;
    const targets = attack.targets.map(target => ({
      label: target.label, kind: target.kind,
      ...(target.kind === 'window' && rects.length ? { rect: rects[windowTarget++ % rects.length] } : {}),
    }));
    state.fx.startedIds.add(effectId);
    state.fx.id = effectId;
    if (state.scene.attackKind) startSandboxRun();
    dom['ocean-fx-caption'].textContent = attack.caption;
    dom['ocean-fx-caption'].hidden = false;
    // Scenario scenes hand the animation their attack kind and live access to world.sandbox (fx-to-engine-core.md);
    // the 30 family scenes use the original OceanFx.play. `subscribe` is the name OceanFx.playAttack reads;
    // `subscribeSandbox` and `creatureSrc` are kept for OceanFx.play and older callers.
    const playAttack = state.scene.attackKind && typeof window.OceanFx.playAttack === 'function';
    const subscribe = listener => {
      state.sandboxListeners.add(listener);
      const unsubscribe = () => { state.sandboxListeners.delete(listener); };
      state.fx.unsubscribers.add(unsubscribe);
      return unsubscribe;
    };
    try {
      state.fx.run = window.OceanFx[playAttack ? 'playAttack' : 'play']({
        attackKind: state.scene.attackKind,
        familyId: state.profile.familyId,
        depthId: state.profile.depthId,
        creatureSrc: state.creatureSrc,
        creature: { sprite: state.creatureSrc ?? state.profile.assetUrl, family: state.profile.familyId },
        container: dom['ocean-fx-layer'],
        targets,
        reducedMotion: state.reducedMotion,
        // Stays under the V2 model's 30 s attack watchdog, so the animation ends the attack, not the watchdog.
        timeoutMs: ATTACK_FX_TIMEOUT_MS,
        getSandbox: () => clone(state.world?.sandbox ?? null),
        subscribe,
        subscribeSandbox: subscribe,
        onEvent: name => { if (name === 'effect' && state.fx.id === effectId) dom['ocean-fx-caption'].textContent = attack.effect; },
        onDone: () => finishEffect(effectId),
      });
    } catch {
      setTimeout(() => finishEffect(effectId), FX_FAILURE_DONE_MS);
    }
  }

  function syncEffect() {
    const { phase, effectId } = state.desk.scene;
    if (phase !== 'attack') stopEffect();
    else if (effectId && !state.fx.startedIds.has(effectId)) startEffect(effectId);
  }

  // ---- world intents from the visible shell ------------------------------------------------------------------

  function handleWorldIntent(os, data) {
    const parsed = window.OceanWorldModel.parseIntentMessage(data);
    // Only the visible shell may speak, and only after the opt-in card.
    if (!parsed || !state.optedIn || os !== state.osMode) return;
    if (parsed.seq <= (state.lastSeq.get(os) ?? 0)) return;
    state.lastSeq.set(os, parsed.seq);
    const before = state.world;
    const result = window.OceanWorldModel.applyIntent(before, parsed.intent, Date.now());
    if (!result.ok) {
      // Re-send the accepted world so a shell that drew the refused change locally snaps back.
      postToShell(os, worldMessage());
      return;
    }
    if (result.changed) setWorld(result.world);
    // Only a scene choice goes to the scene model; program and view events may move the fish guide on.
    const forward = result.forward?.kind === 'choose' ? result.forward : null;
    const intents = window.OceanSceneWorld.sceneIntents({
      before, after: state.world, intent: parsed.intent, forward, desk: state.desk, scene: state.scene,
    });
    for (const intent of intents) reduceScene(intent);
    if (result.forward) guideFollow(result.forward);
    // A key typed or a flag placed: the HUD and the cue follow (the next empty box glows).
    if (['page-type', 'flag'].includes(result.forward?.kind)) { renderHud(); setWorld(state.world); }
  }

  // A fish step with `when` (PROGRAMS.md §5) plays itself when the trainee does that: opens the program (its prompt
  // appears), runs it, cancels it, turns a view's page or finishes it. Only the next step is checked.
  const WHEN_EVENTS = Object.freeze({ 'program-prompt': 'prompt', 'program-run': 'run', 'program-cancelled': 'cancel',
    'program-detected': 'detected', 'program-removed': 'remove', 'app-open': 'open', 'view-page': 'page', 'view-done': 'done', choose: 'choose', 'mail-open': 'mail', 'page-open': 'visit' });
  // The trainee may run ahead of the guide: a later step with its own program, view or page plays as soon as they do its
  // thing (the steps in between play with it), so the guide always says where they are in the attack.
  function guideFollow(forward) {
    const { guide } = state;
    if (!guide.data || guide.at < 0 || guide.at >= guide.data.steps.length) return;
    const kind = WHEN_EVENTS[forward.kind];
    // when open settings:startup waits for that pane; when open <app> for the app.
    const ref = forward.programId ?? forward.view ?? forward.choiceId ?? forward.messageId ?? forward.page ?? (forward.app ? (forward.pane ? `${forward.app}:${forward.pane}` : forward.app) : null);
    const matches = when => when && when.kind === kind && (!when.ref || when.ref === ref || (when.ref.endsWith('-*') && String(ref).startsWith(when.ref.slice(0, -1)))
      || (kind === 'open' && !when.ref.includes(':') && String(ref).startsWith(`${when.ref}:`)))
      && !(when.kind === 'page' && Number.isInteger(when.page) && when.page !== forward.page);
    const steps = guide.data.steps;
    for (let k = guide.at; k < steps.length; k++) {
      if (matches(steps[k].when) && (k === guide.at || steps[k].when.ref)) {
        guideGo(k + 1, true);
        return;
      }
    }
    // An installer offer unticked: the right move. The scene still plays the bundle, so say why it appears anyway.
    if (forward.kind === 'view-check') {
      guide.note = forward.checked ? `You ticked “${forward.label}” again.`
        : `You unticked “${forward.label}”. On a real computer that is the safe choice: the extra is not installed. The training goes on as if it stayed ticked, to show what it does.`;
      renderGuide();
      return;
    }
    if (!kind) return;
    // A gesture the attack did not need: say what it means, and how to carry on.
    const program = forward.programId ? state.world.data.programs?.[forward.programId] : null;
    const name = program?.name ?? 'the program';
    if (forward.kind === 'program-cancelled') guide.note = `You cancelled ${name}. On a real computer that is the safe choice: it never runs. To see what it would have done, open it again and say yes, or press Next.`;
    else if (forward.kind === 'program-detected') guide.note = 'The antivirus caught it before it ran. Remove it, as you would on a real computer, or press Next to see what happens if it gets through.';
    else if (forward.kind === 'choose') {
      // Another button on a lure page: name it, and the button the attack needed.
      const [, pid, n] = /^(.+)-(\d+)$/.exec(forward.choiceId ?? '') ?? [];
      const page = state.world.data.web?.pages?.[pid];
      const wanted = steps.slice(guide.at).map(item => item.when).find(when => when?.kind === 'choose' && when.ref.startsWith(`${pid}-`));
      const picked = page?.choices?.[Number(n) - 1]?.label;
      const needed = wanted && page?.choices?.[Number(wanted.ref.split('-').pop()) - 1]?.label;
      if (!picked || !needed) return;
      guide.note = `You clicked “${picked}”. On a real computer the attack would stop there. Click “${needed}”, or press Next, to see what happens to someone who does.`;
    } else return;
    renderGuide();
  }

  function handleShellMessage(os, message) {
    if (!isRecord(message) || !state.shellsReady || !state.profile || !state.shellPorts.has(os)) return;
    if (message.type === 'world-intent') handleWorldIntent(os, message);
  }

  // Bridge v3: one MessageChannel per shell. The shell answers { type:'ready', version:3, shell, apps }.
  function connectShell(os) {
    const frame = dom[`${os}-shell-frame`];
    return new Promise(resolveReady => {
      let settled = false;
      let port = null;
      let retryTimer = null;
      const finish = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(retryTimer);
        if (!ok) port?.close();
        resolveReady(ok);
      };
      const timer = setTimeout(() => finish(false), CONNECT_TIMEOUT_MS);
      const attach = () => {
        port?.close();
        const channel = new MessageChannel();
        const attached = channel.port1;
        port = attached;
        attached.onmessage = event => {
          const data = event.data;
          if (isRecord(data) && data.type === 'ready' && data.version === WORLD_VERSION && data.shell === os) {
            if (settled) return;
            state.shellPorts.set(os, attached);
            state.lastSeq.delete(os);
            finish(true);
          } else if (port === attached) {
            handleShellMessage(os, data);
          }
        };
        attached.start();
        frame.contentWindow.postMessage({ type: 'ocean-shell-attach', version: WORLD_VERSION }, '*', [channel.port2]);
        retryTimer = setTimeout(() => { if (!settled) attach(); }, ATTACH_RETRY_MS);
      };
      frame.addEventListener('error', () => finish(false), { once: true });
      frame.addEventListener('load', () => { if (!settled) attach(); }, { once: true });
      frame.src = `${state.shellOrigin}${SHELL_PATHS[os]}`;
    });
  }

  // ---- OS swap: visual only; the world, the scene and the attack keep running ---------------------------------

  function setShellOs(os) {
    state.osMode = os;
    document.body.dataset.os = os;
    for (const name of ['windows', 'macos']) {
      const frame = dom[`${name}-shell-frame`];
      frame.dataset.active = String(name === os);
      frame.inert = name !== os;
      dom[`os-${name}`].setAttribute('aria-pressed', String(name === os));
    }
  }

  function requestOs(os) {
    const from = state.osMode;
    if (!state.shellsReady || os === from) return;
    postToShell(os, worldMessage());
    postToShell(os, { type: 'world-active', version: WORLD_VERSION, active: true });
    postToShell(from, { type: 'world-active', version: WORLD_VERSION, active: false });
    setShellOs(os);
    renderGuide();
    dom['os-' + os].focus({ preventScroll: true });
    announce(`Switched to ${os === 'windows' ? 'Windows' : 'macOS'}. The desktop and scene are unchanged.`);
  }

  // ---- runtime configuration (backend-served worlds, later a Vultr event stream) --------------------------------

  // Replaces the whole world but keeps the session's phase; scene content for the reached steps is re-applied.
  function replaceWorld(next) {
    if (!state.world) return { ok: false, error: 'not-ready' };
    const check = window.OceanWorldModel.validate(next);
    if (!check.ok) return { ok: false, error: check.error };
    state.baseWorld = clone(next);
    const draft = { ...clone(next), phase: state.world.phase, revision: Math.max(state.world.revision, next.revision) };
    const projected = window.OceanSceneWorld.project(draft, { scene: state.scene, desk: state.desk, now: sceneNow(), openWindows: false }).world;
    const result = window.OceanWorldModel.validate(projected);
    if (!result.ok) return { ok: false, error: result.error };
    const revision = Math.max(projected.revision, state.world.revision + 1);
    setWorld({ ...projected, revision });
    return { ok: true, revision };
  }

  // Deep-merges a profile-style patch (objects merge, arrays replace, null removes) into the live world.
  function patchWorld(patch) {
    if (!state.world) return { ok: false, error: 'not-ready' };
    let merged;
    try {
      merged = window.OceanWorldModel.createWorld(state.world, patch);
    } catch (error) {
      return { ok: false, error: String(error.message).replace(/^Invalid world: /, '') };
    }
    setWorld({ ...merged, revision: state.world.revision + 1 });
    return { ok: true, revision: state.world.revision };
  }

  // Live world events from the backend (GET /api/desktop/events, Server-Sent Events) for the page's ?run= (default
  // `local`). Each event goes through patchWorld / replaceWorld; a refused one is logged and never applied.
  const STREAM_REOPEN_MS = 5000;
  // `?run=<id>`, or `?job=<jobId>` from a detonation job page (the replay publishes to run=<jobId>).
  function pageRunId() {
    const params = new URLSearchParams(window.location.search);
    return [params.get('run'), params.get('job')].find(value => /^[a-z0-9-]{1,40}$/.test(value ?? '')) ?? 'local';
  }

  function applyStreamEvent(message) {
    return message?.type === 'patch' && isRecord(message.patch) ? patchWorld(message.patch)
      : message?.type === 'replace' && isRecord(message.world) ? replaceWorld(message.world)
        : { ok: false, error: 'unknown-event' };
  }

  function subscribeWorldEvents() {
    if (typeof window.EventSource !== 'function') return;
    const runId = pageRunId();
    let lastId = '';
    const open = () => {
      const source = new window.EventSource(`/api/desktop/events?run=${runId}${lastId ? `&last=${encodeURIComponent(lastId)}` : ''}`);
      source.onopen = () => { document.body.dataset.worldStream = 'open'; };
      source.onmessage = event => {
        lastId = event.lastEventId || lastId;
        let message = null;
        try { message = JSON.parse(event.data); } catch { /* Refused below. */ }
        const result = applyStreamEvent(message);
        if (result.ok && state.replay && message.type === 'patch') state.replayEvents.push(message);
        if (!result.ok) console.warn(`Desktop world event ${event.lastEventId || '?'} refused: ${result.error}`);
      };
      // The browser retries a dropped stream by itself; a refused one (CLOSED) is reopened here, resuming after lastId.
      source.onerror = () => {
        document.body.dataset.worldStream = 'reconnecting';
        if (source.readyState === window.EventSource.CLOSED) setTimeout(open, STREAM_REOPEN_MS);
      };
    };
    open();
  }

  window.OceanDesktop = Object.freeze({
    replaceWorld,
    patchWorld,
    getWorld: () => (state.world ? clone(state.world) : null),
    getScene: () => (state.desk ? clone(state.desk) : null),
  });

  // Effects: none (what a real OS does), low, high. Cycles; remembered for the next visit.
  const FX_LABEL = { none: 'Effects: off', low: 'Effects: low', high: 'Effects: high' };
  const renderFx = () => {
    if (!dom['ocean-fx-toggle']) return;
    dom['ocean-fx-toggle'].textContent = FX_LABEL[state.effects];
    dom['ocean-fx-toggle'].title = 'Off: only the sounds and effects a real computer makes. Low and high add game feel: highlights, sounds and animations.';
    document.body.dataset.fx = state.effects;
  };
  dom['ocean-fx-toggle']?.addEventListener('click', () => {
    state.effects = { none: 'low', low: 'high', high: 'none' }[state.effects];
    try { localStorage.setItem('ocean-fx', state.effects); } catch { /* remembered for this page only */ }
    renderFx();
    if (state.world) setWorld(state.world);
  });
  renderFx();
  dom['os-windows'].addEventListener('click', () => requestOs('windows'));
  dom['os-macos'].addEventListener('click', () => requestOs('macos'));
  dom['ocean-restart'].addEventListener('click', restartScene);
  dom['ocean-brief'].addEventListener('click', () => { if (dom['ocean-intro'].hidden) openIntro(); else closeIntro(); });
  dom['intro-dismiss'].addEventListener('click', closeIntro);
  dom['guide-next'].addEventListener('click', () => guideGo(state.guide.at > state.guide.data.steps.length ? 0 : state.guide.at + 1));
  dom['guide-back'].addEventListener('click', () => guideGo(state.guide.at - 1));
  dom['guide-all'].addEventListener('click', () => guideGo(state.guide.data.steps.length + 1));
  dom['guide-hide'].addEventListener('click', () => setGuideHidden(true));
  dom['ocean-guide-toggle'].addEventListener('click', () => setGuideHidden(!state.guide.hidden));
  // Arrow keys step the guide while the page (not a desktop) has focus.
  document.addEventListener('keydown', event => {
    if (dom['ocean-guide'].hidden || state.guide.at < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' && state.guide.at <= state.guide.data.steps.length) guideGo(state.guide.at + 1);
    else if (event.key === 'ArrowLeft') guideGo(state.guide.at - 1);
    else return;
    event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!dom['ocean-intro'].hidden) {
      event.preventDefault();
      closeIntro();
    } else if (window.top !== window.self) {
      // Shown inside the ocean's creature panel (ui/abyss/creature-panel.js): Esc goes back to its fish list.
      window.parent.postMessage({ type: 'ocean-desktop-escape' }, window.location.origin);
    }
  });
  dom['gate-opt-in'].addEventListener('change', () => { dom['gate-enter'].disabled = !dom['gate-opt-in'].checked; });
  dom['gate-enter'].addEventListener('click', acceptGate);

  // A replay link carries only ?job=<jobId>: it plays the neutral replay profile, and the job's events fill its world.
  const query = new URLSearchParams(window.location.search);
  const requestedProfile = query.get('profile') ?? (query.has('job') ? REPLAY_PROFILE : null);
  if (/^[a-z0-9-]{3,64}$/.test(requestedProfile ?? '')) loadProfile(requestedProfile);
  else window.location.replace('/ocean-profiles.html');
})();
