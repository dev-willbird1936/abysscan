// Shared setup for the verification suites: a loopback server for the production build and
// the harness pages, playwright-core from a configurable path, and a request guard that
// aborts everything that is not this server.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT = resolve(here, "../../..");
export const BUILD = resolve(process.env.WIN_BUILD || join(PROJECT, "desktop-comparison/previews/win11-final"));
export const SHOTS = resolve(process.env.SHOTS_DIR || join(PROJECT, "docs/desktop-parity/screens"));
export const PORT = Number(process.env.VERIFY_PORT || 4380);
export const ORIGIN = `http://127.0.0.1:${PORT}`;
const HARNESS = join(here, "harness");
const SEED = join(PROJECT, "data/desktop-world-seed.json");

const require = createRequire(import.meta.url);
export const playwright = require(process.env.PLAYWRIGHT_CORE || "C:/Temp/pw-kimi/node_modules/playwright-core");
const CHROME = process.env.CHROME_PATH || "C:/Users/<you>/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".gif": "image/gif" };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

// /app/* = production build, /seed.json = world seed, everything else = harness pages.
export const startServer = () =>
  new Promise((done, fail) => {
    const server = createServer((req, res) => {
      const path = new URL(req.url, ORIGIN).pathname;
      // Creature sprites, as the shells server serves them on the shell origin.
      const sprite = /^\/ocean-creatures\/([a-z-]+)\/(sunlight|twilight|midnight|abyss|trench)\.gif$/.exec(path);
      if (sprite) {
        const gif = join(PROJECT, "ocean-style-prototypes/retrodiffusion-creature-animation/animations", `${sprite[1]}-${sprite[2]}-256.gif`);
        if (!existsSync(gif)) return res.writeHead(404).end("not found");
        return res.writeHead(200, { "Content-Type": "image/gif", "Cache-Control": "no-store" }).end(readFileSync(gif));
      }
      const [root, rel] = path.startsWith("/app/") ? [BUILD, path.slice(5)] : [HARNESS, path.slice(1) || "parent.html"];
      const file = path === "/seed.json" ? SEED : normalize(join(root, decodeURIComponent(rel)));
      if (!file.startsWith(normalize(root)) && file !== SEED) return res.writeHead(403).end();
      if (!existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404, { "Access-Control-Allow-Origin": "*" }).end("not found");
      const type = TYPES[extname(file)] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        // The sandboxed frame has origin null, so module scripts and CSS are CORS fetches.
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy": type.startsWith("image/svg") ? "default-src 'none'; style-src 'unsafe-inline'" : CSP,
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      });
      res.end(readFileSync(file));
    });
    server.on("error", fail);
    server.listen(PORT, "127.0.0.1", () => done(server));
  });

export const launch = () => playwright.chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});

// Aborts and records every request that does not go to this server.
export const guard = async (context, external, all) => {
  await context.route(
    () => true,
    (route) => {
      const url = route.request().url();
      if (all) all.push(url);
      if (url.startsWith(ORIGIN + "/") || /^(data|blob|about):/.test(url)) return route.continue();
      external.push(url);
      return route.abort();
    },
  );
};

// The shell frame (inside parent.html) once the adapter is reachable.
export const shellFrame = async (page) => {
  for (let i = 0; i < 150; i++) {
    const f = page.frames().find((x) => x.url().includes("/app/index.html"));
    if (f && (await f.evaluate(() => !!(window.OceanWorldAdapter && window.__win11)).catch(() => false))) return f;
    await page.waitForTimeout(100);
  }
  throw new Error("shell did not start");
};

export const makeChecks = () => {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  };
  const summary = (label) => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${label}: ${results.length - failed}/${results.length} passed`);
    return failed;
  };
  return { results, check, summary };
};
