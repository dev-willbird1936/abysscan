(() => {
  'use strict';

  const SCENARIO_IDS = [
    'oauth-2023', 'zeus-2007', 'drainer-2022', 'iloveyou-2000', 'wannacry-2017',
    'solarwinds-2020', 'heartbleed-2014', 'log4shell-2021', 'moveit-2023', 'bec-2024',
  ];
  const LIFECYCLE_CHANNEL = 'northstar-training-lifecycle-v1';
  const SESSION_ID_PATTERN = /^[a-f0-9-]{36}$/i;
  const isEmbedded = window.parent !== window;
  const requestedAttackId = new URLSearchParams(window.location.search).get('attack');
  const embeddedAttackId = isEmbedded && SCENARIO_IDS.includes(requestedAttackId) ? requestedAttackId : null;
  const ENDPOINTS = Object.freeze({
    scenarios: '/api/training/scenarios',
    start: '/api/training/start',
    view: '/api/training/view',
    action: '/api/training/action',
    reset: '/api/training/reset',
    close: '/api/training/close',
  });
  const ACTION_APP = Object.freeze({
    'oauth-2023': 'permissions',
    'zeus-2007': 'sessions',
    'drainer-2022': 'wallet',
    'iloveyou-2000': 'inbox',
    'wannacry-2017': 'services',
    'solarwinds-2020': 'updater',
    'heartbleed-2014': 'monitor',
    'log4shell-2021': 'logs',
    'moveit-2023': 'transfers',
    'bec-2024': 'payments',
  });
  const FILE_STATE_PATHS = Object.freeze({
    'oauth-plan': ['files', 'planning'],
    'oauth-calendar': ['files', 'calendar'],
    'love-budget': ['files', 'budget'],
    'love-contacts': ['files', 'contacts'],
    'wcry-plan': ['files', 'plan'],
    'wcry-roster': ['files', 'roster'],
    'update-report': ['files', 'summary'],
    'update-inventory': ['files', 'inventory'],
    'heart-canary': ['diagnostic'],
    'transfer-payroll': ['records', 'payroll'],
    'transfer-vendors': ['records', 'vendors'],
  });
  const FILE_ACCESS_RULES = Object.freeze({
    'heart-canary': { path: ['diagnostic', 'canaryExposed'], visibleWhen: true, hiddenAvailability: 'Hidden', hiddenPrivacy: 'Hidden' },
    'transfer-payroll': { path: ['records', 'payroll', 'private'], visibleWhen: false, hiddenAvailability: 'Restricted', hiddenPrivacy: 'Private' },
    'transfer-vendors': { path: ['records', 'vendors', 'private'], visibleWhen: false, hiddenAvailability: 'Restricted', hiddenPrivacy: 'Private' },
  });
  const APP_ICONS = new Set([
    'inbox', 'browser', 'files', 'accounts', 'permissions', 'sessions', 'wallet', 'outbox',
    'services', 'updater', 'monitor', 'logs', 'transfers', 'payments', 'training-guide', 'training-center',
  ]);
  const GUIDE_APP = Object.freeze({ id: 'training-guide', name: 'Training Guide' });
  const TRAINING_CENTER_APP = Object.freeze({ id: 'training-center', name: 'Training Center' });
  const PINNED_APPS = Object.freeze(['browser', 'files', 'inbox', 'accounts']);
  const state = {
    catalog: [],
    view: null,
    seedState: null,
    expired: false,
    busy: false,
    windows: new Map(),
    guide: null,
    trainingCenter: null,
    zIndex: 5,
    nextStartRequestId: 0,
    startPermitResolvers: new Map(),
    startingRequestIds: new Set(),
    startOutcomeUncertain: false,
    parentExitRequested: false,
    parentCloseQueue: [],
    parentCloseRunning: false,
    closedSessionIds: new Set(),
  };
  const dom = Object.fromEntries([
    'desktop', 'desktop-icons', 'window-layer', 'walkthrough', 'guide-titlebar', 'guide-close',
    'guide-minimize', 'guide-maximize', 'guide-content', 'severity-badge', 'consequence-content',
    'event-list', 'launcher', 'launcher-titlebar', 'training-minimize', 'training-maximize',
    'training-close', 'launcher-status', 'scenario-selector', 'selected-summary', 'training-opt-in',
    'launch-session', 'retry-catalog', 'error-banner', 'busy-overlay', 'busy-label', 'scenario-label',
    'execution-mode', 'connection-status', 'taskbar-apps', 'system-clock', 'active-app-name',
    'guide-toggle', 'training-center-toggle', 'reset-session', 'end-session',
    'refresh-session', 'exit-dialog', 'cancel-exit', 'confirm-exit', 'screen-reader-announcer',
  ].map(id => [id, document.getElementById(id)]));

  function updateClock() {
    dom['system-clock'].textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function appIcon(appId, className = 'app-icon') {
    const image = make('img', className);
    const assetId = APP_ICONS.has(appId) ? appId : 'files';
    image.src = `/desktop-assets/app-${assetId}.svg`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.setAttribute('data-app-id', appId);
    return image;
  }

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

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function addText(parent, tag, className, text) {
    const node = make(tag, className, text);
    parent.append(node);
    return node;
  }

  function announce(message) {
    dom['screen-reader-announcer'].textContent = message;
  }

  function showError(message) {
    dom['error-banner'].textContent = message;
    dom['error-banner'].hidden = false;
  }

  function clearError() {
    dom['error-banner'].textContent = '';
    dom['error-banner'].hidden = true;
  }

  function setBusy(busy, message = 'Contacting the training backend…') {
    state.busy = busy;
    dom['busy-overlay'].hidden = !busy;
    dom['busy-label'].textContent = message;
    syncLaunchButton();
    dom['reset-session'].disabled = !state.view || busy || state.expired;
    dom['end-session'].disabled = !state.view || busy || state.expired;
    dom['refresh-session'].disabled = !state.view || busy || state.expired;
    for (const record of state.windows.values()) {
      for (const button of record.content.querySelectorAll('.action-button')) button.disabled = busy || state.expired;
    }
    if (!busy) void processParentCloseRequests();
  }

  function setLauncherStatus(message, isError = false) {
    dom['launcher-status'].textContent = message;
    dom['launcher-status'].classList.toggle('error', isError);
  }

  function syncLaunchButton() {
    const scenario = findScenario(dom['scenario-selector'].value);
    const matchesEmbeddedEntry = !isEmbedded || scenario?.id === embeddedAttackId;
    const canLaunch = state.catalog.length > 0 && Boolean(dom['training-opt-in'].checked) &&
      !state.view && !state.busy && !state.startOutcomeUncertain && Boolean(scenario) && matchesEmbeddedEntry;
    dom['launch-session'].disabled = !canLaunch;
  }

  function postLifecycleMessage(type, details) {
    if (isEmbedded) window.parent.postMessage({ channel: LIFECYCLE_CHANNEL, type, ...details }, window.location.origin);
  }

  function requestParentStartPermit(attackId, requestId) {
    if (!isEmbedded) return Promise.resolve(true);
    if (state.parentExitRequested) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        state.startPermitResolvers.delete(requestId);
        resolve(false);
      }, 5000);
      state.startPermitResolvers.set(requestId, permitted => {
        clearTimeout(timer);
        state.startPermitResolvers.delete(requestId);
        resolve(permitted);
      });
      postLifecycleMessage('session-start-requested', { attackId, requestId });
    });
  }

  async function request(endpoint, { method = 'GET', body, timeoutMs = 10000 } = {}) {
    const controller = new AbortController();
    const options = {
      method,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ApiError('The training API timed out. Refresh backend state before retrying.'));
      }, timeoutMs);
    });
    const responseTask = (async () => {
      let response;
      try { response = await fetch(endpoint, options); }
      catch { throw new ApiError('The training API could not be reached. Check the local server and retry.'); }
      let result;
      try { result = await response.json(); }
      catch { throw new ApiError('The training API returned an unreadable response.', response.status); }
      if (!response.ok) {
        const message = isRecord(result) && typeof result.error === 'string' ? result.error : `The training API returned status ${response.status}.`;
        const code = isRecord(result) && typeof result.code === 'string' ? result.code : '';
        throw new ApiError(message, response.status, code);
      }
      return result;
    })();
    try { return await Promise.race([responseTask, timeout]); }
    finally { clearTimeout(timer); }
  }

  function validateCatalog(value) {
    if (!Array.isArray(value) || value.length !== SCENARIO_IDS.length) throw new ApiError('The training scenario list is incomplete.');
    const ids = value.map(item => isRecord(item) ? item.id : null);
    if (ids.some((id, index) => id !== SCENARIO_IDS[index])) throw new ApiError('The training scenario list does not match the supported exercises.');
    if (value.some(item => !Number.isInteger(item.sev) || item.sev < 1 || item.sev > 5 ||
      typeof item.name !== 'string' || typeof item.mechanism !== 'string' || typeof item.summary !== 'string')) {
      throw new ApiError('The training scenario list contains invalid metadata.');
    }
    return value;
  }

  function validateView(value, expectedAttackId) {
    if (!isRecord(value) || typeof value.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(value.sessionId) ||
      !isRecord(value.scenario) || !SCENARIO_IDS.includes(value.scenario.id) ||
      (expectedAttackId && value.scenario.id !== expectedAttackId) ||
      !isRecord(value.persona) || !Array.isArray(value.apps) || !isRecord(value.assets) ||
      !isRecord(value.assets.mailbox) || !Array.isArray(value.assets.mailbox.messages) ||
      !Array.isArray(value.assets.files) || !Array.isArray(value.assets.browserViews) || !isRecord(value.state) ||
      !isRecord(value.walkthrough) || !Array.isArray(value.walkthrough.steps) ||
      !Array.isArray(value.permittedActions) || !Array.isArray(value.events) ||
      !isRecord(value.outcome) || !isRecord(value.outcome.receipt) || typeof value.executionMode !== 'string') {
      throw new ApiError('The training API returned an invalid session view.');
    }
    if (!Object.hasOwn(ACTION_APP, value.scenario.id) || value.apps.some(app => !isRecord(app) || typeof app.id !== 'string' || typeof app.name !== 'string')) {
      throw new ApiError('The training API returned unsupported desktop applications.');
    }
    if (value.permittedActions.some(action => !isRecord(action) || typeof action.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(action.id) || typeof action.label !== 'string' ||
      !['safe', 'adverse', 'recovery'].includes(action.kind) || typeof action.help !== 'string')) {
      throw new ApiError('The training API returned an invalid action list.');
    }
    return value;
  }

  function findScenario(id) {
    return state.catalog.find(scenario => scenario.id === id) ?? null;
  }

  function updateSelectedScenario() {
    const scenario = findScenario(dom['scenario-selector'].value);
    dom['selected-summary'].textContent = scenario
      ? `SEV ${scenario.sev} · ${scenario.mechanism}. ${scenario.summary}`
      : 'Choose one of the supported training scenarios.';
    syncLaunchButton();
  }

  function renderCatalog(scenarios) {
    state.catalog = validateCatalog(scenarios);
    dom['scenario-selector'].replaceChildren();
    for (const scenario of state.catalog) {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = `SEV ${scenario.sev} · ${scenario.name} (${scenario.year})`;
      dom['scenario-selector'].append(option);
    }
    const requested = requestedAttackId;
    if (isEmbedded) {
      if (!embeddedAttackId) {
        dom['scenario-selector'].disabled = true;
        dom['training-opt-in'].disabled = true;
        dom['retry-catalog'].hidden = true;
        setLauncherStatus('This embedded link does not identify an allowlisted training scenario.', true);
        showError('Unsupported embedded training scenario. Return to the timeline and choose a supported entry.');
        return;
      }
      dom['scenario-selector'].value = embeddedAttackId;
      dom['scenario-selector'].disabled = true;
    } else {
      if (requested && SCENARIO_IDS.includes(requested)) dom['scenario-selector'].value = requested;
      else if (requested) setLauncherStatus('This link does not name a supported exercise. Choose one of the listed training scenarios.', true);
      dom['scenario-selector'].disabled = false;
    }
    dom['training-opt-in'].disabled = false;
    dom['retry-catalog'].hidden = true;
    dom['connection-status'].textContent = 'Training scenario list ready';
    if (!dom['launcher-status'].classList.contains('error')) {
      setLauncherStatus(isEmbedded
        ? 'This timeline entry is fixed. Explicitly opt in before starting its synthetic session.'
        : 'Select a scenario, then explicitly opt in before a session starts.');
    }
    updateSelectedScenario();
    document.body.dataset.sessionState = 'inactive';
  }

  async function loadCatalog() {
    clearError();
    dom['retry-catalog'].hidden = true;
    dom['scenario-selector'].disabled = true;
    dom['training-opt-in'].disabled = true;
    setLauncherStatus('Loading the available training scenarios…');
    document.body.dataset.sessionState = 'loading';
    try {
      const scenarios = await request(ENDPOINTS.scenarios);
      renderCatalog(scenarios);
      announce('Training scenario list loaded.');
    } catch (error) {
      dom['connection-status'].textContent = 'Training API unavailable';
      setLauncherStatus(error.message, true);
      dom['retry-catalog'].hidden = false;
      showError(error.message);
    }
  }

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function startSession() {
    if (state.busy || state.startOutcomeUncertain || !dom['training-opt-in'].checked) return;
    const scenario = findScenario(dom['scenario-selector'].value);
    if (!scenario || (isEmbedded && scenario.id !== embeddedAttackId)) return;
    const requestId = ++state.nextStartRequestId;
    let sessionId = null;
    let requestWasSubmitted = false;
    state.startingRequestIds.add(requestId);
    clearError();
    setBusy(true, 'Creating an opted-in synthetic session…');
    setLauncherStatus('Starting the selected training scenario…');
    try {
      const permitted = await requestParentStartPermit(scenario.id, requestId);
      if (!permitted) throw new ApiError('The timeline is closing this desktop before a session was started.', 409);
      requestWasSubmitted = true;
      const response = await request(ENDPOINTS.start, {
        method: 'POST',
        body: { attackId: scenario.id, optIn: true },
      });
      if (isRecord(response) && SESSION_ID_PATTERN.test(response.sessionId || '')) {
        sessionId = response.sessionId;
        state.startOutcomeUncertain = true;
        postLifecycleMessage('session-started', { attackId: scenario.id, requestId, sessionId });
      }
      activateSession(validateView(response, scenario.id));
      dom['training-opt-in'].checked = false;
      state.startOutcomeUncertain = false;
      setLauncherStatus('Session started. Use the desktop apps and walkthrough.');
      announce(`${scenario.name} training desktop opened.`);
    } catch (error) {
      if (!sessionId) {
        const rejected = (error.status >= 400 && error.status < 500) || error.code === 'TRAINING_CLOUD_BACKEND_UNAVAILABLE';
        const uncertain = requestWasSubmitted && !rejected;
        if (uncertain) state.startOutcomeUncertain = true;
        postLifecycleMessage('session-start-failed', {
          attackId: scenario.id, requestId, reason: uncertain ? 'uncertain' : 'rejected',
        });
      }
      setLauncherStatus(error.message, true);
      showError(error.message);
      if (error.status === 410) markExpired(error);
    } finally {
      state.startingRequestIds.delete(requestId);
      setBusy(false);
    }
  }

  function appForCurrentScenario() {
    return state.view ? ACTION_APP[state.view.scenario.id] : null;
  }

  function activateSession(view) {
    for (const record of state.windows.values()) record.el.remove();
    state.windows.clear();
    dom['taskbar-apps'].replaceChildren();
    state.view = view;
    dom['launcher'].classList.remove('is-open', 'is-minimized', 'is-maximized');
    dom['launcher'].hidden = true;
    state.trainingCenter.minimized = false;
    state.trainingCenter.maximized = false;
    state.guide.minimized = true;
    state.guide.maximized = false;
    state.guide.opened = false;
    state.guide.savedRect = null;
    state.guide.el.hidden = true;
    state.guide.el.classList.remove('is-maximized');
    dom['guide-toggle'].setAttribute('aria-expanded', 'false');
    dom['training-center-toggle'].setAttribute('aria-expanded', 'false');
    state.seedState = cloneData(view.state);
    state.expired = false;
    document.body.dataset.sessionState = 'active';
    dom['scenario-label'].textContent = `${view.scenario.name} · ${view.persona.displayName}`;
    dom['execution-mode'].textContent = view.executionMode;
    dom['execution-mode'].title = `Execution mode reported by backend: ${view.executionMode}`;
    dom['connection-status'].textContent = 'Synthetic training session active';
    renderDesktopApps();
    renderSession();
    openApp('inbox');
  }

  function setCurrentView(view, updateSeed = false) {
    state.view = view;
    if (updateSeed) state.seedState = cloneData(view.state);
    renderSession();
  }

  function renderDesktopApps() {
    dom['desktop-icons'].replaceChildren();
    dom['taskbar-apps'].replaceChildren();
    for (const app of state.view.apps) {
      const icon = make('button', 'desktop-icon');
      icon.type = 'button';
      icon.setAttribute('data-app-id', app.id);
      icon.setAttribute('aria-label', `Open ${appDisplayName(app)}`);
      icon.append(appIcon(app.id, 'app-glyph'), make('span', 'desktop-icon-label', appDisplayName(app)));
      icon.addEventListener('click', () => openApp(app.id));
      dom['desktop-icons'].append(icon);
    }
    renderTaskbar();
  }

  function appMetadata(appId) {
    if (appId === GUIDE_APP.id) return GUIDE_APP;
    return state.view?.apps.find(app => app.id === appId) ?? null;
  }

  function appDisplayName(app) {
    return app.name;
  }

  function openApp(appId) {
    if (appId === GUIDE_APP.id) {
      openGuide();
      return;
    }
    if (appId === TRAINING_CENTER_APP.id) {
      openTrainingCenter();
      return;
    }
    const app = appMetadata(appId);
    if (!state.view || !app || state.expired) return;
    let record = state.windows.get(app.id);
    if (record) {
      record.el.hidden = false;
      record.minimized = false;
      focusWindow(record);
      record.titlebar.focus({ preventScroll: true });
      return;
    }

    const el = make('section', `app-window app-${app.id}`);
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', `window-title-${app.id}`);
    const number = state.windows.size;
    el.style.left = window.innerWidth <= 760 ? '5px' : `${Math.min(5 + number * 4, 19)}%`;
    el.style.top = window.innerWidth <= 760 ? '5px' : `${Math.min(6 + number * 4, 22)}%`;
    el.style.zIndex = String(++state.zIndex);

    const titlebar = make('header', 'window-titlebar');
    titlebar.tabIndex = 0;
    titlebar.setAttribute('aria-label', `${app.name} window title bar. Use arrow keys to move the window.`);
    const title = make('span', 'window-title', appDisplayName(app));
    title.id = `window-title-${app.id}`;
    titlebar.append(title);
    const controls = make('div', 'window-controls');
    controls.append(
      windowControl('Close window', '×', () => closeWindow(app.id), true),
      windowControl('Minimize', '−', () => minimizeWindow(app.id)),
      windowControl('Maximize or restore', '□', () => toggleMaximize(app.id)),
    );
    titlebar.append(controls);
    const content = make('div', 'window-content');
    el.append(titlebar, content);
    dom['window-layer'].append(el);
    record = { appId: app.id, el, content, titlebar, title, minimized: false, maximized: false, savedRect: null, lastRect: null };
    state.windows.set(app.id, record);
    el.addEventListener('pointerdown', () => focusWindow(record));
    installWindowMovement(record);
    renderAppContent(record);
    focusWindow(record);
    renderTaskbar();
    titlebar.focus({ preventScroll: true });
  }

  function windowControl(label, text, onClick, isClose = false) {
    const button = make('button', `window-control${isClose ? ' close-window' : ''}`, text);
    button.type = 'button';
    if (label === 'Minimize') button.classList.add('minimize-window');
    if (label === 'Maximize or restore') button.classList.add('maximize-window');
    button.setAttribute('aria-label', `${label} this window`);
    button.title = `${label} window`;
    button.addEventListener('click', onClick);
    return button;
  }

  function managedWindowRecords() {
    return [...state.windows.values(), ...(state.guide ? [state.guide] : []), ...(state.trainingCenter ? [state.trainingCenter] : [])];
  }

  function allWindowRecords() {
    return managedWindowRecords().filter(record => record.appId !== TRAINING_CENTER_APP.id ||
      (!dom['launcher'].hidden && dom['launcher'].classList.contains('is-open')));
  }

  function actualWindowRect(record) {
    const rect = record.el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function rememberWindowRect(record) {
    if (!record.el.hidden && !record.minimized && !record.maximized) record.lastRect = actualWindowRect(record);
  }

  function placeWindowAtRect(record, rect, layerRect = dom['window-layer'].getBoundingClientRect()) {
    const maxWidth = Math.max(0, layerRect.width - (window.innerWidth <= 760 ? 0 : 20));
    const maxHeight = Math.max(0, layerRect.height - 16);
    const width = Math.min(Math.max(0, rect.width), maxWidth);
    const height = Math.min(Math.max(0, rect.height), maxHeight);
    const left = Math.max(0, Math.min(rect.left - layerRect.left, layerRect.width - width));
    const top = Math.max(0, Math.min(rect.top - layerRect.top, layerRect.height - height));
    record.el.style.left = `${left}px`;
    record.el.style.top = `${top}px`;
    record.el.style.width = `${width}px`;
    record.el.style.height = `${height}px`;
    record.lastRect = { left: layerRect.left + left, top: layerRect.top + top, width, height };
  }

  function focusWindow(record) {
    for (const windowRecord of allWindowRecords()) windowRecord.el.removeAttribute('aria-current');
    record.el.style.zIndex = String(++state.zIndex);
    record.el.setAttribute('aria-current', 'true');
    const app = record.appId === TRAINING_CENTER_APP.id ? TRAINING_CENTER_APP : appMetadata(record.appId);
    dom['active-app-name'].textContent = app ? appDisplayName(app) : 'The Abyss Desktop';
    renderTaskbar();
  }

  function installWindowMovement(record) {
    const { titlebar, el } = record;
    let drag = null;
    titlebar.addEventListener('pointerdown', event => {
      if (record.maximized || event.target.closest('button')) return;
      const parentRect = dom['window-layer'].getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left - parentRect.left, top: rect.top - parentRect.top, parentRect };
      titlebar.setPointerCapture(event.pointerId);
      focusWindow(record);
    });
    titlebar.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const left = drag.left + event.clientX - drag.x;
      const top = drag.top + event.clientY - drag.y;
      moveWindow(record, left, top, drag.parentRect);
    });
    const stopDragging = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (titlebar.hasPointerCapture(event.pointerId)) titlebar.releasePointerCapture(event.pointerId);
      drag = null;
    };
    titlebar.addEventListener('pointerup', stopDragging);
    titlebar.addEventListener('pointercancel', stopDragging);
    titlebar.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (record.maximized) return;
      if (event.key === 'Home') {
        moveWindow(record, 8, 8);
        return;
      }
      const step = event.shiftKey ? 48 : 20;
      const bounds = dom['window-layer'].getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const left = rect.left - bounds.left;
      const top = rect.top - bounds.top;
      if (event.key === 'ArrowLeft') moveWindow(record, left - step, top);
      if (event.key === 'ArrowRight') moveWindow(record, left + step, top);
      if (event.key === 'ArrowUp') moveWindow(record, left, top - step);
      if (event.key === 'ArrowDown') moveWindow(record, left, top + step);
    });
  }

  function moveWindow(record, left, top, parentRect = dom['window-layer'].getBoundingClientRect()) {
    if (record.maximized) return;
    const width = record.el.offsetWidth;
    const height = record.el.offsetHeight;
    const maxLeft = Math.max(0, parentRect.width - Math.min(width, parentRect.width));
    const maxTop = Math.max(0, parentRect.height - Math.min(height, parentRect.height));
    record.el.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
    record.el.style.top = `${Math.max(0, Math.min(top, maxTop))}px`;
    rememberWindowRect(record);
  }

  window.addEventListener('resize', () => {
    const bounds = dom['window-layer'].getBoundingClientRect();
    for (const record of managedWindowRecords()) {
      if (record.maximized) continue;
      const rect = record.minimized || record.el.hidden ? record.lastRect : actualWindowRect(record);
      if (rect) placeWindowAtRect(record, rect, bounds);
    }
  });

  function windowRecordForApp(appId) {
    if (appId === GUIDE_APP.id) return state.guide;
    if (appId === TRAINING_CENTER_APP.id) return state.trainingCenter;
    return state.windows.get(appId) ?? null;
  }

  function focusMostRecentVisibleWindow(excludedAppId) {
    const next = allWindowRecords()
      .filter(record => record.appId !== excludedAppId && !record.minimized && !record.el.hidden)
      .sort((a, b) => (Number(b.el.style.zIndex) || 0) - (Number(a.el.style.zIndex) || 0))[0];
    if (!next) return false;
    focusWindow(next);
    next.titlebar.focus({ preventScroll: true });
    return true;
  }

  function focusShellControl(appId, restore = false) {
    for (const record of managedWindowRecords()) record.el.removeAttribute('aria-current');
    dom['active-app-name'].textContent = 'The Abyss Desktop';
    renderTaskbar();
    const app = appId === TRAINING_CENTER_APP.id ? TRAINING_CENTER_APP : appMetadata(appId);
    const name = app ? appDisplayName(app) : '';
    const restoreButton = restore ? [...dom['taskbar-apps'].querySelectorAll('.taskbar-app')]
      .find(button => button.getAttribute('aria-label') === `Restore ${name}`) ?? null : null;
    const desktopIcon = !restore ? [...dom['desktop-icons'].querySelectorAll('.desktop-icon')]
      .find(button => button.getAttribute('aria-label') === `Open ${name}`) ?? null : null;
    const target = restoreButton ?? desktopIcon ??
      (appId === TRAINING_CENTER_APP.id ? dom['training-center-toggle'] : dom['guide-toggle']);
    target.focus({ preventScroll: true });
  }

  function minimizeWindow(appId) {
    const record = windowRecordForApp(appId);
    if (!record) return;
    rememberWindowRect(record);
    record.minimized = true;
    record.el.hidden = true;
    record.el.removeAttribute('aria-current');
    if (appId === GUIDE_APP.id) dom['guide-toggle'].setAttribute('aria-expanded', 'false');
    if (appId === TRAINING_CENTER_APP.id) dom['training-center-toggle'].setAttribute('aria-expanded', 'false');
    if (!focusMostRecentVisibleWindow(appId)) focusShellControl(appId, true);
  }

  function toggleMaximize(appId) {
    const record = windowRecordForApp(appId);
    if (!record) return;
    if (record.maximized) {
      const savedRect = record.savedRect;
      record.el.classList.remove('is-maximized');
      record.maximized = false;
      if (savedRect) placeWindowAtRect(record, savedRect);
      record.savedRect = null;
    } else {
      record.savedRect = actualWindowRect(record);
      record.lastRect = { ...record.savedRect };
      record.el.classList.add('is-maximized');
      record.maximized = true;
    }
    focusWindow(record);
  }

  function closeWindow(appId) {
    if (appId === GUIDE_APP.id) {
      minimizeWindow(appId);
      return;
    }
    if (appId === TRAINING_CENTER_APP.id) {
      const wasFocused = state.trainingCenter.el.hasAttribute('aria-current');
      rememberWindowRect(state.trainingCenter);
      dom['launcher'].classList.remove('is-open');
      dom['launcher'].hidden = true;
      dom['training-center-toggle'].setAttribute('aria-expanded', 'false');
      state.trainingCenter.minimized = true;
      state.trainingCenter.el.removeAttribute('aria-current');
      renderTaskbar();
      if (wasFocused && !focusMostRecentVisibleWindow(appId)) focusShellControl(appId);
      return;
    }
    const record = state.windows.get(appId);
    if (!record) return;
    const wasFocused = record.el.hasAttribute('aria-current');
    rememberWindowRect(record);
    record.el.removeAttribute('aria-current');
    record.el.remove();
    state.windows.delete(appId);
    renderTaskbar();
    if (wasFocused && !focusMostRecentVisibleWindow(appId)) focusShellControl(appId);
    else if (!wasFocused) {
      const icon = [...dom['desktop-icons'].querySelectorAll('.desktop-icon')]
        .find(button => button.getAttribute('aria-label') === `Open ${appDisplayName(appMetadata(appId))}`);
      icon?.focus({ preventScroll: true });
    }
  }

  function taskbarAppButton(app, record, pinned = false) {
    const button = make('button', `taskbar-app${pinned ? ' taskbar-pinned' : ''}`);
    button.type = 'button';
    const action = record ? record.minimized ? 'Restore' : 'Focus' : 'Open';
    const name = appDisplayName(app);
    button.setAttribute('aria-label', `${action} ${name}`);
    if (record && !record.minimized && !record.el.hidden) button.classList.add('is-running');
    if (record?.el.hasAttribute('aria-current')) button.setAttribute('aria-current', 'page');
    button.append(appIcon(app.id, 'app-glyph'), make('span', '', name));
    button.addEventListener('click', () => openApp(app.id));
    return button;
  }

  function renderTaskbar() {
    dom['taskbar-apps'].replaceChildren();
    const visibleApps = state.view?.apps ?? [];
    const added = new Set();
    for (const id of PINNED_APPS) {
      const app = visibleApps.find(candidate => candidate.id === id);
      if (!app) continue;
      added.add(id);
      dom['taskbar-apps'].append(taskbarAppButton(app, state.windows.get(id) ?? null, true));
    }
    for (const record of state.windows.values()) {
      if (added.has(record.appId)) continue;
      const app = appMetadata(record.appId);
      if (app) dom['taskbar-apps'].append(taskbarAppButton(app, record));
    }
    if (state.guide?.opened) dom['taskbar-apps'].append(taskbarAppButton(GUIDE_APP, state.guide));
    if (state.trainingCenter && dom['launcher'].classList.contains('is-open')) {
      dom['taskbar-apps'].append(taskbarAppButton(TRAINING_CENTER_APP, state.trainingCenter));
    }
  }

  function renderSession() {
    if (!state.view) return;
    const view = state.view;
    dom['scenario-label'].textContent = `${view.scenario.name} · ${view.persona.displayName}`;
    dom['execution-mode'].textContent = view.executionMode;
    dom['execution-mode'].title = `Execution mode reported by backend: ${view.executionMode}`;
    dom['severity-badge'].textContent = `SEV ${view.scenario.sev}`;
    dom['reset-session'].disabled = state.busy || state.expired;
    dom['end-session'].disabled = state.busy || state.expired;
    dom['refresh-session'].disabled = state.busy || state.expired;
    renderGuide();
    renderConsequences();
    renderEvents();
    for (const record of state.windows.values()) renderAppContent(record);
    renderTaskbar();
  }

  function currentEpochEvents(view) {
    const epoch = view.outcome.receipt.epoch;
    let start = 0;
    for (let index = view.events.length - 1; index >= 0; index--) {
      const event = view.events[index];
      if (event.type === 'scenario.started' && event.details?.epoch === epoch) {
        start = index;
        break;
      }
    }
    return view.events.slice(start);
  }

  function renderGuide() {
    const view = state.view;
    const guide = dom['guide-content'];
    guide.replaceChildren();
    addText(guide, 'p', 'guide-scenario', view.scenario.name);
    addText(guide, 'div', 'guide-mechanism', view.scenario.mechanism);
    addText(guide, 'p', 'guide-summary', view.scenario.summary);
    const steps = view.walkthrough.steps;
    const epochEvents = currentEpochEvents(view);
    const actionEvents = epochEvents.filter(event => event.type === 'action.applied');
    const completed = new Set(actionEvents.map(event => event.details?.stepId).filter(value => typeof value === 'string'));
    const progress = make('progress');
    progress.max = Math.max(steps.length, 1);
    progress.value = Math.min(actionEvents.length, progress.max);
    progress.setAttribute('aria-label', 'Walkthrough actions recorded');
    const progressLabel = make('div', 'progress-label');
    progressLabel.append(make('span', '', `${actionEvents.length} action${actionEvents.length === 1 ? '' : 's'} recorded`));
    progressLabel.append(make('span', '', state.expired ? 'Session expired' : view.outcome.status === 'complete' ? 'Exercise complete' : 'Backend ordered'));
    guide.append(progressLabel, progress);

    const list = make('ol', 'step-list');
    for (const step of steps) {
      const item = make('li', `step-item${view.currentStep === step.id ? ' current' : ''}${completed.has(step.id) ? ' complete' : ''}`);
      const title = make('strong', '', step.title);
      if (completed.has(step.id)) title.append(make('span', 'step-status', 'Recorded'));
      else if (view.currentStep === step.id) title.append(make('span', 'step-status', 'Current step'));
      item.append(title, make('p', '', step.instruction));
      list.append(item);
    }
    guide.append(list);

    if (state.expired) {
      guide.append(make('p', 'guide-complete', 'The backend session expired. This view is read-only; start a new explicitly opted-in session to continue.'));
    } else if (view.outcome.status === 'complete') {
      guide.append(make('p', 'guide-complete', `This branch is complete. Backend receipt status: ${view.outcome.receipt.status}.`));
    } else if (view.permittedActions.length) {
      const actionApp = appMetadata(appForCurrentScenario());
      if (actionApp) {
        guide.append(make('p', 'current-action-destination', `Current choices are in ${actionApp.name}.`));
        const open = make('button', 'action-open-app', `Open ${actionApp.name}`);
        open.type = 'button';
        open.addEventListener('click', () => openApp(actionApp.id));
        guide.append(open);
      }
    }
  }

  function appendJson(parent, label, value, className = 'record-pair') {
    const block = make('div', className);
    addText(block, 'strong', '', label);
    addText(block, 'pre', '', JSON.stringify(value, null, 2));
    parent.append(block);
  }

  function renderConsequences() {
    const view = state.view;
    const content = dom['consequence-content'];
    content.replaceChildren();
    if (!view) {
      addText(content, 'p', '', 'Backend state appears after an opted-in session starts.');
      return;
    }
    addText(content, 'div', 'state-tag', state.expired ? 'Read-only · session expired' : `Backend receipt · ${view.outcome.receipt.status}`);
    if (view.scenario.id === 'log4shell-2021') {
      addText(content, 'div', 'state-tag', view.state.canary?.visible === true ? 'Logs canary visible in backend state' : 'Logs canary hidden in backend state');
    }
    appendJson(content, 'Seed state returned at session start (reset starts a new baseline)', stateSnapshotForDisplay(view, state.seedState, true));
    appendJson(content, 'Current backend-owned state', stateSnapshotForDisplay(view, view.state));
    appendJson(content, 'Changes in current receipt epoch', view.outcome.receipt.changes ?? []);
    const expiry = typeof view.expiresAt === 'string' ? view.expiresAt : 'Not reported';
    addText(content, 'div', 'record-content', `Backend expiry: ${expiry}`);
  }

  function renderEvents() {
    const list = dom['event-list'];
    list.replaceChildren();
    if (!state.view || state.view.events.length === 0) {
      list.append(make('li', '', 'No session events.'));
      return;
    }
    for (const event of state.view.events) {
      const item = make('li');
      addText(item, 'span', 'event-type', `#${event.sequence} ${event.type}`);
      addText(item, 'span', '', ` · ${event.at}`);
      addText(item, 'pre', '', JSON.stringify(event.details, null, 2));
      list.append(item);
    }
  }

  function renderAppContent(record) {
    const view = state.view;
    const app = appMetadata(record.appId);
    if (!app || !view) return;
    const content = record.content;
    content.replaceChildren();

    if (record.appId === 'inbox') renderInbox(content, view);
    else if (record.appId === 'browser') renderBrowser(content, view);
    else if (record.appId === 'files') {
      const filesApp = make('section', 'files-app');
      content.append(filesApp);
      renderFiles(filesApp, view, record);
    } else if (record.appId === 'accounts') renderAccounts(content, view);
    else renderScenarioApp(content, view, record.appId);

    if (ACTION_APP[view.scenario.id] === record.appId) renderActions(content, view);
    renderStateInspector(content, view);
  }

  function renderInbox(root, view) {
    const toolbar = make('div', 'mail-toolbar');
    addText(toolbar, 'span', 'mail-toolbar-brand', 'Inbox');
    addText(toolbar, 'span', 'mail-address', view.assets.mailbox.address);
    addText(toolbar, 'span', 'mail-toolbar-note', 'Synthetic mailbox');
    root.append(toolbar);
    for (const message of view.assets.mailbox.messages) {
      const card = make('article', 'message-card');
      const meta = make('div', 'message-meta');
      meta.append(make('span', '', message.sender), make('span', 'training-tag', 'TRAINING MAIL'));
      card.append(meta, make('div', 'message-subject', message.subject), make('p', '', message.body));
      if (typeof message.attachmentId === 'string') {
        const attachment = view.assets.files.find(file => file.id === message.attachmentId);
        if (attachment) {
          const attachmentBox = make('div', 'file-meta');
          attachmentBox.append(make('span', '', `Seeded attachment: ${attachment.name}`), make('span', 'state-tag', 'Inert training marker'));
          card.append(attachmentBox);
        }
      }
      root.append(card);
    }
  }

  function renderBrowser(root, view) {
    const toolbar = make('div', 'browser-toolbar');
    addText(toolbar, 'span', 'browser-nav-icon', '‹');
    addText(toolbar, 'span', 'browser-nav-icon', '›');
    addText(toolbar, 'code', 'browser-address', view.assets.browserViews[0]?.address ?? 'training://home');
    addText(toolbar, 'span', 'browser-private-label', 'TRAINING ONLY');
    root.append(toolbar);
    addText(root, 'div', 'app-section-label', 'Fixed synthetic pages · no external navigation');
    for (const page of view.assets.browserViews) {
      const card = make('article', 'browser-card');
      card.append(make('h3', '', page.title), make('code', 'browser-address', page.address), make('p', '', page.summary));
      if (Array.isArray(page.indicators)) {
        const indicators = make('ul', 'record-list');
        for (const indicator of page.indicators) indicators.append(make('li', '', indicator));
        card.append(indicators);
      }
      root.append(card);
    }
    addText(root, 'p', 'state-tag', 'No external page navigation is available in this training browser.');
  }

  function getFileState(view, file) {
    if (!Object.hasOwn(FILE_STATE_PATHS, file.id)) return null;
    const path = FILE_STATE_PATHS[file.id];
    let value = view.state;
    for (const key of path) {
      if (!isRecord(value) || !Object.hasOwn(value, key)) return null;
      value = value[key];
    }
    return isRecord(value) ? value : null;
  }

  function fileStatus(view, file) {
    const fileState = getFileState(view, file);
    const accessRule = Object.hasOwn(FILE_ACCESS_RULES, file.id) ? FILE_ACCESS_RULES[file.id] : null;
    const accessValue = accessRule ? accessRule.path.reduce((value, key) => value?.[key], view.state) : undefined;
    const accessGranted = !accessRule || accessValue === accessRule.visibleWhen;
    const availability = typeof fileState?.available === 'boolean'
      ? fileState.available ? 'Available' : 'Unavailable'
      : accessRule ? accessGranted ? 'Available' : accessRule.hiddenAvailability
        : 'Not tracked';
    let privacy = 'Not tracked';
    if (accessRule) privacy = accessGranted ? 'Exposed' : accessRule.hiddenPrivacy;
    else if (fileState?.exposed === true || fileState?.private === false) privacy = 'Exposed';
    else if (fileState?.private === true || fileState?.exposed === false) privacy = 'Private';
    const integrity = typeof fileState?.integrity === 'string'
      ? fileState.integrity
      : fileState?.restoredFromBackup === true ? 'Restored from backup' : 'Not tracked';
    const canOpen = fileState?.available !== false && accessGranted;
    return { availability, privacy, integrity, owner: fileState?.owner, canOpen };
  }

  function renderFileStatus(parent, status) {
    const badges = make('div', 'file-status-grid');
    const values = [
      ['Availability', status.availability],
      ['Privacy', status.privacy],
      ['Integrity', status.integrity],
    ];
    if (typeof status.owner === 'string') values.push(['Seeded owner', status.owner]);
    for (const [label, value] of values) {
      const badge = make('span', `file-status-badge ${['Unavailable', 'Exposed', 'Hidden', 'Restricted', 'affected-copy'].includes(value) ? 'warning' : ''}`);
      badge.append(make('strong', '', label), make('span', '', value));
      badges.append(badge);
    }
    parent.append(badges);
  }

  function renderFiles(root, view, windowRecord) {
    root.replaceChildren();
    const toolbar = make('div', 'files-toolbar');
    addText(toolbar, 'span', 'files-toolbar-caption', 'Training files');
    addText(toolbar, 'span', 'files-toolbar-location', 'Backend-owned contents');
    root.append(toolbar);
    if (view.assets.files.length === 0) {
      addText(root, 'p', 'empty-guide', 'No files were seeded for this exercise.');
      return;
    }

    const layout = make('div', 'files-layout');
    const main = make('section', 'files-main');
    addText(main, 'div', 'app-section-label', 'Seeded files · backend access status');
    const list = make('div', 'file-list');
    const viewer = make('section', 'file-viewer');
    layout.append(main);

    let selected = view.assets.files.find(file => file.id === windowRecord.selectedFileId) ?? null;
    if (!selected) {
      selected = view.assets.files.find(file => fileStatus(view, file).canOpen) ?? null;
      windowRecord.selectedFileId = selected?.id ?? null;
    }

    for (const file of view.assets.files) {
      const status = fileStatus(view, file);
      const button = make('button', 'file-select');
      button.type = 'button';
      button.disabled = !status.canOpen;
      button.setAttribute('aria-pressed', String(file.id === selected?.id));
      button.setAttribute('aria-label', `${file.name}. Availability: ${status.availability}; privacy: ${status.privacy}; integrity: ${status.integrity}${status.owner ? `; seeded owner: ${status.owner}` : ''}${status.canOpen ? '' : '. This copy cannot be opened.'}`);
      addText(button, 'span', 'file-select-name', file.name);
      addText(button, 'code', 'file-path', file.path);
      renderFileStatus(button, status);
      if (!status.canOpen) addText(button, 'span', 'file-blocked-note', 'Unavailable · restore access through the walkthrough');
      button.addEventListener('click', () => {
        if (!status.canOpen) return;
        windowRecord.selectedFileId = file.id;
        renderFiles(root, view, windowRecord);
      });
      list.append(button);
    }
    main.append(list);

    addText(viewer, 'div', 'app-section-label', 'File viewer');
    if (!selected) {
      addText(viewer, 'p', 'empty-guide', 'No seeded file is currently available to open. Use the backend walkthrough to restore access.');
    } else {
      const status = fileStatus(view, selected);
      addText(viewer, 'h3', 'file-name', selected.name);
      addText(viewer, 'code', 'file-path', selected.path);
      renderFileStatus(viewer, status);
      if (status.canOpen) addText(viewer, 'pre', 'file-content', selected.content);
      else addText(viewer, 'p', 'file-blocked-note', 'This copy is unavailable in the returned backend state. Its contents are not shown until backend recovery restores access.');
    }
    layout.append(viewer);
    root.append(layout);
  }

  function renderAccounts(root, view) {
    addText(root, 'div', 'app-section-label', 'Bundled fictional accounts · no credential entry');
    addText(root, 'p', '', `${view.persona.displayName} · ${view.persona.role}`);
    for (const account of view.persona.accounts) {
      const card = make('article', 'account-card');
      card.append(make('h3', '', account.label), make('div', 'training-tag', 'TRAINING ONLY · NOT A REAL LOGIN'));
      appendLabeledText(card, 'Training username', account.username);
      if (typeof account.demoSecret === 'string' && account.trainingOnly === true) {
        appendLabeledText(card, 'Fixed demo-only value (never enter a real password)', account.demoSecret);
      }
      if (view.scenario.id === 'zeus-2007') {
        const loginChoices = make('button', 'account-action', 'Open fixed training sign-in choices');
        loginChoices.type = 'button';
        loginChoices.addEventListener('click', () => openApp('sessions'));
        card.append(loginChoices);
      }
      root.append(card);
    }
    addText(root, 'p', 'state-tag', 'These seeded values are display-only. The desktop has no username or password fields.');
  }

  function appendLabeledText(parent, label, value) {
    const row = make('p', 'account-detail');
    const labelNode = make('strong', '', `${label}: `);
    row.append(labelNode, make('code', '', value));
    parent.append(row);
  }

  function displayValue(value) {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    if (value === null || value === undefined) return 'Not reported';
    if (Array.isArray(value)) return value.length ? value.map(displayValue).join(' · ') : 'None';
    if (isRecord(value)) return 'Structured backend value';
    return String(value);
  }

  function renderDomainFields(root, fields) {
    const grid = make('div', 'domain-grid');
    for (const [label, value] of fields) {
      const card = make('div', 'domain-field');
      addText(card, 'span', 'domain-label', label);
      addText(card, 'strong', 'domain-value', displayValue(value));
      grid.append(card);
    }
    root.append(grid);
  }

  function renderDomainList(root, title, values) {
    addText(root, 'div', 'app-section-label', title);
    const list = make('ul', 'record-list');
    if (!Array.isArray(values) || values.length === 0) list.append(make('li', '', 'None recorded by the backend.'));
    else for (const value of values) list.append(make('li', '', displayValue(value)));
    root.append(list);
  }

  function renderDomainRecords(root, title, records, fields) {
    addText(root, 'div', 'app-section-label', title);
    if (!Array.isArray(records) || records.length === 0) {
      addText(root, 'p', 'empty-guide', 'No ledger entries returned by the backend.');
      return;
    }
    for (const record of records) {
      if (!isRecord(record)) continue;
      const card = make('article', 'record-card');
      const values = fields.filter(([key]) => Object.hasOwn(record, key)).map(([key, label]) => [label, record[key]]);
      renderDomainFields(card, values);
      root.append(card);
    }
  }

  function renderPageSummary(root, view) {
    for (const page of view.assets.browserViews) {
      const card = make('article', 'browser-card');
      card.append(make('h3', '', page.title), make('p', '', page.summary));
      if (Array.isArray(page.indicators)) {
        const list = make('ul', 'record-list');
        for (const indicator of page.indicators) list.append(make('li', '', indicator));
        card.append(list);
      }
      root.append(card);
    }
  }

  function renderPrivacyRecord(root, view, fileId, label) {
    const file = view.assets.files.find(candidate => candidate.id === fileId);
    if (!file) return;
    const card = make('article', 'record-card');
    addText(card, 'h3', '', label);
    renderFileStatus(card, fileStatus(view, file));
    root.append(card);
  }

  function renderScenarioApp(root, view, appId) {
    const current = view.state;

    if (appId === 'outbox') {
      renderOutbox(root, view);
      return;
    }

    switch (view.scenario.id) {
      case 'oauth-2023':
        renderDomainFields(root, [
          ['Consent status', current.consent.status],
          ['Granted mail scope', current.permissions.mailRead],
          ['Granted file scope', current.permissions.filesRead],
          ['Mailbox access blocked', current.mailbox.accessBlocked],
        ]);
        renderDomainList(root, 'Granted scopes', current.consent.grantedScopes);
        renderDomainList(root, 'Exposed seeded mail records', current.mailbox.exposedMessageIds);
        renderPrivacyRecord(root, view, 'oauth-plan', 'Planning notes access');
        renderPrivacyRecord(root, view, 'oauth-calendar', 'Team calendar access');
        renderPageSummary(root, view);
        break;
      case 'zeus-2007':
        renderDomainFields(root, [
          ['Training username', view.persona.accounts[0]?.username],
          ['Verified page used', current.identity.officialSurfaceVerified],
          ['Lookalike page used', current.identity.lookalikeSurfaceUsed],
          ['Simulated session active', current.sessions.active],
          ['Account summary visible', current.sessions.accountSummaryVisible],
          ['Session revoked', current.sessions.revoked],
          ['Synthetic session count', current.audit.simulatedSessionCount],
          ['Training account balance', `${current.account.balanceCredits} training credits`],
        ]);
        renderPageSummary(root, view);
        break;
      case 'drainer-2022':
        renderDomainFields(root, [
          ['Training-credit balance', `${current.wallet.balanceCredits} credits`],
          ['Allowance limit', `${current.wallet.allowanceCredits} credits`],
          ['Approval status', current.wallet.approvalStatus],
        ]);
        renderPageSummary(root, view);
        renderDomainRecords(root, 'Toy wallet transfer history', current.wallet.entries, [
          ['type', 'Entry'], ['amountCredits', 'Amount (training credits)'],
        ]);
        break;
      case 'iloveyou-2000':
        renderDomainFields(root, [
          ['Attachment status', current.mail.attachmentStatus],
          ['External sending enabled', current.service.externalSending],
        ]);
        renderOutbox(root, view);
        break;
      case 'wannacry-2017':
        renderDomainFields(root, [
          ['Service status', current.service.status],
          ['Isolation policy', current.service.policy],
          ['Service isolated', current.service.isolated],
          ['Bundled backup available', current.backup.available],
          ['Backup verified', current.backup.verified],
          ['Availability incident simulated', current.audit.incidentSimulated],
        ]);
        renderPrivacyRecord(root, view, 'wcry-plan', 'Operations plan status');
        renderPrivacyRecord(root, view, 'wcry-roster', 'Shift roster status');
        break;
      case 'solarwinds-2020':
        renderDomainFields(root, [
          ['Publisher verified', current.updater.publisherVerified],
          ['Training package accepted', current.updater.packageAccepted],
          ['Package quarantined', current.updater.quarantined],
          ['Protected report access granted', current.access.reportAccessGranted],
        ]);
        renderDomainList(root, 'Exposed seeded reports', current.access.exposedReportIds);
        renderPrivacyRecord(root, view, 'update-report', 'Operations summary status');
        renderPrivacyRecord(root, view, 'update-inventory', 'Service inventory status');
        renderPageSummary(root, view);
        break;
      case 'heartbleed-2014':
        renderDomainFields(root, [
          ['Response bounds enforced', current.policy.replyBoundsEnforced],
          ['Response limit (bytes)', current.policy.replyLimitBytes],
          ['Canary exposed', current.diagnostic.canaryExposed],
          ['Exposure recorded', current.audit.canaryExposureRecorded],
        ]);
        renderDomainList(root, 'Current toy diagnostic reply', current.diagnostic.lastReply);
        break;
      case 'log4shell-2021': {
        renderDomainFields(root, [
          ['Logging mode', current.policies.logMessageMode],
          ['Literal-data-only policy', current.policies.literalDataOnly],
          ['Canary visible', current.canary.visible],
          ['Interpretation events', current.audit.interpretationEvents],
          ['Prior exposure recorded', current.audit.priorExposureRecorded],
        ]);
        addText(root, 'div', 'app-section-label', 'Canary output');
        if (current.canary.visible === true) addText(root, 'pre', 'file-content', current.canary.marker);
        else addText(root, 'p', 'file-blocked-note', 'Canary hidden by the current backend state.');
        const log = view.assets.files.find(file => file.id === 'log-sample');
        if (log) {
          addText(root, 'div', 'app-section-label', 'Seeded service log');
          addText(root, 'pre', 'file-content', log.content);
        }
        break;
      }
      case 'moveit-2023':
        renderDomainFields(root, [
          ['Authorization mode', current.policies.authorizationMode],
          ['Strict owner check enabled', current.policies.strictOwnerCheck],
          ['Future unauthorized requests denied', current.access.futureRequestsDenied],
          ['Unauthorized read count', current.audit.unauthorizedReadCount],
        ]);
        renderDomainList(root, 'Exposed seeded batch IDs', current.access.exposedRecordIds);
        renderDomainRecords(root, 'Seeded transfer batches', [
          { name: 'Payroll batch', ...current.records.payroll },
          { name: 'Vendor batch', ...current.records.vendors },
        ], [
          ['name', 'Batch'], ['owner', 'Seeded owner'], ['private', 'Private'],
        ]);
        renderPageSummary(root, view);
        break;
      case 'bec-2024':
        renderDomainFields(root, [
          ['Invoice status', current.invoice.status],
          ['Payee', current.invoice.payee],
          ['Payee verified', current.invoice.payeeVerified],
          ['Invoice amount', `${current.invoice.amountCredits} training credits`],
          ['Remaining training ledger balance', `${current.ledger.availableCredits} credits`],
          ['Verification method', current.audit.verificationMethod],
        ]);
        renderDomainRecords(root, 'Synthetic payment history', current.ledger.entries, [
          ['type', 'Entry'], ['payee', 'Payee'], ['amountCredits', 'Amount (training credits)'],
        ]);
        renderPageSummary(root, view);
        break;
      default:
        addText(root, 'p', 'empty-guide', 'No scenario-specific domain view is defined for this app.');
    }
  }

  function renderOutbox(root, view) {
    const staged = view.state?.outbox?.stagedMessages;
    renderDomainFields(root, [['External sending enabled', view.state?.service?.externalSending]]);
    addText(root, 'div', 'app-section-label', 'Local staged records · no sending');
    const list = make('ul', 'record-list');
    if (!Array.isArray(staged) || staged.length === 0) list.append(make('li', '', 'No staged training records.'));
    else for (const entry of staged) list.append(make('li', '', entry));
    root.append(list);
  }

  function stateSnapshotForDisplay(view, source, seed = false) {
    const snapshot = cloneData(source);
    const canaryIsHidden = view.scenario.id === 'log4shell-2021' &&
      (seed || view.state.canary?.visible !== true);
    if (canaryIsHidden && isRecord(snapshot.canary)) delete snapshot.canary.marker;
    return snapshot;
  }

  function renderStateInspector(root, view) {
    const details = make('details', 'state-inspector');
    addText(details, 'summary', '', 'Optional backend state JSON inspector');
    const hiddenLogMarker = view.scenario.id === 'log4shell-2021' && view.state.canary?.visible !== true;
    if (hiddenLogMarker) addText(details, 'p', 'file-blocked-note', 'Hidden canary marker omitted while backend visibility is false.');
    addText(details, 'pre', '', JSON.stringify(stateSnapshotForDisplay(view, view.state), null, 2));
    root.append(details);
  }

  function renderActions(root, view) {
    addText(root, 'div', 'app-section-label', 'Walkthrough controls · backend-allowlisted choices');
    if (state.expired) {
      addText(root, 'p', 'guide-complete', 'Session expired. No further action can be sent.');
      return;
    }
    if (view.permittedActions.length === 0) {
      addText(root, 'p', 'guide-complete', 'No more actions are permitted in this completed branch.');
      return;
    }
    for (const action of view.permittedActions) {
      const card = make('article', 'action-card');
      const heading = make('div', 'action-heading');
      heading.append(make('h3', '', action.label), make('span', `action-kind ${action.kind}`, action.kind.toUpperCase()));
      const button = make('button', 'action-button', action.label);
      button.type = 'button';
      button.disabled = state.busy || state.expired;
      button.setAttribute('aria-label', `${action.label} in ${appMetadata(recordAppIdForAction(view))?.name ?? 'training app'}`);
      button.addEventListener('click', () => applyAction(action.id));
      card.append(heading, make('p', '', action.help), button);
      root.append(card);
    }
  }

  function recordAppIdForAction(view) {
    return ACTION_APP[view.scenario.id];
  }

  async function applyAction(actionId) {
    if (!state.view || state.busy || state.expired || !state.view.permittedActions.some(action => action.id === actionId)) return;
    clearError();
    setBusy(true, 'Applying the selected backend-owned training action…');
    try {
      const response = await request(ENDPOINTS.action, {
        method: 'POST',
        body: { sessionId: state.view.sessionId, actionId },
      });
      setCurrentView(validateView(response, state.view.scenario.id));
      dom['connection-status'].textContent = 'Backend state updated';
      announce(`Backend recorded ${actionId}.`);
    } catch (error) {
      showError(error.status === 0
        ? `${error.message} Refresh backend state before retrying an action.`
        : error.message);
      if (error.status === 410) markExpired(error);
    } finally {
      setBusy(false);
    }
  }

  async function refreshSession() {
    if (!state.view || state.busy || state.expired) return;
    clearError();
    setBusy(true, 'Refreshing the backend session view…');
    try {
      const response = await request(ENDPOINTS.view, {
        method: 'POST',
        body: { sessionId: state.view.sessionId },
      });
      setCurrentView(validateView(response, state.view.scenario.id));
      dom['connection-status'].textContent = 'Backend state refreshed';
      announce('Backend session view refreshed.');
    } catch (error) {
      showError(error.message);
      if (error.status === 410) markExpired(error);
    } finally {
      setBusy(false);
    }
  }

  async function resetSession() {
    if (!state.view || state.busy || state.expired) return;
    clearError();
    setBusy(true, 'Resetting the backend-owned synthetic state…');
    try {
      const response = await request(ENDPOINTS.reset, {
        method: 'POST',
        body: { sessionId: state.view.sessionId },
      });
      setCurrentView(validateView(response, state.view.scenario.id), true);
      dom['connection-status'].textContent = 'Backend state reset';
      announce('Training state reset. The backend started a new receipt epoch.');
    } catch (error) {
      showError(error.message);
      if (error.status === 410) markExpired(error);
    } finally {
      setBusy(false);
    }
  }

  function markExpired(error) {
    if (state.expired) return;
    state.expired = true;
    dom['training-opt-in'].checked = false;
    document.body.dataset.sessionState = 'expired';
    dom['connection-status'].textContent = 'Training session expired';
    dom['end-session'].disabled = true;
    dom['reset-session'].disabled = true;
    dom['refresh-session'].disabled = true;
    if (state.view) renderSession();
    showError(`Session expired: ${error.message} Start another explicitly opted-in session to continue.`);
    announce('Training session expired. The current desktop is read-only.');
  }

  function openGuide() {
    state.guide.opened = true;
    state.guide.minimized = false;
    dom['walkthrough'].hidden = false;
    dom['guide-toggle'].setAttribute('aria-expanded', 'true');
    focusWindow(state.guide);
    state.guide.titlebar.focus({ preventScroll: true });
  }

  function openTrainingCenter() {
    dom['launcher'].hidden = false;
    dom['launcher'].classList.add('is-open');
    dom['training-center-toggle'].setAttribute('aria-expanded', 'true');
    state.trainingCenter.minimized = false;
    if (state.view) setLauncherStatus('This exercise is still active. Close it before starting another session; its state will remain unchanged.');
    else {
      document.body.dataset.sessionState = 'inactive';
      dom['scenario-selector'].focus({ preventScroll: true });
    }
    syncLaunchButton();
    focusWindow(state.trainingCenter);
    state.trainingCenter.titlebar.focus({ preventScroll: true });
    renderTaskbar();
  }

  function initializeShellWindows() {
    state.guide = {
      appId: GUIDE_APP.id, el: dom['walkthrough'], content: dom['guide-content'],
      titlebar: dom['guide-titlebar'], opened: false, minimized: true, maximized: false, savedRect: null, lastRect: null,
    };
    state.guide.el.style.zIndex = String(++state.zIndex);
    state.trainingCenter = {
      appId: TRAINING_CENTER_APP.id, el: dom['launcher'], content: dom['launcher'],
      titlebar: dom['launcher-titlebar'], minimized: false, maximized: false, savedRect: null, lastRect: null,
    };
    if (!dom['launcher'].hidden && dom['launcher'].classList.contains('is-open')) {
      state.trainingCenter.el.style.zIndex = String(++state.zIndex);
      state.trainingCenter.el.setAttribute('aria-current', 'true');
    }
    installWindowMovement(state.guide);
    installWindowMovement(state.trainingCenter);
  }

  function endSession() {
    if (!state.view || state.busy || state.expired) return;
    dom['exit-dialog'].showModal();
  }

  function rememberClosedSession(sessionId) {
    state.closedSessionIds.add(sessionId);
    while (state.closedSessionIds.size > 8) state.closedSessionIds.delete(state.closedSessionIds.values().next().value);
  }

  function clearClosedSession(sessionId) {
    if (state.view?.sessionId !== sessionId) return;
    dom['exit-dialog'].close();
    state.view = null;
    state.seedState = null;
    state.expired = false;
    state.startOutcomeUncertain = false;
    for (const record of state.windows.values()) record.el.remove();
    state.windows.clear();
    dom['desktop-icons'].replaceChildren();
    dom['taskbar-apps'].replaceChildren();
    dom['launcher'].hidden = false;
    dom['launcher'].classList.add('is-open');
    dom['launcher'].classList.remove('is-minimized', 'is-maximized');
    dom['training-center-toggle'].setAttribute('aria-expanded', 'true');
    state.trainingCenter.minimized = false;
    state.guide.el.hidden = true;
    state.guide.opened = false;
    state.guide.minimized = true;
    dom['guide-toggle'].setAttribute('aria-expanded', 'false');
    dom['scenario-label'].textContent = 'Session closed';
    dom['execution-mode'].textContent = 'Not connected';
    dom['connection-status'].textContent = 'Session closed';
    dom['guide-content'].replaceChildren(make('p', 'empty-guide', 'The backend session is closed. Choose and explicitly opt in to a new exercise.'));
    dom['severity-badge'].textContent = 'SEV —';
    dom['consequence-content'].replaceChildren(make('p', '', 'The prior session was closed by the backend.'));
    dom['event-list'].replaceChildren(make('li', '', 'The prior session is closed.'));
    document.body.dataset.sessionState = 'closed';
    dom['training-opt-in'].checked = false;
    dom['end-session'].disabled = true;
    dom['reset-session'].disabled = true;
    dom['refresh-session'].disabled = true;
    renderTaskbar();
    announce('Training session closed by the backend.');
  }

  function hasExactMessageKeys(message, keys) {
    return isRecord(message) && Object.keys(message).length === keys.length && keys.every(key => Object.hasOwn(message, key));
  }

  function closeRequestMessage(message) {
    return hasExactMessageKeys(message, ['channel', 'type', 'attackId', 'requestId', 'sessionId']) &&
      message.channel === LIFECYCLE_CHANNEL && message.type === 'session-close-requested' &&
      SCENARIO_IDS.includes(message.attackId) && Number.isSafeInteger(message.requestId) && message.requestId > 0 &&
      (message.sessionId === null || SESSION_ID_PATTERN.test(message.sessionId));
  }

  function receiveParentMessage(event) {
    if (!isEmbedded || event.origin !== window.location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (!isRecord(message) || message.channel !== LIFECYCLE_CHANNEL) return;

    if (hasExactMessageKeys(message, ['channel', 'type', 'attackId', 'requestId']) &&
        ['session-start-authorized', 'session-start-denied'].includes(message.type) &&
        message.attackId === embeddedAttackId && Number.isSafeInteger(message.requestId) && message.requestId > 0) {
      state.startPermitResolvers.get(message.requestId)?.(message.type === 'session-start-authorized' && !state.parentExitRequested);
      return;
    }
    if (!closeRequestMessage(message)) return;
    state.parentExitRequested = true;
    for (const resolve of state.startPermitResolvers.values()) resolve(false);
    if (state.parentCloseQueue.some(item => item.requestId === message.requestId)) return;
    const replaced = state.parentCloseQueue.pop();
    if (replaced) sendParentCloseResult('session-close-failed', replaced, replaced.sessionId);
    state.parentCloseQueue.push(message);
    void processParentCloseRequests();
  }

  function sendParentCloseResult(type, message, sessionId) {
    postLifecycleMessage(type, {
      attackId: message.attackId, requestId: message.requestId, sessionId,
    });
  }

  async function processParentCloseRequests() {
    if (!isEmbedded || state.busy || state.parentCloseRunning || state.parentCloseQueue.length === 0) return;
    const message = state.parentCloseQueue.shift();
    const sessionId = message.sessionId ?? state.view?.sessionId ?? null;
    if (!sessionId) {
      if (state.startingRequestIds.size > 0 || state.startOutcomeUncertain) {
        sendParentCloseResult('session-close-failed', message, null);
      } else {
        sendParentCloseResult('session-close-complete', message, null);
      }
      void processParentCloseRequests();
      return;
    }
    if (state.closedSessionIds.has(sessionId)) {
      sendParentCloseResult('session-close-complete', message, sessionId);
      void processParentCloseRequests();
      return;
    }
    if (state.view && state.view.scenario.id !== message.attackId) {
      sendParentCloseResult('session-close-failed', message, sessionId);
      void processParentCloseRequests();
      return;
    }

    state.parentCloseRunning = true;
    clearError();
    setBusy(true, 'Closing the backend session before returning to the timeline…');
    try {
      const response = await request(ENDPOINTS.close, {
        method: 'POST',
        body: { sessionId },
        timeoutMs: 4000,
      });
      if (!isRecord(response) || response.closed !== true) throw new ApiError('The training API did not confirm session closure.');
      rememberClosedSession(sessionId);
      state.startOutcomeUncertain = false;
      clearClosedSession(sessionId);
      sendParentCloseResult('session-close-complete', message, sessionId);
    } catch {
      sendParentCloseResult('session-close-failed', message, sessionId);
      showError('The parent requested session closure, but the backend did not confirm it. Retry from the timeline control.');
    } finally {
      state.parentCloseRunning = false;
      setBusy(false);
    }
  }

  async function confirmEndSession() {
    if (!state.view || state.busy || state.expired) return;
    const sessionId = state.view.sessionId;
    const attackId = state.view.scenario.id;
    clearError();
    setBusy(true, 'Closing the backend training session…');
    try {
      const response = await request(ENDPOINTS.close, {
        method: 'POST',
        body: { sessionId },
      });
      if (!isRecord(response) || response.closed !== true) throw new ApiError('The training API did not confirm session closure.');
      rememberClosedSession(sessionId);
      clearClosedSession(sessionId);
      postLifecycleMessage('session-closed', { attackId, sessionId });
    } catch (error) {
      showError(error.message);
      if (error.status === 410) {
        dom['exit-dialog'].close();
        markExpired(error);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleGuide() {
    if (dom['walkthrough'].hidden || state.guide.minimized) openGuide();
    else minimizeWindow(GUIDE_APP.id);
  }

  dom['scenario-selector'].addEventListener('change', () => {
    dom['training-opt-in'].checked = false;
    updateSelectedScenario();
  });
  dom['training-opt-in'].addEventListener('change', syncLaunchButton);
  dom['launch-session'].addEventListener('click', startSession);
  dom['retry-catalog'].addEventListener('click', loadCatalog);
  dom['training-center-toggle'].addEventListener('click', openTrainingCenter);
  dom['guide-close'].addEventListener('click', () => closeWindow(GUIDE_APP.id));
  dom['guide-minimize'].addEventListener('click', () => minimizeWindow(GUIDE_APP.id));
  dom['guide-maximize'].addEventListener('click', () => toggleMaximize(GUIDE_APP.id));
  dom['training-close'].addEventListener('click', () => closeWindow(TRAINING_CENTER_APP.id));
  dom['training-minimize'].addEventListener('click', () => minimizeWindow(TRAINING_CENTER_APP.id));
  dom['training-maximize'].addEventListener('click', () => toggleMaximize(TRAINING_CENTER_APP.id));
  dom['guide-toggle'].addEventListener('click', toggleGuide);
  dom['refresh-session'].addEventListener('click', refreshSession);
  dom['reset-session'].addEventListener('click', resetSession);
  dom['end-session'].addEventListener('click', endSession);
  dom['cancel-exit'].addEventListener('click', () => dom['exit-dialog'].close());
  dom['confirm-exit'].addEventListener('click', confirmEndSession);
  dom['exit-dialog'].addEventListener('cancel', () => announce('Session closure cancelled.'));
  if (isEmbedded) window.addEventListener('message', receiveParentMessage);
  window.addEventListener('pagehide', () => {
    const sessionId = state.view?.sessionId;
    if (!sessionId) return;
    void fetch(ENDPOINTS.close, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      mode: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
  });

  initializeShellWindows();
  updateClock();
  renderTaskbar();
  loadCatalog();
})();
