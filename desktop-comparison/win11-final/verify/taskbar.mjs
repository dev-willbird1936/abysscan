// Taskbar overflow suite (win-shell): all 21 apps installed + pinned, several running,
// at 1024/1280/1440/1920, centred and left-aligned.
import { ORIGIN, SHOTS as OUT, guard, launch, startServer } from "./lib.mjs";

const server = await startServer();
const browser = await launch();
const external = [];
let fails = 0;
for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
  for (const align of ["center", "left"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await guard(ctx, external);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${ORIGIN}/parent.html?mode=standalone`);
    const frame = page.frameLocator("#shell");
    await frame.locator("[data-testid=lock-screen]").waitFor();
    const f = () => page.frames().find((x) => x.url().includes("/app/"));
    await (await f()).evaluate((al) => {
      const wa = window.OceanWorldAdapter;
      const next = JSON.parse(JSON.stringify(wa.world));
      next.phase = "desktop";
      next.installed = [...wa.apps];
      next.dock.pins = [...wa.apps];
      next.revision++;
      wa.apply(next);
      for (const app of ["mail", "calculator", "settings", "stickies"]) window.__oceanEmit({ kind: "open-app", app });
      if (al === "left") window.__win11.dispatch({ type: "TASKLEF" });
    }, align);
    await page.waitForTimeout(900);
    const m = await (await f()).evaluate(() => {
      const rect = (el) => el && el.getBoundingClientRect();
      const bar = document.querySelector(".tsbar");
      const items = [...bar.children].filter((el) => !el.classList.contains("widget")).map(rect);
      const tray = rect(document.querySelector(".taskright"));
      const widget = rect(document.querySelector(".weatherPill"));
      const left = Math.min(...items.map((r) => r.left));
      const right = Math.max(...items.map((r) => r.right));
      return {
        left, right, trayLeft: tray.left, widgetRight: widget ? widget.right : 0,
        visible: document.querySelectorAll(".tsbar > .taskAppWrap[data-testid^=task-]").length,
        overflow: !!document.querySelector("[data-testid=task-overflow]"),
        compact: !!document.querySelector(".searchPill.compact"),
      };
    });
    const ok = m.right <= m.trayLeft - 4 && (align === "left" || m.left >= m.widgetRight + 4);
    if (!ok || errors.length) fails++;
    console.log(ok && !errors.length ? "PASS" : "FAIL", `${w}x${h} ${align}`, JSON.stringify(m), errors.join(" | "));
    await page.screenshot({ path: `${OUT}/final-win-shell-40-taskbar-${w}-${align}.png`, clip: { x: 0, y: h - 120, width: w, height: 120 } });
    if (m.overflow && align === "center") {
      await frame.locator("[data-testid=task-overflow]").click();
      await page.waitForTimeout(300);
      const n = await frame.locator("[data-testid=task-overflow-menu] .taskAppWrap").count();
      console.log(n > 0 ? "PASS" : "FAIL", `${w} overflow flyout lists ${n} apps`);
      if (!n) fails++;
      await page.screenshot({ path: `${OUT}/final-win-shell-41-taskbar-overflow-${w}.png`, clip: { x: 0, y: h - 300, width: w, height: 300 } });
      // Activating an overflow app opens it and keeps it visible (focused app is pinned into the strip).
      await frame.locator("[data-testid=task-overflow-menu] .taskAppWrap").last().locator(".tsIcon").click();
      await page.waitForTimeout(400);
      const kept = await (await f()).evaluate(() => {
        const wa = window.OceanWorldAdapter.world;
        const app = wa.windows.find((x) => x.id === wa.focusedId)?.app;
        return { app, inStrip: !!document.querySelector(`.tsbar > [data-testid=task-${app}]`) };
      });
      console.log(kept.inStrip ? "PASS" : "FAIL", `${w} focused overflow app moves into strip`, JSON.stringify(kept));
      if (!kept.inStrip) fails++;
    }
    await ctx.close();
  }
}
console.log(external.length ? "FAIL external " + external.join(" ") : "PASS zero non-loopback requests");
await browser.close();
server.close();
process.exitCode = fails || external.length ? 1 : 0;
console.log(fails ? `taskbar: ${fails} failures` : "taskbar: all checks passed");
