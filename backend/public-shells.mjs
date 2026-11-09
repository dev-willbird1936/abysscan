// The final Windows 11 and macOS training-desktop shells, served by the app itself from its own origin.
// Off unless DESKTOP_SHELLS_PUBLIC=true (server.mjs). Locally the shells come from desktop-comparison/server.mjs on a second loopback port;
// on the live site that port is the visitor's own machine, so the app serves the same built files under the same paths instead.
// Only the shells' own runtime files are served: an exact allowlist built at start, no directory listing, no check/ scripts, no notes.
import { readdirSync, readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, join } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg',
};
const FOLDERS = ['previews/win11-final', 'previews/macos-final'];
// Same policy the local shell server gives these pages, except that only this origin may frame them.
const SHELL_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
  + "connect-src 'self'; media-src 'self' blob:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const SVG_CSP = "default-src 'none'; script-src 'none'; sandbox";
const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), display-capture=(), payment=(), usb=(), serial=(), clipboard-read=(), clipboard-write=()';

// URL path with every segment re-encoded the one way, so a browser's %20 or raw "&" finds the same file.
export const newShellToken = () => randomBytes(24).toString('base64url'); // 32 characters of [A-Za-z0-9_-]
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

// A request under /s/<token>/: the shell file it names, or a 404. The token is compared in constant time; nothing else is served here.
export function serveShellMount(files, token, request, response, pathname) {
  const match = /^\/s\/([^/]+)(\/previews\/.*)$/.exec(pathname);
  const given = match && TOKEN_RE.test(match[1]) ? Buffer.from(match[1]) : null, want = Buffer.from(token);
  if (given && given.length === want.length && timingSafeEqual(given, want) && servePublicShell(files, request, response, match[2])) return;
  response.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end('{"error":"Not found."}');
}

export const normalisePath = pathname => pathname.split('/').map(part => encodeURIComponent(decodeURIComponent(part))).join('/');

export function loadPublicShells(root) {
  const base = join(root, 'desktop-comparison');
  const files = new Map();
  const add = relative => {
    for (const entry of readdirSync(join(base, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'check') add(file); }
      else if (entry.isFile() && MIME[extname(file).toLowerCase()]) files.set(`/${file.split('/').map(encodeURIComponent).join('/')}`, { file: join(base, file), mime: MIME[extname(file).toLowerCase()] });
    }
  };
  for (const folder of FOLDERS) add(folder);
  return files;
}

// Answers GET, HEAD and OPTIONS for a shell file; returns false when the path is not one, so the caller carries on.
// The shells run in a sandboxed frame (origin "null"), so their own scripts, fonts and images are fetched cross-origin and anonymously: such
// requests carry no login credentials. They are therefore served from an unguessable path, /s/<token>/previews/..., which the login gate on the
// live site lets through (deploy/vultr-vm/README.md) and which answers only for the right token; files carry CORS "*", as they do from the local
// shell server. They are static files and hold no user data.
export function servePublicShell(files, request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') return false;
  let key;
  try { key = normalisePath(pathname); } catch { return false; }
  const entry = files.get(key);
  if (!entry) return false;
  if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With' }); response.end(); return true; }
  let body;
  try { body = readFileSync(entry.file); } catch { response.writeHead(503); response.end(); return true; }
  let status = 200, range;
  if (/^(audio|video)\//.test(entry.mime)) { // one byte range, so a media element can seek
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range || ''));
    if (match && (match[1] || match[2])) {
      const size = body.length;
      const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1]);
      const end = match[1] === '' || match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
      if (!(start < size && start <= end)) { response.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }); response.end(); return true; }
      status = 206; range = `bytes ${start}-${end}/${size}`; body = body.subarray(start, end + 1);
    }
  }
  response.writeHead(status, {
    'Content-Type': entry.mime, 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': PERMISSIONS, 'Content-Security-Policy': entry.mime === 'image/svg+xml' ? SVG_CSP : SHELL_CSP,
    ...(entry.mime.startsWith('audio/') ? { 'Accept-Ranges': 'bytes' } : {}), ...(range ? { 'Content-Range': range } : {}),
  });
  response.end(request.method === 'HEAD' ? undefined : body);
  return true;
}
