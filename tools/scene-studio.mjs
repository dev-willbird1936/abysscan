// Standalone local host for the same Scene Studio routes used by the main Abysscan app.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAppServer } from '../server.mjs';
import { createComparisonServer } from '../desktop-comparison/server.mjs';
import { compileAuthorScene, MAX_SOURCE_BYTES } from '../backend/scene-studio.mjs';
import { createSceneStudioRoutes } from '../backend/scene-studio-routes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const peers = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const desktopPaths = new Set(['/desktop.html', '/desktop.css', '/desktop.js', '/desktop-model.js', '/world-model.js', '/scenario-profile.js', '/scene-world.js',
  '/ocean-scenes.js', '/ocean-fx.js', '/api/ocean/profiles', '/api/desktop-templates/status', '/api/desktop/world', '/ui/abyss/pixel-lit.js', '/about',
  '/ui/abyss/retro-pixel.css', '/ui/abyss/fonts/Jersey10-Regular.woff', '/ui/abyss/fonts/AbyssPixelArrows.woff']);

export function forkRoots() {
  return Object.fromEntries([['macos', 'macOS'], ['windows', 'Windows']].flatMap(([os, name]) => {
    const path = resolve(root, '../../Software/Desktop', name, 'dist');
    return existsSync(join(path, 'index.html')) ? [[os, path]] : [];
  }));
}

export function createSceneStudio({ shellRoots = forkRoots(), env = process.env } = {}) {
  if (env.NODE_ENV === 'production' || env.DETONATION_PRODUCTION === 'true' || env.VULTR_SANDBOX_MODE === 'vultr' || env.VULTR_HACKATHON_MODE === 'true') {
    throw new Error('Scene Studio is local-only; use the opt-in main-app integration for production.');
  }
  const studio = createSceneStudioRoutes({ root, authorize: () => true });
  let app, shells;
  const fail = (response, status, error) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify({ error }));
  };
  const server = createServer(async (request, response) => {
    try {
      const origin = `http://127.0.0.1:${request.socket.localPort}`;
      const path = new URL(request.url, origin).pathname;
      // Opaque OS iframes can read only their allowlisted static assets. Editor/APIs require the local origin.
      const shellAsset = request.method === 'GET' && (/^\/previews\/(win11-final|macos-final)\//.test(path) || /^\/(ocean-creatures|ocean-morphology|avatars)\//.test(path));
      if (!peers.has(request.socket.remoteAddress) || request.headers.host !== `127.0.0.1:${request.socket.localPort}` ||
        (!shellAsset && ((request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site'))) {
        fail(response, 403, 'Use Scene Studio from its local 127.0.0.1 address.'); return;
      }
      if (await studio.handle(request, response, path)) return;
      if (request.method !== 'GET') { fail(response, 405, 'Use GET or the documented authoring POST endpoints.'); return; }
      if (['/', '/studio.js', '/studio.css'].includes(path)) {
        response.writeHead(302, { Location: path === '/' ? '/scene-studio' : `/scene-studio${path}`, 'Cache-Control': 'no-store' }); response.end(); return;
      }
      if (path === '/api/healthz') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ mode: 'local-synthetic', service: 'scene-studio' })); return;
      }
      if (path === '/api/desktop/guide') { fail(response, 404, 'Preview expired or unknown. Press Preview again in Scene Studio.'); return; }
      if (shellAsset) {
        shells ??= createComparisonServer({ shellRoots }); shells.emit('request', request, response); return;
      }
      if (desktopPaths.has(path) || /^\/ocean-scenarios\/(sunlight|twilight|midnight|abyss|trench)\.js$/.test(path)) {
        app ??= createAppServer({ templateShellsEnabled: true, sceneStudioEnabled: false, publicShells: false, shellOrigin: origin, production: false,
          publicOrigin: undefined, desktopWorldDir: join(root, 'data'), desktopWorldUrl: '', desktopEventsToken: '',
          desktopSandboxMode: 'simulated', hackathonControllerMode: false, hackathonProofEnabled: false,
          detonation: { handle: async () => false, stop() {} },
          sandboxRunner: async () => { throw new Error('Execution is disabled in standalone Scene Studio.'); }, sandboxEnv: {} });
        app.emit('request', request, response); return;
      }
      fail(response, 404, 'Not found.');
    } catch (error) {
      if (!response.headersSent) fail(response, 500, 'Scene Studio could not serve this request.');
      else response.destroy();
      console.error('Scene Studio:', error.message);
    }
  });
  server.on('close', () => { studio.close(); app?.teardownTrainingSessions(); app?.close(() => {}); shells?.close(() => {}); });
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv[2] === '--check' && process.argv.length === 4) {
      const file = resolve(process.argv[3]);
      if (!statSync(file).isFile() || statSync(file).size > MAX_SOURCE_BYTES) throw new Error('Choose a .scene text file of at most 64 KiB.');
      const result = compileAuthorScene(readFileSync(file, 'utf8'));
      console.log(`${result.name}: valid; ${result.steps.length} steps; starts on ${result.os}.`);
    } else {
      if (process.argv.length !== 2) throw new Error('Usage: node tools/scene-studio.mjs [--check path.scene]');
      const port = Number(process.env.SCENE_STUDIO_PORT || 4175);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SCENE_STUDIO_PORT must be 1024–65535.');
      const server = createSceneStudio();
      server.once('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is occupied; no existing server was stopped.` : error.message); process.exitCode = 1; });
      server.listen(port, '127.0.0.1', () => console.log(`Abysscan Scene Studio: http://127.0.0.1:${port}/scene-studio\nFictional scenes only. No shell commands or malware are executed.`));
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(); });
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
