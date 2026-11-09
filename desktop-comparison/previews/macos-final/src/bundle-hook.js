// Appended by make-macos-final.mjs to the end of the Kimi macOS 27 module (build index-Bfk0NWYJ.js only).
// It runs in module scope before the first React render, so it may use the minified identifiers below.
// Identifiers: _1 registry, uE registry map, _h settings panes, wa App Store catalogue, B0/d7e wallpapers,
// e jsx runtime, y React, Ni lucide glyph lookup, ks app icon, ua settings button, Lo mail identity, Hc/_V people,
// d9e/Ym open a mail message / message thread in the running app, ps posts a pending app event ("mail:open" selects a
// message in Mail, now or when it mounts), Rt Safari store, Z4e/UO Safari start-page and
// error-page favourites, eF Safari address-bar suggestions, ys Safari tabs per window, Ms Clock store, zu Activity Monitor process simulator,
// HO new Safari tab, Oe Music library store, Ke shared audio player, ss its audio element, Df plays Music's current track, vt Photos store, _n default photo
// edits, Ybe Freeform store, nn Calculator store, iV Stickies store, Es Terminal store, Qe Settings app store.
;(() => {
  const oceanCulled = new Set(['weather', 'maps', 'stocks', 'podcasts', 'tv', 'photobooth', 'voicememos', 'diskutility',
    'facetime', 'phone', 'chess', 'dictionary', 'home', 'news', 'games']);
  const oceanKeep = _1.filter(entry => !oceanCulled.has(entry.id));
  _1.splice(0, _1.length, ...oceanKeep);
  for (const id of oceanCulled) delete uE[id];
  // Settings keeps the panes that match the world (sys, user, apps) and the Windows Settings pages.
  const oceanCulledPanes = new Set(['siri', 'timemachine', 'vpn', 'menubar', 'screensaver', 'keyboard', 'trackpad', 'mouse']);
  _h.splice(0, _h.length, ..._h.filter(pane => !oceanCulledPanes.has(pane.id)));
  wa.splice(0, wa.length, ...wa.filter(product => !oceanCulled.has(product.id)));

  const oceanEmit = intent => window.__oceanEmit?.(intent);
  const oceanUseWorld = () => {
    const [world, setWorld] = y.useState(() => window.__oceanWorld ?? null);
    y.useEffect(() => {
      const update = () => setWorld(window.__oceanWorld ?? null);
      window.addEventListener('ocean-world', update);
      return () => window.removeEventListener('ocean-world', update);
    }, []);
    return world;
  };
  const oceanUseNow = ms => {
    const [now, setNow] = y.useState(Date.now());
    y.useEffect(() => {
      const timer = window.setInterval(() => setNow(Date.now()), ms);
      return () => window.clearInterval(timer);
    }, [ms]);
    return now;
  };
  const oceanGlyph = (name, size, color) => e.jsx(Ni(name), { size, color, strokeWidth: 1.9 });
  const oceanCard = (children, extra, key) => e.jsx('div', {
    style: { background: 'var(--fill-secondary, rgba(120,120,128,0.12))', borderRadius: 12, padding: '12px 14px', boxShadow: 'inset 0 0 0 0.5px var(--separator, rgba(0,0,0,0.1))', ...extra },
    children,
  }, key);

  // Six digits from a 30-second window and the account label: deterministic and offline (no secrets involved).
  const oceanCode = (label, windowIndex) => {
    let hash = 2166136261;
    for (const char of `${label}:${windowIndex}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return String(hash % 1000000).padStart(6, '0').replace(/(\d{3})(\d{3})/, '$1 $2');
  };

  // Scene gating shared with the Windows apps (requests/win-apps-to-mac.md): an ordinary gesture is also a scene
  // choice only while world.scene.highlight points at the app (and, where given, the item).
  const oceanHighlighted = (world, app) => world?.scene.highlight?.app === app;

  // Authenticator: world prompts (data.mfa.prompts) with Approve/Deny -> scene-choice, then mfa delete {id}.
  // Accounts come from data.mfa.accounts, or one account derived from world.user when absent.
  function OceanAuthenticator() {
    const world = oceanUseWorld();
    const now = oceanUseNow(1000);
    const email = world?.user.email ?? __oceanUser.email;
    const org = (email.split('@')[1] ?? 'example').split('.')[0];
    const accounts = world?.data.mfa?.accounts.map(item => [item.issuer, item.label]) ?? [[`${org.charAt(0).toUpperCase()}${org.slice(1)} SSO`, email]];
    const prompts = world?.data.mfa?.prompts ?? [];
    const windowIndex = Math.floor(now / 30000);
    const left = 30 - Math.floor((now / 1000) % 30);
    const answer = (prompt, choiceId) => {
      oceanEmit({ kind: 'scene-choice', choiceId });
      oceanEmit({ kind: 'data', store: 'mfa', op: 'delete', item: { id: prompt.id } });
    };
    return e.jsxs('div', {
      className: 'h-full overflow-auto surface-window text-label',
      style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
      children: [
        e.jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [
          e.jsx(ks, { icon: uE.authenticator.icon, size: 34 }),
          e.jsxs('div', { children: [
            e.jsx('div', { style: { fontSize: 15, fontWeight: 600 }, children: 'Authenticator' }),
            e.jsx('div', { className: 'text-label-2', style: { fontSize: 11 }, children: 'Training codes · nothing here is real' }),
          ] }),
        ] }),
        ...prompts.map(prompt => oceanCard(e.jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [
          e.jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }, children: [oceanGlyph('CircleAlert', 16, '#FF9F0A'), `Sign-in request · ${prompt.app}`] }),
          e.jsx('div', { className: 'text-label-2', style: { fontSize: 12 }, children: `${prompt.account} · ${prompt.device} · ${prompt.location}` }),
          prompt.number !== null && e.jsxs('div', { style: { fontSize: 12 }, children: ['Number shown on the sign-in screen: ', e.jsx('b', { style: { fontSize: 20, marginLeft: 6 }, children: String(prompt.number) })] }),
          e.jsx('div', { className: 'text-label-2', style: { fontSize: 11 }, children: 'Only approve a request you started yourself.' }),
          e.jsxs('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' }, children: [
            e.jsx(ua, { red: !0, onClick: () => answer(prompt, 'deny'), children: 'Deny' }),
            e.jsx(ua, { accent: !0, onClick: () => answer(prompt, 'approve'), children: 'Approve' }),
          ] }),
        ] }), { boxShadow: 'inset 0 0 0 1px #FF9F0A' }, prompt.id)),
        ...accounts.map(([label, account]) => oceanCard(e.jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [
          oceanGlyph('KeyRound', 18, 'var(--accent)'),
          e.jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
            e.jsx('div', { style: { fontSize: 12, fontWeight: 600 }, children: label }),
            e.jsx('div', { className: 'text-label-2', style: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }, children: account }),
            e.jsx('div', { style: { fontSize: 24, fontWeight: 300, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' }, children: oceanCode(label, windowIndex) }),
          ] }),
          e.jsx('div', { className: 'text-label-2', style: { fontSize: 11, width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }, children: `${left}s` }),
        ] }), undefined, label)),
      ],
    });
  }

  // Software Update: world updates (data.updates). Install -> upsert status installed, plus the item's scene choice.
  // "Check Now" is the scene's check-updates choice while Software Update is highlighted.
  function OceanSoftwareUpdate() {
    const world = oceanUseWorld();
    const [checking, setChecking] = y.useState(false);
    y.useEffect(() => {
      if (!checking) return undefined;
      const timer = window.setTimeout(() => setChecking(false), 1400);
      return () => window.clearTimeout(timer);
    }, [checking]);
    const updates = world?.data.updates ?? [];
    const pending = updates.filter(item => item.status === 'available');
    const row = (glyph, title, sub, extra, key = title) => oceanCard(e.jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [
      oceanGlyph(glyph, 22, 'var(--accent)'),
      e.jsxs('div', { style: { flex: 1 }, children: [
        e.jsx('div', { style: { fontSize: 13, fontWeight: 600 }, children: title }),
        e.jsx('div', { className: 'text-label-2', style: { fontSize: 11 }, children: sub }),
      ] }),
      extra,
    ] }), undefined, key);
    const install = item => {
      const { choiceId, ...rest } = item;
      oceanEmit({ kind: 'data', store: 'updates', op: 'upsert', item: { ...rest, status: 'installed' } });
      if (choiceId) oceanEmit({ kind: 'scene-choice', choiceId });
    };
    const check = () => {
      setChecking(true);
      if (oceanHighlighted(world, 'updates')) oceanEmit({ kind: 'scene-choice', choiceId: 'check-updates' });
    };
    return e.jsxs('div', {
      className: 'h-full overflow-auto surface-window text-label',
      style: { padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
      children: [
        e.jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [
          e.jsx(ks, { icon: uE.softwareupdate.icon, size: 40 }),
          e.jsxs('div', { style: { flex: 1 }, children: [
            e.jsx('div', { style: { fontSize: 17, fontWeight: 600 }, children: 'Software Update' }),
            e.jsx('div', { className: 'text-label-2', style: { fontSize: 11 }, children: checking ? 'Checking for updates…'
              : pending.length ? `${pending.length} update${pending.length > 1 ? 's' : ''} available` : 'This Mac is up to date.' }),
          ] }),
          e.jsx(ua, { onClick: check, children: 'Check Now' }),
        ] }),
        ...updates.map(item => row(item.status === 'installed' ? 'Check' : 'Download', item.title,
          `${item.kb} · ${item.size} · ${item.status === 'installed' ? 'Installed' : 'Available'}`,
          item.status === 'available' ? e.jsx(ua, { accent: !0, onClick: () => install(item), children: 'Install' }) : null, item.id)),
        row('RefreshCw', 'Automatic updates', 'Security responses and system files are installed automatically.'),
      ],
    });
  }

  // Settings > Login Items: the world's startup items (data.startup), read-only. Zt, ft, We and tt are the Settings pane builders.
  function OceanLoginItems() {
    const world = oceanUseWorld();
    const items = world?.data.startup ?? [];
    return e.jsxs('div', { 'data-testid': 'login-items', children: [
      e.jsx(Zt, { children: 'Login Items' }),
      e.jsx(ft, { children: 'OPEN AT LOGIN' }),
      e.jsx(We, { children: items.length
        ? items.map((item, index) => e.jsx(tt, { label: item.name, sub: [item.publisher ?? 'Unknown publisher', item.command, item.location].filter(Boolean).join(' · '), last: index === items.length - 1, icon: oceanGlyph('LogIn', 16, 'var(--accent)') }, item.id))
        : e.jsx(tt, { label: 'No login items', last: !0 }) }),
    ] });
  }
  window.__oceanLoginItems = OceanLoginItems;
  _h.splice(_h.findIndex(pane => pane.id === 'general') + 1, 0, { id: 'loginitems', title: 'Login Items', from: '#8E8E93', to: '#48484A',
    icon: e.jsx(Ni('LogIn'), { size: 13 }), keywords: ['login', 'startup', 'open at login', 'startup items'] });

  // A program window (docs/desktop-parity/PROGRAMS.md): the world's data.views[payload.view] at payload.page, drawn by
  // the shared DOM module OceanProgramUI, the same code the Windows shell uses. Buttons become view-action intents.
  function OceanProgram({ winId, payload }) {
    const world = oceanUseWorld();
    const ref = y.useRef(null);
    const view = world?.data.views?.[payload?.view] ?? null;
    const page = payload?.page ?? 0;
    const flips = payload?.flips ?? [];
    const dark = world?.sys.theme === 'dark';
    const key = JSON.stringify([view, page, flips, dark]);
    y.useEffect(() => { window.OceanProgramUI?.injectStyles(document); }, []);
    y.useEffect(() => {
      if (!ref.current || !window.OceanProgramUI) return;
      window.OceanProgramUI.renderView(ref.current, { view, id: payload?.view ?? null, page, flips, os: 'macos', dark }, action => {
        const windowId = window.__oceanWorldWindowId?.(winId);
        if (windowId) oceanEmit({ kind: 'view-action', windowId, action });
      });
    }, [key, winId]);
    return e.jsx('div', { ref, className: 'oceanProgram', 'data-testid': 'program-view', 'data-view': payload?.view ?? '',
      style: { position: 'absolute', inset: 0, overflow: 'auto' } });
  }

  for (const entry of [
    { id: 'oceanprogram', get name() { return window.__oceanProgramName || 'Program'; }, icon: { from: '#8E8E93', to: '#48484A', glyph: 'AppWindow' }, component: OceanProgram,
      defaultSize: { w: 500, h: 330 }, minSize: { w: 260, h: 150 }, category: 'Utilities', keywords: [], hidden: !0 },
    { id: 'authenticator', name: 'Authenticator', icon: { from: '#34C759', to: '#1E8E3E', glyph: 'ShieldCheck' }, component: OceanAuthenticator,
      defaultSize: { w: 380, h: 520 }, minSize: { w: 320, h: 420 }, category: 'Utilities', keywords: ['mfa', '2fa', 'code', 'verification', 'authenticator'], allowMultiple: !1 },
    { id: 'softwareupdate', name: 'Software Update', icon: { from: '#A1A1A6', to: '#5E5E63', glyph: 'RefreshCw' }, component: OceanSoftwareUpdate,
      defaultSize: { w: 620, h: 440 }, minSize: { w: 480, h: 360 }, category: 'Utilities', keywords: ['update', 'upgrade', 'software', 'patch'], allowMultiple: !1 },
  ]) {
    _1.push(entry);
    uE[entry.id] = entry;
  }

  // Store listings for every training app, so a profile that leaves one out can still install it.
  for (const entry of _1.filter(item => !item.hidden && item.id !== 'launchpad' && item.id !== 'preview' && item.id !== 'quicktime')) {
    if (wa.some(product => product.id === entry.id)) continue;
    wa.push({ id: entry.id, name: entry.name, subtitle: 'Included with this training Mac', developer: 'Northwind IT', icon: entry.icon, price: 'Free', real: !0,
      sections: ['work'], categoryTile: 'Productivity', screenshots: ['./photo-2.jpg', './photo-4.jpg'], blurb: `${entry.name} for the training desktop.`,
      description: [`${entry.name} is part of the fictional training desktop. Installing it only changes the simulated world state.`],
      rating: 4.5, ratingCount: '1K', histogram: [0.7, 0.2, 0.05, 0.03, 0.02], age: '4+', size: '24 MB', version: '27.0', versionNotes: 'Training build' });
  }

  const oceanDepth = { 'depth-sunlight': 'Sunlight Zone', 'depth-twilight': 'Twilight Zone', 'depth-midnight': 'Midnight Zone', 'depth-abyss': 'Abyss', 'depth-trench': 'Trench' };
  for (const [id, label] of Object.entries(oceanDepth)) {
    B0.push(`./src/wallpapers/${id}.svg`);
    d7e[`./src/wallpapers/${id}.svg`] = label;
  }

  // Mail has no attachment or link UI: render the world's scene link and attachments under the body.
  window.__oceanMailExtras = message => {
    const extras = window.__oceanMailExtrasFor?.(message.id);
    if (!extras || (!extras.link && extras.attachments.length === 0)) return null;
    const chip = (key, glyph, label, onClick) => e.jsxs('button', {
      key, onClick, className: 'text-label',
      style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginRight: 8, marginTop: 6, borderRadius: 8, fontSize: 12,
        background: 'var(--fill-secondary, rgba(120,120,128,0.14))', boxShadow: 'inset 0 0 0 0.5px var(--separator, rgba(0,0,0,0.12))' },
      children: [oceanGlyph(glyph, 13, 'var(--accent)'), label],
    });
    return e.jsxs('div', { key: 'ocean-extras', style: { marginTop: 4 }, children: [
      extras.link && chip('link', 'Link', extras.linkLabel, () => window.__oceanFollowLink?.(message.id)),
      ...extras.attachments.map(item => chip(item.id, 'Paperclip', item.name, () => window.__oceanOpenAttachment?.(message.id, item.id))),
    ] });
  };

  window.__macos27 = {
    wins: Ee, sys: we, phase: _o, apps: Pt, notify: Ve, ui: ze, fs: je, open: Le, app: Ut, registry: _1, registryMap: uE,
    installed: qu, clipboard: ln, wallpapers: B0, sounds: O, workArea: Wd, tileRect: Z$,
    mail: ha, messages: da, notes: JO, reminders: Eo, calendar: A1, contacts: nV, mailIdentity: Lo, people: Hc, peopleMap: _V,
    storeCatalogue: wa, openMail: d9e, selectMail: id => ps('mail:open', id), openThread: Ym, safari: Rt, safariStart: Z4e, safariSuggestions: UO, safariSites: eF,
    safariTabs: ys, clock: Ms, processes: zu,
    newSafariTab: HO, music: Oe, player: Ke, audio: ss, photos: vt,
    // Df (Music's own start of the current track) with a start position and autoplay choice.
    playMusicTrack: (position, autoplay) => {
      const music = Oe.getState(), track = music.currentTrack();
      if (!track) return;
      QD('music', { next: () => music.next(), prev: () => music.prev(), onEnded: () => music.handleEnded() });
      Ke.getState().start('music', track.src, { title: track.title, artist: track.artist, album: track.album, artwork: track.artwork, duration: track.duration || void 0 }, { position, autoplay });
    }, photoEdits: _n, freeform: Ybe,
    calculator: nn, stickies: iV, terminal: Es, settingsStore: Qe,
  };
})();
