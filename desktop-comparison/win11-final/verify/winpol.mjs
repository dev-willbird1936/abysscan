// Polish checks for requests/integrate-to-win-apps.md and the win-polish pass: clickable toasts and
// notification-centre items emit valid open-app intents, scene pages keep single line breaks, the Start
// pinned grid pages through every installed app, desktop labels on light/dark/depth wallpapers, and the
// Settings page scroll area at 1280x800. Screenshots → final-winpol-*.png.
// node verify/winpol.mjs
import { ORIGIN, SHOTS, guard, launch, makeChecks, shellFrame, startServer } from "./lib.mjs";

const server = await startServer();
const browser = await launch();
const external = [];
const { check, summary } = makeChecks();
const shot = (page, name, clip) => page.screenshot({ path: `${SHOTS}/final-winpol-${name}.png`, ...(clip ? { clip } : {}) });

const openPage = async (mode, width, height) => {
  const context = await browser.newContext({ viewport: { width, height } });
  await guard(context, external);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
  await page.goto(`${ORIGIN}/parent.html?mode=${mode}`);
  const handle = await shellFrame(page);
  return { context, page, errors, handle, frame: page.frameLocator("#shell") };
};

// ---------- embedded: intents, scene page, Start paging, desktop labels ----------
{
  const { context, page, errors, handle, frame } = await openPage("embedded", 1440, 900);
  await page.waitForFunction(() => window.harness && window.harness.ready, null, { timeout: 15000 });
  await frame.locator("[data-testid=taskbar]").waitFor();
  await page.waitForTimeout(1500); // let the sign-in/taskbar entrance animations settle
  // Mutates a copy of the parent world in Node (the harness CSP forbids eval) and pushes it as the next revision.
  const push = async (mutate) => {
    const w = await page.evaluate(() => window.harness.world);
    w.phase = "desktop";
    w.windows = [];
    w.order = [];
    w.focusedId = null;
    w.notifications.banners = [];
    for (const k of Object.keys(w.overlays)) w.overlays[k] = false;
    mutate(w);
    await page.evaluate((next) => window.harness.push((d) => Object.assign(d, next)), w);
    await page.waitForTimeout(500);
  };
  const intents = async (from) => (await page.evaluate(() => window.harness.intents.map((i) => i.intent))).slice(from);
  const valid = (list) => handle.evaluate((l) => l.every((i) => window.OceanWorldModel.parseIntent(i) !== null), list);
  const seed = await page.evaluate(() => window.harness.world);
  const messageId = seed.data.mail.messages[0].id;
  const other = seed.installed.find((a) => !["mail", "settings"].includes(a));
  const now = new Date().toISOString();

  // 1. Toast click → open-app mail {messageId} + notify-dismiss.
  await push((w) => (w.notifications.banners = [{ id: "n-pol", app: "mail", title: "IT Service Desk", body: "Your mailbox is almost full.", time: now, ref: messageId }]));
  await frame.locator("[data-testid=toast]").waitFor();
  await page.waitForTimeout(600);
  await shot(page, "toast");
  let mark = (await intents(0)).length;
  await frame.locator("[data-testid=toast] .toastTitle").click();
  await page.waitForTimeout(300);
  let got = await intents(mark);
  check("toast click opens mail with {messageId}", got.some((i) => i.kind === "open-app" && i.app === "mail" && i.payload && i.payload.messageId === messageId && Object.keys(i.payload).length === 1), JSON.stringify(got));
  check("toast click dismisses the toast", got.some((i) => i.kind === "notify-dismiss" && i.id === "n-pol"), JSON.stringify(got));
  check("toast intents are valid", await valid(got));
  mark = (await intents(0)).length;
  await frame.locator("[data-testid=toast] .toastX").click();
  await page.waitForTimeout(300);
  got = await intents(mark);
  check("toast close button only dismisses", got.length === 1 && got[0].kind === "notify-dismiss", JSON.stringify(got));

  // 2. Notification centre: mail ref → {messageId}; other app ref → no payload.
  await push((w) => {
    w.overlays.centre = true;
    w.notifications.history = [
      { id: "n-mail", app: "mail", title: "IT Service Desk", body: "Review the message in Mail.", time: now, ref: messageId },
      { id: "n-other", app: other, title: "Reminder", body: "Something for later.", time: now, ref: "thread-1" },
    ];
  });
  await frame.locator("[data-testid=centre] .centreItem").first().waitFor();
  await shot(page, "centre");
  mark = (await intents(0)).length;
  await frame.locator("[data-testid=centre] .centreItem", { hasText: "Review the message" }).click();
  await frame.locator("[data-testid=centre] .centreItem", { hasText: "Something for later" }).click();
  await page.waitForTimeout(300);
  got = (await intents(mark)).filter((i) => i.kind === "open-app");
  check("centre mail item opens {messageId}", got[0] && got[0].app === "mail" && got[0].payload && got[0].payload.messageId === messageId, JSON.stringify(got));
  check("centre non-mail item opens without payload", got[1] && got[1].app === other && !("payload" in got[1]), JSON.stringify(got));
  check("centre intents are valid", await valid(got));

  // 3. Scene page keeps single line breaks.
  await push((w) => {
    w.data.web = { pages: { "pol-consent": { title: "Gleam Docs", url: "https://gleam-docs.example/consent", heading: "Gleam Docs wants to access your account",
      body: "Gleam Docs will be able to:\n• Read, send and delete your email\n• See and download your contacts\n• Act on your behalf\n\nOnly allow apps you trust.",
      choices: [{ label: "Allow", choiceId: "allow" }, { label: "Cancel", choiceId: "cancel", style: "secondary" }] } } };
    w.windows = [{ id: "w-b", app: "browser", title: "Browser", rect: { x: 150, y: 30, w: 700, h: 520 }, mode: "normal", tile: null, payload: { url: "scene:pol-consent" } }];
    w.order = ["w-b"];
    w.focusedId = "w-b";
  });
  const para = frame.locator(".br-scene-card p").first();
  await para.waitFor();
  const lines = await para.evaluate((p) => ({ ws: getComputedStyle(p).whiteSpace, h: p.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(p).lineHeight) || 20 }));
  check("scene page paragraph uses pre-line", lines.ws === "pre-line", lines.ws);
  check("scene page list renders on separate lines", lines.h >= 3.5 * lines.lh, JSON.stringify(lines));
  await shot(page, "scene-page");

  // 4. Start pinned grid pages through every installed app.
  for (const theme of ["light", "dark"]) {
    await push((w) => ((w.sys.theme = theme), (w.overlays.launcher = true)));
    const installedNames = await handle.evaluate(() => [...document.querySelectorAll(".allApp .appName")].map((n) => n.textContent));
    const pinned = frame.locator("[data-testid=pinned-apps] .appName");
    await pinned.first().waitFor();
    const first = await pinned.allInnerTexts();
    const dots = frame.locator("[data-testid=pinned-pages] .pnDot");
    const pages = await dots.count();
    await shot(page, `start-page1-${theme}`);
    const seen = [...first];
    for (let i = 1; i < pages; i++) {
      await dots.nth(i).click();
      await page.waitForTimeout(250);
      seen.push(...(await pinned.allInnerTexts()));
      await shot(page, `start-page${i + 1}-${theme}`);
    }
    check(`start page 1 shows 18 pinned apps (${theme})`, first.length === Math.min(18, installedNames.length), String(first.length));
    check(`start paging dots match installed apps (${theme})`, pages === Math.ceil(installedNames.length / 18), `${pages} dots, ${installedNames.length} apps`);
    check(`every installed app reachable from pinned pages (${theme})`, installedNames.every((n) => seen.includes(n)) && seen.length === installedNames.length, `${seen.length}/${installedNames.length}`);
    await frame.locator("[data-testid=pinned-apps]").hover();
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(250);
    check(`wheel pages back to page 1 (${theme})`, JSON.stringify(await pinned.allInnerTexts()) === JSON.stringify(first));
  }

  // 5. Desktop labels on light, dark and depth wallpapers.
  for (const [name, theme, wallpaper] of [["light", "light", "stock"], ["dark", "dark", "stock"], ["sunlight", "light", "depth-sunlight"], ["abyss", "dark", "depth-abyss"]]) {
    await push((w) => Object.assign(w.sys, { theme, wallpaper, wallpaperUrl: null }));
    await page.mouse.move(1437, 500);
    await page.waitForTimeout(400);
    await shot(page, `desktop-labels-${name}`);
    await shot(page, `desktop-labels-${name}-zoom`, { x: 0, y: 0, width: 160, height: 260 });
  }
  const shadow = await handle.evaluate(() => {
    const n = document.querySelector("[data-testid=desktop-icon] .dskName");
    return n ? { color: getComputedStyle(n).color, shadow: getComputedStyle(n).textShadow } : null;
  });
  check("desktop label is white with a soft dark shadow", shadow && shadow.color === "rgb(255, 255, 255)" && /rgba\(0, 0, 0/.test(shadow.shadow), JSON.stringify(shadow));

  check("no page errors (embedded)", errors.length === 0, errors.join(" || "));
  await context.close();
}

// ---------- standalone 1280x800: Settings scroll area ----------
for (const theme of ["light", "dark"]) {
  const { context, page, errors, handle, frame } = await openPage("standalone", 1280, 800);
  await handle.evaluate((t) => {
    const w = window.OceanWorldAdapter.world;
    w.phase = "desktop";
    w.revision++;
    window.OceanWorldAdapter.apply(w);
    window.__oceanEmit({ kind: "set-sys", patch: { theme: t } });
    window.__oceanEmit({ kind: "open-app", app: "settings" });
  }, theme);
  const tiles = frame.locator("[data-testid=settings-window] .tilesCont");
  await tiles.waitFor();
  await page.mouse.move(1277, 440);
  await page.waitForTimeout(700);
  await shot(page, `settings-${theme}-1280`);
  // Playwright hides scrollbars in headless Chromium, so check the styles that make the scroll area obvious.
  const box = await tiles.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { scroll: el.scrollHeight, client: el.clientHeight, overflow: cs.overflowY, bar: cs.scrollbarWidth, fade: cs.maskImage || cs.webkitMaskImage };
  });
  check(`settings page scrolls inside the window (${theme} 1280)`, box.overflow === "auto" && box.scroll > box.client, JSON.stringify(box));
  check(`settings scroll area is marked: thin scrollbar + bottom fade (${theme} 1280)`, box.bar === "thin" && /linear-gradient/.test(box.fade), JSON.stringify(box));
  await tiles.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  const last = await tiles.evaluate((el) => {
    const rows = el.querySelectorAll(".tile");
    const r = rows[rows.length - 1].getBoundingClientRect();
    return { rowBottom: Math.round(r.bottom), paneBottom: Math.round(el.getBoundingClientRect().bottom) };
  });
  check(`settings last row fully reachable (${theme} 1280)`, last.rowBottom <= last.paneBottom, JSON.stringify(last));
  await shot(page, `settings-${theme}-1280-scrolled`);
  check(`no page errors (settings ${theme})`, errors.length === 0, errors.join(" || "));
  await context.close();
}

check("zero non-loopback requests", external.length === 0, [...new Set(external)].join(" "));
await browser.close();
server.close();
process.exitCode = summary("winpol") ? 1 : 0;
