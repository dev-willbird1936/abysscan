// Apps suite (win-apps): renders each canonical app in the production build inside
// <iframe sandbox="allow-scripts">, drives UI mutations, swaps worlds, records network.
// node verify/apps.mjs [app,app,...]
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ORIGIN, PROJECT as ROOT, SHOTS, guard, launch, shellFrame, startServer } from "./lib.mjs";

const require = createRequire(import.meta.url);
const model = require(`${ROOT}/ui/desktop/world-model.js`);
mkdirSync(SHOTS, { recursive: true });
const only = process.argv[2] ? process.argv[2].split(",") : null;

const clone = (v) => JSON.parse(JSON.stringify(v));
const seed = JSON.parse(readFileSync(`${ROOT}/data/desktop-world-seed.json`, "utf8"));

// W1: seed + scene-style extras, phase desktop.
const W1 = clone(seed);
W1.phase = "desktop";
W1.scene = { phase: "boot", stepId: null, highlight: null };
W1.data.stickies = [
  { id: "stk-badge", text: "Call facilities about the badge reader\nExt. 4410", color: "yellow", x: 30, y: 30, w: 220, h: 160, collapsed: false },
  { id: "stk-lunch", text: "Lunch with Dana, Thursday", color: "pink", x: 280, y: 60, w: 200, h: 150, collapsed: false },
];
W1.data.browser = { tabs: [{ id: "tab-1", url: "scene:pw-reset", title: "Northwind account verification" }], activeTabId: "tab-1", bookmarks: [], history: [] };
W1.data.media = {
  tracks: [
    { id: "t1", title: "Neon Skyline", artist: "Vector Fields", album: "Neon Skyline — Single", genre: "Synthwave", asset: "track-1", cover: "cover-1", duration: 212, loved: true },
    { id: "t2", title: "Golden Hour", artist: "Café Mono", album: "Golden Hour", genre: "Lo-Fi", asset: "track-2", cover: "cover-2", duration: 184, loved: false },
  ],
  playlists: [{ id: "pl-focus", name: "Focus", trackIds: ["t2"] }],
  shuffle: false,
  repeat: "off",
  nowPlaying: null,
};
W1.data.photos = {
  items: [
    { id: "p1", name: "photo-1.jpg", asset: "photo-1", taken: "2026-07-14T17:42:00Z", favorite: false, trashed: false },
    { id: "p2", name: "photo-2.jpg", asset: "photo-2", taken: "2026-07-09T09:15:00Z", favorite: true, trashed: false },
  ],
  albums: [{ id: "al-trip", name: "Team Trip", photoIds: ["p1"] }],
};
W1.data.mail.messages.unshift({
  id: "m-lure", folder: "inbox", from: "IT Helpdesk <helpdesk@northwind-support.example>", to: "alex.rivera@northwind.example",
  subject: "Action required: your password expires today", body: "Hello Alex,\n\nYour Northwind password expires today. Verify your account to keep access to email.\n\nIT Helpdesk",
  time: "2026-11-02T08:45:00Z", read: false, flagged: false, attachments: [], link: "scene:pw-reset",
});
W1.data.web = {
  pages: { "pw-reset": { title: "Northwind account verification", brand: "Northwind Support", heading: "Verify your account", url: "https://northwind-support.example/verify", body: "Your password expires today.\n\nSign in to keep access to your mailbox and files.", choices: [{ label: "Sign in", choiceId: "sign-in" }, { label: "Not now", choiceId: "not-now", style: "secondary" }, { label: "Report this page", choiceId: "report", style: "secondary" }] } },
  favorites: [{ title: "Support portal", url: "scene:pw-reset" }],
};
W1.data.mfa = { accounts: [{ id: "acct-nw", issuer: "Northwind", label: "alex.rivera@northwind.example" }], prompts: [{ id: "pr-1", app: "Northwind sign-in", account: "alex.rivera@northwind.example", location: "Lisbon, Portugal (fictional)", device: "Chrome on Windows", time: "2026-11-02T08:50:00Z", number: 47 }] };
W1.data.alarms = [{ id: "a-standup", label: "Stand-up", time: "10:20", enabled: true }, { id: "a-gym", label: "Gym", time: "18:00", enabled: false }];
W1.data.updates = [{ id: "u-cu", title: "2026-11 Cumulative Update for Windows 11 (fictional)", kb: "KB5099001", size: "412 MB", status: "available", choiceId: "download" }, { id: "u-defs", title: "Security intelligence update (fictional)", kb: "KB2267602", size: "88 MB", status: "installed" }];
W1.data.processes = [{ id: "p-sync", name: "Northwind Sync Helper", cpu: 2.5, mem: 48, publisher: "Unknown publisher", suspicious: true, endChoice: "delete" }];
W1.data.calendar[1].invite = "Invitation from Marcus Lee <marcus.lee@northwind.example>";
W1.fs.nodes["f-harbour"] = { id: "f-harbour", parentId: "pictures", name: "Harbour walk.png", kind: "file", mime: "image/png", size: 182000, modified: "2026-09-02T10:00:00Z", trashed: false, contentId: "c-harbour" };
W1.data.contents["c-harbour"] = { asset: "harbour" };
W1.fs.nodes["f-drift"] = { id: "f-drift", parentId: "music", name: "Ocean drift.mp3", kind: "file", mime: "audio/mpeg", size: 3100000, modified: "2026-07-05T10:00:00Z", trashed: false, contentId: "c-drift" };
W1.data.contents["c-drift"] = { asset: "drift" };
{
  const v = model.validate(W1);
  if (!v.ok) throw new Error(`W1 invalid: ${v.error}`);
}

// W2: a different profile (light theme, pink accent, other user, mailbox, files, fewer apps).
const W2 = clone(W1);
W2.revision = 50;
W2.sys = { ...W2.sys, theme: "light", accent: "pink", wallpaper: "depth-twilight" };
W2.user = { id: "trainee", name: "Jordan Kim", short: "jordan", email: "jordan.kim@fabrikam.example", avatar: "initials" };
W2.fs.nodes.home.name = "jordan";
W2.data.mail.messages = [
  { id: "m-invoice", folder: "inbox", from: "Accounts <ap@fabrikam.example>", to: "jordan.kim@fabrikam.example", subject: "Invoice 4471 overdue", body: "Jordan,\n\nInvoice 4471 is overdue. Please review.\n\nAccounts", time: "2026-11-03T09:00:00Z", read: false, flagged: false, attachments: ["f-invoice"] },
];
W2.fs.nodes["f-invoice"] = { id: "f-invoice", parentId: "documents", name: "Invoice 4471.txt", kind: "file", mime: "text/plain", size: 90, modified: "2026-11-03T09:00:00Z", trashed: false, contentId: "c-invoice" };
W2.data.contents["c-invoice"] = { text: "Invoice 4471\nAmount: 1,200.00\nDue: 2026-10-31" };
delete W2.fs.nodes["f-budget"];
delete W2.data.contents["c-budget"];
W2.installed = W2.installed.filter((a) => a !== "whiteboard");
W2.dock.badges = { mail: 1 };
{
  const v = model.validate(W2);
  if (!v.ok) throw new Error(`W2 invalid: ${v.error}`);
}

const PAYLOAD = { mail: { messageId: "m-lure" }, browser: { url: "scene:pw-reset" }, texteditor: { fileId: "f-welcome" }, files: { folderId: "documents" } };
const withWindow = (world, app, payload = PAYLOAD[app] || null, mode = "maximized") => {
  const w = clone(world);
  const id = `w-${app}-1`;
  w.windows = [{ id, app, title: app, rect: { x: 100, y: 40, w: 760, h: 500 }, mode, tile: null, payload }];
  w.order = [id];
  w.focusedId = id;
  w.overlays = { launcher: false, search: false, quick: false, centre: false, taskView: false, switcher: false };
  w.revision = (world.revision || 0) + 1;
  return w;
};

const report = { blocked: [], requests: [], errors: [], apps: {}, mutations: [], swap: [] };
const server = await startServer();
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await guard(context, report.blocked, report.requests);
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && report.errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
await page.goto(`${ORIGIN}/parent.html?mode=standalone`);
const frame = await shellFrame(page);
const sandbox = await page.evaluate(() => document.getElementById("shell").getAttribute("sandbox"));
await frame.evaluate(() => {
  window.__w3intents = [];
  window.OceanWorldAdapter.onIntent((i) => window.__w3intents.push(i));
});
const takeChoices = () => frame.evaluate(() => window.__w3intents.splice(0).filter((i) => i.kind === "scene-choice").map((i) => i.choiceId));
const apply = (w) => frame.evaluate((x) => window.OceanWorldAdapter.apply(x), w);
const world = () => frame.evaluate(() => window.__win11.store.getState().world);
const settle = (ms = 500) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${SHOTS}/final-win-apps-${name}.png` });
const check = (name, ok, detail = "") => {
  report.mutations.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const content = () => frame.locator(".oc-app").first();

// ---------- 1. every canonical app renders world data ----------
const EXPECT = {
  files: "Team budget 2027.txt", browser: "Northwind account verification", mail: "your password expires today", messages: "Priya Shah",
  mfa: "Approve sign-in?", updates: "KB5099001", settings: null, terminal: "Microsoft Windows", notes: "Offsite ideas", texteditor: "Welcome.txt",
  calendar: "Stand-up", reminders: "Comment on budget draft", contacts: "Marcus Lee", photos: "All photos", media: "Neon Skyline",
  calculator: "Standard", clock: "World clock", store: "Essential apps", taskmanager: "Northwind Sync Helper", stickies: "Call facilities about the badge reader", whiteboard: null,
};
for (const app of model.CANONICAL_APPS) {
  if (only && !only.includes(app)) continue;
  await apply(withWindow(W1, app));
  await settle(app === "whiteboard" ? 900 : 600);
  const info = await frame.evaluate((a) => {
    const win = document.querySelector(".oc-app") || document.querySelector("[data-app]");
    const body = document.body.innerText + "\n" + [...document.querySelectorAll("textarea, input")].map((x) => x.value).join("\n");
    return { hasOcean: !!document.querySelector(".oc-app"), text: body.slice(0, 20000), app: a };
  }, app);
  const want = EXPECT[app];
  const ok = want ? info.text.includes(want) : true;
  report.apps[app] = { rendered: ok, oceanRoot: info.hasOcean, expected: want };
  check(`render ${app}${want ? ` (expects "${want}")` : ""}`, ok);
  await shot(app);
}

if (!only) {
  // ---------- 1b. default-size windows opened through the open-app intent ----------
  const base = clone(W1);
  base.windows = [];
  base.order = [];
  base.focusedId = null;
  await apply(base);
  await settle(300);
  for (const [app, payload] of [["mail"], ["photos", { fileId: "f-offsite" }], ["mfa"], ["stickies"], ["calculator"]]) {
    await frame.evaluate(([a, p]) => window.__oceanEmit(p ? { kind: "open-app", app: a, payload: p } : { kind: "open-app", app: a }), [app, payload]);
    await settle(450);
  }
  const opened = (await world()).windows.map((w) => `${w.app}:${w.rect.w}x${w.rect.h}`);
  check("open-app intents create windows", opened.length === 5, opened.join(" "));
  await shot("default-windows");
  // Light theme + green accent on the same windows, no reload.
  await frame.evaluate(() => window.__oceanEmit({ kind: "set-sys", patch: { theme: "light", accent: "green" } }));
  await settle(500);
  check("set-sys theme switch restyles apps", (await content().getAttribute("data-theme")) === "light");
  await shot("default-windows-light");
  for (const app of ["calendar", "store", "notes", "files", "browser"]) {
    const lw = withWindow({ ...W1, sys: { ...W1.sys, theme: "light", accent: "purple" } }, app);
    await apply(lw);
    await settle(500);
    await shot(`light-${app}`);
  }

  // ---------- 2. mutations through the UI change world state ----------
  await apply(withWindow(W1, "mail"));
  await settle();
  await frame.locator(".ml-item", { hasText: "Stand-up moved" }).click();
  await settle(200);
  check("mail mark-read via click", (await world()).data.mail.messages.find((m) => m.id === "m-standup").read === true);
  await frame.locator(".ml-reader .oc-btn", { hasText: "Flag" }).first().click();
  await settle(200);
  check("mail flag via button", (await world()).data.mail.messages.find((m) => m.id === "m-standup").flagged === true);
  await frame.locator(".ml-item", { hasText: "password expires" }).click();
  await frame.locator(".ml-link").click();
  await settle(400);
  const wl = await world();
  check("mail link opens scene page in browser", wl.windows.some((w) => w.app === "browser" && w.payload && w.payload.url === "scene:pw-reset"));
  await apply(withWindow(await world(), "mail"));
  await settle(300);
  await frame.locator(".ml-new").click();
  await frame.locator(".ml-field-input").first().fill("priya.shah@northwind.example");
  await frame.locator(".ml-field-input").nth(1).fill("Training draft");
  await frame.locator(".ml-compose-body").fill("Draft body");
  await frame.locator(".oc-btn", { hasText: "Send" }).click();
  await settle(300);
  check("mail compose + send (save-draft, move sent)", (await world()).data.mail.messages.some((m) => m.subject === "Training draft" && m.folder === "sent"));

  await apply(withWindow(await world(), "files", { folderId: "documents" }));
  await settle();
  await frame.locator(".oc-btn", { hasText: "New folder" }).click();
  await settle(300);
  await frame.locator(".fx-rename").fill("Lure test");
  await frame.locator(".fx-rename").press("Enter");
  await settle(300);
  let wf = await world();
  const folder = Object.values(wf.fs.nodes).find((n) => n.name === "Lure test" && n.parentId === "documents");
  check("explorer new folder + rename", !!folder, folder ? folder.id : "missing");
  await frame.locator(".fx-item", { hasText: "Employee handbook.txt" }).dragTo(frame.locator(".fx-item", { hasText: "Lure test" }));
  await settle(300);
  check("explorer drag-drop move", (await world()).fs.nodes["f-handbook"].parentId === (folder && folder.id));
  await frame.locator(".fx-item", { hasText: "Team budget 2027.txt" }).click();
  await frame.locator(".fx-app").press("Delete");
  await settle(300);
  check("explorer delete → trash", (await world()).fs.nodes["f-budget"].trashed === true);
  await frame.locator(".fx-side-item", { hasText: "Recycle Bin" }).click();
  await settle(300);
  await shot("files-recycle-bin");
  await frame.locator(".oc-btn", { hasText: "Restore all items" }).click();
  await settle(300);
  check("explorer restore from recycle bin", (await world()).fs.nodes["f-budget"].trashed === false);
  await frame.locator(".fx-side-item", { hasText: "Documents" }).click();
  await frame.locator("select.fx-select").nth(1).selectOption("details");
  await settle(200);
  await shot("files-details");

  await apply(withWindow(await world(), "texteditor", { fileId: "f-welcome" }));
  await settle();
  await frame.locator(".np-text").click();
  await frame.locator(".np-text").press("End");
  await frame.locator(".np-text").press("Control+End");
  await frame.locator(".np-text").type("\nEdited in Notepad.");
  await frame.locator(".np-text").press("Control+s");
  await settle(300);
  check("notepad save → fs write", (await world()).data.contents["c-welcome"].text.endsWith("Edited in Notepad."));

  await apply(withWindow(await world(), "terminal", null));
  await settle();
  const term = frame.locator(".tm-input");
  for (const cmd of ["cd Documents", "mkdir Reports", "echo hello world > hi.txt", "dir", "type hi.txt"]) {
    await term.fill(cmd);
    await term.press("Enter");
    await settle(150);
  }
  wf = await world();
  const hi = Object.values(wf.fs.nodes).find((n) => n.name === "hi.txt" && n.parentId === "documents");
  check("terminal mkdir", Object.values(wf.fs.nodes).some((n) => n.name === "Reports" && n.parentId === "documents"));
  check("terminal echo > file", !!hi && wf.data.contents[hi.contentId].text === "hello world\n");
  await shot("terminal-session");

  await apply(withWindow(await world(), "reminders"));
  await settle();
  await frame.locator(".ls-task", { hasText: "Comment on budget draft" }).locator(".oc-check").click();
  await settle(200);
  check("to do toggle", (await world()).data.reminders.find((r) => r.id === "r-budget").done === true);
  await frame.locator(".ls-add-input").fill("Report the fake helpdesk email");
  await frame.locator(".ls-add-input").press("Enter");
  await settle(200);
  check("to do add", (await world()).data.reminders.some((r) => r.title === "Report the fake helpdesk email"));

  await apply(withWindow(await world(), "messages"));
  await settle();
  await frame.locator(".ch-compose input").fill("On my way");
  await frame.locator(".ch-compose input").press("Enter");
  await settle(200);
  check("chat append", (await world()).data.messages.threads.some((t) => t.items.some((i) => i.text === "On my way")));

  await apply(withWindow(await world(), "notes"));
  await settle();
  await frame.locator(".nt-add", { hasText: "Add page" }).click();
  await settle(200);
  await frame.locator(".nt-title").fill("Phish tells");
  await frame.locator(".nt-body").click();
  await frame.locator(".nt-body").type("Urgency, odd domain");
  await frame.locator(".nt-pages-head input").click();
  await settle(200);
  check("notes add + edit", (await world()).data.notes.some((n) => n.title === "Phish tells" && n.body === "Urgency, odd domain"));

  await apply(withWindow(await world(), "stickies"));
  await settle();
  await frame.locator(".sn-head .sn-ib").click();
  await settle(200);
  check("sticky add", (await world()).data.stickies.length === 3);

  await apply(withWindow(await world(), "contacts"));
  await settle();
  await frame.locator(".pp-head .oc-btn").click();
  const inputs = frame.locator(".oc-dialog input");
  await inputs.nth(0).fill("Riley Chen");
  await inputs.nth(1).fill("riley.chen@northwind.example");
  await inputs.nth(2).fill("+1 555 0109");
  await inputs.nth(3).fill("Northwind");
  await frame.locator(".oc-dialog .oc-btn", { hasText: "Save" }).click();
  await settle(200);
  check("people add contact", (await world()).data.contacts.some((c) => c.name === "Riley Chen"));

  await apply(withWindow(await world(), "calendar"));
  await settle();
  await frame.locator(".cl-new").click();
  await frame.locator(".oc-dialog input").first().fill("Phishing drill");
  await frame.locator(".oc-dialog .oc-btn", { hasText: "Save" }).click();
  await settle(200);
  check("calendar new event", (await world()).data.calendar.some((e) => e.title === "Phishing drill"));

  await apply(withWindow(await world(), "clock"));
  await settle();
  await frame.locator(".oc-nav-item", { hasText: "Alarm" }).click();
  await frame.locator(".ck-alarm", { hasText: "Gym" }).locator(".oc-toggle").click();
  await settle(200);
  check("clock alarm toggle", (await world()).data.alarms.find((a) => a.id === "a-gym").enabled === true);
  await shot("clock-alarms");

  await apply(withWindow(await world(), "mfa"));
  await settle();
  await takeChoices();
  await frame.locator(".au-prompt .oc-btn", { hasText: "Deny" }).click();
  await settle(200);
  check("authenticator deny → scene-choice deny", (await takeChoices()).join() === "deny");
  check("authenticator deny → prompt deleted", (await world()).data.mfa.prompts.length === 0);

  await apply(withWindow(await world(), "updates"));
  await settle();
  await takeChoices();
  await frame.locator(".up-item .oc-btn", { hasText: "Install" }).click();
  await settle(200);
  check("lure update install → scene-choice download", (await takeChoices()).join() === "download");
  check("windows update install", (await world()).data.updates.find((u) => u.id === "u-cu").status === "installed");

  await apply(withWindow(await world(), "store"));
  await settle();
  await frame.locator(".st-rail-item", { hasText: "Library" }).click();
  await frame.locator(".st-lib", { hasText: "Whiteboard" }).locator(".oc-btn").nth(1).click();
  await settle(300);
  check("store uninstall", !(await world()).installed.includes("whiteboard"));
  await frame.locator(".st-rail-item", { hasText: "Home" }).click();
  await settle(200);
  await shot("store-available");
  await frame.locator(".st-card", { hasText: "Whiteboard" }).first().locator(".oc-btn", { hasText: "Get" }).click();
  await settle(300);
  check("store install", (await world()).installed.includes("whiteboard"));

  await apply(withWindow(await world(), "taskmanager"));
  await settle();
  check("task manager lists app window", (await frame.evaluate(() => document.body.innerText)).includes("Task Manager"));
  await takeChoices();
  await frame.locator(".tk-row", { hasText: "Northwind Sync Helper" }).click();
  await frame.locator(".oc-btn", { hasText: "End task" }).click();
  await settle(200);
  check("end task on suspicious process → its endChoice", (await takeChoices()).join() === "delete");

  await apply(withWindow(await world(), "calculator"));
  await settle(300);
  for (const k of ["7", "×", "6", "="]) await frame.locator(".cc-key", { hasText: new RegExp(`^${k}$`) }).click();
  await frame.locator(".cc-mkey", { hasText: "MS" }).click();
  await frame.locator(".cc-key", { hasText: /^C$/ }).click();
  await frame.locator(".cc-mkey", { hasText: "MR" }).click();
  check("calculator 7×6 then MS/C/MR", (await frame.locator(".cc-val").innerText()).trim() === "42");

  await apply(withWindow(await world(), "browser", null));
  await settle(300);
  await frame.locator(".br-address input").click();
  await frame.locator(".br-address input").fill("www.real-bank.com/login");
  await frame.locator(".br-address input").press("Enter");
  await settle(500);
  const btext = await frame.evaluate(() => document.body.innerText);
  check("typed external URL shows offline page, nothing loaded", btext.includes("can't reach this page") && report.blocked.length === 0);
  await shot("browser-offline");

  // ---------- 2b. scene choices fire only on the highlighted item ----------
  await takeChoices();
  const hl = withWindow({ ...W1, scene: { phase: "boot", stepId: null, highlight: { app: "mail", ref: "m-lure" } } }, "mail", { messageId: "m-lure" });
  await apply(hl);
  await settle(400);
  await frame.locator(".ml-link").click();
  await settle(200);
  let choices = await frame.evaluate(() => window.__w3intents.filter((i) => i.kind === "scene-choice").map((i) => i.choiceId));
  check("highlighted lure link → scene-choice follow-link", choices.includes("follow-link"), choices.join(","));
  await apply(withWindow({ ...W1, scene: { phase: "boot", stepId: null, highlight: { app: "mail", ref: "m-lure" } } }, "mail", { messageId: "m-standup" }));
  await settle(300);
  await frame.evaluate(() => (window.__w3intents.length = 0));
  await frame.locator(".ml-reader .oc-btn", { hasText: "Report" }).click();
  await settle(200);
  choices = await frame.evaluate(() => window.__w3intents.filter((i) => i.kind === "scene-choice").map((i) => i.choiceId));
  check("report on a non-highlighted mail sends no scene choice", choices.length === 0, choices.join(",") || "none");
  check("report moves the mail to junk", (await world()).data.mail.messages.find((m) => m.id === "m-standup").folder === "junk");
  await apply(withWindow(W1, "browser", { url: "scene:pw-reset" }));
  await settle(300);
  await frame.evaluate(() => (window.__w3intents.length = 0));
  await frame.locator(".br-choice", { hasText: "Report this page" }).click();
  await settle(200);
  choices = await frame.evaluate(() => window.__w3intents.filter((i) => i.kind === "scene-choice").map((i) => i.choiceId));
  check("scene page button → scene-choice report", choices.join() === "report", choices.join(","));

  // ---------- 3. world swap re-renders without reload ----------
  const navs = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  for (const [app, before, after] of [
    ["mail", "your password expires today", "Invoice 4471 overdue"],
    ["files", "Team budget 2027.txt", "Invoice 4471.txt"],
  ]) {
    await apply(withWindow(W1, app, app === "mail" ? null : { folderId: "documents" }));
    await settle(400);
    const t1 = await frame.evaluate(() => document.body.innerText);
    const theme1 = await content().getAttribute("data-theme");
    await apply(withWindow(W2, app, app === "mail" ? null : { folderId: "documents" }));
    await settle(400);
    const t2 = await frame.evaluate(() => document.body.innerText);
    const theme2 = await content().getAttribute("data-theme");
    const accent2 = await content().evaluate((el) => el.style.getPropertyValue("--oc-accent"));
    const ok = t1.includes(before) && !t2.includes(before) && t2.includes(after) && theme1 === "dark" && theme2 === "light";
    report.swap.push({ app, ok, theme1, theme2, accent2 });
    check(`world swap re-renders ${app}`, ok, `${theme1}→${theme2}, accent ${accent2}`);
    await shot(`swap-${app}-w2`);
  }
  const frameUrlSame = frame.url().endsWith("/index.html");
  check("no reload during swaps", frameUrlSame && (await page.evaluate(() => performance.getEntriesByType("navigation").length)) === navs);
  await apply(withWindow(W2, "store"));
  await settle(300);
  check("uninstalled app hidden from store library (W2 lacks whiteboard)", !(await frame.evaluate(() => [...document.querySelectorAll(".st-card")].some((c) => c.innerText.includes("Whiteboard") && c.innerText.includes("Open")))));
}

report.sandbox = sandbox;
report.nonLoopback = report.requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith("data:"));
check('iframe sandbox="allow-scripts"', sandbox === "allow-scripts", sandbox);
check("zero non-loopback requests", report.nonLoopback.length === 0 && report.blocked.length === 0, report.blocked.join(" "));
check("zero console errors", report.errors.length === 0, report.errors.slice(0, 5).join(" || "));
writeFileSync(fileURLToPath(new URL("last-apps-report.json", import.meta.url)), JSON.stringify(report, null, 2));
console.log(`sandbox="${sandbox}" requests=${report.requests.length} blocked=${report.blocked.length} errors=${report.errors.length}`);
await browser.close();
server.close();
const failed = report.mutations.filter((r) => !r.ok).length;
console.log(`\napps: ${report.mutations.length - failed}/${report.mutations.length} passed`);
process.exitCode = failed ? 1 : 0;
