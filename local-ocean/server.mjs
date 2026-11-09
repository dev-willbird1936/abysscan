import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createOAuthPlan,
  executeOAuthScenario,
  LocalSyntheticAdapter,
  ScenarioInputError,
  validateScenarioRequest,
} from './backend/oauth-scenario.mjs';
import { runBrowserOAuthInContainer } from './backend/browser-container.mjs';
import { createApprovedVultrAdapterFactory } from './backend/vultr-adapter.mjs';
import { loadPersonas } from './backend/personas.mjs';
import { loadAbyssAssets } from './backend/abyss-assets.mjs';
import { loadDesktopArtwork, verifyPassiveDesktopSvg } from './backend/desktop-artwork.mjs';
import { TrainingSessionError, TrainingSessionStore } from './backend/training-session.mjs';
import { registerDesktopEntry } from './build.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = join(root, 'index.html');
const MAX_JSON_BYTES = 2048;
const TRAINING_ROUTES = new Set([
  '/api/training/scenarios', '/api/training/start', '/api/training/view',
  '/api/training/action', '/api/training/reset', '/api/training/close',
]);
const DESKTOP_ASSETS = new Map([
  ['/desktop.html', { file: join(root, 'ui/desktop/index.html'), mime: 'text/html; charset=utf-8' }],
  ['/desktop.css', { file: join(root, 'ui/desktop/desktop.css'), mime: 'text/css; charset=utf-8' }],
  ['/desktop.js', { file: join(root, 'ui/desktop/desktop.js'), mime: 'text/javascript; charset=utf-8' }],
  ['/desktop-entry.js', { file: join(root, 'ui/desktop/abyss-entry.js'), mime: 'text/javascript; charset=utf-8' }],
  ['/desktop-assets/windows-bloom.svg', { file: join(root, 'ui/desktop/assets/windows-bloom.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/sonoma-flow.svg', { file: join(root, 'ui/desktop/assets/sonoma-flow.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-inbox.svg', { file: join(root, 'ui/desktop/assets/app-inbox.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-browser.svg', { file: join(root, 'ui/desktop/assets/app-browser.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-browser-windows.svg', { file: join(root, 'ui/desktop/assets/app-browser-windows.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-files.svg', { file: join(root, 'ui/desktop/assets/app-files.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-accounts.svg', { file: join(root, 'ui/desktop/assets/app-accounts.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-permissions.svg', { file: join(root, 'ui/desktop/assets/app-permissions.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-sessions.svg', { file: join(root, 'ui/desktop/assets/app-sessions.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-wallet.svg', { file: join(root, 'ui/desktop/assets/app-wallet.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-outbox.svg', { file: join(root, 'ui/desktop/assets/app-outbox.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-services.svg', { file: join(root, 'ui/desktop/assets/app-services.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-updater.svg', { file: join(root, 'ui/desktop/assets/app-updater.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-monitor.svg', { file: join(root, 'ui/desktop/assets/app-monitor.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-logs.svg', { file: join(root, 'ui/desktop/assets/app-logs.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-transfers.svg', { file: join(root, 'ui/desktop/assets/app-transfers.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-payments.svg', { file: join(root, 'ui/desktop/assets/app-payments.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-launchpad.svg', { file: join(root, 'ui/desktop/assets/app-launchpad.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-finder.svg', { file: join(root, 'ui/desktop/assets/app-finder.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-training-center.svg', { file: join(root, 'ui/desktop/assets/app-training-center.svg'), mime: 'image/svg+xml' }],
  ['/desktop-assets/app-training-guide.svg', { file: join(root, 'ui/desktop/assets/app-training-guide.svg'), mime: 'image/svg+xml' }],
]);
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const DESKTOP_CSP = CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'");
// Trusted local graphics require WebAssembly decoding and embedded glTF image blobs. No JS eval or external hosts.
const RENDER_CSP = CSP.replace("'unsafe-inline'", "'unsafe-inline' 'wasm-unsafe-eval'").replace("img-src 'self' data:", "img-src 'self' data: blob:").replace("connect-src 'self'", "connect-src 'self' blob:") + "; worker-src 'self'";

function assertTrainingRequestKeys(input, allowed, label) {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new TrainingSessionError('INVALID_INPUT', `${label} must be a JSON object.`);
  }
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new TrainingSessionError('INVALID_INPUT', `Unexpected ${label} field.`);
  }
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': CSP,
    'Referrer-Policy': 'no-referrer',
  });
  response.end(body);
}

async function readJsonRequest(request) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new ScenarioInputError('Expected application/json.', 415);

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_JSON_BYTES) throw new ScenarioInputError('Request is too large.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ScenarioInputError('Malformed JSON.');
  }
}

function originIsLocal(request) {
  const host = request.headers.host;
  if (typeof host !== 'string' || !/^127\.0\.0\.1:\d+$/.test(host)) return false;
  const origin = request.headers.origin;
  return !origin || origin === `http://${host}`;
}

export function createAppServer({
  personas = loadPersonas(),
  adapterFactory,
  browserContainerRunner = runBrowserOAuthInContainer,
  trainingSessionStore = new TrainingSessionStore(),
} = {}) {
  const vultrMode = process.env.VULTR_SANDBOX_MODE === 'vultr';
  const createAdapter = adapterFactory ?? (vultrMode
    ? createApprovedVultrAdapterFactory({ env: process.env, oauthApp: personas.oauth_app })
    : () => new LocalSyntheticAdapter({ allowedScopes: personas.oauth_app.requested_scopes }));
  const rendererAssets = loadAbyssAssets(root);
  const desktopArtwork = loadDesktopArtwork(root);
  // Keep the snapshot entry for integrity accounting, but serve its project-owned replacement below.
  rendererAssets.delete('/ui/abyss/desktop-entry.js');
  let scenarioRunning = false;
  let browserContainerCleanupUnconfirmed = false;
  let activeAdapter = null;
  let trainingCleanupUnconfirmed = false;
  let trainingShutdownStarted = false;
  let trainingTeardownPromise = null;
  const activeTrainingStarts = new Map();

  async function startTrainingSession(request, response, input) {
    if (trainingShutdownStarted) {
      throw new TrainingSessionError('TRAINING_SHUTDOWN', 'Training backend shutdown has begun; no new sessions can be started.', 503);
    }
    if (trainingCleanupUnconfirmed) {
      throw new TrainingSessionError('TRAINING_CLEANUP_UNCONFIRMED', 'A disconnected start has unconfirmed cleanup; reconcile its backend resources before starting again.', 503);
    }
    const controller = new AbortController();
    const disconnected = () => { if (!response.writableFinished) controller.abort(); };
    let finishStart;
    activeTrainingStarts.set(controller, new Promise(resolve => { finishStart = resolve; }));
    request.once('aborted', disconnected);
    response.once('close', disconnected);
    try {
      if (request.aborted || response.destroyed) return;
      const view = await trainingSessionStore.create(input, { signal: controller.signal });
      if (controller.signal.aborted || response.destroyed) {
        try {
          if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(view?.sessionId || '')) {
            throw new Error('Disconnected start has no confirmed session capability.');
          }
          await trainingSessionStore.destroy(view.sessionId);
        } catch {
          trainingCleanupUnconfirmed = true;
          console.warn('Disconnected training start cleanup is unconfirmed; new starts are blocked.');
        }
        if (!response.destroyed && !response.writableEnded) {
          sendJson(response, 503, {
            error: trainingCleanupUnconfirmed ? 'Cancelled start cleanup is unconfirmed.' : 'Training start was cancelled during shutdown.',
            code: trainingCleanupUnconfirmed ? 'TRAINING_CLEANUP_UNCONFIRMED' : 'TRAINING_SHUTDOWN',
          });
        }
        return;
      }
      sendJson(response, 200, view);
    } finally {
      activeTrainingStarts.delete(controller);
      request.removeListener('aborted', disconnected);
      response.removeListener('close', disconnected);
      finishStart();
    }
  }

  const server = createServer(async (request, response) => {
    let pathname;
    try {
      pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    } catch {
      sendJson(response, 400, { error: 'Invalid request path.' });
      return;
    }

    if (TRAINING_ROUTES.has(pathname)) {
      if (!originIsLocal(request)) {
        sendJson(response, 403, { error: 'Local origin required.', code: 'LOCAL_ORIGIN_REQUIRED' });
        return;
      }
      if (vultrMode) {
        sendJson(response, 503, {
          error: 'Ten-scenario training has no approved Vultr worker backend; local in-process state is unavailable in Vultr mode.',
          code: 'TRAINING_CLOUD_BACKEND_UNAVAILABLE',
        });
        return;
      }
      const expectedMethod = pathname === '/api/training/scenarios' ? 'GET' : 'POST';
      if (request.method !== expectedMethod) {
        response.setHeader('Allow', expectedMethod);
        sendJson(response, 405, { error: `Use ${expectedMethod} for this training route.`, code: 'METHOD_NOT_ALLOWED' });
        return;
      }
      try {
        if (pathname === '/api/training/scenarios') {
          sendJson(response, 200, await trainingSessionStore.listScenarios());
        } else {
          const input = await readJsonRequest(request);
          let result;
          if (pathname === '/api/training/start') {
            await startTrainingSession(request, response, input);
            return;
          } else if (pathname === '/api/training/view') {
            assertTrainingRequestKeys(input, new Set(['sessionId']), 'view request');
            result = await trainingSessionStore.view(input.sessionId);
          } else if (pathname === '/api/training/action') {
            assertTrainingRequestKeys(input, new Set(['sessionId', 'actionId']), 'action request');
            result = await trainingSessionStore.act(input.sessionId, { actionId: input.actionId });
          } else if (pathname === '/api/training/reset') {
            assertTrainingRequestKeys(input, new Set(['sessionId']), 'reset request');
            result = await trainingSessionStore.reset(input.sessionId);
          } else {
            assertTrainingRequestKeys(input, new Set(['sessionId']), 'close request');
            await trainingSessionStore.destroy(input.sessionId);
            result = { closed: true };
          }
          sendJson(response, 200, result);
        }
      } catch (error) {
        if (response.destroyed) return;
        const knownError = error instanceof TrainingSessionError || error instanceof ScenarioInputError;
        sendJson(response, knownError ? error.status : 500, {
          error: knownError ? error.message : 'Synthetic training request failed.',
          ...(typeof error?.code === 'string' ? { code: error.code } : {}),
        });
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/api/healthz') {
      sendJson(response, 200, {
        ok: true,
        mode: vultrMode ? 'vultr-gated' : 'local-synthetic',
        externalNetwork: vultrMode ? 'Vultr API and private VPC only; requires the explicit live gate' : false,
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/scenarios/oauth/plan') {
      if (!originIsLocal(request)) {
        sendJson(response, 403, { error: 'Local origin required.' });
        return;
      }
      try {
        const input = await readJsonRequest(request);
        if (input?.optIn !== true) throw new ScenarioInputError('Explicit training opt-in is required.');
        if (vultrMode && input.browserContainerOptIn === true) {
          throw new ScenarioInputError('Browser-container mode is available only in local synthetic mode.');
        }
        const plan = createOAuthPlan(input, personas);
        sendJson(response, 200, {
          ...plan,
          executionMode: vultrMode ? 'vultr-gated' : plan.browserContainerOptIn ? 'docker-browser-requested' : 'local-synthetic',
        });
      } catch (error) {
        const status = error instanceof ScenarioInputError ? error.status : 500;
        sendJson(response, status, {
          error: error instanceof ScenarioInputError ? error.message : 'Synthetic plan failed.',
        });
      }
      return;
    }

    if (request.method === 'POST' && pathname === '/api/scenarios/oauth/execute') {
      if (!originIsLocal(request)) {
        sendJson(response, 403, { error: 'Local origin required.' });
        return;
      }
      if (scenarioRunning) {
        sendJson(response, 409, {
          error: 'A synthetic scenario is already running.',
          code: 'scenario_busy',
          containerTeardown: 'not_started',
        });
        return;
      }
      scenarioRunning = true;
      let adapter = null;
      try {
        const input = await readJsonRequest(request);
        if (input?.optIn !== true) throw new ScenarioInputError('Explicit training opt-in is required.');
        const scenario = validateScenarioRequest(input, personas);
        if (vultrMode && scenario.browserContainerOptIn) {
          throw new ScenarioInputError('Browser-container mode is available only in local synthetic mode.');
        }
        if (vultrMode && input.costAcknowledged !== true) {
          throw new ScenarioInputError('Vultr cost acknowledgement is required.');
        }
        if (scenario.browserContainerOptIn) {
          if (browserContainerCleanupUnconfirmed) {
            sendJson(response, 503, {
              error: 'A previous browser-container cleanup is unconfirmed. Inspect and clean Docker, then restart the local server before using browser mode again.',
              code: 'container_teardown_unconfirmed',
              executionMode: 'docker-browser-requested',
              containerTeardown: 'unconfirmed',
            });
          } else {
            try {
              const result = await browserContainerRunner({
                optIn: true,
                decision: scenario.decision,
                personaId: scenario.personaId,
              });
              sendJson(response, 200, { ...result, executionMode: 'docker-browser-requested' });
            } catch (error) {
              const containerTeardown = error?.containerTeardown === 'confirmed' ? 'confirmed' : 'unconfirmed';
              if (containerTeardown !== 'confirmed') browserContainerCleanupUnconfirmed = true;
              const code = typeof error?.code === 'string' && /^[a-z0-9_]{1,64}$/.test(error.code)
                ? error.code
                : 'browser_container_failed';
              sendJson(response, 503, {
                error: 'Browser-container run failed. No in-memory fallback was used.',
                code,
                executionMode: 'docker-browser-requested',
                containerTeardown,
              });
            }
          }
        } else {
          adapter = createAdapter();
          activeAdapter = adapter;
          const result = await executeOAuthScenario({ input, personas, adapter });
          sendJson(response, result.ok ? 200 : 500, {
            ...result,
            executionMode: vultrMode ? 'vultr-gated' : 'local-synthetic',
          });
        }
      } catch (error) {
        const status = error instanceof ScenarioInputError ? error.status : 500;
        sendJson(response, status, {
          error: error instanceof ScenarioInputError ? error.message : 'Synthetic scenario failed.',
        });
      } finally {
        if (!adapter?.activeSandbox && !adapter?.lastSandbox?.active) activeAdapter = null;
        scenarioRunning = false;
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/favicon.ico') {
      response.writeHead(204, { 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    if (request.method === 'GET' && DESKTOP_ASSETS.has(pathname)) {
      const asset = DESKTOP_ASSETS.get(pathname);
      const body = readFileSync(asset.file);
      const isSvg = asset.mime === 'image/svg+xml';
      if (isSvg && !verifyPassiveDesktopSvg(body, desktopArtwork.get('ui/desktop/assets/' + pathname.slice('/desktop-assets/'.length)))) {
        sendJson(response, 503, {error:'Desktop artwork integrity check failed.',code:'DESKTOP_ARTWORK_REJECTED'});
        return;
      }
      response.writeHead(200, {
        'Content-Type': asset.mime,
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': isSvg ? "default-src 'none'; script-src 'none'; object-src 'none'; sandbox" : pathname === '/desktop.html' ? DESKTOP_CSP : CSP,
        'Referrer-Policy': 'no-referrer',
      });
      response.end(body);
      return;
    }

    if (request.method === 'GET' && rendererAssets.has(pathname)) {
      const asset = rendererAssets.get(pathname);
      const body = readFileSync(asset.full);
      response.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': body.length, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': RENDER_CSP, 'Referrer-Policy': 'no-referrer' });
      response.end(body);
      return;
    }

    if (request.method === 'GET' && (pathname === '/' || pathname === '/index.html' || pathname === '/chamber.html')) {
      try {
        const legacy = pathname === '/chamber.html';
        const source = readFileSync(legacy ? join(root, 'chamber.html') : INDEX_FILE, 'utf8');
        const html = legacy ? source : registerDesktopEntry(source);
        const body = Buffer.from(html, 'utf8');
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': legacy ? CSP : RENDER_CSP,
          'Referrer-Policy': 'no-referrer',
        });
        response.end(body);
      } catch {
        sendJson(response, 500, { error: 'Run `node build.mjs` to generate the local page first.' });
      }
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  });
  server.teardownActiveScenario = async () => {
    if (activeAdapter?.activeSandbox) await activeAdapter.destroySandbox(activeAdapter.activeSandbox);
    else if (activeAdapter?.lastSandbox?.active) await activeAdapter.destroySandbox(activeAdapter.lastSandbox);
  };
  Object.defineProperty(server, 'trainingCleanupUnconfirmed', { get: () => trainingCleanupUnconfirmed });
  Object.defineProperty(server, 'trainingShutdownStarted', { get: () => trainingShutdownStarted });
  server.teardownTrainingSessions = () => {
    trainingShutdownStarted = true;
    for (const controller of activeTrainingStarts.keys()) controller.abort();
    trainingTeardownPromise ??= Promise.all([...activeTrainingStarts.values()]).then(() => trainingSessionStore.dispose()).catch(() => {
      trainingCleanupUnconfirmed = true;
      trainingTeardownPromise = null;
      throw new Error('Training backend shutdown cleanup is unconfirmed; reconcile its resources before another run.');
    });
    return trainingTeardownPromise;
  };
  server.teardownActiveResources = async () => {
    const results = await Promise.allSettled([
      server.teardownTrainingSessions(),
      Promise.resolve().then(() => server.teardownActiveScenario()),
    ]);
    if (trainingCleanupUnconfirmed || results.some(result => result.status === 'rejected')) {
      throw new Error('Active resource teardown is unconfirmed; reconcile the selected execution environment.');
    }
  };
  server.once('close', () => {
    void server.teardownTrainingSessions().catch(() => {
      console.error('Training backend shutdown cleanup is unconfirmed; reconcile its resources before another run.');
    });
  });
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('PORT must be an integer from 1024 through 65535.');
    process.exitCode = 1;
  } else {
    const server = createAppServer();
    server.listen(port, '127.0.0.1', () => {
      console.log(`Detonation Chamber: http://127.0.0.1:${port}`);
      if (process.env.VULTR_SANDBOX_MODE === 'vultr') {
        console.log('Vultr mode is gated; cloud API and private-VPC calls occur only after plan and cost confirmation.');
      } else {
        console.log('Local synthetic mode. No external targets or services are contacted.');
      }
    });
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      try {
        await server.teardownActiveResources();
      } catch {
        console.error('Teardown is unconfirmed; inspect the selected local or cloud execution environment before another run.');
      }
      await new Promise(resolveClose => server.close(resolveClose));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
}
