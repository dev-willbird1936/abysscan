// Fidelity screenshots of the production build: lock, Start, search, quick settings,
// notification centre, task view, switcher, snap layouts, File Explorer, Mail and Settings,
// light and dark, at 1440x900 and 1280x800 → final-winfin-<view>-<theme>-<width>.png.
// node verify/polish.mjs [view,view,...]
import { ORIGIN, SHOTS, guard, launch, makeChecks, shellFrame, startServer } from "./lib.mjs";

const only = process.argv[2] ? process.argv[2].split(",") : null;
const server = await startServer();
const browser = await launch();
const external = [];
const { check, summary } = makeChecks();

const VIEWS = {
  lock: async (s) => s.world((w) => (w.phase = "lock")),
  start: async (s) => s.emit({ kind: "toggle-overlay", name: "launcher", open: true }),
  search: async (s) => {
    await s.frame.locator("[data-testid=search-pill]").click();
    await s.frame.locator("[data-testid=search-input]").fill("budget");
  },
  quick: async (s) => s.frame.locator("[data-testid=tray-quick]").click(),
  centre: async (s) => {
    await s.world((w) => {
      const n = { id: "n-polish", app: "mail", title: "IT Service Desk", body: "Your mailbox is almost full. Review the message in Mail.", time: new Date().toISOString() };
      w.notifications.history.push(n);
    });
    await s.frame.locator("[data-testid=tray-clock]").click();
  },
  taskview: async (s) => {
    await s.openMany(["files", "mail", "settings"]);
    await s.frame.locator("[data-testid=task-view-button]").click();
  },
  switcher: async (s) => {
    await s.openMany(["files", "mail", "settings"]);
    await s.page.keyboard.down("Control");
    await s.page.keyboard.press("Backquote");
    s.after = () => s.page.keyboard.up("Control");
  },
  snap: async (s) => {
    await s.openMany(["files"]);
    await s.frame.locator("[data-testid=window][data-focused=true] [aria-label=Maximise]").hover();
  },
  files: async (s) => s.openMany([["files", { folderId: "documents" }]]),
  mail: async (s) => s.openMany(["mail"]),
  settings: async (s) => s.openMany(["settings"]),
};

for (const [width, height] of [[1440, 900], [1280, 800]]) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await guard(context, external);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${ORIGIN}/parent.html?mode=standalone`);
    const handle = await shellFrame(page);
    const s = {
      page,
      frame: page.frameLocator("#shell"),
      emit: (intent) => handle.evaluate((i) => window.__oceanEmit(i), intent),
      world: async (mutate) => {
        const w = await handle.evaluate(() => window.OceanWorldAdapter.world);
        mutate(w);
        w.revision++;
        await handle.evaluate((next) => window.OceanWorldAdapter.apply(next), w);
      },
      openMany: async (apps) => {
        for (const entry of apps) {
          const [app, payload] = Array.isArray(entry) ? entry : [entry];
          await handle.evaluate(([a, p]) => window.__oceanEmit(p ? { kind: "open-app", app: a, payload: p } : { kind: "open-app", app: a }), [app, payload]);
          await page.waitForTimeout(250);
        }
      },
    };
    const fresh = (w) => {
      w.phase = "desktop";
      w.windows = [];
      w.order = [];
      w.focusedId = null;
      w.notifications.banners = [];
      for (const k of Object.keys(w.overlays)) w.overlays[k] = false;
    };
    for (const [view, run] of Object.entries(VIEWS)) {
      if (only && !only.includes(view)) continue;
      await page.keyboard.press("Escape");
      await s.world(fresh);
      await s.emit({ kind: "set-sys", patch: { theme } });
      // Park the pointer on empty desktop so no hover state shows.
      await page.mouse.move(width - 3, Math.round(height * 0.55));
      await page.waitForTimeout(300);
      s.after = null;
      await run(s);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/final-winfin-${view}-${theme}-${width}.png` });
      if (s.after) await s.after();
      await page.waitForTimeout(200);
    }
    check(`no page or console errors (${theme} ${width})`, errors.length === 0, errors.slice(0, 3).join(" || "));
    await context.close();
  }
}
check("zero non-loopback requests", external.length === 0, [...new Set(external)].join(" "));
await browser.close();
server.close();
process.exitCode = summary("polish") ? 1 : 0;
