import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { showDesktop } from "../../actions";
import { installedApps, badgeOf, pinnedApps } from "../../utils";
import { Icon } from "../../utils/general";
import { emit, isDimmed, isFocusApp, toggleOverlay, useWorld } from "../../utils/ocean";
import Battery from "../shared/Battery";
import { programMeta } from "../ocean/programs";
import "./taskbar.scss";

const audioLevel = (sys) =>
  sys.muted || sys.volume == 0 ? 0 : sys.volume < 30 ? 1 : sys.volume < 70 ? 2 : 3;

// Context menus that need item data dispatch MENUSHOW themselves and stop the event, so the
// global contextmenu handler in App.jsx leaves them alone.
export const showMenu = (dispatch, e, menu, dataset) => {
  e.preventDefault();
  e.stopPropagation();
  dispatch({ type: "MENUSHOW", payload: { top: e.clientY, left: e.clientX, menu, dataset } });
};

// Click: open if closed, minimise if it is the focused window, otherwise bring it forward.
const activate = (world, app) => {
  const wins = world.windows.filter((w) => w.app == app.id);
  if (!wins.length) return emit({ kind: "open-app", app: app.id });
  const top = wins[wins.length - 1];
  if (world.focusedId == top.id && top.mode != "minimized") emit({ kind: "minimize", id: top.id });
  else emit({ kind: "focus-window", id: top.id });
};

const TaskApp = ({ app, world, onActivate }) => {
  const dispatch = useDispatch();
  const wins = world.windows.filter((w) => w.app == app.id);
  const focused = wins.some((w) => w.id == world.focusedId && w.mode != "minimized");
  const badge = badgeOf(world, app.id);
  return (
    <div
      className="taskAppWrap"
      title={app.name}
      data-testid={"task-" + app.id}
      data-dim={isDimmed(world, app.id)}
      data-focus={isFocusApp(world, app.id)}
      onContextMenu={(e) => showMenu(dispatch, e, "taskapp", { app: app.id })}
    >
      <Icon
        className="tsIcon"
        width={24}
        open={wins.length ? true : null}
        active={focused}
        onClick={() => {
          activate(world, app);
          if (onActivate) onActivate();
        }}
        src={app.iconSrc}
        ext
        pr
      />
      {badge ? <span className="taskBadge">{badge > 99 ? "99+" : badge}</span> : null}
    </div>
  );
};

// A program window (docs/desktop-parity/PROGRAMS.md) has its own taskbar button, titled by its view.
const ProgramTask = ({ win, world }) => {
  const meta = programMeta(world, win);
  const focused = win.id == world.focusedId && win.mode != "minimized";
  return (
    <div className="taskAppWrap" title={meta.name} data-testid={"task-program-" + win.payload.view}>
      <Icon
        className="tsIcon"
        width={24}
        open={true}
        active={focused}
        onClick={() => emit(focused ? { kind: "minimize", id: win.id } : { kind: "focus-window", id: win.id })}
        src={meta.iconSrc}
        ext
        pr
      />
    </div>
  );
};

// Width budget so the app strip never reaches the tray: compact the search pill, then tighten
// icon spacing, then move the rest into an overflow flyout. Slots match .tsIcon (38 px + margins).
const SLOT = 44;
const TIGHT = 40;
const SEARCH_PILL = 208;
const fitStrip = ({ width, trayW, widgetW, centred, search, count }) => {
  const avail = centred ? width - 2 * Math.max(trayW, widgetW) - 24 : width - trayW - widgetW - 24;
  let fixed = 2 * SLOT + (search ? SEARCH_PILL : 0);
  if (fixed + count * SLOT <= avail) return { compactSearch: false, tight: false, visible: count };
  if (search) fixed += SLOT - SEARCH_PILL;
  if (fixed + count * SLOT <= avail) return { compactSearch: search, tight: false, visible: count };
  if (fixed + count * TIGHT <= avail) return { compactSearch: search, tight: true, visible: count };
  return { compactSearch: search, tight: true, visible: Math.max(1, Math.floor((avail - fixed - TIGHT) / TIGHT)) };
};

const Overflow = ({ apps, world }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="taskAppWrap" ref={ref}>
      <div className="tsIcon taskOverflowBtn prtclk" title={`${apps.length} more apps`} data-testid="task-overflow" data-active={open} onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 10l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {apps.some((app) => badgeOf(world, app.id)) ? <span className="taskOverflowDot"></span> : null}
      </div>
      {open ? (
        <div className="taskOverflow acrylic" data-testid="task-overflow-menu">
          {apps.map((app) => (
            <TaskApp key={app.id} app={app} world={world} onActivate={() => setOpen(false)} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const Taskbar = () => {
  const tasks = useSelector((state) => state.taskbar);
  const world = useWorld();
  const dispatch = useDispatch();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const pinned = pinnedApps(world);
  const running = installedApps(world).filter(
    (app) => !pinned.includes(app) && world.windows.some((w) => w.app == app.id),
  );
  const programs = world.windows.filter((w) => w.app == "program" && w.payload);
  const unread = world.notifications.history.length;

  const trayRef = useRef(null);
  const widgetRef = useRef(null);
  const [layout, setLayout] = useState({ width: window.innerWidth, trayW: 260, widgetW: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const next = {
        width: window.innerWidth,
        trayW: trayRef.current ? trayRef.current.offsetWidth : 260,
        widgetW: widgetRef.current ? widgetRef.current.offsetWidth + 8 : 0,
      };
      setLayout((cur) => (cur.width == next.width && cur.trayW == next.trayW && cur.widgetW == next.widgetW ? cur : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  const strip = [...pinned, ...running];
  const fit = fitStrip({ ...layout, centred: tasks.align != "left", search: tasks.search, count: strip.length + programs.length });
  let shown = strip.slice(0, fit.visible);
  let hidden = strip.slice(fit.visible);
  // Keep the focused app on the taskbar even when the strip overflows.
  const focusedApp = (world.windows.find((w) => w.id == world.focusedId) || {}).app;
  const lost = hidden.find((app) => app.id == focusedApp);
  if (lost && shown.length) {
    hidden = [shown[shown.length - 1], ...hidden.filter((app) => app != lost)];
    shown = [...shown.slice(0, -1), lost];
  }

  return (
    <div className="taskbar" data-testid="taskbar" data-autohide={!!world.sys.dockAutohide}>
      <div className="taskcont">
        <div className="tasksCont" data-menu="task" data-side={tasks.align}>
          <div className="tsbar" data-tight={fit.tight}>
            {tasks.widgets ? (
              <div ref={widgetRef} className="widget weatherPill prtclk handcr" data-action="WIDGTOGG" onClick={() => dispatch({ type: "WIDGTOGG" })}>
                <Icon src="weather" width={22} />
                <div className="weatherText">
                  <div>18°C</div>
                  <div>Partly cloudy</div>
                </div>
              </div>
            ) : null}
            <Icon className="tsIcon" src="home" width={24} click="STARTOGG" />
            {tasks.search ? (
              <div
                className={fit.compactSearch ? "tsIcon searchPill compact prtclk" : "searchPill prtclk"}
                data-action="STARTSRC"
                data-testid="search-pill"
                title="Search (Alt+S)"
                onClick={() => dispatch({ type: "STARTSRC" })}
              >
                <Icon icon="taskSearch" width={16} />
                {fit.compactSearch ? null : <span>Search</span>}
              </div>
            ) : null}
            <div
              className="tsIcon taskViewBtn prtclk"
              title="Task view (Ctrl+↑)"
              data-testid="task-view-button"
              data-active={world.overlays.taskView}
              onClick={() => toggleOverlay("taskView", !world.overlays.taskView)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="8" height="16" rx="2" fill="#1f6fd1" />
                <rect x="13" y="4" width="8" height="7" rx="2" fill="#5fb2f2" />
                <rect x="13" y="13" width="8" height="7" rx="2" fill="#2f8be0" />
              </svg>
            </div>
            {shown.map((app) => (
              <TaskApp key={app.id} app={app} world={world} />
            ))}
            {hidden.length ? <Overflow apps={hidden} world={world} /> : null}
            {programs.map((win) => (
              <ProgramTask key={win.id} win={win} world={world} />
            ))}
          </div>
        </div>
        <div className="taskright" ref={trayRef}>
          <div
            className="prtclk handcr my-1 px-2 hvlight flex rounded items-center"
            onClick={() => dispatch({ type: "PANETOGG" })}
            data-action="PANETOGG"
            data-testid="tray-quick"
          >
            <Icon className={"taskIcon" + (world.sys.wifi ? "" : " opacity-40")} src="wifi" ui width={16} title={world.sys.wifi ? world.sys.wifiNetwork || "Wi-Fi" : "Wi-Fi off"} />
            <Icon className="taskIcon" src={"audio" + audioLevel(world.sys)} ui width={16} />
            <Battery pct={world.sys.showBatteryPercent ? true : undefined} />
          </div>
          <div
            className="taskDate m-1 handcr prtclk rounded hvlight"
            data-action="CENTRETOGG"
            data-testid="tray-clock"
            onClick={() => toggleOverlay("centre", !world.overlays.centre)}
          >
            <div>{time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
            <div>{time.toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric" })}</div>
          </div>
          <div
            className="bellBtn m-1 handcr prtclk rounded hvlight"
            data-action="CENTRETOGG"
            data-testid="tray-bell"
            onClick={() => toggleOverlay("centre", !world.overlays.centre)}
            title="Notifications"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2a7 7 0 0 1 7 6.8V13l1.4 3.2A1 1 0 0 1 19.5 17.6H15a3 3 0 0 1-6 .2v-.2H4.5a1 1 0 0 1-.9-1.4L5 13V9a7 7 0 0 1 7-7Zm1.5 15.6h-3a1.5 1.5 0 0 0 3 .1v-.1ZM12 3.5A5.5 5.5 0 0 0 6.5 9v4.3l-1.2 2.8h13.4l-1.2-2.8V9.1A5.5 5.5 0 0 0 12 3.5Z"
                fill="currentColor"
              />
            </svg>
            {unread ? <span className="bellBadge">{unread}</span> : null}
            {world.sys.focus ? <span className="bellFocus"></span> : null}
          </div>
          <div className="showDesk" title="Show desktop" data-testid="show-desktop" onClick={showDesktop}></div>
        </div>
      </div>
    </div>
  );
};

export default Taskbar;
