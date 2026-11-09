// Shared, opt-in authoring routes. The host supplies its authorization policy; no execution or disk-write endpoint exists.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileAuthorScene, MAX_SOURCE_BYTES, STARTERS, SNIPPETS } from './scene-studio.mjs';

const csp = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const assets = new Map([
  ['/scene-studio', ['ui/scene-studio/index.html', 'text/html; charset=utf-8']],
  ['/scene-studio/', ['ui/scene-studio/index.html', 'text/html; charset=utf-8']],
  ['/scene-studio/studio.js', ['ui/scene-studio/studio.js', 'text/javascript; charset=utf-8']],
  ['/scene-studio/studio.css', ['ui/scene-studio/studio.css', 'text/css; charset=utf-8']],
  ['/scene-studio/help', ['ui/scene-studio/help.html', 'text/html; charset=utf-8']],
]);
const apiPaths = new Set(['/api/scene-studio/templates', '/api/scene-studio/validate', '/api/scene-studio/preview']);
const summary = guide => ({ name: guide.name, os: guide.os, steps: guide.steps.map(({ title, look }) => ({ title, look })) });

export function createSceneStudioRoutes({ root, authorize = () => false }) {
  const previews = new Map();
  const send = (response, status, value, type = 'application/json; charset=utf-8') => {
    const body = Buffer.from(type.startsWith('application/json') ? JSON.stringify(value) : value);
    response.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store',
      'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=()' });
    response.end(body);
  };
  return {
    close: () => previews.clear(),
    async handle(request, response, path) {
      const run = path === '/api/desktop/guide' ? new URL(request.url, 'http://127.0.0.1').searchParams.get('run') : null;
      const guideRequest = typeof run === 'string' && run.startsWith('author-');
      if (!assets.has(path) && !apiPaths.has(path) && !guideRequest) return false;
      if (!authorize(request)) { send(response, 403, { error: 'Trusted application origin required.' }); return true; }
      const mutating = path === '/api/scene-studio/validate' || path === '/api/scene-studio/preview';
      const method = mutating ? 'POST' : 'GET';
      if (request.method !== method) {
        response.setHeader('Allow', method); send(response, 405, { error: `Use ${method}.` }); return true;
      }
      if (assets.has(path)) {
        const [file, type] = assets.get(path);
        send(response, 200, readFileSync(join(root, file)), type); return true;
      }
      if (path === '/api/scene-studio/templates') { send(response, 200, { starters: STARTERS, snippets: SNIPPETS }); return true; }
      if (guideRequest) {
        const guide = previews.get(run);
        send(response, guide ? 200 : 404, guide ?? { error: 'Preview expired or unknown. Press Preview again in Scene Studio.' }); return true;
      }
      if (String(request.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') {
        send(response, 415, { error: 'Expected application/json.' }); return true;
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > MAX_SOURCE_BYTES * 2) { send(response, 413, { error: 'Request is too large.' }); return true; }
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { send(response, 400, { error: 'Malformed JSON.' }); return true; }
      if (!input || Array.isArray(input) || Object.keys(input).join() !== 'source') { send(response, 400, { error: 'Send only a source string.' }); return true; }
      let guide;
      try { guide = compileAuthorScene(input.source); }
      catch (error) { send(response, 422, { error: error.message, line: Number(/script:(\d+):/.exec(error.message)?.[1]) || null }); return true; }
      if (path.endsWith('/validate')) { send(response, 200, summary(guide)); return true; }
      const id = `author-${randomBytes(12).toString('hex')}`;
      if (previews.size >= 20) previews.delete(previews.keys().next().value);
      previews.set(id, guide);
      send(response, 201, { ...summary(guide), url: `/desktop.html?job=${id}&os=${guide.os}` });
      return true;
    },
  };
}
