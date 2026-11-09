import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { openApp, openNode } from "../../actions";
import { Icon } from "../../utils/general";
import { childrenOf, emit, fileIcon, isNodeDimmed, setSys, useWorld } from "../../utils/ocean";
import { playSound } from "../../utils/sounds";
import { showMenu } from "../taskbar";
import Battery from "../shared/Battery";
import "./searchpane.scss";
import "./sidepane.scss";
import "./startmenu.scss";

export * from "./start";
export * from "./widget";

const CELL = { w: 78, h: 94 };
const BIN_ID = "trash";

// Embedded under the parent's training toolbar (top right), icons keep clear of it like an AppBar.
const TOP_INSET = new URLSearchParams(location.search).get("oceanShell") === "1" ? 48 : 0;
const deskArea = () => ({ top: TOP_INSET, w: window.innerWidth, h: Math.max(200, window.innerHeight - 48 - TOP_INSET) });

// Virtual 1000×600 desktop positions ↔ pixels.
export const toVirtual = (left, top) => {
  const area = deskArea();
  return { x: Math.round((left / area.w) * 1000), y: Math.max(0, Math.round(((top - area.top) / area.h) * 600)) };
};
const toPixels = (pos) => {
  const area = deskArea();
  return { left: (pos.x / 1000) * area.w, top: area.top + (pos.y / 600) * area.h };
};
const autoSlot = (i) => {
  const area = deskArea();
  const rows = Math.max(1, Math.floor((area.h - 8) / CELL.h));
  return { left: 6 + Math.floor(i / rows) * CELL.w, top: area.top + 6 + (i % rows) * CELL.h };
};

// Grid-ordered virtual positions for sorted desktop items (used by "Sort by").
export const sortedDesktopPositions = (nodes) =>
  nodes.map((node, i) => {
    const slot = autoSlot(i + 1);
    return { id: node.id, pos: toVirtual(slot.left, slot.top) };
  });

export const DesktopApp = () => {
  const world = useWorld();
  const desk = useSelector((state) => state.desktop);
  const dispatch = useDispatch();
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(null);
  const [renameText, setRenameText] = useState("");
  const binRef = useRef(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const clear = (e) => !(e.target.closest && e.target.closest(".dskItem")) && setSelected(null);
    window.addEventListener("pointerdown", clear);
    return () => window.removeEventListener("pointerdown", clear);
  }, []);

  useEffect(() => {
    if (desk.renaming) {
      const node = world.fs.nodes[desk.renaming];
      setRenameText(node ? node.name : "");
    }
  }, [desk.renaming]);

  if (desk.hide) return <div className="desktopIcons"></div>;

  const items = childrenOf(world, "desktop");
  let free = 1;
  const placed = items.map((node) => ({
    node,
    px: node.desktopPos ? toPixels(node.desktopPos) : autoSlot(free++),
  }));
  const binPx = autoSlot(0);
  const binFull = Object.values(world.fs.nodes).some((n) => n.trashed);
  const iconSize = Math.round(desk.size * 36);

  const startDrag = (e, node, px) => {
    if (e.button != 0) return;
    setSelected(node.id);
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      setDrag({ id: node.id, left: px.left + dx, top: px.top + dy });
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDrag(null);
      if (!moved) return;
      const bin = binRef.current && binRef.current.getBoundingClientRect();
      if (bin && ev.clientX >= bin.left && ev.clientX <= bin.right && ev.clientY >= bin.top && ev.clientY <= bin.bottom) {
        emit({ kind: "fs", op: "trash", id: node.id });
        playSound("trash", world.sys);
        return;
      }
      const area = deskArea();
      const left = Math.min(Math.max(0, Math.round((px.left + ev.clientX - start.x) / 8) * 8), area.w - CELL.w);
      const top = Math.min(Math.max(area.top, Math.round((px.top + ev.clientY - start.y) / 8) * 8), area.top + area.h - CELL.h);
      emit({ kind: "fs", op: "set-desktop-pos", id: node.id, pos: toVirtual(left, top) });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const commitRename = (node) => {
    const name = renameText.trim();
    if (name && name != node.name) emit({ kind: "fs", op: "rename", id: node.id, name });
    dispatch({ type: "DESKRENAME", payload: null });
  };

  const onKey = (e, node) => {
    if (desk.renaming) return;
    if (e.key == "Enter") openNode(node.id);
    else if (e.key == "Delete") {
      emit({ kind: "fs", op: "trash", id: node.id });
      playSound("trash", world.sys);
    } else if (e.key == "F2") dispatch({ type: "DESKRENAME", payload: node.id });
  };

  return (
    <div className="desktopIcons" data-testid="desktop-icons">
      <div
        ref={binRef}
        className="dskItem"
        style={{ left: binPx.left, top: binPx.top }}
        data-selected={selected == BIN_ID}
        tabIndex={0}
        onPointerDown={() => setSelected(BIN_ID)}
        onDoubleClick={() => openNode(BIN_ID)}
        onContextMenu={(e) => showMenu(dispatch, e, "bin", { id: BIN_ID })}
      >
        <Icon src={binFull ? "bin1" : "bin0"} width={iconSize} />
        <div className="dskName">Recycle Bin</div>
      </div>
      {placed.map(({ node, px }) => {
        const pos = drag && drag.id == node.id ? drag : px;
        const renaming = desk.renaming == node.id;
        return (
          <div
            key={node.id}
            className="dskItem"
            data-testid="desktop-icon"
            data-ocean-key={node.kind == "app" ? "app:" + node.appId : "file:" + node.id}
            data-dragging={!!(drag && drag.id == node.id)}
            data-selected={selected == node.id}
            data-app={node.kind == "app" ? node.appId : undefined}
            data-dim={isNodeDimmed(world, node)}
            style={{ left: pos.left, top: pos.top }}
            tabIndex={0}
            title={node.name}
            onPointerDown={(e) => !renaming && startDrag(e, node, px)}
            onDoubleClick={() => !renaming && openNode(node.id)}
            onKeyDown={(e) => onKey(e, node)}
            onContextMenu={(e) => {
              setSelected(node.id);
              showMenu(dispatch, e, "file", { id: node.id });
            }}
          >
            <Icon src={fileIcon(node)} width={iconSize} />
            {renaming ? (
              <input
                className="dskRename"
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => commitRename(node)}
                onKeyDown={(e) => {
                  if (e.key == "Enter") commitRename(node);
                  if (e.key == "Escape") dispatch({ type: "DESKRENAME", payload: null });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="dskName">{node.kind == "app" ? node.name : window.OceanWorldModel.displayName(node, "windows", !!world.sys.showExtensions)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------- quick settings ----------

const QUICK = [
  { key: "wifi", name: "Wi-Fi", src: "wifi" },
  { key: "bluetooth", name: "Bluetooth", src: "bluetooth" },
  { key: "focus", name: "Focus", src: "moon" },
  { key: "lowPower", name: "Battery saver", src: "saver" },
  { key: "theme", name: "Dark mode", src: "sun" },
  { key: "nightLight", name: "Night light", src: "nightlight" },
];

export const SidePane = () => {
  const sidepane = useSelector((state) => state.sidepane);
  const world = useWorld();
  const dispatch = useDispatch();
  const sys = world.sys;
  const [bright, setBright] = useState(sys.brightness);
  const [vol, setVol] = useState(sys.volume);

  useEffect(() => setBright(sys.brightness), [sys.brightness]);
  useEffect(() => setVol(sys.volume), [sys.volume]);

  const isOn = (key) => (key == "theme" ? sys.theme == "dark" : !!sys[key]);
  const toggle = (key) =>
    setSys(key == "theme" ? { theme: sys.theme == "dark" ? "light" : "dark" } : { [key]: !sys[key] });
  const audio = sys.muted || vol == 0 ? 0 : vol < 30 ? 1 : vol < 70 ? 2 : 3;
  const track = (value, min) => ({
    "--track-color": `linear-gradient(90deg, var(--clrPrm) ${((value - min) / (100 - min)) * 100}%, #888 ${((value - min) / (100 - min)) * 100}%)`,
  });

  return (
    <div className="sidePane dpShad" data-hide={sidepane.hide} style={{ "--prefix": "PANE" }} data-testid="quick-settings">
      <div className="quickSettings p-5 pb-8">
        <div className="qkCont">
          {QUICK.map((qk) => (
            <div key={qk.key} className="qkGrp">
              <div className="qkbtn handcr prtclk" data-state={isOn(qk.key)} data-testid={"quick-" + qk.key} onClick={() => toggle(qk.key)}>
                <Icon className="quickIcon" ui src={qk.key == "theme" && isOn("theme") ? "moon" : qk.src} width={16} invert={isOn(qk.key) ? true : null} />
              </div>
              <div className="qktext" title={qk.name}>{qk.key == "wifi" && sys.wifi && sys.wifiNetwork ? sys.wifiNetwork : qk.name}</div>
            </div>
          ))}
        </div>
        <div className="sliderCont">
          <Icon className="mx-2" src="brightness" ui width={20} />
          <input
            className="sliders bSlider"
            data-testid="brightness"
            type="range"
            min="20"
            max="100"
            value={bright}
            style={track(bright, 20)}
            onChange={(e) => setBright(Number(e.target.value))}
            onPointerUp={() => setSys({ brightness: bright })}
            onKeyUp={() => setSys({ brightness: bright })}
          />
        </div>
        <div className="sliderCont">
          <div className="handcr" title={sys.muted ? "Unmute" : "Mute"} onClick={() => setSys({ muted: !sys.muted })}>
            <Icon className="mx-2" src={"audio" + audio} ui width={18} />
          </div>
          <input
            className="sliders vSlider"
            data-testid="volume"
            type="range"
            min="0"
            max="100"
            value={vol}
            style={track(vol, 0)}
            onChange={(e) => setVol(Number(e.target.value))}
            onPointerUp={() => setSys({ volume: vol, muted: vol == 0 ? sys.muted : false })}
            onKeyUp={() => setSys({ volume: vol })}
          />
        </div>
      </div>
      <div className="p-1 bottomBar">
        <div className="px-3 battery-sidepane">
          <Battery pct />
        </div>
        <div
          className="qkSettings handcr prtclk"
          title="All settings"
          onClick={() => {
            dispatch({ type: "PANEHIDE" });
            openApp("settings");
          }}
        >
          <Icon src="settings" ui width={16} />
        </div>
      </div>
    </div>
  );
};
