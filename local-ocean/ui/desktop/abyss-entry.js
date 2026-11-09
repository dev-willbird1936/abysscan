(() => {
  'use strict';

  const CHANNEL = 'northstar-training-lifecycle-v1';
  const SCENARIO_IDS = new Set([
    'oauth-2023', 'zeus-2007', 'drainer-2022', 'iloveyou-2000', 'wannacry-2017',
    'solarwinds-2020', 'heartbleed-2014', 'log4shell-2021', 'moveit-2023', 'bec-2024',
  ]);
  const SESSION_ID = /^[a-f0-9-]{36}$/i;
  const START_WAIT_MS = 5000;
  const CLOSE_WAIT_MS = 5000;
  const CLOSE_PATH = '/api/training/close';
  const MAX_DETACHED_ENTRIES = 8;
  const detachedEntries = new Map();
  let activeEntry = null;

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasExactKeys(value, keys) {
    return isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  }

  function postLifecycle(entry, type, details) {
    const frameWindow = entry.iframe.contentWindow;
    if (!frameWindow) return false;
    try {
      frameWindow.postMessage({ channel: CHANNEL, type, ...details }, window.location.origin);
      return true;
    } catch {
      return false;
    }
  }

  function reportCleanup(entry, status) {
    entry.cleanupStatus = status;
    window.dispatchEvent(new CustomEvent('northstar:session-cleanup', {
      detail: { attackId: entry.attackId, status },
    }));
  }

  function setEntryError(entry, message) {
    entry.status.textContent = message;
    entry.status.hidden = false;
    entry.leaveUnconfirmed.hidden = false;
  }

  function clearEntryStatus(entry) {
    entry.status.textContent = '';
    entry.status.hidden = true;
    entry.leaveUnconfirmed.hidden = true;
  }

  function settleStartWaiters(entry) {
    if (entry.pendingStarts.size > 0) return;
    for (const resolve of entry.startWaiters.splice(0)) resolve(true);
  }

  function waitForStarts(entry) {
    const deadline = Date.now() + START_WAIT_MS;
    const wait = async () => {
      while (entry.pendingStarts.size > 0) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        const settled = await new Promise(resolve => {
          let finished = false;
          const timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            entry.startWaiters = entry.startWaiters.filter(waiter => waiter !== onSettled);
            resolve(false);
          }, remaining);
          const onSettled = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve(true);
          };
          entry.startWaiters.push(onSettled);
        });
        if (!settled) return false;
      }
      return true;
    };
    return wait();
  }

  function waitForClose(entry, requestId) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        entry.closeWaiters.delete(requestId);
        resolve({ confirmed: false, reason: 'timeout' });
      }, CLOSE_WAIT_MS);
      entry.closeWaiters.set(requestId, result => {
        clearTimeout(timer);
        entry.closeWaiters.delete(requestId);
        resolve(result);
      });
    });
  }

  async function closeBackendSession(sessionId, { keepalive = false } = {}) {
    const response = await fetch(CLOSE_PATH, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
      keepalive,
      signal: AbortSignal.timeout(CLOSE_WAIT_MS),
      body: JSON.stringify({ sessionId }),
    });
    let result;
    try { result = await response.json(); } catch { result = null; }
    return response.ok && isRecord(result) && result.closed === true;
  }

  async function sendCloseRequest(entry) {
    const requestId = ++entry.nextCloseRequestId;
    const reply = waitForClose(entry, requestId);
    const sent = postLifecycle(entry, 'session-close-requested', {
      attackId: entry.attackId,
      requestId,
      sessionId: entry.sessionId,
    });
    if (!sent) {
      const waiter = entry.closeWaiters.get(requestId);
      waiter?.({ confirmed: false, reason: 'frame-unavailable' });
    }
    return reply;
  }

  function showCleanupFailure(entry, reason) {
    entry.closing = false;
    entry.iframe.inert = false;
    entry.returnButton.disabled = false;
    entry.returnButton.textContent = 'Return to the ocean';
    const suffix = entry.sessionId || entry.uncertainStart
      ? 'The synthetic session may remain until its bounded in-process expiry.'
      : 'No active session was reported.';
    reportCleanup(entry, 'unconfirmed');
    setEntryError(entry, `Session cleanup was not confirmed (${reason}). ${suffix} Retry, or explicitly leave without cleanup confirmation.`);
  }

  function restoreReturnControl(entry) {
    const button = entry.returnButton || entry.host.closest('dialog.attack-entry')?.querySelector('.attack-entry-content .attack-entry-return');
    if (button) {
      button.disabled = false;
      button.textContent = 'Return to the ocean';
    }
  }

  function leaveWithoutConfirmation(entry) {
    if (activeEntry !== entry || entry.returning) return;
    entry.returning = true;
    reportCleanup(entry, 'unconfirmed');
    entry.returnToOcean();
  }

  async function closeBeforeReturn(entry) {
    if (activeEntry !== entry || entry.closing || entry.returning) return;
    entry.closing = true;
    entry.exitRequested = true;
    entry.iframe.inert = true;
    entry.returnButton.disabled = true;
    entry.returnButton.textContent = 'Closing training session…';
    clearEntryStatus(entry);

    for (const requestId of entry.pendingStarts) {
      postLifecycle(entry, 'session-start-denied', { attackId: entry.attackId, requestId });
    }

    const startsSettled = await waitForStarts(entry);
    if (!startsSettled) {
      showCleanupFailure(entry, 'a start request did not settle within the wait limit');
      return;
    }

    if (activeEntry !== entry || entry.detached) {
      void cleanupRemovedFrame(entry);
      return;
    }
    const close = await sendCloseRequest(entry);
    if (activeEntry !== entry || entry.detached) {
      void cleanupRemovedFrame(entry);
      return;
    }
    if (!close.confirmed) {
      showCleanupFailure(entry, close.reason || 'the backend did not confirm closure');
      return;
    }

    entry.sessionId = null;
    entry.uncertainStart = false;
    entry.returning = true;
    reportCleanup(entry, close.sessionId ? 'confirmed' : 'no-session');
    entry.returnToOcean();
  }

  function onLifecycleMessage(event) {
    const entry = activeEntry?.sourceWindow === event.source ? activeEntry : detachedEntries.get(event.source);
    if (!entry || event.origin !== window.location.origin || event.source !== entry.sourceWindow) return;
    const message = event.data;
    if (!isRecord(message) || message.channel !== CHANNEL || message.attackId !== entry.attackId) return;

    if (message.type === 'session-start-requested' &&
        hasExactKeys(message, ['channel', 'type', 'attackId', 'requestId']) &&
        Number.isSafeInteger(message.requestId) && message.requestId > 0) {
      const denied = entry.detached || entry.exitRequested || entry.uncertainStart;
      if (!denied) entry.pendingStarts.add(message.requestId);
      const type = denied ? 'session-start-denied' : 'session-start-authorized';
      postLifecycle(entry, type, { attackId: entry.attackId, requestId: message.requestId });
      return;
    }

    if (message.type === 'session-started' &&
        hasExactKeys(message, ['channel', 'type', 'attackId', 'requestId', 'sessionId']) &&
        Number.isSafeInteger(message.requestId) && message.requestId > 0 && SESSION_ID.test(message.sessionId) &&
        entry.pendingStarts.has(message.requestId)) {
      entry.pendingStarts.delete(message.requestId);
      entry.sessionId = message.sessionId;
      entry.uncertainStart = false;
      settleStartWaiters(entry);
      if (entry.detached) void cleanupRemovedFrame(entry);
      else if (entry.exitRequested && !entry.closing) void closeBeforeReturn(entry);
      return;
    }

    if (message.type === 'session-start-failed' &&
        hasExactKeys(message, ['channel', 'type', 'attackId', 'requestId', 'reason']) &&
        Number.isSafeInteger(message.requestId) && message.requestId > 0 &&
        ['rejected', 'uncertain'].includes(message.reason) && entry.pendingStarts.has(message.requestId)) {
      entry.pendingStarts.delete(message.requestId);
      if (message.reason === 'uncertain') entry.uncertainStart = true;
      settleStartWaiters(entry);
      if (entry.detached) void cleanupRemovedFrame(entry);
      else if (entry.exitRequested && !entry.closing) void closeBeforeReturn(entry);
      return;
    }

    if (message.type === 'session-closed' &&
        hasExactKeys(message, ['channel', 'type', 'attackId', 'sessionId']) && SESSION_ID.test(message.sessionId)) {
      if (entry.sessionId === message.sessionId && !entry.closing) entry.sessionId = null;
      return;
    }

    if (message.type === 'session-close-complete' &&
        hasExactKeys(message, ['channel', 'type', 'attackId', 'requestId', 'sessionId']) &&
        Number.isSafeInteger(message.requestId) && message.requestId > 0 &&
        (message.sessionId === null || SESSION_ID.test(message.sessionId))) {
      const resolve = entry.closeWaiters.get(message.requestId);
      if (resolve && message.sessionId === entry.sessionId) resolve({ confirmed: true, sessionId: message.sessionId });
      return;
    }

    if (message.type === 'session-close-failed' &&
        hasExactKeys(message, ['channel', 'type', 'attackId', 'requestId', 'sessionId']) &&
        Number.isSafeInteger(message.requestId) && message.requestId > 0 &&
        (message.sessionId === null || SESSION_ID.test(message.sessionId))) {
      const resolve = entry.closeWaiters.get(message.requestId);
      if (resolve) resolve({ confirmed: false, reason: 'desktop could not confirm closure' });
    }
  }

  function onReturnControl(event) {
    const entry = activeEntry;
    if (!entry) return;
    const dialog = entry.host.closest('dialog.attack-entry');
    if (!dialog) return;

    if (event.type === 'cancel') {
      if (event.target !== dialog) return;
      entry.returnButton = dialog.querySelector('.attack-entry-content .attack-entry-return');
    } else {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('dialog.attack-entry .attack-entry-content .attack-entry-return');
      if (!button || !dialog.contains(entry.host)) return;
      entry.returnButton = button;
    }
    if (!entry.returnButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void closeBeforeReturn(entry);
  }

  function onIframeRemoved(entry) {
    if (activeEntry !== entry || entry.returning || entry.removalStarted) return;
    entry.removalStarted = true;
    entry.detached = true;
    void cleanupRemovedFrame(entry);
  }

  function finishDetachedEntry(entry) {
    if (!entry.detached) return;
    entry.removalObserver?.disconnect();
    if (activeEntry === entry) {
      restoreReturnControl(entry);
      document.removeEventListener('click', onReturnControl, true);
      document.removeEventListener('cancel', onReturnControl, true);
      if (entry.host.isConnected) entry.host.style.cssText = entry.previousHostStyle;
      activeEntry = null;
    }
    if (entry.pendingStarts.size > 0 && entry.sourceWindow) {
      detachedEntries.set(entry.sourceWindow, entry);
      entry.detachedTimer ??= setTimeout(() => {
        detachedEntries.delete(entry.sourceWindow);
        entry.detachedTimer = null;
      }, START_WAIT_MS);
      while (detachedEntries.size > MAX_DETACHED_ENTRIES) {
        const first = detachedEntries.keys().next().value;
        clearTimeout(detachedEntries.get(first).detachedTimer);
        detachedEntries.delete(first);
      }
    } else {
      clearTimeout(entry.detachedTimer);
      detachedEntries.delete(entry.sourceWindow);
    }
  }

  async function cleanupRemovedFrame(entry) {
    if (entry.removalCleaning) return;
    entry.removalCleaning = true;
    try {
      const startsSettled = await waitForStarts(entry);
      if (!startsSettled) {
        reportCleanup(entry, 'unconfirmed');
        console.warn('Training iframe was removed while a start request remained unconfirmed; bounded backend expiry is the fallback.');
        return;
      }
      if (!entry.sessionId) {
        reportCleanup(entry, entry.uncertainStart ? 'unconfirmed' : 'no-session');
        return;
      }
      const closed = await closeBackendSession(entry.sessionId);
      reportCleanup(entry, closed ? 'confirmed' : 'unconfirmed');
      if (!closed) console.warn('Training iframe was removed; the backend did not confirm session closure.');
    } catch {
      reportCleanup(entry, 'unconfirmed');
      console.warn('Training iframe was removed; the close request failed and cleanup is unconfirmed.');
    } finally {
      entry.removalCleaning = false;
      finishDetachedEntry(entry);
    }
  }

  function onLeaveAttack(event) {
    const entry = activeEntry;
    if (!entry || event.target !== window || event.detail?.attackId !== entry.attackId) return;
    if (!entry.returning) {
      entry.detached = true;
      onIframeRemoved(entry);
      finishDetachedEntry(entry);
      return;
    }
    restoreReturnControl(entry);
    document.removeEventListener('click', onReturnControl, true);
    document.removeEventListener('cancel', onReturnControl, true);
    entry.removalObserver?.disconnect();
    entry.host.style.cssText = entry.previousHostStyle;
    activeEntry = null;
  }

  function enterAttack(event) {
    if (event.target !== window || activeEntry) return;
    const detail = event.detail;
    if (!isRecord(detail) || typeof detail.attackId !== 'string' || !SCENARIO_IDS.has(detail.attackId) ||
        !isRecord(detail.attack) || detail.attack.id !== detail.attackId ||
        !(detail.host instanceof HTMLElement) || !document.body.contains(detail.host) ||
        typeof detail.returnToOcean !== 'function') return;

    const host = detail.host;
    const status = document.createElement('div');
    status.className = 'training-entry-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    const leaveUnconfirmed = document.createElement('button');
    leaveUnconfirmed.type = 'button';
    leaveUnconfirmed.className = 'training-entry-leave-unconfirmed';
    leaveUnconfirmed.textContent = 'Leave without cleanup confirmation';
    leaveUnconfirmed.hidden = true;
    const frame = document.createElement('iframe');
    frame.title = 'Northstar synthetic training desktop';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.style.cssText = 'display:block;flex:1 1 auto;width:100%;min-height:0;border:0;background:#0d1e25';

    const entry = {
      attackId: detail.attackId,
      host,
      iframe: frame,
      status,
      leaveUnconfirmed,
      returnToOcean: detail.returnToOcean,
      returnButton: null,
      sessionId: null,
      nextCloseRequestId: 0,
      pendingStarts: new Set(),
      startWaiters: [],
      closeWaiters: new Map(),
      uncertainStart: false,
      exitRequested: false,
      closing: false,
      returning: false,
      removalStarted: false,
      cleanupStatus: 'not-started',
      previousHostStyle: host.style.cssText,
    };
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.minHeight = '0';
    host.style.height = '100%';
    host.replaceChildren(status, leaveUnconfirmed, frame);
    leaveUnconfirmed.addEventListener('click', () => leaveWithoutConfirmation(entry));
    const desktopUrl = new URL('/desktop.html', window.location.origin);
    desktopUrl.searchParams.set('attack', detail.attackId);
    frame.src = desktopUrl.href;
    entry.sourceWindow = frame.contentWindow;
    activeEntry = entry;
    document.addEventListener('click', onReturnControl, true);
    document.addEventListener('cancel', onReturnControl, true);
    entry.removalObserver = new MutationObserver(() => {
      if (!frame.isConnected) onIframeRemoved(entry);
    });
    entry.removalObserver.observe(document.documentElement, { childList: true, subtree: true });
    event.preventDefault();
  }

  function onPageHide() {
    const entry = activeEntry;
    if (!entry) return;
    if (!entry.sessionId) {
      if (entry.pendingStarts.size || entry.uncertainStart) reportCleanup(entry, 'unconfirmed');
      return;
    }
    reportCleanup(entry, 'unconfirmed');
    void closeBackendSession(entry.sessionId, { keepalive: true }).catch(() => {});
  }

  window.addEventListener('message', onLifecycleMessage);
  window.addEventListener('abyss:enter-attack', enterAttack);
  window.addEventListener('abyss:leave-attack', onLeaveAttack);
  window.addEventListener('pagehide', onPageHide);
})();
