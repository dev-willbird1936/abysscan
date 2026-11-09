// Scene suite (SCENARIOS-60 contract §3): focus dimming from world.scene.focusApps, the creature
// in the wallpaper layer for every state, reduced motion, and the one-click lock screen.
// node verify/scene.mjs
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { ORIGIN, PROJECT as ROOT, SHOTS, guard, launch, makeChecks, shellFrame, startServer } from "./lib.mjs";

const require = createRequire(import.meta.url);
const model = require(`${ROOT}/ui/desktop/world-model.js`);
mkdirSync(SHOTS, { recursive: true });
const clone = (v) => JSON.parse(JSON.stringify(v));
const seed = JSON.parse(readFileSync(`${ROOT}/data/desktop-world-seed.json`, "utf8"));
const { check, summary } = makeChecks();

const sprite = "/ocean-creatures/anglerfish/sunlight.gif";
const open = (app, n, rect) => ({ id: `w-${app}-${n}`, app, title: app, rect, mode: "normal", tile: null, payload: null });
const base = clone(seed);
base.phase = "desktop";
base.windows = [
  open("mail", 1, { x: 120, y: 60, w: 520, h: 380 }),
  open("browser", 1, { x: 480, y: 180, w: 440, h: 340 }),
  open("files", 1, { x: 30, y: 320, w: 300, h: 240 }),
];
base.order = base.windows.map((w) => w.id);
base.focusedId = "w-files-1";
base.overlays = { launcher: false, search: false, quick: false, centre: false, taskView: false, switcher: false };
const rawWorld = (extra, revision) => {
  const w = clone(base);
  w.revision = revision;
  w.scene = { phase: "boot", stepId: null, highlight: null, ...extra };
  return w;
};
// Same world, but it must pass the shared validator (the shell only ever receives valid worlds).
const worldWith = (extra, revision = 1) => {
  const w = rawWorld(extra, revision);
  const v = model.validate(w);
  if (!v.ok) throw new Error(`scene world invalid: ${v.error}`);
  return w;
};
const creature = (state, targetApp = "mail", file = sprite) => ({ family: "deception", depth: "sunlight", sprite: file, state, targetApp });

const server = await startServer();
const browser = await launch();
const errors = [];
const blocked = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await guard(context, blocked, []);
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${ORIGIN}/parent.html?mode=standalone`);
const frame = await shellFrame(page);
const apply = (w) => frame.evaluate((x) => window.OceanWorldAdapter.apply(x), w);
const state = () => frame.evaluate(() => window.__win11.store.getState().world);
const settle = (ms = 600) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${SHOTS}/final-win-scene-${name}.png` });
const dimCount = () => frame.locator('[data-dim="true"]').count();
const dimOf = (selector) => frame.locator(selector).first().getAttribute("data-dim");
const creatureCount = () => frame.locator('[data-testid="creature"]').count();
const rectOf = () =>
  frame.evaluate(() => {
    const r = document.querySelector('[data-testid="creature"]').getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width };
  });

// ---------- 1. focus dimming ----------
await apply(worldWith({ focusApps: [] }));
await settle();
check("empty focusApps dims nothing", (await dimCount()) === 0);
await apply(worldWith({}, 2));
await settle();
check("absent focusApps dims nothing", (await dimCount()) === 0);

await apply(worldWith({ focusApps: ["mail"] }, 3));
await settle(900);
check("window outside focusApps is dimmed", (await dimOf('.oceanWin[data-app="browser"]')) === "true");
check("window in focusApps is bright", (await dimOf('.oceanWin[data-app="mail"]')) === "false");
check("taskbar icon outside focusApps is dimmed", (await dimOf('[data-testid="task-browser"]')) === "true");
check("taskbar icon in focusApps is bright", (await dimOf('[data-testid="task-mail"]')) === "false");
const css = await frame.evaluate(() => {
  const s = getComputedStyle(document.querySelector('.oceanWin[data-app="browser"]'));
  const t = getComputedStyle(document.querySelector('[data-testid="task-browser"]'));
  return { winFilter: s.filter, winOpacity: s.opacity, taskFilter: t.filter, taskOpacity: t.opacity };
});
check("dimmed window is saturate(.25) at opacity .55", css.winFilter === "saturate(0.25)" && css.winOpacity === "0.55", JSON.stringify(css));
check("dimmed taskbar icon is saturate(.25) at opacity .55", css.taskFilter === "saturate(0.25)" && css.taskOpacity === "0.55", JSON.stringify(css));
await frame.evaluate(() => window.__oceanEmit({ kind: "toggle-overlay", name: "launcher", open: true }));
await settle(700);
const tiles = await frame.evaluate(() => {
  const all = [...document.querySelectorAll(".pnApp")];
  const mail = all.find((el) => /Mail|Outlook/i.test(el.innerText));
  return { dimmed: all.filter((el) => el.dataset.dim == "true").length, total: all.length, mailDim: mail && mail.dataset.dim };
});
check("Start tiles outside focusApps are dimmed, Mail is bright", tiles.dimmed === tiles.total - 1 && tiles.mailDim === "false", JSON.stringify(tiles));
await shot("dimmed-start");
await frame.evaluate(() => window.__oceanEmit({ kind: "toggle-overlay", name: "launcher", open: false }));
await settle(300);
await frame.locator('[data-testid="task-notes"]').click();
await settle(500);
check("dimmed taskbar icon is still clickable", (await state()).windows.some((w) => w.app == "notes"));
await frame.evaluate(() => window.__win11.store.getState().world.windows.filter((w) => w.app == "notes").forEach((w) => window.__oceanEmit({ kind: "close-window", id: w.id })));
await settle(400);
await frame.locator('.oceanWin[data-app="browser"] .oceanTitle').click();
await settle(300);
check("dimmed window is still clickable (takes focus)", (await state()).focusedId === "w-browser-1");
await shot("dimmed-desktop");

// ---------- 2. creature states ----------
const sizes = {};
const centres = {};
for (const st of ["idle", "notice", "approach", "circle", "press"]) {
  await apply(worldWith({ focusApps: ["mail"], creature: creature(st) }, 10));
  await settle(2200);
  const info = await frame.evaluate(() => {
    const c = document.querySelector('[data-testid="creature"]');
    const img = c;
    const r = c.getBoundingClientRect();
    const win = document.querySelector('.oceanWin[data-app="mail"]').getBoundingClientRect();
    const mid = document.elementFromPoint(win.left + win.width / 2, win.top + win.height / 2);
    return {
      state: c.dataset.state,
      loaded: img.complete && img.naturalWidth > 0,
      pointer: getComputedStyle(c.closest(".oceanCreatureLayer")).pointerEvents,
      behindWindows: !!(mid && mid.closest(".oceanWin")) && !c.contains(mid),
      w: r.width,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  });
  sizes[st] = info.w;
  centres[st] = info;
  check(`creature ${st}: state shown, sprite loaded`, info.state === st && info.loaded, JSON.stringify(info));
  check(`creature ${st}: pointer-events none, behind windows`, info.pointer === "none" && info.behindWindows);
  await shot(`creature-${st}`);
}
check("creature grows idle < notice < approach < press", sizes.idle < sizes.notice && sizes.notice < sizes.approach && sizes.approach < sizes.press, JSON.stringify(sizes));
const mailBox = await frame.evaluate(() => {
  const r = document.querySelector('.oceanWin[data-app="mail"]').getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
const dist = (p) => Math.hypot(p.cx - mailBox.cx, p.cy - mailBox.cy);
check("approach moves toward the target window", dist(centres.approach) < dist(centres.idle), `${Math.round(dist(centres.idle))} -> ${Math.round(dist(centres.approach))}`);
await apply(worldWith({ focusApps: ["mail"], creature: creature("circle") }, 11));
await settle(1500);
const a = await rectOf();
await settle(1600);
const b = await rectOf();
check("circle orbits the target (position changes over time)", Math.hypot(a.cx - b.cx, a.cy - b.cy) > 20, `${Math.round(Math.hypot(a.cx - b.cx, a.cy - b.cy))}px`);

await apply(worldWith({ focusApps: ["mail"], creature: creature("breakthrough") }, 12));
await settle(300);
check("breakthrough hides the shell creature", (await creatureCount()) === 0);
await apply(rawWorld({ creature: creature("idle", null, "/elsewhere/sprite.gif") }, 13));
await settle(300);
check("a sprite outside /ocean-creatures/ is never loaded", (await creatureCount()) === 0);
await apply(worldWith({ creature: creature("idle", null, "/ocean-creatures/octopus/trench.gif") }, 14));
await settle(500);
check("no creature target falls back to the screen", (await creatureCount()) === 1);
await apply(worldWith({ creature: creature("idle", null, "/ocean-creatures/zzz/sunlight.gif") }, 15));
await settle(800);
check("a sprite that cannot load leaves no broken image", (await frame.locator('[data-testid="creature-layer"]').count()) === 0);
await apply(worldWith({ creature: null }, 16));
await settle(300);
check("creature null removes the layer", (await frame.locator('[data-testid="creature-layer"]').count()) === 0);

// ---------- 3. reduced motion ----------
await page.emulateMedia({ reducedMotion: "reduce" });
await page.reload();
const frame2 = await shellFrame(page);
const apply2 = (w) => frame2.evaluate((x) => window.OceanWorldAdapter.apply(x), w);
await apply2(worldWith({ focusApps: ["mail"], creature: creature("circle") }, 20));
await settle(700);
const rect2 = () =>
  frame2.evaluate(() => {
    const c = document.querySelector('[data-testid="creature"]');
    const r = c.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, anim: getComputedStyle(c).animationName };
  });
const r1 = await rect2();
await settle(1500);
const r2 = await rect2();
check("reduced motion: no orbit, no sprite animation", Math.abs(r1.cx - r2.cx) < 1 && Math.abs(r1.cy - r2.cy) < 1 && r1.anim === "none", JSON.stringify([r1, r2]));
await apply2(worldWith({ focusApps: ["mail"], creature: creature("press") }, 21));
await settle(300);
const r3 = await rect2();
check("reduced motion: state shows by size and position", r3.w > r1.w * 2, `${Math.round(r1.w)} -> ${Math.round(r3.w)}`);
await shot("creature-reduced-motion-press");
await page.emulateMedia({ reducedMotion: "no-preference" });

// ---------- 4. lock screen ----------
await page.reload();
const frame3 = await shellFrame(page);
const lock = worldWith({}, 30);
lock.phase = "lock";
lock.user = { id: "trainee", name: "Ines Carvalho", short: "ines", email: "ines.carvalho@fabrikam.example", avatar: "no-such-avatar" };
await frame3.evaluate((x) => window.OceanWorldAdapter.apply(x), lock);
await frame3.locator('[data-testid="lock-screen"]').waitFor();
await settle(600);
await frame3.locator('[data-testid="lock-screen"]').click({ position: { x: 640, y: 400 } });
await settle(700);
const text = await frame3.locator('[data-testid="lock-screen"]').innerText();
check("lock screen shows the world user name and email", text.includes("Ines Carvalho") && text.includes("ines.carvalho@fabrikam.example"));
check("lock screen has no input or password field", (await frame3.locator('[data-testid="lock-screen"] input').count()) === 0);
check("an avatar picture that cannot load falls back to initials", (await frame3.locator(".lockAvatar").innerText()).trim() === "IC");
await shot("lock-user");
await frame3.locator('[data-testid="lock-user"]').click();
await frame3.waitForFunction(() => window.__win11.store.getState().world.phase === "desktop", null, { timeout: 5000 }).catch(() => {});
check("one click on the user signs in", (await frame3.evaluate(() => window.__win11.store.getState().world.phase)) === "desktop");

check("zero non-loopback requests", blocked.length === 0, blocked.join(", "));
check("zero console errors", errors.length === 0, errors.join(" | "));
await browser.close();
server.close();
process.exitCode = summary("scene") ? 1 : 0;
