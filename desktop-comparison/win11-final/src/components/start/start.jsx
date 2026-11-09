import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as Actions from "../../actions";
import { installedApps } from "../../utils";
import { AvatarFace } from "../ocean/avatar";
import { Icon } from "../../utils/general";
import {
  emit,
  fileIcon,
  formatTime,
  isDimmed,
  openerOf,
  setSys,
  SYSTEM_FOLDERS,
  toggleOverlay,
  useWorld,
} from "../../utils/ocean";
import { newId, saveNote } from "../../ocean/world-helpers";
import { sinceAt, syncedOp } from "../../ocean/synced";

// ---------- search corpus ----------

const SETTINGS_PAGES = [
  ["Personalisation", "Theme, accent colour, background"],
  ["Accounts", "Your info, sign-in"],
  ["System", "Display, sound, notifications, power"],
  ["Bluetooth & devices", "Bluetooth"],
  ["Network & internet", "Wi-Fi"],
  ["Apps", "Installed apps"],
  ["Time & language", "Date and time"],
  ["Accessibility", "Motion, transparency"],
  ["Privacy & security", "Permissions"],
];

const shellActions = (world) => [
  { name: "Lock", hint: "Ctrl+L", run: Actions.powerLock },
  { name: "Sleep", run: Actions.powerSleep },
  { name: "Restart", run: Actions.powerRestart },
  { name: "Shut down", run: Actions.powerOff },
  { name: world.sys.theme == "dark" ? "Turn off dark mode" : "Turn on dark mode", run: () => setSys({ theme: world.sys.theme == "dark" ? "light" : "dark" }) },
  { name: world.sys.wifi ? "Turn off Wi-Fi" : "Turn on Wi-Fi", run: () => setSys({ wifi: !world.sys.wifi }) },
  { name: world.sys.bluetooth ? "Turn off Bluetooth" : "Turn on Bluetooth", run: () => setSys({ bluetooth: !world.sys.bluetooth }) },
  { name: world.sys.focus ? "End focus session" : "Start focus session", run: () => setSys({ focus: !world.sys.focus }) },
  { name: world.sys.nightLight ? "Turn off night light" : "Turn on night light", run: () => setSys({ nightLight: !world.sys.nightLight }) },
  ...(world.installed.includes("notes") ? [{ name: "New note", run: () => newNote(world) }] : []),
  ...(world.installed.includes("calendar") ? [{ name: "New event", run: () => Actions.openApp("calendar") }] : []),
  ...(world.installed.includes("reminders") ? [{ name: "New reminder", run: () => Actions.openApp("reminders") }] : []),
  ...(world.installed.includes("clock") ? [{ name: "Start a 5 minute timer", run: () => (syncedOp("clock", "set-timer", { timer: { label: "Timer", durationMs: 300000, remainingMs: 300000, running: true } }), Actions.openApp("clock")) }] : []),
  ...(world.installed.includes("mail") ? [{ name: "New email", run: () => Actions.openApp("mail") }] : []),
  ...(world.installed.includes("messages") ? [{ name: "New message", run: () => Actions.openApp("messages") }] : []),
  ...((world.data.media || {}).nowPlaying ? [{ name: world.data.media.nowPlaying.playing ? "Pause music" : "Play music", run: () => togglePlayback(world) }] : []),
  { name: "Show desktop", hint: "Ctrl+D", run: Actions.showDesktop },
  { name: "Task view", hint: "Ctrl+↑", run: () => toggleOverlay("taskView", true) },
  { name: "Empty Recycle Bin", run: Actions.binEmpty },
  { name: "Next desktop background", run: Actions.nextWallpaper },
];

const newNote = (world) => {
  saveNote({ id: newId("n"), folder: "notes", title: "New note", body: "", pinned: false });
  Actions.openApp("notes");
};
const togglePlayback = (world) => {
  const np = world.data.media.nowPlaying;
  const position = np.positionSec + (np.playing ? sinceAt(np.at) / 1000 : 0);
  syncedOp("media", "set-playback", { trackId: np.trackId, queue: np.queue, positionSec: Math.round(position * 10) / 10, playing: !np.playing });
};

// Unit conversion, as Spotlight does: "5 km in miles", "70 f to c", "2 lb to kg".
const UNITS = {
  length: { m: 1, meter: 1, meters: 1, km: 1000, kilometers: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, ft: 0.3048, feet: 0.3048, foot: 0.3048, in: 0.0254, inch: 0.0254, inches: 0.0254, yd: 0.9144, yards: 0.9144 },
  mass: { kg: 1, kilograms: 1, g: 0.001, grams: 0.001, lb: 0.45359237, lbs: 0.45359237, pounds: 0.45359237, oz: 0.028349523, ounces: 0.028349523 },
  volume: { l: 1, liter: 1, liters: 1, ml: 0.001, gal: 3.785411784, gallons: 3.785411784, cup: 0.2365882365, cups: 0.2365882365 },
  data: { b: 1, bytes: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12 },
  time: { s: 1, sec: 1, seconds: 1, min: 60, minutes: 60, h: 3600, hr: 3600, hours: 3600, day: 86400, days: 86400, week: 604800, weeks: 604800 },
};
const TEMPS = { c: "c", celsius: "c", f: "f", fahrenheit: "f", k: "k", kelvin: "k" };
export const convert = (text) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*([a-z°]+)\s+(?:in|to|as)\s+([a-z°]+)\s*$/i.exec(text);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const [from, to] = [m[2], m[3]].map((u) => u.toLowerCase().replace("°", ""));
  const fmt = (n) => String(Math.round(n * 1e4) / 1e4);
  if (TEMPS[from] && TEMPS[to]) {
    const c = TEMPS[from] == "c" ? value : TEMPS[from] == "f" ? ((value - 32) * 5) / 9 : value - 273.15;
    const out = TEMPS[to] == "c" ? c : TEMPS[to] == "f" ? (c * 9) / 5 + 32 : c + 273.15;
    return `${fmt(out)} °${TEMPS[to].toUpperCase()}`;
  }
  for (const table of Object.values(UNITS)) if (table[from] && table[to]) return `${fmt((value * table[from]) / table[to])} ${m[3]}`;
  return null;
};

// Small arithmetic evaluator (no eval): + - * / % ^ and parentheses.
export const calculate = (text) => {
  const src = text.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/");
  if (!/^[\d.+\-*/%^()]+$/.test(src) || !/\d/.test(src) || !/[+\-*/%^]/.test(src.replace(/^-/, ""))) return null;
  let i = 0;
  const peek = () => src[i];
  const number = () => {
    const m = /^\d*\.?\d+(?:e[+-]?\d+)?|^\d+\./.exec(src.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const atom = () => {
    if (peek() == "-") {
      i++;
      return -atom();
    }
    if (peek() == "(") {
      i++;
      const v = sum();
      if (src[i++] != ")") throw new Error("paren");
      return v;
    }
    return number();
  };
  const power = () => {
    const base = atom();
    if (peek() == "^") {
      i++;
      return Math.pow(base, power());
    }
    return base;
  };
  const product = () => {
    let v = power();
    while (["*", "/", "%"].includes(peek())) {
      const op = src[i++];
      const r = power();
      v = op == "*" ? v * r : op == "/" ? v / r : v % r;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (["+", "-"].includes(peek())) {
      const op = src[i++];
      const r = product();
      v = op == "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    const value = sum();
    if (i != src.length || !Number.isFinite(value)) return null;
    return Math.round(value * 1e10) / 1e10;
  } catch (err) {
    return null;
  }
};

const useSearch = (world, query) =>
  useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (s) => String(s).toLowerCase().includes(q);
    const out = [];
    const math = calculate(query);
    if (math != null) out.push({ group: "Calculator", name: `${query.trim()} = ${math}`, icon: "calculator", kind: "math", value: math });
    const unit = math == null ? convert(query) : null;
    if (unit) out.push({ group: "Conversion", name: `${query.trim()} = ${unit}`, icon: "calculator", kind: "math", value: unit });
    for (const app of installedApps(world)) if (has(app.name) || has(app.id)) out.push({ group: "Apps", name: app.name, icon: app.iconSrc, ext: true, kind: "app", id: app.id, sub: "App" });
    for (const node of Object.values(world.fs.nodes)) {
      if (node.trashed || SYSTEM_FOLDERS.includes(node.id) || !has(node.name) || !openerOf(world, node)) continue;
      out.push({ group: "Files", name: node.name, icon: fileIcon(node), kind: "file", id: node.id, sub: node.kind == "folder" ? "Folder" : "Modified " + formatTime(node.modified) });
    }
    if (world.installed.includes("settings"))
      for (const [page, sub] of SETTINGS_PAGES) if (has(page) || has(sub)) out.push({ group: "Settings", name: page, icon: "settings", kind: "settings", page, sub });
    if (world.installed.includes("updates") && (has("windows update") || has("update")))
      out.push({ group: "Settings", name: "Windows Update", icon: "update", kind: "app", id: "updates", sub: "Check for updates" });
    for (const action of shellActions(world)) if (has(action.name)) out.push({ group: "Actions", name: action.name, icon: "settings", kind: "action", run: action.run, sub: action.hint || "Action" });
    return out.slice(0, 24);
  }, [world, query]);

// ---------- Start + search flyout ----------

export const StartMenu = () => {
  const { align } = useSelector((state) => state.taskbar);
  const start = useSelector((state) => state.startmenu);
  const world = useWorld();
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const inputRef = useRef(null);
  const results = useSearch(world, query);
  const apps = installedApps(world);
  // Pinned grid pages of 18 (6 x 3), Windows 11 style with side dots and wheel paging.
  const pageCount = Math.max(1, Math.ceil(apps.length / 18));
  const pinPage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (!start.hide && !start.menu && inputRef.current) inputRef.current.focus();
    if (start.hide) setQuery(""), setPage(0);
  }, [start.hide, start.menu]);
  useEffect(() => setCursor(0), [query]);

  const close = () => dispatch({ type: "STARTHID" });
  const run = (item) => {
    if (!item) return;
    if (item.kind == "app") Actions.openApp(item.id);
    else if (item.kind == "file") Actions.openNode(item.id);
    else if (item.kind == "settings") Actions.openSettings(item.page);
    else if (item.kind == "action") item.run(dispatch);
    else if (item.kind == "math") return;
    close();
  };

  const recent = Object.values(world.fs.nodes)
    .filter((n) => n.kind == "file" && !n.trashed && openerOf(world, n))
    .sort((a, b) => String(b.modified).localeCompare(String(a.modified)))
    .slice(0, 6);

  const letters = {};
  for (const app of [...apps].sort((a, b) => a.name.localeCompare(b.name))) {
    const letter = /[a-z]/i.test(app.name[0]) ? app.name[0].toUpperCase() : "#";
    (letters[letter] = letters[letter] || []).push(app);
  }

  const searchBox = (
    <div className="startSearch">
      <Icon icon="taskSearch" width={16} />
      <input
        ref={inputRef}
        data-testid="search-input"
        value={query}
        placeholder="Search for apps, settings, and documents"
        onFocus={() => start.menu && dispatch({ type: "SEARCHSHW" })}
        onChange={(e) => {
          setQuery(e.target.value);
          if (start.menu) dispatch({ type: "SEARCHSHW" });
        }}
        onKeyDown={(e) => {
          if (e.key == "ArrowDown") setCursor((c) => Math.min(c + 1, results.length - 1));
          else if (e.key == "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
          else if (e.key == "Enter") run(results[cursor]);
          else if (e.key == "Escape") close();
        }}
      />
    </div>
  );

  const best = results[cursor] || results[0];

  return (
    <div className="startMenu dpShad" data-hide={start.hide} style={{ "--prefix": "START" }} data-align={align} data-testid={start.menu ? "start-menu" : "search-flyout"}>
      <div className="startTop">{searchBox}</div>
      {start.menu ? (
        <>
          <div className="stmenu" data-allapps={!!start.showAll}>
            <div className="menuUp">
              <div className="stAcbar">
                <div className="gpname">Pinned</div>
                <div className="gpbtn prtclk" onClick={() => dispatch({ type: "STARTALL" })} data-action="STARTALL">
                  <div>All apps</div>
                  <Icon fafa="faChevronRight" width={8} />
                </div>
              </div>
              <div className="pnPaged" onWheel={(e) => pageCount > 1 && setPage(Math.max(0, Math.min(pageCount - 1, pinPage + Math.sign(e.deltaY))))}>
                <div className="pnApps" data-testid="pinned-apps">
                  {apps.slice(pinPage * 18, pinPage * 18 + 18).map((app) => (
                    <div key={app.id} className="prtclk pnApp" data-dim={isDimmed(world, app.id)} onClick={() => run({ kind: "app", id: app.id })}>
                      <Icon className="pnIcon" src={app.iconSrc} ext width={32} />
                      <div className="appName">{app.name}</div>
                    </div>
                  ))}
                </div>
                {pageCount > 1 ? (
                  <div className="pnDots" data-testid="pinned-pages">
                    {Array.from({ length: pageCount }, (_, i) => (
                      <button key={i} className="pnDot" data-on={i == pinPage} aria-label={`Pinned page ${i + 1}`} onClick={() => setPage(i)} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="recApps win11Scroll">
              <div className="stAcbar">
                <div className="gpname">Recommended</div>
              </div>
              <div className="reApps">
                {recent.map((node) => (
                  <div key={node.id} className="rnApp" onClick={() => run({ kind: "file", id: node.id })}>
                    <Icon className="pnIcon" src={fileIcon(node)} width={32} />
                    <div className="acInfo">
                      <div className="appName truncate">{node.name}</div>
                      <div className="timeUsed">{formatTime(node.modified)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="allCont" data-allapps={!!start.showAll}>
            <div className="appCont">
              <div className="stAcbar">
                <div className="gpname">All apps</div>
                <div className="gpbtn prtclk" onClick={() => dispatch({ type: "STARTALL" })} data-action="STARTALL">
                  <Icon className="chevLeft" fafa="faChevronLeft" width={8} />
                  <div>Back</div>
                </div>
              </div>
              <div className="allApps win11Scroll">
                {Object.keys(letters).map((letter) => (
                  <React.Fragment key={letter}>
                    <div className="allApp">
                      <div className="ltName">{letter}</div>
                    </div>
                    {letters[letter].map((app) => (
                      <div key={app.id} className="allApp prtclk" data-dim={isDimmed(world, app.id)} onClick={() => run({ kind: "app", id: app.id })}>
                        <Icon className="pnIcon" src={app.iconSrc} ext width={24} />
                        <div className="appName">{app.name}</div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="menuBar">
            <div className="profile handcr" onClick={() => run({ kind: "settings", page: "Accounts" })}>
              <div className="startAvatar"><AvatarFace user={world.user} /></div>
              <div className="usName">{world.user.name}</div>
            </div>
            <div className="relative powerMenu" data-action="STARTPWC">
              <div className="powerCont" data-vis={start.pwctrl}>
                {[
                  ["Lock", Actions.powerLock],
                  ["Sleep", Actions.powerSleep],
                  ["Shut down", Actions.powerOff],
                  ["Restart", Actions.powerRestart],
                ].map(([name, fn]) => (
                  <div key={name} className="flex prtclk items-center gap-2" onClick={() => { close(); fn(); }}>
                    <span>{name}</span>
                  </div>
                ))}
              </div>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" onClick={() => dispatch({ type: "STARTPWC" })} data-action="STARTPWC" data-testid="power-button">
                <path
                  d="M8.204 4.82a.75.75 0 0 1 .634 1.36A7.51 7.51 0 0 0 4.5 12.991c0 4.148 3.358 7.51 7.499 7.51s7.499-3.362 7.499-7.51a7.51 7.51 0 0 0-4.323-6.804.75.75 0 1 1 .637-1.358 9.01 9.01 0 0 1 5.186 8.162c0 4.976-4.029 9.01-9 9.01C7.029 22 3 17.966 3 12.99a9.01 9.01 0 0 1 5.204-8.17ZM12 2.496a.75.75 0 0 1 .743.648l.007.102v7.5a.75.75 0 0 1-1.493.102l-.007-.102v-7.5a.75.75 0 0 1 .75-.75Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          </div>
        </>
      ) : (
        <div className="searchMenu">
          {query.trim() ? (
            <div className="searchResults">
              <div className="resultList win11Scroll" data-testid="search-results">
                {results.length ? (
                  results.map((item, i) => (
                    <React.Fragment key={item.group + item.name + i}>
                      {i == 0 || results[i - 1].group != item.group ? <div className="resultGroup">{item.group}</div> : null}
                      <div className="resultItem" data-active={i == cursor} data-dim={item.kind == "app" && isDimmed(world, item.id)} onMouseEnter={() => setCursor(i)} onClick={() => run(item)}>
                        <Icon src={item.icon} ext={item.ext || null} width={22} />
                        <div className="min-w-0">
                          <div className="truncate">{item.name}</div>
                          {item.sub ? <div className="resultSub truncate">{item.sub}</div> : null}
                        </div>
                      </div>
                    </React.Fragment>
                  ))
                ) : (
                  <div className="resultEmpty">No results for “{query.trim()}”</div>
                )}
              </div>
              {best ? (
                <div className="resultPreview">
                  <Icon src={best.icon} ext={best.ext || null} width={56} />
                  <div className="previewName">{best.kind == "math" ? best.value : best.name}</div>
                  <div className="resultSub">{best.kind == "math" ? query.trim() : best.group}</div>
                  {best.kind != "math" ? (
                    <button className="previewOpen" onClick={() => run(best)}>
                      {best.kind == "action" ? "Run" : "Open"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="searchIdle">
              <div className="text-sm font-semibold mb-3">Top apps</div>
              <div className="topApps flex w-full gap-2">
                {apps.slice(0, 6).map((app) => (
                  <div key={app.id} className="topApp pt-6 py-4 ltShad prtclk" data-dim={isDimmed(world, app.id)} onClick={() => run({ kind: "app", id: app.id })}>
                    <Icon src={app.iconSrc} ext width={30} />
                    <div className="text-xs mt-2">{app.name}</div>
                  </div>
                ))}
              </div>
              <div className="text-sm font-semibold mt-8 mb-2">Recent files</div>
              {recent.slice(0, 4).map((node) => (
                <div key={node.id} className="resultItem" onClick={() => run({ kind: "file", id: node.id })}>
                  <Icon src={fileIcon(node)} width={22} />
                  <div>
                    <div>{node.name}</div>
                    <div className="resultSub">{formatTime(node.modified)}</div>
                  </div>
                </div>
              ))}
              <div className="searchTip">Try “12*7”, “5 km in miles”, “new note”, “dark mode” or “budget”.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
