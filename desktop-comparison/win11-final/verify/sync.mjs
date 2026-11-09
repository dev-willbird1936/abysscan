// Sync suite (win-parity): the macOS-standard features on Windows and their bindings to the shared
// world stores (SYNC-AUDIT.md §4–5). Each check drives the real UI of the production build inside
// <iframe sandbox="allow-scripts"> and asserts the world state the parent would receive.
// Screenshots: docs/desktop-parity/screens/final-winsync-*.png.   node verify/sync.mjs
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { ORIGIN, PROJECT as ROOT, SHOTS, guard, launch, makeChecks, shellFrame, startServer } from "./lib.mjs";

const require = createRequire(import.meta.url);
const model = require(`${ROOT}/ui/desktop/world-model.js`);
mkdirSync(SHOTS, { recursive: true });
const clone = (v) => JSON.parse(JSON.stringify(v));
const T = "2026-07-14T10:00:00Z";

const W = clone(JSON.parse(readFileSync(`${ROOT}/data/desktop-world-seed.json`, "utf8")));
W.phase = "desktop";
W.data.web = {
  pages: { "sc-consent": { title: "Fabrikam Docs sign-in", brand: "Fabrikam Docs", url: "https://docs.fabrikam.example/share", body: "A file was shared with you.\n\nSign in to view it.", choices: [{ label: "Sign in", choiceId: "sign-in" }] } },
};
Object.assign(W.data, {
  browser: { tabs: [{ id: "tab-1", url: "scene:sc-consent", title: "Fabrikam Docs sign-in" }], activeTabId: "tab-1", bookmarks: [], history: [] },
  media: {
    tracks: [
      { id: "t1", title: "Neon Skyline", artist: "Vector Fields", album: "Neon Skyline", genre: "Synthwave", asset: "track-1", cover: "cover-1", duration: 212, loved: true },
      { id: "t2", title: "Golden Hour", artist: "Café Mono", album: "Golden Hour", genre: "Lo-Fi", asset: "track-2", cover: "cover-2", duration: 184, loved: false },
      { id: "t3", title: "Drift", artist: "Isla Wave", album: "Drift", genre: "Ambient", asset: "track-4", cover: "cover-4", duration: 198, loved: false },
    ],
    playlists: [{ id: "pl-focus", name: "Focus", trackIds: ["t2", "t3"] }],
    shuffle: false,
    repeat: "off",
    nowPlaying: null,
  },
  photos: {
    items: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `photo-${n}.jpg`, asset: `photo-${n}`, taken: `2026-0${8 - n}-10T09:00:00Z`, favorite: n === 2, trashed: false })),
    albums: [{ id: "al-trip", name: "Team Trip", photoIds: ["p1"] }],
  },
  whiteboard: { boards: [{ id: "b1", name: "Team brainstorm", modified: T, items: [{ id: "i1", type: "sticky", x: 60, y: 60, w: 160, h: 160, text: "Demo Friday", color: "pink" }] }], activeId: "b1" },
  calculator: { mode: "basic", angle: "deg", base: 10, memory: 0, history: [] },
  clock: { worldClocks: [{ id: "local", name: "Harbor City", tz: "local" }], timer: null, stopwatch: { running: false, elapsedMs: 0, at: null, laps: [] } },
  terminal: { cwd: "home", history: [] },
  stickies: [{ id: "stk-a", text: "Wi-Fi\nlumenhome5g", color: "yellow", x: 20, y: 20, w: 200, h: 160, collapsed: false }],
});
W.data.messages.threads[0].pinned = false;
{
  const v = model.validate(W);
  if (!v.ok) throw new Error(`test world invalid: ${v.error}`);
}

const withWindow = (world, app, payload = null) => {
  const w = clone(world);
  const id = `w-${app}-1`;
  w.windows = [{ id, app, title: app, rect: { x: 100, y: 40, w: 760, h: 500 }, mode: "maximized", tile: null, payload }];
  w.order = [id];
  w.focusedId = id;
  w.overlays = { launcher: false, search: false, quick: false, centre: false, taskView: false, switcher: false };
  w.revision = (world.revision || 0) + 1;
  return w;
};

const { check, summary } = makeChecks();
const blocked = [];
const errors = [];
const server = await startServer();
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await guard(context, blocked);
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/parent.html?mode=standalone`);
const frame = await shellFrame(page);
const apply = (w) => frame.evaluate((x) => window.OceanWorldAdapter.apply(x), w);
const world = () => frame.evaluate(() => window.__win11.store.getState().world);
const data = async (store) => (await world()).data[store];
const settle = (ms = 350) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${SHOTS}/final-winsync-${name}.png` });
const open = async (app, payload = null) => {
  await apply(withWindow(await world(), app, payload));
  await settle(500);
};
const text = () => frame.evaluate(() => document.body.innerText);
const valid = async (label) => check(`${label}: world still valid`, model.validate(await world()).ok);
await apply(withWindow(W, "files"));
await settle(500);

// ---------- Calculator: modes, history, programmer bases ----------
await open("calculator");
await frame.locator("[data-testid=calc-nav]").click();
await frame.locator(".cc-nav-item[data-mode=scientific]").click();
await settle();
check("calculator Scientific mode → data.calculator.mode", (await data("calculator")).mode === "scientific");
for (const k of ["2", "^", "1", "0", "="]) await frame.locator(`.cc-key[data-key="${k}"]`).click();
await settle();
check("calculator 2^10 = 1024 shown", (await frame.locator("[data-testid=calc-value]").innerText()).trim() === "1024");
const hist = (await data("calculator")).history;
check("calculator history recorded in the world", hist.length === 1 && hist[0].result === "1024" && /2 \^ 10/.test(hist[0].expr), JSON.stringify(hist[0] || {}));
await frame.locator(".cc-mkey.cc-angle").click();
await settle();
check("calculator DEG → RAD → data.calculator.angle", (await data("calculator")).angle === "rad");
await shot("calculator-scientific");
await frame.locator("[data-testid=calc-nav]").click();
await frame.locator(".cc-nav-item[data-mode=programmer]").click();
await settle();
for (const k of ["2", "5", "5"]) await frame.locator(`.cc-key[data-key="${k}"]`).click();
await frame.locator(".cc-base", { hasText: "HEX" }).click();
await settle();
const calc = await data("calculator");
check("calculator Programmer: 255 in HEX shows FF, base synced", calc.mode === "programmer" && calc.base === 16 && (await frame.locator("[data-testid=calc-value]").innerText()).trim() === "FF");
await shot("calculator-programmer");
await valid("calculator");

// ---------- Clock: world clocks, timer, stopwatch ----------
await open("clock");
await frame.locator("[data-testid=clock-world] select").selectOption("Tokyo");
await frame.locator("[data-testid=clock-world] .oc-btn", { hasText: "Add" }).click();
await settle();
check("clock add world clock → data.clock.worldClocks", (await data("clock")).worldClocks.some((c) => c.tz === "Asia/Tokyo"));
await shot("clock-world");
await frame.locator(".oc-nav-item", { hasText: "Stopwatch" }).click();
await frame.locator("[data-testid=clock-stopwatch] .oc-btn", { hasText: "Start" }).click();
await settle(600);
await frame.locator("[data-testid=clock-stopwatch] .oc-btn", { hasText: "Lap" }).click();
await settle();
const sw = (await data("clock")).stopwatch;
check("clock stopwatch start + lap → running, at stamped, one lap", sw.running && !!sw.at && sw.laps.length === 1);
await frame.locator(".oc-nav-item", { hasText: "Timer" }).click();
await frame.locator("[data-testid=clock-timer] .oc-btn", { hasText: "3 min" }).click();
await frame.locator("[data-testid=clock-timer] .oc-btn", { hasText: "Start" }).click();
await settle();
const timer = (await data("clock")).timer;
check("clock timer start → data.clock.timer running 3 min", !!timer && timer.running && timer.durationMs === 180000);
await shot("clock-timer");
await valid("clock");

// ---------- Terminal: cwd and history ----------
await open("terminal");
const term = frame.locator(".tm-input");
for (const cmd of ["cd Documents", "dir"]) {
  await term.fill(cmd);
  await term.press("Enter");
  await settle(150);
}
await settle();
const tdata = await data("terminal");
check("terminal cd → data.terminal.cwd = documents", tdata.cwd === "documents");
check("terminal history recorded", tdata.history.join("|") === "cd Documents|dir", tdata.history.join("|"));
await term.press("ArrowUp");
await term.press("ArrowUp");
check("terminal ↑ recalls the shared history", (await term.inputValue()) === "cd Documents");
await valid("terminal");

// ---------- Browser: tabs, favourites, history ----------
// Tabs exist only while a browser window does (the model clears them otherwise), so open it the way a
// mail link does: open-app with a scene url adds or activates that tab.
{
  const w = withWindow(await world(), "files");
  await apply(w);
  await settle(300);
  await frame.evaluate(() => window.__oceanEmit({ kind: "open-app", app: "browser", payload: { url: "scene:sc-consent" } }));
  const id = (await world()).windows.find((x) => x.app === "browser").id;
  await frame.evaluate((i) => window.__oceanEmit({ kind: "maximize", id: i }), id);
  await settle(500);
}
check("browser visit recorded in data.browser.history", (await data("browser")).history.some((h) => h.url === "scene:sc-consent"));
await frame.locator("[data-testid=browser-star]").click();
await settle();
check("browser star → data.browser.bookmarks", (await data("browser")).bookmarks.some((b) => b.url === "scene:sc-consent"));
await frame.locator(".br-plus").click();
await settle();
let b = await data("browser");
check("browser new tab → two tabs, new one active", b.tabs.length === 2 && b.activeTabId === b.tabs[1].id && b.tabs[1].url === "start:");
await frame.locator(".br-favitem", { hasText: "Fabrikam Docs" }).click();
await settle();
b = await data("browser");
check("browser favourites bar opens the page in the active tab", b.tabs[1].url === "scene:sc-consent");
await frame.locator(".br-bar .oc-btn[title=History]").click();
await settle();
check("browser History page lists the visit", (await text()).includes("Fabrikam Docs sign-in") && (await data("browser")).tabs[1].url === "history:");
await shot("browser-history");
await frame.locator(".br-tab").nth(1).locator(".br-x").click();
await settle();
check("browser close tab → one tab left", (await data("browser")).tabs.length === 1);
await valid("browser");

// ---------- Media Player: library, playback, liked, playlists ----------
await open("media");
await frame.locator(".md-row", { hasText: "Golden Hour" }).dblclick();
await settle();
let np = (await data("media")).nowPlaying;
check("media double-click plays → nowPlaying", !!np && np.trackId === "t2" && np.playing && np.queue.includes("t2"));
await frame.locator("[data-testid=media-play]").click();
await settle();
np = (await data("media")).nowPlaying;
check("media pause → playing false, position kept", np && np.playing === false && np.trackId === "t2");
await frame.locator(".md-row", { hasText: "Drift" }).locator(".md-love").click();
await settle();
check("media like → track loved", (await data("media")).tracks.find((t) => t.id === "t3").loved === true);
await frame.locator(".md-buttons .md-repeat").click();
await settle();
check("media repeat → data.media.repeat all", (await data("media")).repeat === "all");
await frame.locator(".md-add").click();
await settle();
check("media new playlist", (await data("media")).playlists.length === 2);
await frame.locator(".oc-nav-item", { hasText: "Music library" }).click();
await frame.locator(".md-row", { hasText: "Neon Skyline" }).click({ button: "right" });
await frame.locator(".oc-menu-item", { hasText: "Add to Focus" }).click();
await settle();
check("media add to playlist via context menu", (await data("media")).playlists.find((p) => p.id === "pl-focus").trackIds.includes("t1"));
await shot("media");
await valid("media");

// ---------- Photos: favourites, albums, Recently deleted ----------
await open("photos");
const tile = (name) => frame.locator(".ph-tile", { hasText: name });
await tile("photo-3.jpg").click({ button: "right" });
await frame.locator(".oc-menu-item", { hasText: "Add to favourites" }).click();
await settle();
check("photos favourite → item.favorite", (await data("photos")).items.find((p) => p.id === "p3").favorite === true);
await tile("photo-3.jpg").click({ button: "right" });
await frame.locator(".oc-menu-item", { hasText: "Add to Team Trip" }).click();
await settle();
check("photos add to album", (await data("photos")).albums[0].photoIds.includes("p3"));
await tile("photo-4.jpg").click({ button: "right" });
await frame.locator(".oc-menu-item", { hasText: /^Delete$/ }).click();
await settle();
check("photos delete → trashed (Recently deleted)", (await data("photos")).items.find((p) => p.id === "p4").trashed === true);
await frame.locator(".oc-nav-item", { hasText: "Recently deleted" }).click();
await tile("photo-4.jpg").click({ button: "right" });
await frame.locator(".oc-menu-item", { hasText: "Restore" }).click();
await settle();
check("photos restore from Recently deleted", (await data("photos")).items.find((p) => p.id === "p4").trashed === false);
await frame.locator(".oc-nav-item", { hasText: "All photos" }).click();
await settle();
await shot("photos");
await valid("photos");

// ---------- Whiteboard: boards, sticky, pen ----------
await open("whiteboard");
const canvas = frame.locator("[data-testid=wb-canvas]");
await frame.locator(".wb-tool[data-tool=sticky]").click();
await canvas.click({ position: { x: 420, y: 160 } });
await settle();
await page.keyboard.type("Shared idea");
await canvas.click({ position: { x: 900, y: 500 } });
await settle();
let board = (await data("whiteboard")).boards[0];
check("whiteboard sticky added with text", board.items.some((i) => i.type === "sticky" && i.text === "Shared idea"), board.items.map((i) => i.type).join(","));
await frame.locator(".wb-tool[title=Pen]").nth(2).click();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + 200, box.y + 380);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 200 + i * 20, box.y + 380 + (i % 2) * 20);
await page.mouse.up();
await settle();
board = (await data("whiteboard")).boards[0];
const pen = board.items.find((i) => i.type === "pen");
check("whiteboard pen stroke → one board-upsert with points", !!pen && pen.points.length >= 8 && pen.color === "#2a52e9");
await frame.locator(".wb-side .oc-btn[title='New board']").click();
await settle();
const wb = await data("whiteboard");
check("whiteboard new board becomes active", wb.boards.length === 2 && wb.activeId === wb.boards[1].id);
await frame.locator(".wb-side .oc-nav-item", { hasText: "Team brainstorm" }).click();
await settle();
await shot("whiteboard");
await valid("whiteboard");

// ---------- Sticky Notes: data.stickies ----------
await open("stickies");
await frame.locator("[data-testid=sticky-new]").click();
await settle();
check("sticky new → data.stickies", (await data("stickies")).length === 2);
const bar = frame.locator("[data-testid=sticky]").first().locator(".sn-bar");
const bb = await bar.boundingBox();
await page.mouse.move(bb.x + 90, bb.y + 14);
await page.mouse.down();
await page.mouse.move(bb.x + 190, bb.y + 84, { steps: 5 });
await page.mouse.up();
await settle();
const moved = (await data("stickies")).find((s) => s.id === "stk-a");
check("sticky drag → x/y saved, raised to the top", moved.x >= 110 && moved.y >= 80 && (await data("stickies")).slice(-1)[0].id === "stk-a", `${moved.x},${moved.y}`);
await frame.locator("[data-testid=sticky]", { hasText: "Wi-Fi" }).locator(".sn-ib[title=Menu]").click();
await frame.locator(".oc-menu-item", { hasText: "Green" }).click();
await settle();
check("sticky colour → green", (await data("stickies")).find((s) => s.id === "stk-a").color === "green");
await frame.locator("[data-testid=sticky]", { hasText: "Wi-Fi" }).locator(".sn-bar").dblclick();
await settle();
check("sticky double-click title → collapsed", (await data("stickies")).find((s) => s.id === "stk-a").collapsed === true);
await shot("stickies");
await valid("stickies");

// ---------- Notes: the body stays plain text (the model did not adopt a markup) ----------
await open("notes");
await frame.locator("textarea.nt-body").click();
await frame.locator("textarea.nt-body").press("Control+End");
await frame.locator("textarea.nt-body").type("\nPack charger");
await frame.locator(".nt-pages-head input").click();
await settle();
check("notes edit → plain-text body in the world", (await data("notes")).some((n) => n.body.endsWith("Cooking class\nPack charger")));
await shot("notes");

// ---------- To Do, Chat, People, Calendar optional fields ----------
await open("reminders");
await frame.locator(".ls-task").first().locator(".td-star").click();
await settle();
const flagged = (await data("reminders")).filter((r) => r.flagged);
check("to do star → reminders[].flagged", flagged.length === 1);
await frame.locator(".ls-task").first().click();
await frame.locator("[data-testid=todo-details] select").selectOption("3");
await frame.locator(".td-notes").fill("Ask about the fictional budget");
await frame.locator(".ls-add-input").click();
await settle();
const rem = (await data("reminders")).find((r) => r.id === flagged[0].id);
check("to do details → priority 3 and notes", rem.priority === 3 && rem.notes === "Ask about the fictional budget" && rem.flagged === true);
await shot("todo");
await open("messages");
await frame.locator(".ch-pin").click();
await settle();
check("chat pin → threads[].pinned", (await data("messages")).threads.some((t) => t.pinned));
await open("contacts");
await frame.locator(".pp-actions .oc-btn[title='Add to favourites']").click();
await settle();
check("people favourite → contacts[].favorite", (await data("contacts")).some((c) => c.favorite));
await open("calendar");
await frame.locator(".cl-new").click();
await frame.locator(".oc-dialog input").first().fill("Offsite day");
await frame.locator(".cl-allday input").check();
await frame.locator(".oc-dialog textarea").fill("Bring the fictional badge");
await frame.locator(".oc-dialog .oc-btn", { hasText: "Save" }).click();
await settle();
const ev = (await data("calendar")).find((e) => e.title === "Offsite day");
check("calendar all-day event with notes", !!ev && ev.allDay === true && ev.notes === "Bring the fictional badge");
await valid("item fields");

// ---------- File Explorer: tabs, Preview pane, Space-bar preview ----------
await open("files", { folderId: "documents" });
await frame.locator(".fx-tab-add").click();
await settle();
check("explorer new tab", (await frame.locator(".fx-tab").count()) === 2);
await frame.locator(".fx-tab").first().click();
await frame.locator(".fx-commands .oc-btn[title^='Preview pane']").click();
await frame.locator(".fx-item", { hasText: "Team budget 2027.txt" }).click();
await settle();
check("explorer Preview pane shows the file text", (await frame.locator("[data-testid=explorer-preview]").innerText()).length > 10);
await frame.locator(".fx-app").press(" ");
await settle();
check("explorer Space opens the preview dialog", await frame.locator("[data-testid=explorer-peek]").isVisible());
await shot("explorer-peek");
await page.keyboard.press("Escape");
await frame.locator(".oc-dialog .oc-btn", { hasText: "Close" }).click();

// ---------- Settings, taskbar and quick settings ----------
await open("settings");
for (const [pageName, testid, key] of [
  ["Personalisation", "settings-taskbar-autohide", "dockAutohide"],
  ["System", "settings-battery-percent", "showBatteryPercent"],
  ["Accessibility", "settings-contrast", "increaseContrast"],
  ["Privacy & security", "settings-ads", "personalizedAds"],
  ["Privacy & security", "settings-location", "locationServices"],
]) {
  await frame.locator(".navLink", { hasText: pageName }).first().click();
  await settle(250);
  const was = !!(await world()).sys[key];
  await frame.locator(`[data-testid=${testid}]`).click();
  await settle(250);
  check(`settings ${pageName} toggles sys.${key}`, (await world()).sys[key] === !was);
  await shot(`settings-${key}`);
}
const winBox = await frame.locator("[data-testid=window]").first().boundingBox();
check("auto-hidden taskbar gives maximised windows the full height", winBox.height >= 795, JSON.stringify(winBox));
await frame.locator(".navLink", { hasText: "Network & internet" }).first().click();
await frame.locator("[data-testid=settings-wifi-network]").selectOption("Harbor Cafe");
await settle();
check("settings Wi-Fi network → sys.wifiNetwork", (await world()).sys.wifiNetwork === "Harbor Cafe");
await shot("settings-network");
check("taskbar auto-hides when sys.dockAutohide is on", (await world()).sys.dockAutohide === true && (await frame.locator("[data-testid=taskbar]").getAttribute("data-autohide")) === "true");
await frame.evaluate(() => window.__oceanEmit({ kind: "set-sys", patch: { dockAutohide: false, increaseContrast: false } }));
await frame.locator("[data-testid=tray-quick]").click();
await settle(400);
check("quick settings shows the Wi-Fi network name", (await frame.locator("[data-testid=quick-settings]").innerText()).includes("Harbor Cafe"));
await shot("quick-settings");
await page.keyboard.press("Escape");
await frame.locator("[data-testid=tray-quick]").click();

// ---------- Search: unit conversion and quick actions ----------
await frame.locator("[data-testid=search-pill]").click();
await settle(300);
await frame.locator("[data-testid=search-input]").fill("5 km in miles");
await settle(300);
check("search unit conversion", (await frame.locator("[data-testid=search-results]").innerText()).includes("3.1069 miles"));
await shot("search-convert");
await frame.locator("[data-testid=search-input]").fill("new note");
await settle(300);
const before = (await data("notes")).length;
await frame.locator("[data-testid=search-input]").press("Enter");
await settle(500);
const after = await world();
check("search action New note → note + Notes window", after.data.notes.length === before + 1 && after.windows.some((w) => w.app === "notes"));

// ---------- OS-switch shape: a world from the other shell renders here ----------
const other = withWindow(W, "media");
other.data.media.nowPlaying = { trackId: "t3", queue: ["t1", "t3"], positionSec: 40, playing: false, at: T };
other.data.calculator = { mode: "programmer", angle: "rad", base: 2, memory: 5, history: [{ id: "c9", expr: "1010 + 1", result: "11", time: T }] };
await apply(other);
await settle(400);
check("now playing from the world (other OS) shows in Media Player", (await frame.locator("[data-testid=media-now]").innerText()) === "Drift");
await apply(withWindow(other, "calculator"));
await settle(400);
check("calculator mode + history from the world (other OS)", (await text()).includes("Programmer") && (await text()).includes("1010 + 1"));

check("zero non-loopback requests", blocked.length === 0, blocked.join(" "));
check("zero console or page errors", errors.length === 0, errors.slice(0, 4).join(" || "));
await browser.close();
server.close();
process.exitCode = summary("sync") ? 1 : 0;
