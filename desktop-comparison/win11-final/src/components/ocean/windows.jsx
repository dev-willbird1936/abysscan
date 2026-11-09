import React, { useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useSelector } from "react-redux";
import { appById } from "../../utils/apps";
import { Icon } from "../../utils/general";
import { emit, isDimmed, useWorld } from "../../utils/ocean";
import { playSound } from "../../utils/sounds";
import { programMeta } from "./programs";

// Windows from world.windows. Rects are virtual 1000×600 and scale to the desktop area.
// Drag and resize are local until pointer-up, then commit one set-rect / tile / maximize.
export const TILE_RECTS = {
  left: { x: 0, y: 0, w: 500, h: 600 },
  right: { x: 500, y: 0, w: 500, h: 600 },
  top: { x: 0, y: 0, w: 1000, h: 300 },
  bottom: { x: 0, y: 300, w: 1000, h: 300 },
  tl: { x: 0, y: 0, w: 500, h: 300 },
  tr: { x: 500, y: 0, w: 500, h: 300 },
  bl: { x: 0, y: 300, w: 500, h: 300 },
  br: { x: 500, y: 300, w: 500, h: 300 },
};
const MIN = { w: 160, h: 120 };
const TASKBAR = 48;

// The work area loses the taskbar height unless the taskbar auto-hides (sys.dockAutohide).
const area = () => ({ w: window.innerWidth, h: Math.max(200, window.innerHeight - (document.body.dataset.autohide == "true" ? 0 : TASKBAR)) });
const toPx = (r) => {
  const { w, h } = area();
  return { left: (r.x / 1000) * w, top: (r.y / 600) * h, width: (r.w / 1000) * w, height: (r.h / 600) * h };
};
const toVirtual = (p) => {
  const { w, h } = area();
  return {
    x: Math.round((p.left / w) * 1000),
    y: Math.round((p.top / h) * 600),
    w: Math.round((p.width / w) * 1000),
    h: Math.round((p.height / h) * 600),
  };
};
const tileOf = (rect) =>
  Object.keys(TILE_RECTS).find((t) => ["x", "y", "w", "h"].every((k) => Math.abs(TILE_RECTS[t][k] - rect[k]) <= 6)) || null;

const pct = (v) => (typeof v == "string" && v.endsWith("%") ? parseFloat(v) / 100 : 0);

// Snap layouts flyout (layout table from reducers/globals.js `lays`).
const SnapFlyout = ({ win, onDone }) => {
  const lays = useSelector((state) => state.globals.lays);
  const pick = (dim) => {
    const rect = {
      x: Math.round(pct(dim.left) * 1000),
      y: Math.round(pct(dim.top) * 600),
      w: Math.round(pct(dim.width) * 1000),
      h: Math.round(pct(dim.height) * 600),
    };
    const tile = tileOf(rect);
    emit(tile ? { kind: "tile", id: win.id, tile } : { kind: "set-rect", id: win.id, rect });
    onDone();
  };
  return (
    <div className="snapcont mdShad" data-dark={document.body.dataset.theme == "dark"} data-testid="snap-flyout">
      {lays.map((lay, i) => (
        <div key={i} className="snapLay">
          {lay.map((cell, j) => (
            <div
              key={j}
              className="snapper"
              style={{
                borderTopLeftRadius: (cell.br % 2 == 0) * 4,
                borderTopRightRadius: (cell.br % 3 == 0) * 4,
                borderBottomRightRadius: (cell.br % 5 == 0) * 4,
                borderBottomLeftRadius: (cell.br % 7 == 0) * 4,
              }}
              onClick={(e) => {
                e.stopPropagation();
                pick(cell.dim);
              }}
            ></div>
          ))}
        </div>
      ))}
    </div>
  );
};

const AppCrashed = ({ error }) => (
  <div className="oceanCrash">This app stopped responding. ({String(error && error.message)})</div>
);

const HANDLES = [
  ["n", 0, -1], ["s", 0, 1], ["e", 1, 0], ["w", -1, 0],
  ["ne", 1, -1], ["nw", -1, -1], ["se", 1, 1], ["sw", -1, 1],
];

const WindowFrame = ({ win, z, focused }) => {
  const world = useWorld();
  // A program window (PROGRAMS.md) is a system window drawing data.views; its frame follows the view's layout.
  const app = win.app == "program" ? programMeta(world, win) : appById(win.app);
  const layout = win.app == "program" ? app.layout : null;
  const compact = layout == "message";
  const [live, setLive] = useState(null); // {box, snap} while dragging/resizing
  const [snapOpen, setSnapOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!app || !app.component) return null;
  const Content = app.component;
  const { w: W, h: H } = area();
  const maximized = win.mode == "maximized";
  const fullscreen = win.mode == "fullscreen";
  const minimized = win.mode == "minimized";
  const base = fullscreen
    ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    : maximized
    ? { left: 0, top: 0, width: W, height: H }
    : toPx(win.tile ? TILE_RECTS[win.tile] : win.rect);
  const box = live ? live.box : base;

  const focus = () => !focused && emit({ kind: "focus-window", id: win.id });

  const startGesture = (e, mode, dir) => {
    if (e.button != 0 || fullscreen) return;
    e.preventDefault();
    e.stopPropagation();
    focus();
    const start = { x: e.clientX, y: e.clientY };
    // Dragging a maximised or tiled window restores its saved size under the pointer.
    let origin = base;
    if (mode == "move" && (maximized || win.tile)) {
      const restored = toPx(win.rect);
      const ratio = (e.clientX - base.left) / base.width;
      origin = { ...restored, left: e.clientX - restored.width * ratio, top: 0 };
    }
    let current = { box: origin, snap: null };
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      let next;
      let snap = null;
      if (mode == "move") {
        next = { ...origin, left: origin.left + dx, top: Math.max(0, origin.top + dy) };
        if (ev.clientX <= 2) snap = "left";
        else if (ev.clientX >= window.innerWidth - 3) snap = "right";
        else if (ev.clientY <= 2) snap = "max";
      } else {
        const [hx, hy] = dir;
        const minW = (MIN.w / 1000) * W;
        const minH = (MIN.h / 600) * H;
        let { left, top, width, height } = origin;
        if (hx > 0) width = Math.max(minW, origin.width + dx);
        if (hx < 0) {
          width = Math.max(minW, origin.width - dx);
          left = origin.left + origin.width - width;
        }
        if (hy > 0) height = Math.max(minH, origin.height + dy);
        if (hy < 0) {
          height = Math.max(minH, origin.height - dy);
          top = Math.max(0, origin.top + origin.height - height);
        }
        next = { left, top, width, height };
      }
      current = { box: next, snap };
      setLive(current);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setLive(null);
      if (!moved) return;
      if (current.snap == "max") emit({ kind: "maximize", id: win.id });
      else if (current.snap) emit({ kind: "tile", id: win.id, tile: current.snap });
      else {
        const b = current.box;
        const left = Math.min(Math.max(b.left, -b.width + 80), W - 80);
        emit({ kind: "set-rect", id: win.id, rect: toVirtual({ ...b, left }) });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // File/folder/message windows keep the world title (item name); app windows use the Windows name.
  const title = win.app == "program" ? app.name : win.payload && !win.payload.url && win.title ? win.title : app.name;
  const snapPreview = live && live.snap;

  return (
    <>
      {snapPreview ? (
        <div
          className="snapPreview"
          style={snapPreview == "max" ? { left: 6, top: 6, width: W - 12, height: H - 12 } : { ...toPx(TILE_RECTS[snapPreview]) }}
        />
      ) : null}
      <div
        className="oceanWin"
        data-testid="window"
        data-win-id={win.id}
        data-payload={JSON.stringify(win.payload)}
        data-app={win.app}
        data-mode={win.mode}
        data-focused={focused}
        data-live={!!live}
        data-tiled={!!win.tile}
        data-dim={win.app == "program" ? false : isDimmed(world, win.app)}
        data-layout={layout || undefined}
        style={{ ...box, zIndex: 20 + z }}
        onPointerDownCapture={focus}
      >
        <div className="oceanTitle" onPointerDown={(e) => startGesture(e, "move")} onDoubleClick={() => emit({ kind: maximized ? "restore" : "maximize", id: win.id })}>
          <Icon src={app.iconSrc} ext width={16} />
          <div className="oceanTitleText">{title}</div>
          <div className="oceanCtl" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            {compact ? null : (
            <button aria-label="Minimise" onClick={() => emit({ kind: "minimize", id: win.id })}>
              <Icon src="minimize" ui width={10} />
            </button>
            )}
            {compact ? null : (
            <div className="snapbox" onMouseEnter={() => setSnapOpen(true)} onMouseLeave={() => setSnapOpen(false)}>
              <button
                aria-label={maximized ? "Restore" : "Maximise"}
                onClick={() => emit({ kind: maximized || fullscreen ? "restore" : "maximize", id: win.id })}
              >
                <Icon src={maximized ? "maxmin" : "maximize"} ui width={10} />
              </button>
              {snapOpen && !fullscreen ? <SnapFlyout win={win} onDone={() => setSnapOpen(false)} /> : null}
            </div>
            )}
            <button
              className="oceanClose"
              aria-label="Close"
              onClick={() => {
                emit({ kind: "close-window", id: win.id });
              }}
            >
              <Icon src="close" ui width={11} />
            </button>
          </div>
        </div>
        <div className="oceanWinBody">
          <ErrorBoundary FallbackComponent={AppCrashed} onError={() => playSound("error", world.sys)}>
            <Content win={win} />
          </ErrorBoundary>
        </div>
        {!maximized && !fullscreen
          ? HANDLES.map(([name, hx, hy]) => (
              <div key={name} className={"oceanHandle h-" + name} onPointerDown={(e) => startGesture(e, "resize", [hx, hy])} />
            ))
          : null}
      </div>
    </>
  );
};

export const WindowLayer = () => {
  const world = useWorld();
  const order = world.order || [];
  return (
    <>
      {world.windows
        .filter((w) => world.installed.includes(w.app) || w.app == "program")
        .map((w) => (
          <WindowFrame key={w.id} win={w} z={Math.max(0, order.indexOf(w.id))} focused={world.focusedId == w.id} />
        ))}
    </>
  );
};
