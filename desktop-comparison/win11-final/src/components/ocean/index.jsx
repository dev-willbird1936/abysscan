import React, { useEffect, useMemo, useRef, useState } from "react";
import { openApp } from "../../actions";
import { appById } from "../../utils/apps";
import { Icon } from "../../utils/general";
import { emit, formatTime, setSys, toggleOverlay, useWorld } from "../../utils/ocean";
import { playSound } from "../../utils/sounds";

// A program window (app "program", PROGRAMS.md) shows the generic program icon.
export const AppIcon = ({ id, width }) => (
  <Icon src={id == "program" ? window.OceanProgramUI.fileIcon("program", "windows") : (appById(id) || {}).iconSrc || "img/icon/settings.png"} ext width={width} />
);
export const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const appLabel = (id) => (appById(id) || {}).name || "System";
// Only a mail ref maps to a valid open-app payload; anything else opens the app plain.
const openNotification = (n) => openApp(n.app, n.app == "mail" && n.ref ? { messageId: n.ref } : undefined);

// ---------- toasts ----------

export const Banners = () => {
  const world = useWorld();
  // One auto-dismiss timer per shown banner. A banner that leaves and comes back (a scene replay reuses its id) is new.
  const timers = useRef(new Map());
  const banners = world.phase == "desktop" && !world.sys.focus ? world.notifications.banners : [];

  useEffect(() => {
    const shown = new Set(banners.map((n) => n.id));
    for (const [id, timer] of timers.current) if (!shown.has(id)) (clearTimeout(timer), timers.current.delete(id));
    const fresh = banners.filter((n) => !timers.current.has(n.id));
    if (fresh.length) playSound("chime", world.sys);
    fresh.forEach((n) => timers.current.set(n.id, setTimeout(() => emit({ kind: "notify-dismiss", id: n.id }), 7000)));
  }, [banners.map((n) => n.id).join()]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <div className="oceanToasts" data-testid="toasts">
      {banners.slice(-3).map((n) => (
        <div
          key={n.id}
          className="oceanToast acrylic"
          data-testid="toast"
          data-ocean-key={"notification:" + n.id}
          data-ocean-label={"The notification “" + n.title + "”"}
          onClick={() => (openNotification(n), emit({ kind: "notify-dismiss", id: n.id }))}
        >
          <div className="toastHead">
            <AppIcon id={n.app} width={16} />
            <span>{appLabel(n.app)}</span>
            <button
              className="toastX"
              style={{ marginLeft: "auto" }}
              onClick={(e) => (e.stopPropagation(), emit({ kind: "notify-dismiss", id: n.id }))}
              aria-label="Dismiss"
            >
              <XIcon />
            </button>
          </div>
          <div className="toastTitle">{n.title}</div>
          <div className="toastBody">{n.body}</div>
        </div>
      ))}
    </div>
  );
};

// ---------- notification centre + calendar ----------

const sameDay = (a, b) =>
  a.getFullYear() == b.getFullYear() && a.getMonth() == b.getMonth() && a.getDate() == b.getDate();

const MonthGrid = ({ events }) => {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState(today);
  const cells = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);
  const dayEvents = events.filter((e) => sameDay(new Date(e.start), picked));
  const shift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <>
      <div className="calHead">
        <span>{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <div className="flex">
          <button className="calNav" onClick={() => shift(-1)} aria-label="Previous month">˄</button>
          <button className="calNav" onClick={() => shift(1)} aria-label="Next month">˅</button>
        </div>
      </div>
      <div className="calGrid">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="calDow">{d}</div>
        ))}
        {cells.map((d) => (
          <button
            key={d.toISOString()}
            className="calDay"
            data-out={d.getMonth() != cursor.getMonth()}
            data-today={sameDay(d, today)}
            data-picked={sameDay(d, picked)}
            data-event={events.some((e) => sameDay(new Date(e.start), d))}
            onClick={() => setPicked(d)}
          >
            {d.getDate()}
          </button>
        ))}
      </div>
      <div className="calAgenda">
        <div className="text-xs font-semibold mb-1">
          {picked.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        {dayEvents.length ? (
          dayEvents.map((e) => (
            <div key={e.id} className="calEvent">
              <span className="calBar"></span>
              <div>
                <div className="text-xs font-semibold">{e.title}</div>
                <div className="text-xss opacity-70">
                  {new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  {e.location ? " · " + e.location : ""}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-xss opacity-60">No events</div>
        )}
      </div>
    </>
  );
};

export const NotificationCentre = () => {
  const world = useWorld();
  const open = world.overlays.centre;
  const history = [...world.notifications.history].reverse();

  return (
    <div className="oceanCentre" data-hide={!open} style={{ "--prefix": "CENTRE" }} data-testid="centre">
      <div className="centreCard acrylic">
        <div className="centreHead">
          <span>Notifications</span>
          {history.length ? (
            <button className="linkBtn" onClick={() => emit({ kind: "notify-clear" })}>
              Clear all
            </button>
          ) : null}
        </div>
        <div className="centreList win11Scroll">
          {world.sys.focus ? <div className="focusNote">Focus is on. Banners are hidden.</div> : null}
          {history.length ? (
            history.map((n) => (
              <div
                key={n.id}
                className="centreItem"
                onClick={() => openNotification(n) && toggleOverlay("centre", false)}
              >
                <div className="toastHead">
                  <AppIcon id={n.app} width={16} />
                  <span>{appLabel(n.app)}</span>
                  <span className="ml-auto opacity-60">{formatTime(n.time)}</span>
                  <button
                    className="toastX"
                    aria-label="Clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      emit({ kind: "notify-clear", id: n.id });
                    }}
                  >
              <XIcon />
            </button>
                </div>
                <div className="toastTitle">{n.title}</div>
                <div className="toastBody">{n.body}</div>
              </div>
            ))
          ) : (
            <div className="centreEmpty">No new notifications</div>
          )}
        </div>
      </div>
      <div className="centreCard acrylic">
        <MonthGrid events={world.data.calendar || []} />
        <div className="centreFoot">
          <button className="focusBtn" data-on={world.sys.focus} onClick={() => setSys({ focus: !world.sys.focus })}>
            {world.sys.focus ? "End focus" : "Focus"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- task view and switcher ----------

const visibleWindows = (world) =>
  (world.order || [])
    .map((id) => world.windows.find((w) => w.id == id))
    .filter((w) => w && world.installed.includes(w.app))
    .reverse();

const WindowCard = ({ win, selected, onPick, onClose }) => (
  <div className="winCard" data-selected={selected} onClick={onPick}>
    <div className="winCardHead">
      <AppIcon id={win.app} width={16} />
      <span className="truncate">{win.payload && !win.payload.url && win.title ? win.title : appLabel(win.app)}</span>
      {onClose ? (
        <button
          className="toastX"
          aria-label="Close window"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <XIcon />
        </button>
      ) : null}
    </div>
    <div className="winCardBody">
      <AppIcon id={win.app} width={56} />
      {win.mode != "normal" ? (
        <div className="text-xss opacity-70 mt-2">{{ minimized: "Minimised", maximized: "Maximised", fullscreen: "Full screen" }[win.mode]}</div>
      ) : null}
    </div>
  </div>
);

export const TaskView = () => {
  const world = useWorld();
  if (!world.overlays.taskView || world.phase != "desktop") return null;
  const wins = visibleWindows(world);
  const pick = (id) => {
    emit({ kind: "focus-window", id });
    toggleOverlay("taskView", false);
  };

  return (
    <div className="oceanTaskView" data-testid="task-view" onClick={() => toggleOverlay("taskView", false)}>
      <div className="tvTitle">Task view</div>
      <div className="tvGrid" onClick={(e) => e.stopPropagation()}>
        {wins.length ? (
          wins.map((w) => (
            <WindowCard key={w.id} win={w} onPick={() => pick(w.id)} onClose={() => emit({ kind: "close-window", id: w.id })} />
          ))
        ) : (
          <div className="tvEmpty">No open windows</div>
        )}
      </div>
      <div className="tvDesktops">
        <div className="tvDesk" data-active="true">Desktop 1</div>
      </div>
    </div>
  );
};

export const Switcher = () => {
  const world = useWorld();
  const [index, setIndex] = useState(1);
  const open = world.overlays.switcher && world.phase == "desktop";
  const wins = visibleWindows(world);
  const live = useRef({ index, wins });
  live.current = { index, wins };

  useEffect(() => {
    if (!open) return;
    setIndex(wins.length > 1 ? 1 : 0);
    const step = (e) => setIndex((i) => (i + e.detail + live.current.wins.length) % Math.max(1, live.current.wins.length));
    const commit = (e) => {
      if (e.key != "Control" && e.key != "Alt" && e.key != "Meta") return;
      const { index: i, wins: list } = live.current;
      if (list[i]) emit({ kind: "focus-window", id: list[i].id });
      toggleOverlay("switcher", false);
    };
    window.addEventListener("ocean-switcher-step", step);
    window.addEventListener("keyup", commit);
    return () => {
      window.removeEventListener("ocean-switcher-step", step);
      window.removeEventListener("keyup", commit);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="oceanSwitcher" data-testid="switcher">
      <div className="swStrip acrylic">
        {wins.length ? (
          wins.map((w, i) => (
            <WindowCard
              key={w.id}
              win={w}
              selected={i == index}
              onPick={() => {
                emit({ kind: "focus-window", id: w.id });
                toggleOverlay("switcher", false);
              }}
            />
          ))
        ) : (
          <div className="tvEmpty">No open windows</div>
        )}
      </div>
    </div>
  );
};
